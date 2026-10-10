// Unit/integration tests for api/contact.js using a mocked fetch (no network, no real emails).
// Run: node scripts/test-api.mjs
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const handler = createRequire(import.meta.url)(path.join(root, "api", "contact.js"));

let calls = [];
let fetchPlan = () => ({ ok: true, status: 200, json: async () => ({ ok: true, success: true }), text: async () => "" });
globalThis.fetch = async (url, opts) => { calls.push({ url: String(url), opts }); return fetchPlan(String(url), opts); };

function run({ method = "POST", body, headers = {}, ip = "1.2.3.4" } = {}) {
  return new Promise(async (resolve) => {
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(data) { resolve({ status: this.statusCode, headers: this.headers, json: data ? JSON.parse(data) : null }); },
    };
    const req = { method, body, headers: { host: "site.test", "x-forwarded-for": ip, ...headers }, socket: {} };
    await handler(req, res);
  });
}
const good = () => ({ name: "Test User", email: "test@example.com", telegram: "@test_user", service: "Business website", size: "", timeline: "", message: "I need a website for my small bakery in Addis.", consent: true, website: "", elapsed: 15000 });
const ENV = ["RESEND_API_KEY", "CONTACT_TO_EMAIL", "CONTACT_FROM_EMAIL", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "TURNSTILE_SECRET_KEY", "ALLOWED_ORIGINS"];
const setEnv = (o) => { ENV.forEach((k) => delete process.env[k]); Object.assign(process.env, o); calls = []; fetchPlan = () => ({ ok: true, status: 200, json: async () => ({ ok: true, success: true }), text: async () => "" }); };
let n = 0, ipc = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log("  ok  ", name); } catch (e) { console.log("  FAIL", name, "\n      ", e.message); process.exitCode = 1; } };
const ip = () => `10.0.0.${++ipc}`;
const FULL = { RESEND_API_KEY: "re_test_key", CONTACT_TO_EMAIL: "owner@example.com", TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_CHAT_ID: "42" };

