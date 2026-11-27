/* QuantumBeliefs.com/certification (paid enrollment page).
   Vanilla JS, no dependencies, no secrets.
   - Counts down to the founding-price deadline using real clock time
     (never a stored or restarting counter).
   - After the deadline: hides the countdown and the strike-through, shows the regular price.
   - Points every "Purchase now" button at CHECKOUT_URL. */
(function () {
  "use strict";

  /* ================= CONFIG: edit only this block ================= */

  /* Where "Purchase now" goes. Sungazer course site (set up by the BGP agent):
     public enrollment page for the Quantum Beliefs Certificate Program.
     Replace with the direct Founding $97 checkout/payment link if there is one. */
  var CHECKOUT_URL = "https://quantumbeliefs.sungazer.com/enroll/quantum-beliefs";

  /* Real deadline: 2027-01-01 00:00 America/New_York (EST, UTC-5). */
  var DEADLINE_ISO = "2027-01-01T00:00:00-05:00";

  /* Prices shown on the page. Regular $197.00 matches Stripe/Sungazer's Regular offer.
     Sale price is $97.00 per David; the Sungazer Founding offer had a different amount when checked
     (2026-11-26), so confirm the offer amount matches before launch. */
  var FOUNDING_PRICE = "$97.00";
  var REGULAR_PRICE = "$197.00";

  /* Optional signed-paperback add-on (checkbox in every CTA card).
     When checked, Purchase now goes to CHECKOUT_URL with ?ADDON_PARAM=ADDON_VALUE.
     Sungazer's enroll route reads ?paperback=1 and adds the signed paperback
     (US shipping addresses only) to the Stripe Checkout session.
     The add-on price below is the public paperback price from Sungazer's
     /api/public/courses/quantum-beliefs/offer (the paperback price is $19.99). */
  var ADDON_PARAM = "paperback";
  var ADDON_VALUE = "1";
  var ADDON_PRICE = "$19.99";

  /* ================================================================ */

  var DEADLINE_MS = Date.parse(DEADLINE_ISO);
  var clockOffset = 0; // server time minus device time, once known
  var timerId = null;
  var state = "pending";

  var els = {
    box: document.getElementById("countdown"),
    d: document.getElementById("cd-days"),
    h: document.getElementById("cd-hours"),
    m: document.getElementById("cd-minutes"),
    s: document.getElementById("cd-seconds")
  };

  function now() {
    return Date.now() + clockOffset;
  }

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function setText(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }

  function applyPrices() {
    var map = { founding: FOUNDING_PRICE, regular: REGULAR_PRICE };
    Array.prototype.forEach.call(document.querySelectorAll("[data-price]"), function (el) {
      var v = map[el.getAttribute("data-price")];
      if (v) el.textContent = v;
    });
  }

  function addonBoxes() {
    return Array.prototype.slice.call(document.querySelectorAll(".js-addon"));
  }

  function checkoutUrl() {
    var wanted = addonBoxes().some(function (box) { return box.checked; });
    if (!wanted) return CHECKOUT_URL;
    var url = new URL(CHECKOUT_URL);
    url.searchParams.set(ADDON_PARAM, ADDON_VALUE);
    return url.toString();
  }

  function applyCheckoutUrl() {
    var href = checkoutUrl();
    Array.prototype.forEach.call(document.querySelectorAll(".js-checkout"), function (a) {
      a.setAttribute("href", href);
    });
  }

  // Keep every card's checkbox in the same state and update all Purchase now links.
  function initAddon() {
    Array.prototype.forEach.call(document.querySelectorAll(".addon-price"), function (el) {
      el.textContent = "+" + ADDON_PRICE;
    });
    var boxes = addonBoxes();
    boxes.forEach(function (box) {
      box.addEventListener("change", function () {
        boxes.forEach(function (other) { other.checked = box.checked; });
        applyCheckoutUrl();
      });
    });
    // Browsers can restore a checked box on back/forward navigation.
    window.addEventListener("pageshow", function () {
      var anyChecked = boxes.some(function (box) { return box.checked; });
      boxes.forEach(function (box) { box.checked = anyChecked; });
      applyCheckoutUrl();
    });
  }

  function setState(next) {
    if (state === next) return;
    state = next;
    Array.prototype.forEach.call(document.querySelectorAll(".price-block"), function (b) {
      b.setAttribute("data-offer", next);
    });
    if (els.box) els.box.hidden = next !== "founding";
  }

  function render() {
    var remaining = DEADLINE_MS - now();
    if (isNaN(remaining) || remaining <= 0) {
      // Deadline passed (or config broken): never show a countdown or the sale price.
      setState("regular");
      stop();
      return false;
    }
    var total = Math.floor(remaining / 1000);
    setText(els.d, pad(Math.floor(total / 86400)));
    setText(els.h, pad(Math.floor((total % 86400) / 3600)));
    setText(els.m, pad(Math.floor((total % 3600) / 60)));
    setText(els.s, pad(total % 60));
    setState("founding");
    return true;
  }

  function stop() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function schedule() {
    stop();
    if (!render()) return;
    // Tick on the next whole second of the (corrected) clock.
    var wait = 1000 - (now() % 1000);
    timerId = setTimeout(schedule, wait + 5);
  }

  // Browsers throttle timers in background tabs; recompute from the clock on return.
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && state !== "regular") schedule();
  });

  // Correct for a wrong device clock using the server's Date header (best effort).
  function syncWithServer() {
    if (!window.fetch) return;
    var sent = Date.now();
    fetch(window.location.pathname, { method: "HEAD", cache: "no-store" })
      .then(function (res) {
        var header = res.headers.get("Date");
        var server = header ? Date.parse(header) : NaN;
        if (isNaN(server)) return;
        var received = Date.now();
        clockOffset = server + (received - sent) / 2 - received;
        if (state !== "regular" || DEADLINE_MS - now() > 0) schedule();
      })
      .catch(function () { /* keep device clock */ });
  }

  initAddon();
  applyCheckoutUrl();
  applyPrices();
  schedule();
  syncWithServer();
})();
