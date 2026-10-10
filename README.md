# Mekuanint Tewende — portfolio & quote-request site

A fast, static one-page site (plain HTML + one CSS file + one small JS file, no build step)
plus **one serverless function** (`api/contact.js`) that delivers quote requests to your
email and/or Telegram.

```
index.html            the page (all copy lives here)
CSS/site.css          all styles — colors/fonts are variables at the top (:root)
js/site-config.js     YOUR settings: contact details, prices, form endpoint
js/site.js            nav, form validation/submit, price display
api/contact.js        Vercel serverless function (secrets stay here, on the server)
vercel.json           security headers (CSP etc.) + caching
robots.txt, sitemap.xml
image/optimized/      WebP screenshots/portraits used by the page (originals kept in image/ and image/portfolio/)
image/icons.svg       inline SVG icon sprite (Font Awesome Free, CC BY 4.0)
fonts/                self-hosted Rubik + Josefin Sans (SIL OFL)
scripts/              check.mjs, test-api.mjs, dev-server.mjs, set-site-url.mjs
docs/                 proposal-template.md (for your own use with clients)
```

## What you must configure manually

1. **Real domain** — run once, with your final URL:
   `node scripts/set-site-url.mjs https://your-real-domain.com`
   (fills canonical, social-sharing URLs, structured data, robots.txt and sitemap.xml).
2. **Contact form delivery** — set these in *Vercel → Project → Settings → Environment Variables*, then redeploy:

   | Variable | Required | What it is |
   |---|---|---|
   | `RESEND_API_KEY` | for email | API key from https://resend.com |
   | `CONTACT_TO_EMAIL` | for email | where inquiries should arrive |
   | `CONTACT_FROM_EMAIL` | recommended | e.g. `Portfolio <hello@yourdomain.com>` (domain verified in Resend). Without it Resend's test sender is used, which only delivers to *your own Resend account email*. |
   | `TELEGRAM_BOT_TOKEN` | for Telegram | create a bot with @BotFather |
   | `TELEGRAM_CHAT_ID` | for Telegram | your chat id: message your bot once, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `message.chat.id` |
   | `TURNSTILE_SECRET_KEY` | optional | Cloudflare Turnstile secret (also put the *site* key in `js/site-config.js`) |
   | `ALLOWED_ORIGINS` | only if the site is hosted elsewhere | comma-separated site origins |

   You need email **or** Telegram (or both). Never put these values in any file in the repo.
3. **Check your contact details** in `js/site-config.js` and the matching static text in `index.html`
   (`node scripts/check.mjs` fails if they disagree). **Double-check the email address** — the old site used
   `mequaninthabtamu12@gmail.com`; a typo here means lost leads.
4. **Prices** — set `showPrices: true` and edit `prices` in `js/site-config.js` when you are ready. They are shown as
   estimates. Until then the page says "quote after a short discovery chat".
5. **Review the copy I drafted** (search `index.html` for these): service deliverables, typical timelines
   (1–3 weeks / 4–10 weeks), "usually within one business day", and each project's *My contribution* wording.
   Change anything that isn't true for you.

### If the site is NOT hosted on Vercel
The form needs the `api/` function. Easiest: deploy this repo (or just `api/` + `vercel.json`) as a Vercel project,
then in `js/site-config.js` set `formEndpoint` to its full URL (e.g. `https://my-api.vercel.app/api/contact`),
set `ALLOWED_ORIGINS` to your site's origin, and add that URL to `connect-src` in the CSP of whichever host serves the pages.
Netlify/Cloudflare would need the function ported to their format.

## Run and test locally
```bash
node scripts/dev-server.mjs          # http://localhost:5173 — serves the site and /api/contact
node scripts/check.mjs               # static validation: links, anchors, assets, alt text, meta, config
node scripts/test-api.mjs            # 20 tests of the API (mocked email/Telegram, nothing is really sent)
```
To try real delivery locally, start the dev server with the env vars from the table above.

## How the form is protected
- Secrets only exist as server environment variables; the browser never sees them.
- Server-side validation of every field; control characters stripped; HTML-escaped in emails/Telegram.
- Honeypot field, minimum fill-time, link-stuffing check, per-IP rate limit (best effort on serverless),
  origin check, optional Cloudflare Turnstile.
- If delivery fails, visitors see a clear error with email/Telegram fallbacks and their text is kept.

## Editing content
- Projects: each `<article class="case">` in `index.html`. Copy one to add a project (add its images to `image/optimized/`).
- Mark each project honestly (`badge` line): *Portfolio project*, *Personal practice project*, or *Client project*.
  Only use the last one for real paid work you have permission to show.
- Optimize new screenshots as WebP (about 1000 px and 560 px wide) before adding them.

Fonts: Rubik and Josefin Sans (SIL OFL). Icons: Font Awesome Free 7.3.1 (CC BY 4.0).