await t("rejects non-POST with 405", async () => { setEnv(FULL); const r = await run({ method: "GET", ip: ip() }); assert.equal(r.status, 405); });
await t("503 when no delivery channel configured", async () => { setEnv({}); const r = await run({ body: good(), ip: ip() }); assert.equal(r.status, 503); assert.equal(calls.length, 0); });
await t("valid request delivers via email + telegram and returns ok", async () => {
  setEnv(FULL); const r = await run({ body: good(), ip: ip() });
  assert.equal(r.status, 200); assert.equal(r.json.ok, true); assert.equal(calls.length, 2);
  const mail = calls.find((c) => c.url.includes("resend")); const body = JSON.parse(mail.opts.body);
  assert.equal(mail.opts.headers.Authorization, "Bearer re_test_key"); assert.deepEqual(body.to, ["owner@example.com"]);
  assert.equal(body.reply_to, "test@example.com"); assert.match(body.subject, /Business website/);
  assert.ok(calls.find((c) => c.url.includes("api.telegram.org/bot123:abc/sendMessage")));
});
await t("works with email only and telegram only", async () => {
  setEnv({ RESEND_API_KEY: "k", CONTACT_TO_EMAIL: "o@e.com" }); let r = await run({ body: good(), ip: ip() }); assert.equal(r.status, 200); assert.equal(calls.length, 1);
  setEnv({ TELEGRAM_BOT_TOKEN: "1:a", TELEGRAM_CHAT_ID: "1" }); r = await run({ body: good(), ip: ip() }); assert.equal(r.status, 200); assert.equal(calls.length, 1);
});
await t("succeeds if one channel fails but the other works", async () => {
  setEnv(FULL); fetchPlan = (u) => u.includes("resend") ? { ok: false, status: 500, text: async () => "simulated email failure" } : { ok: true, status: 200, json: async () => ({ ok: true }) };
  const r = await run({ body: good(), ip: ip() }); assert.equal(r.status, 200);
});
await t("502 (generic error, no provider details) if every channel fails", async () => {
  setEnv(FULL); fetchPlan = () => ({ ok: false, status: 500 });
  const r = await run({ body: good(), ip: ip() }); assert.equal(r.status, 502); assert.ok(!JSON.stringify(r.json).includes("resend"));
});
await t("422 with field errors for invalid input", async () => {
  setEnv(FULL); const r = await run({ body: { ...good(), name: "", email: "nope", message: "short", consent: false, service: "" }, ip: ip() });
  assert.equal(r.status, 422); for (const k of ["name", "email", "message", "consent", "service"]) assert.ok(r.json.fieldErrors[k], k); assert.equal(calls.length, 0);
});
await t("rejects header/CRLF injection attempts in email", async () => {
  setEnv(FULL); const r = await run({ body: { ...good(), email: "a@b.com\r\nBcc: x@y.com" }, ip: ip() }); assert.equal(r.status, 422); assert.equal(calls.length, 0);
});
await t("subject has no newlines even if name does", async () => {
  setEnv(FULL); await run({ body: { ...good(), name: "Eve\r\nBcc: x@y.com" }, ip: ip() });
  const subj = JSON.parse(calls.find((c) => c.url.includes("resend")).opts.body).subject; assert.ok(!/[\r\n]/.test(subj));
});
await t("HTML in message is escaped in html email and Telegram text", async () => {
  setEnv(FULL); await run({ body: { ...good(), message: "<script>alert(1)</script> hello there, please build me a thing" }, ip: ip() });
  const m = JSON.parse(calls.find((c) => c.url.includes("resend")).opts.body); assert.ok(!m.html.includes("<script>")); assert.ok(m.html.includes("&lt;script&gt;"));
  const tg = JSON.parse(calls.find((c) => c.url.includes("telegram")).opts.body); assert.ok(!tg.text.includes("<script>"));
});
await t("honeypot: pretends success but delivers nothing", async () => {
  setEnv(FULL); const r = await run({ body: { ...good(), website: "http://spam.example" }, ip: ip() }); assert.equal(r.status, 200); assert.equal(calls.length, 0);
});
await t("too-fast submissions are rejected", async () => {
  setEnv(FULL); const r = await run({ body: { ...good(), elapsed: 300 }, ip: ip() }); assert.equal(r.status, 400); assert.equal(calls.length, 0);
});
await t("missing elapsed is rejected", async () => { setEnv(FULL); const b = good(); delete b.elapsed; const r = await run({ body: b, ip: ip() }); assert.equal(r.status, 400); });
await t("link-stuffed spam is rejected", async () => {
  setEnv(FULL); const r = await run({ body: { ...good(), message: "http://a.co http://b.co http://c.co http://d.co buy now please" }, ip: ip() }); assert.equal(r.status, 422);
});
await t("turnstile: required and verified when secret is set", async () => {
  setEnv({ ...FULL, TURNSTILE_SECRET_KEY: "ts_secret" });
  let r = await run({ body: good(), ip: ip() }); assert.equal(r.status, 400); // no token
  fetchPlan = (u) => u.includes("siteverify") ? { ok: true, json: async () => ({ success: false }) } : { ok: true, status: 200 };
  r = await run({ body: { ...good(), turnstileToken: "bad" }, ip: ip() }); assert.equal(r.status, 400);
  fetchPlan = () => ({ ok: true, status: 200, json: async () => ({ ok: true, success: true }), text: async () => "" });
  r = await run({ body: { ...good(), turnstileToken: "ok" }, ip: ip() }); assert.equal(r.status, 200);
});
await t("rate limit returns 429 after 5 requests from one IP", async () => {
  setEnv(FULL); const same = "9.9.9.9"; let last;
  for (let i = 0; i < 6; i++) last = await run({ body: good(), ip: same });
  assert.equal(last.status, 429);
});
await t("cross-origin request from unlisted origin is blocked (403)", async () => {
  setEnv(FULL); const r = await run({ body: good(), headers: { origin: "https://evil.example" }, ip: ip() }); assert.equal(r.status, 403); assert.equal(calls.length, 0);
});
await t("same-origin and allow-listed origins work; CORS header set only for allow-list", async () => {
  setEnv({ ...FULL, ALLOWED_ORIGINS: "https://me.example" });
  let r = await run({ body: good(), headers: { origin: "https://site.test" }, ip: ip() }); assert.equal(r.status, 200);
  r = await run({ body: good(), headers: { origin: "https://me.example" }, ip: ip() }); assert.equal(r.status, 200); assert.equal(r.headers["access-control-allow-origin"], "https://me.example");
  r = await run({ method: "OPTIONS", headers: { origin: "https://me.example" }, ip: ip() }); assert.equal(r.status, 204);
});
await t("invalid / non-object body is rejected", async () => {
  setEnv(FULL); let r = await run({ body: "not json", ip: ip() }); assert.equal(r.status, 400); r = await run({ body: [1, 2], ip: ip() }); assert.equal(r.status, 400);
});
await t("secrets never appear in responses", async () => {
  setEnv(FULL); const r = await run({ body: good(), ip: ip() }); const s = JSON.stringify(r); assert.ok(!s.includes("re_test_key") && !s.includes("123:abc"));
});

console.log(`\n${n} passed${process.exitCode ? " — with failures" : ""}`);
