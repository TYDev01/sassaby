import request from "supertest";
import { expect } from "chai";
import sinon from "sinon";
import axios from "axios";
import { SignJWT, exportJWK, generateKeyPair, type KeyLike } from "jose";

import app from "../../src/app";
import { prisma } from "../../src/lib/prisma";

/**
 * Apple's keys are fetched from appleid.apple.com over the network. Rather than
 * stubbing our own verifier — the module namespace is frozen, and stubbing it
 * would skip the very code worth testing — this serves a JWKS we control from a
 * stubbed `fetch` and signs real ES256 tokens against it. Signature, audience,
 * issuer and expiry are then all checked for real.
 */

const CLIENT_ID = "exchange.sassaby.web";
const KID = "test-key-1";

let privateKey: KeyLike;
let jwksBody: string;

async function appleToken(claims: Record<string, unknown> = {}, over: { aud?: string; iss?: string } = {}) {
  return new SignJWT({
    email: "ada@privaterelay.appleid.com",
    email_verified: "true",
    ...claims,
  })
    .setProtectedHeader({ alg: "ES256", kid: KID })
    .setIssuer(over.iss ?? "https://appleid.apple.com")
    .setAudience(over.aud ?? CLIENT_ID)
    .setSubject((claims.sub as string) ?? "apple-sub-123")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

function userRow(over: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    createdAt: new Date(),
    email: "ada@privaterelay.appleid.com",
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

const originals: Record<string, unknown> = {};

function installMocks(opts: { byAppleId?: unknown; byEmail?: unknown } = {}) {
  const p = prisma as unknown as Record<string, unknown>;
  if (!("user" in originals)) originals.user = p.user;
  p.user = {
    findUnique: sinon.stub().callsFake(({ where }: { where: Record<string, unknown> }) => {
      if ("appleId" in where) return opts.byAppleId ?? null;
      if ("email" in where) return opts.byEmail ?? null;
      return null;
    }),
    update: sinon.stub().callsFake(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
      ...(opts.byEmail as Record<string, unknown>),
      ...data,
      id: where.id,
    })),
    create: sinon.stub().callsFake(({ data }: { data: Record<string, unknown> }) => ({ ...userRow(), ...data })),
  };
}

function restoreMocks() {
  const p = prisma as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(originals)) p[k] = v;
}

describe("POST /api/auth/apple", () => {
  const saved = { secret: process.env.JWT_SECRET, client: process.env.APPLE_CLIENT_ID };

  before(async () => {
    const { publicKey, privateKey: pk } = await generateKeyPair("ES256");
    privateKey = pk as KeyLike;
    const jwk = await exportJWK(publicKey);
    jwksBody = JSON.stringify({ keys: [{ ...jwk, kid: KID, alg: "ES256", use: "sig" }] });

    // jose caches the key set after the first fetch, so this has to be in place
    // before the first verification and can stay for the whole suite.
    sinon.stub(globalThis, "fetch").callsFake(async () =>
      new Response(jwksBody, { status: 200, headers: { "content-type": "application/json" } })
    );
  });

  after(() => sinon.restore());

  beforeEach(() => {
    process.env.JWT_SECRET = "a".repeat(48);
    process.env.APPLE_CLIENT_ID = CLIENT_ID;
    // .env carries a live RESEND_API_KEY — never let the suite send real mail.
    process.env.MAIL_FROM = "Sassaby <noreply@noreply.sassaby.exchange>";
    sinon.stub(axios, "post").resolves({ data: { id: "mail-1" } });
  });

  afterEach(() => {
    // Keep the fetch stub from `before` — only the per-test stubs are undone.
    (axios.post as sinon.SinonStub).restore?.();
    restoreMocks();
    if (saved.secret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = saved.secret;
    if (saved.client === undefined) delete process.env.APPLE_CLIENT_ID;
    else process.env.APPLE_CLIENT_ID = saved.client;
  });

  it("responds 503 when APPLE_CLIENT_ID is not set", async () => {
    delete process.env.APPLE_CLIENT_ID;
    installMocks();

    const res = await request(app).post("/api/auth/apple").send({ credential: "x" });

    expect(res.status).to.equal(503);
  });

  it("creates an account from a valid Apple token", async () => {
    installMocks();

    const res = await request(app)
      .post("/api/auth/apple")
      .send({ credential: await appleToken(), fullName: "Ada Lovelace" });

    expect(res.status).to.equal(201);
    expect(res.body.created).to.equal(true);

    const p = prisma as unknown as { user: { create: sinon.SinonStub } };
    const data = p.user.create.firstCall.args[0].data;
    expect(data.appleId).to.equal("apple-sub-123");
    expect(data.password).to.equal(null);
    expect(data.emailVerified).to.equal(true);
    // Apple only ever sends the name once, alongside the token — never inside it.
    expect(data.fullName).to.equal("Ada Lovelace");
    // A private-relay address is a real, verified address.
    expect(data.email).to.equal("ada@privaterelay.appleid.com");
  });

  // The audience check is the whole point: a token minted for another Services
  // ID must never authenticate a session here.
  it("rejects a token issued for a different Services ID", async () => {
    installMocks();

    const res = await request(app)
      .post("/api/auth/apple")
      .send({ credential: await appleToken({}, { aud: "com.someone.else" }) });

    expect(res.status).to.equal(401);

    const p = prisma as unknown as { user: { create: sinon.SinonStub } };
    expect(p.user.create.called).to.equal(false);
  });

  it("rejects a token from the wrong issuer", async () => {
    installMocks();

    const res = await request(app)
      .post("/api/auth/apple")
      .send({ credential: await appleToken({}, { iss: "https://evil.example" }) });

    expect(res.status).to.equal(401);
  });

  it("rejects a token whose email is not verified", async () => {
    installMocks();

    const res = await request(app)
      .post("/api/auth/apple")
      .send({ credential: await appleToken({ email_verified: "false" }) });

    expect(res.status).to.equal(401);
    expect(res.body.error).to.include("not verified");
  });

  // Apple is inconsistent about the type of this claim.
  it("accepts email_verified as a boolean as well as a string", async () => {
    installMocks();

    const res = await request(app)
      .post("/api/auth/apple")
      .send({ credential: await appleToken({ email_verified: true }) });

    expect(res.status).to.equal(201);
  });

  it("signs in a returning Apple identity", async () => {
    installMocks({ byAppleId: userRow({ appleId: "apple-sub-123" }) });

    const res = await request(app).post("/api/auth/apple").send({ credential: await appleToken() });

    expect(res.status).to.equal(200);
    expect(res.body.created).to.equal(false);
  });

  it("requires the password to link onto an existing password account", async () => {
    installMocks({ byEmail: userRow({ password: "$2a$12$notarealhash0000000000000000000000000000000000000000" }) });

    const res = await request(app).post("/api/auth/apple").send({ credential: await appleToken() });

    expect(res.status).to.equal(409);
    expect(res.body.requiresPassword).to.equal(true);
  });
});
