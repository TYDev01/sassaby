import request from "supertest";
import { expect } from "chai";
import sinon from "sinon";
import axios from "axios";
import app from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { signToken } from "../../src/lib/auth";
import { __resetRateCaches } from "../../src/routes/rates";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const USER = {
  id: "user-1",
  email: "trader@example.com",
  password: "$2a$12$notarealhashbutlookslikeone000000000000000000000000000",
  phone: "",
  fullName: "Ada Trader",
  bankAccountName: "Ada Trader",
  kycTier: "light",
  banned: false,
  createdAt: new Date(),
};

const SELL_BODY = {
  direction: "sell",
  sendAmount: 10,
  sendToken: "BTC",
  chain: "bitcoin",
  receiveCurrency: "NGN",
  bank: "First Bank",
  bankCode: "011",
  accountNumber: "1234567890",
  senderAddress: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
};

const BUY_BODY = {
  direction: "buy",
  sendAmount: 10,
  sendToken: "BTC",
  chain: "bitcoin",
  receiveCurrency: "NGN",
  destinationAddress: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
};

// ─── Prisma delegate mocks ────────────────────────────────────────────────────
// Prisma delegates are Proxies, so stubbing individual methods is bypassed —
// the whole delegate is replaced instead. Same approach the old suite used.

const originals: Record<string, unknown> = {};

interface MockOpts {
  openOrder?: unknown;
  depositRow?: unknown;
  createThrows?: { code: string };
}

function installMocks(opts: MockOpts = {}) {
  const p = prisma as unknown as Record<string, unknown>;
  for (const key of ["user", "depositAddress", "rateConfig", "transfer"]) {
    if (!(key in originals)) originals[key] = p[key];
  }

  p.user = { findUnique: sinon.stub().resolves(USER) };

  // Keep the suite off the network. Quoting calls getTokenPriceUSD, which would
  // otherwise hit CoinGecko for real — slow, flaky, and it poisons the shared
  // 60s price cache for every suite that runs afterwards.
  sinon.stub(axios, "get").resolves({
    data: { bitcoin: { usd: 60000 } },
  });

  p.depositAddress = {
    findUnique: sinon.stub().resolves(
      opts.depositRow === undefined
        ? {
            id: 1, token: "BTC", chain: "bitcoin", address: "BTC_DESK_ADDR",
            memo: "", label: "", kind: "self", active: true, updatedAt: new Date(),
          }
        : opts.depositRow
    ),
  };

  // Manual rate keeps getFlwRate() off the network.
  p.rateConfig = {
    findUnique: sinon.stub().resolves({
      id: 1, currency: "NGN", mode: "manual", manualRate: "1600",
    }),
  };

  const create = opts.createThrows
    ? sinon.stub().rejects(Object.assign(new Error("unique violation"), opts.createThrows))
    : sinon.stub().callsFake(({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        createdAt: new Date(),
        completedAt: null,
        releasedAt: null,
      }));

  p.transfer = {
    findFirst:  sinon.stub().resolves(opts.openOrder ?? null),
    findMany:   sinon.stub().resolves([]),
    findUnique: sinon.stub().resolves(null),
    create,
    updateMany: sinon.stub().resolves({ count: 1 }),
  };
}

function restoreMocks() {
  const p = prisma as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(originals)) p[k] = v;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/orders", () => {
  let token: string;

  // Scoped to this suite on purpose. Declared at file level these become Mocha
  // ROOT hooks and run against every other suite in the run, restoring their
  // stubs out from under them.
  before(() => {
    process.env.JWT_SECRET = "a".repeat(48);
    token = signToken({ userId: USER.id });
  });

  afterEach(() => {
    restoreMocks();
    sinon.restore();
    __resetRateCaches();
  });

  it("rejects an unauthenticated request", async () => {
    installMocks();
    const res = await request(app).post("/api/orders").send(SELL_BODY);
    expect(res.status).to.equal(401);
  });

  it("creates a sell order awaiting_deposit and returns the deposit address", async () => {
    installMocks();
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send(SELL_BODY);

    expect(res.status).to.equal(201);
    expect(res.body.status).to.equal("awaiting_deposit");
    expect(res.body.depositAddress).to.equal("BTC_DESK_ADDR");
  });

  it("creates a buy order awaiting_payment and exposes no deposit address", async () => {
    installMocks();
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send(BUY_BODY);

    expect(res.status).to.equal(201);
    expect(res.body.status).to.equal("awaiting_payment");
    expect(res.body.depositAddress).to.equal("");
  });

  it("refuses an unsupported (token, chain) pair", async () => {
    installMocks();
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      // BTC exists on Bitcoin, not on Tron.
      .send({ ...SELL_BODY, chain: "tron" });

    expect(res.status).to.equal(400);
    expect(res.body.error).to.match(/not a supported asset/i);
  });

  it("refuses a buy with no destination wallet", async () => {
    installMocks();
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...BUY_BODY, destinationAddress: "" });

    expect(res.status).to.equal(400);
  });

  it("refuses a sell when the asset has no configured deposit address", async () => {
    installMocks({ depositRow: null });
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send(SELL_BODY);

    expect(res.status).to.equal(400);
    expect(res.body.error).to.match(/not currently accepted/i);
  });

  describe("one open order per user", () => {
    it("returns 409 and the existing order id when one is already open", async () => {
      installMocks({
        openOrder: {
          id: "open-order-1", userId: USER.id, status: "awaiting_payment",
          direction: "buy", sendAmount: 1, sendToken: "BTC", chain: "bitcoin",
          usdEquivalent: 1, receiveAmount: 1, receiveCurrency: "NGN", fee: 0, feeRate: 0,
          createdAt: new Date(),
        },
      });

      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${token}`)
        .send(SELL_BODY);

      expect(res.status).to.equal(409);
      expect(res.body.openOrderId).to.equal("open-order-1");
    });

    it("still returns 409 when the race is lost and the DB index fires", async () => {
      // The pre-check passes (no open order visible) but a concurrent request
      // commits first — the partial unique index rejects this insert. This is
      // the path a disabled submit button cannot cover.
      installMocks({ createThrows: { code: "P2002" } });

      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${token}`)
        .send(SELL_BODY);

      expect(res.status).to.equal(409);
      expect(res.body.error).to.match(/already have an order/i);
    });
  });
});
