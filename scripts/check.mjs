// Static validation of the site — no dependencies.  Run: node scripts/check.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const errors = [], warnings = [];
const fail = (m) => errors.push(m), warn = (m) => warnings.push(m);

// ids
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
if (dup.length) fail(`duplicate ids: ${[...new Set(dup)].join(", ")}`);

// basics
if (!/<html lang="en">/.test(html)) fail('<html lang="en"> missing');
const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
if (!title || title.length < 20 || title.length > 80) warn(`title length ${title ? title.length : 0} (aim for 20–70)`);
const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
if (!desc || desc.length < 70 || desc.length > 175) warn(`meta description length ${desc ? desc.length : 0} (aim for 70–160)`);
for (const k of ["canonical", "og:title", "og:description", "og:image", "og:url", "twitter:card"]) if (!html.includes(k)) fail(`missing ${k}`);
if ((html.match(/<h1[\s>]/g) || []).length !== 1) fail("page must have exactly one <h1>");
for (const tag of ["header", "nav", "main", "footer"]) if (!new RegExp(`<${tag}[\\s>]`).test(html)) fail(`missing <${tag}>`);

// images: alt text, dimensions
for (const m of html.matchAll(/<img\b[^>]*>/g)) {
  const tag = m[0];
  if (!/\salt="[^"]+"/.test(tag)) fail(`img without alt: ${tag.slice(0, 80)}`);
  if (!/\swidth="\d+"/.test(tag) || !/\sheight="\d+"/.test(tag)) warn(`img without width/height: ${tag.slice(0, 80)}`);
}

// local references exist
const refs = new Set();
for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) refs.add(m[1]);
for (const m of html.matchAll(/\ssrcset="([^"]+)"/g)) m[1].split(",").forEach((p) => refs.add(p.trim().split(/\s+/)[0]));
for (const ref of refs) {
  if (/^(https?:|mailto:|tel:|data:)/.test(ref)) continue;
  if (ref.startsWith("#")) {
    if (ref === "#" || ref === "#0") fail(`placeholder link ${ref}`);
    else if (!ids.includes(ref.slice(1))) fail(`broken anchor ${ref}`);
    continue;
  }
  const [file, frag] = ref.split("#");
  if (!fs.existsSync(path.join(root, file.split("?")[0]))) { fail(`missing file: ${ref}`); continue; }
  if (frag && file.endsWith(".svg") && !fs.readFileSync(path.join(root, file), "utf8").includes(`id="${frag}"`)) fail(`SVG symbol not found: ${ref}`);
}

// external links
for (const m of html.matchAll(/<a\b[^>]*>/g)) {
  const tag = m[0];
  if (/target="_blank"/.test(tag) && !/rel="[^"]*noopener/.test(tag)) fail(`target=_blank without rel=noopener: ${tag.slice(0, 90)}`);
}
const external = [...new Set([...html.matchAll(/\shref="(https?:\/\/[^"]+)"/g)].map((m) => m[1]))].filter((u) => !u.includes("your-domain.example"));
console.log(`External links found (${external.length}):\n  ` + external.join("\n  "));

// config vs static HTML
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "js/site-config.js"), "utf8"), sandbox);
const cfg = sandbox.window.SITE_CONFIG;
if (!html.includes(`mailto:${cfg.contact.email}`)) fail("static HTML email differs from js/site-config.js");
if (!html.includes(cfg.contact.telegramUrl)) fail("static HTML Telegram link differs from js/site-config.js");
if (!html.includes(`tel:${cfg.contact.phone}`)) fail("static HTML phone differs from js/site-config.js");
if (/(sk_|re_[A-Za-z0-9]{10,}|bot\d{6,}:)/.test(fs.readFileSync(path.join(root, "js/site-config.js"), "utf8"))) fail("site-config.js looks like it contains a secret");

// deployment placeholders
for (const f of ["index.html", "robots.txt", "sitemap.xml"]) {
  if (fs.readFileSync(path.join(root, f), "utf8").includes("your-domain.example")) warn(`${f} still contains the placeholder domain — run: node scripts/set-site-url.mjs https://your-domain`);
}
if (cfg.showPrices && /X{2,}/.test(JSON.stringify(cfg.prices))) warn("showPrices is true but prices still contain XXX placeholders");

for (const f of ["robots.txt", "sitemap.xml", "vercel.json", "api/contact.js"]) if (!fs.existsSync(path.join(root, f))) fail(`missing ${f}`);

console.log(`\nPage weight check:`);
let total = 0;
for (const ref of refs) { if (/^(https?:|mailto:|tel:|#)/.test(ref)) continue; const p = path.join(root, ref.split("#")[0]); if (fs.existsSync(p)) total += fs.statSync(p).size; }
console.log(`  directly referenced files: ${(total / 1024).toFixed(0)} KB (before lazy-loaded srcset variants)`);

warnings.forEach((w) => console.log("WARN  " + w));
errors.forEach((e) => console.log("FAIL  " + e));
console.log(errors.length ? `\n${errors.length} error(s)` : "\nAll static checks passed.");
process.exit(errors.length ? 1 : 0);
