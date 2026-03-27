/**
 * Property-based / fuzzy tests using fast-check.
 *
 * fast-check generates hundreds of random inputs per property and shrinks
 * failures down to the smallest reproducing case.  These complement the
 * hand-written unit tests by exploring the full input space automatically.
 */
import fc from "fast-check";
import { expect } from "chai";
import request from "supertest";
import app from "../../src/app";

// ─── adminAuth ────────────────────────────────────────────────────────────────

describe("adminAuth — property-based", () => {
  before(() => {
    process.env.ADMIN_API_KEY = "correct-secret-key-for-tests";
  });
  after(() => {
    delete process.env.ADMIN_API_KEY;
  });

  it("any token that is NOT the real key is always rejected (401 or 403)", () => {
    fc.assert(
      fc.property(
        // Generate arbitrary non-empty strings that differ from the real key
        fc.string({ minLength: 1 }).filter((s) => s !== "correct-secret-key-for-tests"),
        (badToken) => {
          // Synchronous stub via in-process call (avoids HTTP round-trip overhead)
          const { adminAuth } = require("../../src/middleware/adminAuth");
          const statusCalls: number[] = [];
          const req: any = { headers: { authorization: `Bearer ${badToken}` } };
          const res: any = {
            status(code: number) { statusCalls.push(code); return this; },
            json() { return this; },
          };
          adminAuth(req, res, () => { throw new Error("next() must not be called"); });
          // A token that doesn't match must always be rejected — 401 when the
          // header can't be parsed cleanly (e.g. contains spaces), 403 otherwise.
          return statusCalls[0] === 401 || statusCalls[0] === 403;
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ─── POST /api/transfers — input validation ───────────────────────────────────

describe("POST /api/transfers — property-based validation", () => {
  it("always rejects sendAmount <= 0", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.integer({ max: 0 }),          // zero or negative integers
          fc.float({ max: -Number.EPSILON }) // negative floats
        ),
        async (badAmount) => {
          const res = await request(app)
            .post("/api/transfers")
            .send({
              sendAmount: badAmount,
              sendToken: "STX",
              receiveCurrency: "NGN",
              bank: "Bank",
              bankCode: "001",
              accountNumber: "1234567890",
            });
          return res.status === 400;
        }
      ),
      { numRuns: 50 }
    );
  });

  it("always rejects sendAmount > 1_000_000", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1_000_001, max: 1e9 }),
        async (bigAmount) => {
          const res = await request(app)
            .post("/api/transfers")
            .send({
              sendAmount: bigAmount,
              sendToken: "STX",
              receiveCurrency: "NGN",
              bank: "Bank",
              bankCode: "001",
              accountNumber: "1234567890",
            });
          return res.status === 400;
        }
      ),
      { numRuns: 50 }
    );
  });

  it("always rejects tokens not in [STX, USDCx, BTC]", async () => {
    const VALID = new Set(["STX", "USDCx", "BTC"]);
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => !VALID.has(s)),
        async (badToken) => {
          const res = await request(app)
            .post("/api/transfers")
            .send({
              sendAmount: 1,
              sendToken: badToken,
              receiveCurrency: "NGN",
              bank: "Bank",
              bankCode: "001",
              accountNumber: "1234567890",
            });
          return res.status === 400;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("always rejects currencies not in [NGN, GHS, KES]", async () => {
    const VALID = new Set(["NGN", "GHS", "KES"]);
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 5 }).filter((s) => !VALID.has(s)),
        async (badCurrency) => {
          const res = await request(app)
            .post("/api/transfers")
            .send({
              sendAmount: 1,
              sendToken: "STX",
              receiveCurrency: badCurrency,
              bank: "Bank",
              bankCode: "001",
              accountNumber: "1234567890",
            });
          return res.status === 400;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("always rejects accountNumber longer than 20 chars", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 21, maxLength: 100 }),
        async (longAcct) => {
          const res = await request(app)
            .post("/api/transfers")
            .send({
              sendAmount: 1,
              sendToken: "STX",
              receiveCurrency: "NGN",
              bank: "Bank",
              bankCode: "001",
              accountNumber: longAcct,
            });
          return res.status === 400;
        }
      ),
      { numRuns: 50 }
    );
  });
});
