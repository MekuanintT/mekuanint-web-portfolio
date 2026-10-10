/*
 * Public site settings — the ONLY file you normally need to edit.
 *
 * IMPORTANT: this file is served to every visitor. Never put API keys,
 * passwords or other secrets here. Secrets (Resend key, Telegram bot token,
 * Turnstile secret) live in your hosting dashboard as environment variables
 * and are only ever read by api/contact.js on the server.
 */
window.SITE_CONFIG = {
  // Where the quote form POSTs. "/api/contact" works when the site and the
  // api/ folder are deployed together on Vercel. If the site is hosted
  // elsewhere (GitHub Pages, Netlify…), set this to the full URL of your
  // deployed function, e.g. "https://my-contact-api.vercel.app/api/contact".
  formEndpoint: "/api/contact",

  // Optional Cloudflare Turnstile SITE key (public by design).
  // Leave "" to rely on the honeypot + timing + server-side checks only.
  // If you set this, also set TURNSTILE_SECRET_KEY on the server.
  turnstileSiteKey: "",

  contact: {
    email: "mequaninthabtamu12@gmail.com", // <-- double-check this address is correct
    telegramUrl: "https://t.me/LightMQ_XII",
    telegramHandle: "@LightMQ_XII",
    phone: "+251960847511",
    phoneDisplay: "+251 960 847 511"
  },

  // Prices are ESTIMATES, not guarantees. Nothing is shown until you set
  // showPrices to true. Edit the strings freely (any currency / wording).
  showPrices: false,
  prices: {
    website: "Estimate: from $XXX",
    application: "Estimate: from $X,XXX",
    maintenance: "Estimate: from $XX / month"
  }
};
