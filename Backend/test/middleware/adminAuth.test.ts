import { expect } from "chai";
import sinon from "sinon";
import { Request, Response, NextFunction } from "express";
import { adminAuth } from "../../src/middleware/adminAuth";

// Helper to create a minimal mock response
function mockRes() {
  const res: Partial<Response> = {};
  res.status = sinon.stub().returns(res);
  res.json = sinon.stub().returns(res);
  return res as Response & { status: sinon.SinonStub; json: sinon.SinonStub };
}

describe("adminAuth middleware", () => {
  const next = sinon.stub() as unknown as NextFunction;

  afterEach(() => {
    sinon.restore();
    delete process.env.ADMIN_API_KEY;
  });

  it("responds 503 when ADMIN_API_KEY is not set", () => {
    delete process.env.ADMIN_API_KEY;
    const req = { headers: {} } as Request;
    const res = mockRes();

    adminAuth(req, res, next);

    expect((res.status as sinon.SinonStub).calledWith(503)).to.be.true;
    expect((res.json as sinon.SinonStub).calledOnce).to.be.true;
  });

  it("responds 401 when Authorization header is absent", () => {
    process.env.ADMIN_API_KEY = "supersecret";
    const req = { headers: {} } as Request;
    const res = mockRes();

    adminAuth(req, res, next);

    expect((res.status as sinon.SinonStub).calledWith(401)).to.be.true;
  });

  it("responds 401 when scheme is not Bearer", () => {
    process.env.ADMIN_API_KEY = "supersecret";
    const req = { headers: { authorization: "Basic supersecret" } } as Request;
    const res = mockRes();

    adminAuth(req, res, next);

    expect((res.status as sinon.SinonStub).calledWith(401)).to.be.true;
  });

  it("responds 403 when token does not match", () => {
    process.env.ADMIN_API_KEY = "supersecret";
    const req = { headers: { authorization: "Bearer wrongtoken" } } as Request;
    const res = mockRes();

    adminAuth(req, res, next);

    expect((res.status as sinon.SinonStub).calledWith(403)).to.be.true;
  });

  it("calls next() when token is correct", () => {
    process.env.ADMIN_API_KEY = "supersecret";
    const req = { headers: { authorization: "Bearer supersecret" } } as Request;
    const res = mockRes();
    const nextSpy = sinon.spy();

    adminAuth(req, res, nextSpy);

    expect(nextSpy.calledOnce).to.be.true;
    expect((res.status as sinon.SinonStub).called).to.be.false;
  });
});
