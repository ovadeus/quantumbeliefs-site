/* QuantumBeliefs.com/linkedin form handler.
   Validates on the client, then POSTs to the same-origin signup API.
   Never includes API keys or other secrets in this file. */
(function () {
  "use strict";

  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
  var STORAGE_KEY = "qbcp_linkedin_utm";
  var LANDING_PATH = "/linkedin";
  var FORM_ENDPOINT = "/api/linkedin-signup";
  var GENERIC_ERROR = "Something went wrong and your request was not saved. Please try again.";

  function linkedInReferrer(referrer) {
    try {
      var host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
      return host === "linkedin.com" || host.endsWith(".linkedin.com") || host === "lnkd.in";
    } catch (e) {
      return false;
    }
  }

  function readStoredUtms() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function persistUtms(utm) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(utm));
    } catch (e) {
      // sessionStorage may be unavailable; hidden fields still hold values for this page load.
    }
  }

  function readUtms() {
    var params = new URLSearchParams(window.location.search);
    var stored = readStoredUtms();
    var utm = {};
    UTM_KEYS.forEach(function (key) {
      var fromQuery = params.get(key);
      if (fromQuery !== null && fromQuery !== "") {
        utm[key] = fromQuery;
      } else if (stored[key]) {
        utm[key] = stored[key];
      } else {
        utm[key] = "";
      }
    });
    // Do not overwrite a present utm_source with a default.
    if (!utm.utm_source) {
      utm.utm_source = linkedInReferrer(document.referrer) ? "linkedin" : "direct";
    }
    persistUtms(utm);
    return utm;
  }

  function applyUtmsToForm(form, utm) {
    UTM_KEYS.forEach(function (key) {
      if (form.elements[key]) form.elements[key].value = utm[key] || "";
    });
    if (form.elements.landing_path) form.elements.landing_path.value = LANDING_PATH;
  }

  function isValidEmail(value) {
    var v = (value || "").trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  function field(form, name) {
    return form.elements[name];
  }

  function setConsentEnabled(form) {
    var consent = field(form, "consent");
    var submit = form.querySelector(".js-submit");
    if (submit) submit.disabled = !(consent && consent.checked);
  }

  function setPending(form, pending) {
    var submit = form.querySelector(".js-submit");
    if (!submit) return;
    submit.setAttribute("aria-busy", pending ? "true" : "false");
    if (pending) {
      submit.disabled = true;
    } else {
      setConsentEnabled(form);
    }
  }

  function clearStatus(form) {
    var status = form.querySelector(".js-form-status");
    if (!status) return;
    status.textContent = "";
    status.classList.remove("is-error");
  }

  function showError(form, message, invalidEl) {
    var status = form.querySelector(".js-form-status");
    if (status) {
      status.textContent = message;
      status.classList.add("is-error");
    }
    var email = field(form, "email");
    if (email) email.classList.toggle("is-invalid", invalidEl === email);
    if (invalidEl && typeof invalidEl.focus === "function") invalidEl.focus();
  }

  function collectPayload(form) {
    var consent = field(form, "consent");
    var honeypot = field(form, "website");
    var payload = {
      name: (field(form, "name").value || "").trim(),
      email: (field(form, "email").value || "").trim(),
      consent: !!(consent && consent.checked),
      landing_path: LANDING_PATH,
      source: "linkedin",
      referrer: document.referrer || "",
      website: honeypot ? honeypot.value : ""
    };
    UTM_KEYS.forEach(function (key) {
      payload[key] = field(form, key) ? field(form, key).value : "";
    });
    return payload;
  }

  function showThanks() {
    document.querySelectorAll(".js-form-panel").forEach(function (panel) {
      var wrap = panel.querySelector(".js-form-wrap");
      var thanks = panel.querySelector(".js-thanks");
      if (wrap) wrap.hidden = true;
      if (thanks) thanks.hidden = false;
    });
    var heading = document.querySelector(".js-thanks:not([hidden]) .js-thanks-heading");
    if (heading) heading.focus();
    if (history.replaceState) {
      var url = new URL(window.location.href);
      url.hash = "thanks";
      history.replaceState(null, "", url.pathname + url.search + "#thanks");
    }
  }

  function syncField(sourceForm, otherForms, name) {
    var src = field(sourceForm, name);
    if (!src) return;
    otherForms.forEach(function (form) {
      if (form === sourceForm) return;
      var dest = field(form, name);
      if (!dest) return;
      if (src.type === "checkbox") {
        dest.checked = src.checked;
        setConsentEnabled(form);
      } else {
        dest.value = src.value;
      }
    });
  }

  function validate(form) {
    var nameEl = field(form, "name");
    var email = field(form, "email");
    var consent = field(form, "consent");
    clearStatus(form);
    if (email) email.classList.remove("is-invalid");

    if (!nameEl || !(nameEl.value || "").trim()) {
      showError(form, "Please enter your name.", nameEl);
      return false;
    }
    if (!isValidEmail(email && email.value)) {
      showError(form, "Please enter a valid email address.", email);
      return false;
    }
    if (!consent || !consent.checked) {
      showError(form, "Please confirm the consent box before continuing.", consent);
      return false;
    }
    return true;
  }

  function onSubmit(event) {
    event.preventDefault();
    var form = event.currentTarget;
    if (!validate(form)) return;

    var payload = collectPayload(form);
    setPending(form, true);

    fetch(FORM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        if (!response.ok) throw new Error("save-failed");
        return response.json().catch(function () { return {}; });
      })
      .then(function (body) {
        if (body && body.ok === false) throw new Error("save-failed");
        showThanks();
      })
      .catch(function () {
        showError(form, GENERIC_ERROR, field(form, "email"));
        setPending(form, false);
      });
  }

  function init() {
    var utm = readUtms();
    var forms = Array.prototype.slice.call(document.querySelectorAll(".js-signup-form"));
    forms.forEach(function (form) {
      applyUtmsToForm(form, utm);
      setConsentEnabled(form);
      form.addEventListener("submit", onSubmit);
      var consent = field(form, "consent");
      if (consent) {
        consent.addEventListener("change", function () {
          setConsentEnabled(form);
          syncField(form, forms, "consent");
        });
      }
      ["name", "email"].forEach(function (name) {
        var el = field(form, name);
        if (!el) return;
        el.addEventListener("input", function () {
          syncField(form, forms, name);
          if (name === "email") el.classList.remove("is-invalid");
        });
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
