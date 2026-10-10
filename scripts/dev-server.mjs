// Tiny local dev server: serves the static site and runs api/contact.js,
// so you can test the whole form flow without deploying.
//   node scripts/dev-server.mjs [port]
// Set the same env vars you'd set on Vercel to test real delivery, e.g.
//   RESEND_API_KEY=... CONTACT_TO_EMAIL=you@example.com node scripts/dev-server.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const handler = require(path.join(root, "api", "contact.js"));
const port = Number(process.argv[2] || process.env.PORT || 5173);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain", ".xml": "application/xml", ".svg": "image/svg+xml" };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/contact") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      try { req.body = raw && (req.headers["content-type"] || "").includes("json") ? JSON.parse(raw) : raw; } catch { req.body = raw; }
      handler(req, res).catch((e) => { console.error(e); res.statusCode = 500; res.end("{}"); });
    });
    return;
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.join(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end("Not found"); }
  res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Dev server: http://localhost:${port}`));
