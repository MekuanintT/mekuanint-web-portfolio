/**
 * POST /api/contact — receives quote requests from the website form and
 * delivers them to you by email (Resend) and/or Telegram (Bot API).
 *
 * Runs as a Vercel serverless function. All secrets come from environment
 * variables set in the Vercel dashboard — nothing secret is in the frontend.
 *
 *   RESEND_API_KEY        Resend API key (https://resend.com)           [email]
 *   CONTACT_TO_EMAIL      Where inquiries are delivered                 [email]
 *   CONTACT_FROM_EMAIL    Verified sender, e.g. "Portfolio <hello@yourdomain.com>".
 *                         Defaults to Resend's test sender, which can only
 *                         deliver to the email address of your Resend account.
 *   TELEGRAM_BOT_TOKEN    Token from @BotFather                         [telegram]
 *   TELEGRAM_CHAT_ID      Your chat id (message the bot, then see README) [telegram]
 *   TURNSTILE_SECRET_KEY  Optional Cloudflare Turnstile secret (enables the check)
 *   ALLOWED_ORIGINS       Optional comma-separated list of site origins allowed
 *                         to call this API cross-origin, e.g. "https://me.dev,https://www.me.dev"
 *
 * At least one delivery channel (email or Telegram) must be configured.
 */
"use strict";

const MIN_FILL_MS = 2000;            // faster than this after page load = bot
const RATE_LIMIT = 5;                // requests per IP per window (best effort, per instance)
const RATE_WINDOW_MS = 10 * 60 * 1000;
const hits = new Map();

const EMAIL_RE = /^[^\s@<>()"',;:\\]+@[^\s@<>()"',;:\\]+\.[^\s@<>()"',;:\\]{2,}$/;
const TG_RE = /^@?[A-Za-z0-9_]{3,32}$/;

function clean(value, max) {
  if (typeof value !== "string") return "";
  // strip control characters (keep \n and \t), normalise, trim, cap length
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}
function oneLine(value, max) { return clean(value, max).replace(/\s+/g, " "); }
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) { // keep memory bounded
    for (const [k, v] of hits) if (!v.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k);
  }
  return list.length > RATE_LIMIT;
}

function validate(body) {
  const fieldErrors = {};
  const data = {
    name: oneLine(body.name, 100),
    email: oneLine(body.email, 254),
    telegram: oneLine(body.telegram, 64),
    service: oneLine(body.service, 80),
    size: oneLine(body.size, 80),
    timeline: oneLine(body.timeline, 80),
    message: clean(body.message, 4000),
  };
  if (!data.name) fieldErrors.name = "Please enter your name.";
  if (!data.email) fieldErrors.email = "Please enter your email address.";
  else if (!EMAIL_RE.test(data.email)) fieldErrors.email = "That doesn't look like a valid email address.";
  if (!data.service) fieldErrors.service = "Please choose what you need.";
  if (data.telegram && !TG_RE.test(data.telegram)) fieldErrors.telegram = "Use a Telegram username like @yourname, or leave this empty.";
  if (data.message.length < 20) fieldErrors.message = "Please add a bit more detail (at least 20 characters).";
  if (body.consent !== true) fieldErrors.consent = "Please tick the box so I can reply to you.";
  if ((data.message.match(/https?:\/\//gi) || []).length > 3) fieldErrors.message = "Please remove some links from your message.";
  return { data, fieldErrors };
}

function buildMessages(d, meta) {
  const subject = oneLine(`New quote request: ${d.service} — ${d.name}`, 150);
  const rows = [
    ["Name", d.name], ["Email", d.email], ["Telegram", d.telegram || "—"],
    ["Service", d.service], ["Project size", d.size || "—"], ["Timeline", d.timeline || "—"],
  ];
  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
    `\n\nMessage:\n${d.message}\n\n— Sent from the website quote form (${meta.when})`;
  const html = `<h2 style="margin:0 0 12px">New quote request</h2>
<table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">
${rows.map(([k, v]) => `<tr><td style="color:#666;vertical-align:top"><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join("\n")}
</table>
<p style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap"><b>Message</b><br>${esc(d.message)}</p>
<p style="color:#888;font-size:12px;font-family:Arial,sans-serif">Sent from the website quote form (${esc(meta.when)}). Reply to this email to answer ${esc(d.name)}.</p>`;
  const telegram = `<b>New quote request</b>\n` +
    rows.map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}`).join("\n") +
    `\n\n${esc(d.message.slice(0, 3000))}`;
  return { subject, text, html, telegram };
}

async function sendEmail(msg, d, env) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.CONTACT_FROM_EMAIL || "Portfolio <onboarding@resend.dev>",
      to: [env.CONTACT_TO_EMAIL],
      reply_to: d.email,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    }),
  });
  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw new Error(`resend ${res.status}: ${details.slice(0, 500)}`);
  }
}


