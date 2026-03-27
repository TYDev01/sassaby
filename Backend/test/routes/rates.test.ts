import { expect } from "chai";
import sinon from "sinon";
import axios from "axios";
import { getTokenPriceUSD } from "../../src/routes/rates";

describe("getTokenPriceUSD()", () => {
  afterEach(() => sinon.restore());

  it("throws for an unsupported token", async () => {
    try {
      await getTokenPriceUSD("DOGE");
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      expect((err as Error).message).to.include("Unsupported token");
    }
  });

  it("returns the price from CoinGecko for STX", async () => {
    sinon.stub(axios, "get").resolves({
      data: { blockstack: { usd: 1.23 } },
    });

    const price = await getTokenPriceUSD("STX");
    expect(price).to.equal(1.23);
  });

  it("returns the price for BTC", async () => {
    sinon.stub(axios, "get").resolves({
      data: { bitcoin: { usd: 60000 } },
    });

    const price = await getTokenPriceUSD("BTC");
    expect(price).to.equal(60000);
  });

  it("throws when CoinGecko returns no price data", async () => {
    sinon.stub(axios, "get").resolves({ data: {} });

    try {
      await getTokenPriceUSD("USDCx");
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      expect((err as Error).message).to.include("No price data");
    }
  });
});
