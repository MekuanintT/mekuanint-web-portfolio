// Replace the placeholder domain everywhere with your real site URL.
//   node scripts/set-site-url.mjs https://www.yourdomain.com
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = process.argv[2];
if (!arg || !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(arg.replace(/\/$/, ""))) {
  console.error("Usage: node scripts/set-site-url.mjs https://your-real-domain.com");
  process.exit(1);
}
const url = arg.replace(/\/$/, "");
const today = new Date().toISOString().slice(0, 10);
for (const f of ["index.html", "robots.txt", "sitemap.xml"]) {
  const p = path.join(root, f);
  let s = fs.readFileSync(p, "utf8").replaceAll("https://your-domain.example", url);
  if (f === "sitemap.xml") s = s.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${today}</lastmod>`);
  fs.writeFileSync(p, s);
  console.log("updated", f);
}
