import { expect } from "chai";
import {
  canTransition,
  OPEN_STATUSES,
  EXPIRABLE_STATUSES,
  OrderStatus,
} from "../src/store";

const TERMINAL: OrderStatus[] = ["settled", "released", "rejected", "expired", "failed"];

describe("order state machine", () => {
  describe("sell leg", () => {
    it("walks awaiting_deposit → deposit_confirmed → awaiting_manual_payout → settled", () => {
      expect(canTransition("awaiting_deposit", "deposit_confirmed")).to.equal(true);
      expect(canTransition("deposit_confirmed", "awaiting_manual_payout")).to.equal(true);
      expect(canTransition("awaiting_manual_payout", "settled")).to.equal(true);
    });

    it("cannot skip straight from awaiting_deposit to settled", () => {
      expect(canTransition("awaiting_deposit", "settled")).to.equal(false);
    });
  });

  describe("buy leg", () => {
    it("walks awaiting_payment → payment_claimed → verifying → released", () => {
      expect(canTransition("awaiting_payment", "payment_claimed")).to.equal(true);
      expect(canTransition("payment_claimed", "verifying")).to.equal(true);
      expect(canTransition("verifying", "released")).to.equal(true);
    });

    it("cannot release straight from a payment claim, skipping verification", () => {
      expect(canTransition("payment_claimed", "released")).to.equal(false);
      expect(canTransition("awaiting_payment", "released")).to.equal(false);
    });
  });

  describe("value in flight is never auto-expired", () => {
    it("only allows expiry from states where nothing has been received", () => {
      expect(EXPIRABLE_STATUSES).to.have.members(["awaiting_deposit", "awaiting_payment"]);
    });

    it("refuses to expire a confirmed deposit — the desk owes fiat by then", () => {
      expect(canTransition("deposit_confirmed", "expired")).to.equal(false);
      expect(canTransition("awaiting_manual_payout", "expired")).to.equal(false);
    });

    it("refuses to expire a claimed payment — the money may be settling", () => {
      expect(canTransition("payment_claimed", "expired")).to.equal(false);
      expect(canTransition("verifying", "expired")).to.equal(false);
    });

    it("every expirable status is also an open status", () => {
      for (const s of EXPIRABLE_STATUSES) {
        expect(OPEN_STATUSES).to.include(s);
      }
    });
  });

  describe("terminal states", () => {
    it("admits no outgoing transitions at all", () => {
      const everyStatus: OrderStatus[] = [...OPEN_STATUSES, ...TERMINAL];
      for (const from of TERMINAL) {
        for (const to of everyStatus) {
          expect(canTransition(from, to), `${from} → ${to}`).to.equal(false);
        }
      }
    });

    it("is disjoint from the open set", () => {
      for (const t of TERMINAL) {
        expect(OPEN_STATUSES).to.not.include(t);
      }
    });
  });

  describe("cross-leg transitions", () => {
    it("cannot jump between the buy and sell legs", () => {
      expect(canTransition("awaiting_deposit", "payment_claimed")).to.equal(false);
      expect(canTransition("awaiting_payment", "deposit_confirmed")).to.equal(false);
      expect(canTransition("verifying", "settled")).to.equal(false);
      expect(canTransition("awaiting_manual_payout", "released")).to.equal(false);
    });
  });
});
