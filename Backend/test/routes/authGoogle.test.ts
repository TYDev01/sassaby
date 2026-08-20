import request from "supertest";
import { expect } from "chai";
import sinon from "sinon";

import axios from "axios";
import { OAuth2Client } from "google-auth-library";

import app from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { hashPassword } from "../../src/lib/auth";

// ESM namespace objects are frozen, so the route's own imports cannot be
// stubbed. Both seams are reachable one level down instead, which has the
// happy side effect of exercising the real verifier and the real mailer:
//   - Google  -> OAuth2Client.prototype.verifyIdToken (a prototype method)
//   - welcome -> axios.post, which is what sendMail() ultimately calls
//
// Stubbing axios.post is not optional here: .env carries a live RESEND_API_KEY,
// and without it this suite would send real mail to the fixture address.

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PASSWORD = "correct-horse-battery";
/** Real bcrypt hash of PASSWORD — verifyPassword refuses anything else. */
let PASSWORD_HASH = "";

const IDENTITY = {
  googleId: "google-sub-123",
  email: "ada@gmail.com",
  fullName: "Ada Lovelace",
};

function userRow(over: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    createdAt: new Date(),
    email: IDENTITY.email,
    password: null,
    googleId: null,
    appleId: null,
    emailVerified: false,
    phone: "",
    fullName: "",
    bankAccountName: "",
    kycTier: "light",
    banned: false,
    isAdmin: false,
    ...over,
  };
}

// Prisma delegates are Proxies, so the whole delegate is replaced rather than
// individual methods stubbed — same approach as the orders suite.
const originals: Record<string, unknown> = {};

interface MockOpts {
  byGoogleId?: unknown;
  byEmail?: unknown;
}

function installMocks(opts: MockOpts = {}) {
  const p = prisma as unknown as Record<string, unknown>;
  if (!("user" in originals)) originals.user = p.user;

  p.user = {
    findUnique: sinon.stub().callsFake(({ where }: { where: Record<string, unknown> }) => {
      if ("googleId" in where) return opts.byGoogleId ?? null;
      if ("email" in where) return opts.byEmail ?? null;
      return null;
    }),
    update: sinon.stub().callsFake(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
      ...(opts.byEmail as Record<string, unknown>),
      ...data,
      id: where.id,
    })),
    create: sinon.stub().callsFake(({ data }: { data: Record<string, unknown> }) => ({
      ...userRow(),
      ...data,
    })),
  };
}

function restoreMocks() {
  const p = prisma as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(originals)) p[k] = v;
}

/** Make the real verifier accept a token, as if Google had signed it. */
function googleReturns(over: Record<string, unknown> = {}) {
  return sinon.stub(OAuth2Client.prototype, "verifyIdToken").resolves({
    getPayload: () => ({
      sub:            IDENTITY.googleId,
      email:          IDENTITY.email,
      email_verified: true,
      name:           IDENTITY.fullName,
      ...over,
    }),
  } as never);
}

