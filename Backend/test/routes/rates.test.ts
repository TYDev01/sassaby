import { expect } from "chai";
import sinon from "sinon";
import axios from "axios";
import { getTokenPriceUSD, __resetRateCaches } from "../../src/routes/rates";

describe("getTokenPriceUSD()", () => {
  // The price cache is memoised for 60s and outlives a single test, so a
  // successful fetch here would otherwise satisfy the "no price data" case below.
  afterEach(() => {
    sinon.restore();
    __resetRateCaches();
  });

  it("throws for an unsupported token", async () => {
    try {
      await getTokenPriceUSD("DOGE");
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      expect((err as Error).message).to.include("Unsupported token");
    }
  });

  it("returns the price from CoinGecko for USDT", async () => {
    sinon.stub(axios, "get").resolves({
      data: { tether: { usd: 1.0 } },
    });

    const price = await getTokenPriceUSD("USDT");
    expect(price).to.equal(1.0);
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
      await getTokenPriceUSD("USDT");
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      expect((err as Error).message).to.include("No price data");
    }
  });
});
