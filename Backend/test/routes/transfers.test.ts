import request from "supertest";
import { expect } from "chai";
import sinon from "sinon";
import axios from "axios";
import app from "../../src/app";
import { prisma } from "../../src/lib/prisma";

const VALID_BODY = {
  sendAmount: 10,
  sendToken: "STX",
  receiveCurrency: "NGN",
  bank: "First Bank",
  bankCode: "011",
  accountNumber: "1234567890",
  senderAddress: "SP2X0TZ59D5SZ8ACQ6YMCHHNR2ZN51Z32E2CJ173",
};

// ─── Prisma model-level mock helpers ─────────────────────────────────────────
// Prisma delegates use a Proxy internally so sinon.stub() on individual methods
// is bypassed. We replace the whole delegate with a plain stub object instead.

let origDepositAddress: unknown;
let origRateConfig: unknown;
let origTransferModel: unknown;

function installPrismaMocks(depositRow: unknown | null = {
  id: 1, token: "STX", address: "SP_ADMIN_ADDR", label: "STX Deposit",
  updatedAt: new Date(), createdAt: new Date(),
}) {
  const p = prisma as unknown as Record<string, unknown>;
  origDepositAddress  = p.depositAddress;
  origRateConfig      = p.rateConfig;
  origTransferModel   = p.transfer;

  p.depositAddress = {
    findUnique: sinon.stub().resolves(depositRow),
  };
  // Returning a manual rate prevents getFlwRate() from hitting the FLW API
  p.rateConfig = {
    findUnique: sinon.stub().resolves({
      id: 1, currency: "NGN", mode: "manual", manualRate: "1600",
      createdAt: new Date(), updatedAt: new Date(),
    }),
  };
  p.transfer = {
    create:   sinon.stub().resolves({}),
    findMany: sinon.stub().resolves([]),
  };
}

function restorePrisma() {
  const p = prisma as unknown as Record<string, unknown>;
  if (origDepositAddress !== undefined) p.depositAddress = origDepositAddress;
  if (origRateConfig     !== undefined) p.rateConfig     = origRateConfig;
  if (origTransferModel  !== undefined) p.transfer       = origTransferModel;
}

// ─── POST /api/transfers ──────────────────────────────────────────────────────

describe("POST /api/transfers", () => {
  afterEach(() => {
    sinon.restore();
    restorePrisma();
  });

  it("returns 201 with deposit address for a valid transfer", async () => {
    installPrismaMocks();
    // Ensure getTokenPriceUSD can resolve even if the price cache is cold
    sinon.stub(axios, "get").resolves({ data: { blockstack: { usd: 1.5 } } });

    const res = await request(app).post("/api/transfers").send(VALID_BODY);
    expect(res.status).to.equal(201);
    expect(res.body.success).to.be.true;
    expect(res.body).to.have.property("id");
    expect(res.body.depositAddress).to.equal("SP_ADMIN_ADDR");
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await request(app)
      .post("/api/transfers")
      .send({ sendAmount: 10, sendToken: "STX" });
    expect(res.status).to.equal(400);
    expect(res.body).to.have.property("error");
  });

  it("returns 400 for an invalid sendToken", async () => {
    const res = await request(app)
      .post("/api/transfers")
      .send({ ...VALID_BODY, sendToken: "ETH" });
    expect(res.status).to.equal(400);
    expect(res.body.error).to.include("sendToken");
  });

  it("returns 400 for an invalid receiveCurrency", async () => {
    const res = await request(app)
      .post("/api/transfers")
      .send({ ...VALID_BODY, receiveCurrency: "USD" });
    expect(res.status).to.equal(400);
    expect(res.body.error).to.include("receiveCurrency");
  });

  it("returns 400 when sendAmount is zero", async () => {
    const res = await request(app)
      .post("/api/transfers")
      .send({ ...VALID_BODY, sendAmount: 0 });
    expect(res.status).to.equal(400);
  });

  it("returns 400 when sendAmount exceeds MAX_SEND_AMOUNT", async () => {
    const res = await request(app)
      .post("/api/transfers")
      .send({ ...VALID_BODY, sendAmount: 2_000_000 });
    expect(res.status).to.equal(400);
    expect(res.body.error).to.include("sendAmount");
  });

  it("returns 400 when accountNumber exceeds 20 chars", async () => {
    const res = await request(app)
      .post("/api/transfers")
      .send({ ...VALID_BODY, accountNumber: "1".repeat(21) });
    expect(res.status).to.equal(400);
    expect(res.body.error).to.include("length");
  });

  it("returns 400 when no deposit address is configured for the token", async () => {
    installPrismaMocks(null); // depositAddress.findUnique returns null
    const res = await request(app).post("/api/transfers").send(VALID_BODY);
    expect(res.status).to.equal(400);
    expect(res.body.error).to.include("No deposit address");
  });
});

// ─── GET /api/transfers ───────────────────────────────────────────────────────

describe("GET /api/transfers", () => {
  afterEach(() => {
    sinon.restore();
    restorePrisma();
  });

  it("returns 400 when walletAddress query param is missing", async () => {
    const res = await request(app).get("/api/transfers");
    expect(res.status).to.equal(400);
  });

  it("returns transfers for a valid Stacks wallet address", async () => {
    installPrismaMocks();
    const validStx = "SP2X0TZ59D5SZ8ACQ6YMCHHNR2ZN51Z32E2CJ173";
    const res = await request(app).get("/api/transfers?walletAddress=" + validStx);
    expect(res.status).to.equal(200);
    expect(res.body.transfers).to.be.an("array");
  });

  it("returns 400 for an invalid wallet address format", async () => {
    const res = await request(app).get("/api/transfers?walletAddress=INVALID");
    expect(res.status).to.equal(400);
    expect(res.body.error).to.include("Invalid wallet address");
  });
});
