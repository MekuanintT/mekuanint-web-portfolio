/*
 * Site behaviour — vanilla JS, no dependencies.
 * Settings come from js/site-config.js (window.SITE_CONFIG).
 */
(function () {
  "use strict";

  var CFG = window.SITE_CONFIG || {};
  var CONTACT = CFG.contact || {};
  var pageLoadedAt = Date.now();

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ---------- Apply contact settings (single source of truth) ---------- */
  function applyContact() {
    $all('[data-contact="email"]').forEach(function (a) {
      if (!CONTACT.email) return;
      a.href = "mailto:" + CONTACT.email;
      if (/@/.test(a.textContent)) a.textContent = CONTACT.email;
    });
    $all('[data-contact="telegram"]').forEach(function (a) {
      if (CONTACT.telegramUrl) a.href = CONTACT.telegramUrl;
      if (a.getAttribute("data-text") === "telegramHandle" && CONTACT.telegramHandle) a.textContent = CONTACT.telegramHandle;
    });
    $all('[data-contact="phone"]').forEach(function (a) {
      if (CONTACT.phone) a.href = "tel:" + CONTACT.phone;
      if (CONTACT.phoneDisplay) a.textContent = CONTACT.phoneDisplay;
    });
  }

  /* ---------- Prices (hidden until showPrices is true) ---------- */
  function applyPrices() {
    if (!CFG.showPrices || !CFG.prices) return;
    Object.keys(CFG.prices).forEach(function (key) {
      var value = CFG.prices[key];
      var priceEl = $('[data-price="' + key + '"]');
      var fallbackEl = $('[data-price-fallback="' + key + '"]');
      if (!value || !priceEl) return;
      priceEl.textContent = value;
      priceEl.hidden = false;
      if (fallbackEl) fallbackEl.hidden = true;
    });
  }

  /* ---------- Navigation ---------- */
  function initNav() {
    var header = $("#site-header");
    var toggle = $(".nav-toggle");
    var nav = $("#primary-nav");

    function setOpen(open) {
      nav.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    }
    toggle.addEventListener("click", function () { setOpen(toggle.getAttribute("aria-expanded") !== "true"); });
    nav.addEventListener("click", function (e) { if (e.target.closest("a")) setOpen(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") { setOpen(false); toggle.focus(); }
    });

    function onScroll() { header.classList.toggle("is-scrolled", window.scrollY > 24); }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    // Highlight the nav link of the section currently in view.
    var links = $all('.primary-nav a[href^="#"]:not(.btn)');
    var map = {};
    links.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          links.forEach(function (a) { a.classList.remove("is-active"); a.removeAttribute("aria-current"); });
          var a = map[en.target.id];
          if (a) { a.classList.add("is-active"); a.setAttribute("aria-current", "true"); }
        });
      }, { rootMargin: "-45% 0px -50% 0px" });
      Object.keys(map).forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
    }
  }

  /* ---------- "Request a quote" buttons pre-select the service ---------- */
  function initServiceButtons() {
    var select = $("#f-service");
    $all("[data-service]").forEach(function (a) {
      a.addEventListener("click", function () {
        var wanted = a.getAttribute("data-service").replace(/&amp;/g, "&");
        Array.prototype.forEach.call(select.options, function (o) { if (o.text === wanted) select.value = o.value || o.text; });
      });
    });
  }

  /* ---------- Quote form ---------- */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function initForm() {
    var form = $("#quote-form");
    if (!form) return;
    var submit = $("#f-submit");
    var status = $("#form-status");
    var label = $(".btn-label", submit);
    var idleLabel = label.textContent;
    var turnstileToken = "";
    var busy = false;

    function setFieldError(input, message) {
      var err = document.getElementById(input.id + "-err");
      if (err) err.textContent = message || "";
      if (message) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
    }

    function validateField(input) {
      var v = (input.type === "checkbox") ? input.checked : input.value.trim();
      var msg = "";
      switch (input.name) {
        case "name":
          if (!v) msg = "Please enter your name.";
          break;
        case "email":
          if (!v) msg = "Please enter your email address.";
          else if (!EMAIL_RE.test(v)) msg = "That doesn't look like a valid email address.";
          break;
        case "service":
          if (!v) msg = "Please choose what you need.";
          break;
        case "message":
          if (!v) msg = "Please tell me a little about your project.";
          else if (v.length < 20) msg = "Please add a bit more detail (at least 20 characters).";
          break;
        case "consent":
          if (!v) msg = "Please tick the box so I can reply to you.";
          break;
        case "telegram":
          if (v && !/^@?[A-Za-z0-9_]{3,32}$/.test(v)) msg = "Use a Telegram username like @yourname, or leave this empty.";
          break;
      }
      setFieldError(input, msg);
      return !msg;
    }

    var fields = $all("input[name], select[name], textarea[name]", form).filter(function (f) { return f.name !== "website"; });
    fields.forEach(function (f) {
      f.addEventListener("blur", function () { if (f.type !== "checkbox") validateField(f); });
      f.addEventListener("input", function () { if (f.getAttribute("aria-invalid") === "true") validateField(f); });
      f.addEventListener("change", function () { if (f.getAttribute("aria-invalid") === "true" || f.type === "checkbox") validateField(f); });
    });

    function showStatus(kind, html) {
      status.className = "form-status is-" + kind;
      status.innerHTML = html;
      status.focus();
    }
    function fallbackLinks() {
      var email = CONTACT.email || "";
      var tg = CONTACT.telegramUrl || "#";
      return 'You can also reach me directly at <a href="mailto:' + email + '">' + email + '</a> or on <a href="' + tg + '" target="_blank" rel="noopener noreferrer">Telegram</a>.';
    }
    function setBusy(on) {
      busy = on;
      submit.disabled = on;
      submit.classList.toggle("is-loading", on);
      submit.setAttribute("aria-busy", String(on));
      label.textContent = on ? "Sending…" : idleLabel;
    }

    /* Cloudflare Turnstile (only when a public site key is configured) */
    if (CFG.turnstileSiteKey) {
      window.__onTurnstileLoad = function () {
        window.turnstile.render("#turnstile-box", {
          sitekey: CFG.turnstileSiteKey,
          theme: "dark",
          callback: function (t) { turnstileToken = t; },
          "expired-callback": function () { turnstileToken = ""; },
          "error-callback": function () { turnstileToken = ""; }
        });
      };
      var s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__onTurnstileLoad&render=explicit";
      s.async = true; s.defer = true;
      document.head.appendChild(s);
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (busy) return;

      var firstInvalid = null;
      fields.forEach(function (f) { if (!validateField(f) && !firstInvalid) firstInvalid = f; });
      if (firstInvalid) {
        showStatus("error", "Please fix the highlighted fields and try again.");
        firstInvalid.focus();
        return;
      }
      if (CFG.turnstileSiteKey && !turnstileToken) {
        showStatus("error", "Please complete the spam check above, then send again.");
        return;
      }

      var el = form.elements; // note: form.name would be the <form> attribute, not the input
      var data = {
        name: el.name.value.trim(),
        email: el.email.value.trim(),
        telegram: el.telegram.value.trim(),
        service: el.service.value,
        size: el.size.value,
        timeline: el.timeline.value,
        message: el.message.value.trim(),
        consent: el.consent.checked,
        website: el.website.value,                 // honeypot
        elapsed: Date.now() - pageLoadedAt,        // timing signal
        turnstileToken: turnstileToken
      };

      status.className = "form-status"; status.textContent = "";
      setBusy(true);

      var controller = ("AbortController" in window) ? new AbortController() : null;
      var timer = setTimeout(function () { if (controller) controller.abort(); }, 20000);

      fetch(CFG.formEndpoint || "/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(data),
        signal: controller ? controller.signal : undefined
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (body) { return { res: res, body: body }; });
        })
        .then(function (r) {
          if (r.res.ok && r.body.ok) {
            form.reset();
            fields.forEach(function (f) { setFieldError(f, ""); });
            if (window.turnstile && CFG.turnstileSiteKey) { try { window.turnstile.reset(); } catch (_) {} turnstileToken = ""; }
            showStatus("success", "<strong>Thank you — your request was sent.</strong> I'll reply to " + escapeHtml(data.email) + " soon, usually within one business day.");
            return;
          }
          if (r.body && r.body.fieldErrors) {
            var first = null;
            Object.keys(r.body.fieldErrors).forEach(function (name) {
              var input = form.elements[name];
              if (input) { setFieldError(input, r.body.fieldErrors[name]); if (!first) first = input; }
            });
            if (first) first.focus();
          }
          var msg = (r.body && r.body.error) || "Something went wrong while sending your request.";
          if (r.res.status === 429) msg = "Too many requests. Please wait a few minutes and try again.";
          showStatus("error", escapeHtml(msg) + " " + fallbackLinks());
        })
        .catch(function (err) {
          var timedOut = err && err.name === "AbortError";
          showStatus("error", (timedOut ? "The request took too long." : "I couldn't reach the server — please check your connection.") + " Your message was <strong>not</strong> sent. " + fallbackLinks());
        })
        .then(function () { clearTimeout(timer); setBusy(false); });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; });
  }

  applyContact();
  applyPrices();
  initNav();
  initServiceButtons();
  initForm();
})();
