import request from "supertest";
import { expect } from "chai";
import app from "../src/app";

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).to.equal(200);
    expect(res.body.status).to.equal("ok");
    expect(res.body).to.have.property("timestamp");
  });

  it("timestamp is a valid ISO string", async () => {
    const res = await request(app).get("/health");
    const parsed = Date.parse(res.body.timestamp);
    expect(parsed).to.be.a("number").and.not.be.NaN;
  });
});

describe("Unknown routes", () => {
  it("returns 404 for an unknown path", async () => {
    const res = await request(app).get("/does-not-exist");
    expect(res.status).to.equal(404);
  });
});