/** The unawaited welcome mail needs a tick to reach axios. */
const settle = () => new Promise((r) => setTimeout(r, 25));

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("POST /api/auth/google", () => {
  const savedSecret = process.env.JWT_SECRET;
  const savedClient = process.env.GOOGLE_CLIENT_ID;
  let mailPost: sinon.SinonStub;

  before(async () => {
    PASSWORD_HASH = await hashPassword(PASSWORD);
  });

  beforeEach(() => {
    process.env.JWT_SECRET = "a".repeat(48);
    process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "Sassaby <noreply@noreply.sassaby.exchange>";
    mailPost = sinon.stub(axios, "post").resolves({ data: { id: "mail-1" } });
  });

  afterEach(() => {
    sinon.restore();
    restoreMocks();
    if (savedSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = savedSecret;
    if (savedClient === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = savedClient;
  });

  it("responds 503 when GOOGLE_CLIENT_ID is not set", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    installMocks();

    const res = await request(app).post("/api/auth/google").send({ credential: "x" });

    expect(res.status).to.equal(503);
  });

  it("responds 401 when the token does not verify", async () => {
    sinon.stub(OAuth2Client.prototype, "verifyIdToken").rejects(new Error("invalid signature"));
    installMocks();

    const res = await request(app).post("/api/auth/google").send({ credential: "forged" });

    expect(res.status).to.equal(401);
    expect(res.body.error).to.include("Could not verify");
  });

  // This is what makes linking-by-email safe — see the note in googleAuth.ts.
  it("refuses a token whose email is not verified by Google", async () => {
    googleReturns({ email_verified: false });
    installMocks();

    const res = await request(app).post("/api/auth/google").send({ credential: "good" });

    expect(res.status).to.equal(401);
    expect(res.body.error).to.include("not verified");

    const p = prisma as unknown as { user: { create: sinon.SinonStub; update: sinon.SinonStub } };
    expect(p.user.create.called).to.equal(false);
    expect(p.user.update.called).to.equal(false);
  });

  // ── Case 3: brand new account ───────────────────────────────────────────────
  it("creates an account with no password on a first Google sign-in", async () => {
    googleReturns();
    installMocks();

    const res = await request(app).post("/api/auth/google").send({ credential: "good" });

    expect(res.status).to.equal(201);
    expect(res.body.created).to.equal(true);
    expect(res.body.token).to.be.a("string");
    expect(res.body.user.email).to.equal(IDENTITY.email);

    const p = prisma as unknown as { user: { create: sinon.SinonStub } };
    const data = p.user.create.firstCall.args[0].data;
    expect(data.password).to.equal(null);
    expect(data.googleId).to.equal(IDENTITY.googleId);
    expect(data.emailVerified).to.equal(true);
    // Never settable from a request body, on any path.
    expect(data.isAdmin).to.equal(undefined);
  });

  it("sends the welcome email only when an account is actually created", async () => {
    googleReturns();
    installMocks();

    await request(app).post("/api/auth/google").send({ credential: "good" });
    await settle();

    expect(mailPost.calledOnce).to.equal(true);
    expect(mailPost.firstCall.args[1].to).to.deep.equal([IDENTITY.email]);
  });

  // ── Case 1: returning user ──────────────────────────────────────────────────
  it("signs in an existing Google identity without creating anything", async () => {
    googleReturns();
    installMocks({ byGoogleId: userRow({ googleId: IDENTITY.googleId, emailVerified: true }) });

    const res = await request(app).post("/api/auth/google").send({ credential: "good" });

    expect(res.status).to.equal(200);
    expect(res.body.created).to.equal(false);

    const p = prisma as unknown as { user: { create: sinon.SinonStub } };
    expect(p.user.create.called).to.equal(false);
    await settle();
    expect(mailPost.called).to.equal(false);
  });

  // ── Case 2: linking ─────────────────────────────────────────────────────────
  //
  // An account WITH a password must prove it before a social identity attaches,
  // otherwise an address registered by someone else becomes a shared account.

  it("refuses to link to a password account without that password", async () => {
    googleReturns();
    installMocks({ byEmail: userRow({ password: PASSWORD_HASH }) });

    const res = await request(app).post("/api/auth/google").send({ credential: "good" });

    expect(res.status).to.equal(409);
    expect(res.body.requiresPassword).to.equal(true);

    const p = prisma as unknown as { user: { update: sinon.SinonStub } };
    expect(p.user.update.called).to.equal(false);
  });

  it("refuses to link when the supplied password is wrong", async () => {
    googleReturns();
    installMocks({ byEmail: userRow({ password: PASSWORD_HASH }) });

    const res = await request(app)
      .post("/api/auth/google")
      .send({ credential: "good", password: "not-the-password" });

    expect(res.status).to.equal(401);

    const p = prisma as unknown as { user: { update: sinon.SinonStub } };
    expect(p.user.update.called).to.equal(false);
  });

  it("links once the account's own password is supplied", async () => {
    googleReturns();
    installMocks({ byEmail: userRow({ password: PASSWORD_HASH, fullName: "Ada Typed Her Own Name" }) });

    const res = await request(app)
      .post("/api/auth/google")
      .send({ credential: "good", password: PASSWORD });

    expect(res.status).to.equal(200);
    expect(res.body.created).to.equal(false);

    const p = prisma as unknown as { user: { update: sinon.SinonStub; create: sinon.SinonStub } };
    expect(p.user.create.called).to.equal(false);
    const data = p.user.update.firstCall.args[0].data;
    expect(data.googleId).to.equal(IDENTITY.googleId);
    expect(data.emailVerified).to.equal(true);
    // A name the user typed themselves is never overwritten by the provider's.
    expect(data.fullName).to.equal(undefined);
  });

  // No password means nothing to prove: the account was itself created by a
  // provider that verified this same address.
  it("links to a passwordless account without asking for anything", async () => {
    googleReturns();
    installMocks({ byEmail: userRow({ password: null, appleId: "apple-sub-1", fullName: "" }) });

    const res = await request(app).post("/api/auth/google").send({ credential: "good" });

    expect(res.status).to.equal(200);

    const p = prisma as unknown as { user: { update: sinon.SinonStub } };
    const data = p.user.update.firstCall.args[0].data;
    expect(data.googleId).to.equal(IDENTITY.googleId);
    // A blank name IS filled from the provider.
    expect(data.fullName).to.equal(IDENTITY.fullName);
  });

  // ── Bans apply on every path ────────────────────────────────────────────────
  it("refuses a banned account signing in with Google", async () => {
    googleReturns();
    installMocks({ byGoogleId: userRow({ googleId: IDENTITY.googleId, banned: true }) });

    const res = await request(app).post("/api/auth/google").send({ credential: "good" });

    expect(res.status).to.equal(403);
  });

  it("refuses a banned account reached by email link", async () => {
    googleReturns();
    installMocks({ byEmail: userRow({ password: null, banned: true }) });

    const res = await request(app).post("/api/auth/google").send({ credential: "good" });

    expect(res.status).to.equal(403);
  });
});

// ─── Password login must not accept a Google-only account ─────────────────────

describe("POST /api/auth/login with a passwordless account", () => {
  const savedSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = "a".repeat(48);
  });

  afterEach(() => {
    sinon.restore();
    restoreMocks();
    if (savedSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = savedSecret;
  });

  it("responds with the same generic 401 as a wrong password", async () => {
    const p = prisma as unknown as Record<string, unknown>;
    if (!("user" in originals)) originals.user = p.user;
    p.user = { findUnique: sinon.stub().resolves(userRow({ googleId: "g", password: null })) };

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: IDENTITY.email, password: "anything-at-all" });

    expect(res.status).to.equal(401);
    // Must not reveal that this address exists but uses Google.
    expect(res.body.error).to.equal("Incorrect email or password.");
  });
});