async function sendTelegram(msg, env) {
  const res = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: String(env.TELEGRAM_CHAT_ID).trim(),
        text: msg.telegram,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    }
  );

  const result = await res.json().catch(() => null);

  if (!res.ok || !result?.ok) {
    throw new Error(
      `telegram ${res.status}: ${
        result?.description || "Unknown Telegram API error"
      }`
    );
  }
}

async function verifyTurnstile(token, ip, secret) {
  if (!token || typeof token !== "string") return false;
  const params = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") params.set("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: params });
  if (!res.ok) return false;
  const json = await res.json();
  return json.success === true;
}

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function handler(req, res) {
  const env = process.env;
  const origin = req.headers.origin;
  const allow = allowedOrigins(env);

  // --- Origin / CORS ---
  if (origin) {
    let sameHost = false;
    try { sameHost = new URL(origin).host === req.headers.host; } catch (_) { /* invalid origin */ }
    if (allow.includes(origin.replace(/\/$/, ""))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
    } else if (!sameHost) {
      return send(res, 403, { ok: false, error: "This origin is not allowed." });
    }
  }
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "POST") { res.setHeader("Allow", "POST, OPTIONS"); return send(res, 405, { ok: false, error: "Method not allowed." }); }

  // --- Configuration check ---
  const emailReady = !!(env.RESEND_API_KEY && env.CONTACT_TO_EMAIL);
  const telegramReady = !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
  if (!emailReady && !telegramReady) {
    console.error("contact: no delivery channel configured (set RESEND_API_KEY + CONTACT_TO_EMAIL and/or TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)");
    return send(res, 503, { ok: false, error: "The contact form isn't set up on the server yet." });
  }

  // --- Rate limit ---
  const ip = clientIp(req);
  if (rateLimited(ip)) { res.setHeader("Retry-After", "600"); return send(res, 429, { ok: false, error: "Too many requests." }); }

  // --- Body ---
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = null; } }
  if (!body || typeof body !== "object" || Array.isArray(body)) return send(res, 400, { ok: false, error: "Invalid request." });

  // --- Spam signals ---
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return send(res, 200, { ok: true }); // honeypot: pretend success, deliver nothing
  }
  if (typeof body.elapsed !== "number" || body.elapsed < MIN_FILL_MS) {
    return send(res, 400, { ok: false, error: "That was sent too quickly. Please review your message and try again." });
  }
  if (env.TURNSTILE_SECRET_KEY) {
    let human = false;
    try { human = await verifyTurnstile(body.turnstileToken, ip, env.TURNSTILE_SECRET_KEY); } catch (e) { console.error("contact: turnstile error", e.message); }
    if (!human) return send(res, 400, { ok: false, error: "The spam check failed. Please refresh the check and try again." });
  }

  // --- Validation ---
  const { data, fieldErrors } = validate(body);
  if (Object.keys(fieldErrors).length) return send(res, 422, { ok: false, error: "Please check the highlighted fields.", fieldErrors });

  // --- Deliver ---
  const msg = buildMessages(data, { when: new Date().toISOString() });
  const jobs = [];
  if (emailReady) jobs.push(sendEmail(msg, data, env));
  if (telegramReady) jobs.push(sendTelegram(msg, env));
  const results = await Promise.allSettled(jobs);
  results.forEach((r) => { if (r.status === "rejected") console.error("contact: delivery failed:", r.reason && r.reason.message); });
  if (results.some((r) => r.status === "fulfilled")) return send(res, 200, { ok: true });
  return send(res, 502, { ok: false, error: "I couldn't deliver your message right now." });
}

module.exports = handler;
module.exports._internal = { validate, clean, esc, buildMessages };
