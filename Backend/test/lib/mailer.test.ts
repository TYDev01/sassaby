import { expect } from "chai";
import sinon from "sinon";
import axios from "axios";

import { sendMail } from "../../src/lib/mailer";
import { sendWelcomeEmail } from "../../src/lib/emails/welcome";

describe("mailer", () => {
  const saved = { key: process.env.RESEND_API_KEY, from: process.env.MAIL_FROM };

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "Sassaby <noreply@sassaby.exchange>";
  });

  afterEach(() => {
    sinon.restore();
    if (saved.key === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = saved.key;
    if (saved.from === undefined) delete process.env.MAIL_FROM;
    else process.env.MAIL_FROM = saved.from;
  });

  describe("sendMail()", () => {
    it("posts to Resend with the configured sender and a bearer key", async () => {
      const post = sinon.stub(axios, "post").resolves({ data: { id: "abc" } });

      await sendMail({ to: "user@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" });

      expect(post.calledOnce).to.equal(true);
      const [url, body, cfg] = post.firstCall.args as [string, Record<string, unknown>, { headers: Record<string, string> }];
      expect(url).to.equal("https://api.resend.com/emails");
      expect(body.from).to.equal("Sassaby <noreply@sassaby.exchange>");
      expect(body.to).to.deep.equal(["user@example.com"]);
      expect(body.subject).to.equal("Hi");
      expect(cfg.headers.Authorization).to.equal("Bearer re_test_key");
    });

    it("no-ops without throwing when Resend is not configured", async () => {
      delete process.env.RESEND_API_KEY;
      const post = sinon.stub(axios, "post").resolves({ data: {} });

      await sendMail({ to: "user@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" });

      expect(post.called).to.equal(false);
    });

    // The whole point of the fail-soft contract: registration must not 500
    // because Resend was down.
    it("swallows a send failure", async () => {
      sinon.stub(axios, "post").rejects(new Error("connect ETIMEDOUT"));

      await sendMail({ to: "user@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" });
    });
  });

  describe("sendWelcomeEmail()", () => {
    it("greets by first name and sends both html and text parts", async () => {
      const post = sinon.stub(axios, "post").resolves({ data: { id: "abc" } });

      await sendWelcomeEmail({ email: "ada@example.com", fullName: "Ada Lovelace" });

      const body = post.firstCall.args[1] as Record<string, string>;
      expect(body.subject).to.equal("Welcome to Sassaby");
      expect(body.html).to.include("Hi Ada,");
      expect(body.text).to.include("Hi Ada,");
      expect(body.html).to.include("<");
      expect(body.text).to.not.include("<td");
    });

    it("falls back to a nameless greeting when fullName is blank", async () => {
      const post = sinon.stub(axios, "post").resolves({ data: { id: "abc" } });

      await sendWelcomeEmail({ email: "ada@example.com", fullName: "   " });

      const body = post.firstCall.args[1] as Record<string, string>;
      expect(body.html).to.include("Hi there,");
    });

    // fullName is user-supplied and lands inside the HTML body.
    it("escapes html in the recipient's name", async () => {
      const post = sinon.stub(axios, "post").resolves({ data: { id: "abc" } });

      await sendWelcomeEmail({ email: "x@example.com", fullName: "<script>alert(1)</script>" });

      const body = post.firstCall.args[1] as Record<string, string>;
      expect(body.html).to.not.include("<script>");
      expect(body.html).to.include("&lt;script&gt;");
    });
  });
});
