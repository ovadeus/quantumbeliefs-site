#!/usr/bin/env node
"use strict";

/**
 * Same-origin signup API for /linkedin and /certification.
 * POST /api/linkedin-signup — validate, append one JSON line to SIGNUP_STORE
 * (default /data/signups.jsonl), then optionally forward to the planned BGP
 * CRM intake if BGP_INTAKE_URL and BGP_INTAKE_SECRET are set.
 * Each record is tagged source "linkedin" or "certification".
 *
 * The browser response succeeds only after the local write succeeds.
 * Forward success or failure is recorded on the stored line; a forward
 * failure does not fail the request. A local write failure returns 500.
 *
 * There is no HTTP read or export route. Export is by shell in the container.
 * The secret is sent only as header X-BGP-Intake-Secret, never in the URL,
 * and is never logged. Emails in logs are redacted.
 */

const fs = require("fs");
const http = require("http");
const path = require("path");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);
const SIGNUP_STORE = process.env.SIGNUP_STORE || "/data/signups.jsonl";
const BGP_INTAKE_URL = (process.env.BGP_INTAKE_URL || "").trim();
const BGP_INTAKE_SECRET = process.env.BGP_INTAKE_SECRET || "";
const INTAKE_TIMEOUT_MS = 10 * 1000;

const MAX_BODY = 8 * 1024;
const MAX_EMAIL = 320;
const MAX_NAME = 200;
const MAX_UTM = 200;
const MAX_REFERRER = 500;
const MAX_LANDING = 100;
const MAX_HONEYPOT = 200;

const RATE_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const RATE_MAX = Number(process.env.RATE_LIMIT_MAX || 8);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

const SOURCE_CONFIG = {
  linkedin: {
    source: "linkedin",
    landingPath: "/linkedin",
    consentVersion: "qb-linkedin-v1",
    consentText:
      "I agree to be contacted by Ovädeus LLC about free access to the Quantum Beliefs Certificate Program and related course information. I can unsubscribe at any time.",
  },
  certification: {
    source: "certification",
    landingPath: "/certification",
    consentVersion: "qb-certification-v1",
    consentText:
      "I agree to be contacted by Ovädeus LLC about the Quantum Beliefs Certificate Program and related course information. I can unsubscribe at any time.",
  },
};

function resolveSource(payload) {
  const raw = typeof payload.source === "string" ? payload.source.trim().toLowerCase() : "";
  if (raw === "linkedin" || raw === "qb-linkedin") return "linkedin";
  if (raw === "certification") return "certification";
  const landing = typeof payload.landing_path === "string" ? payload.landing_path.trim() : "";
  if (landing === "/certification" || landing.startsWith("/certification/")) return "certification";
  return "linkedin";
}

const GENERIC_ERROR = "Something went wrong and your request was not saved. Please try again.";

const rateHits = new Map();

function redactEmail(email) {
  if (typeof email !== "string") return "[redacted]";
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at < 1 || at === trimmed.length - 1) return "[redacted]";
  return trimmed[0] + "***@" + trimmed.slice(at + 1);
}

function sanitizeLog(value) {
  if (value == null) return value;
  let str = typeof value === "string" ? value : JSON.stringify(value);
  if (BGP_INTAKE_SECRET && str.includes(BGP_INTAKE_SECRET)) {
    str = str.split(BGP_INTAKE_SECRET).join("[redacted-secret]");
  }
  return str;
}

function logInfo(msg, extra) {
  console.log("signup:", msg, extra ? sanitizeLog(extra) : "");
}

function logWarn(msg, extra) {
  console.warn("signup:", msg, extra ? sanitizeLog(extra) : "");
}

function logError(msg, extra) {
  console.error("signup:", msg, extra ? sanitizeLog(extra) : "");
}

function clientIp(req) {
  const raw =
    (req.headers["x-real-ip"] || "").toString().trim() ||
    (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
    (req.socket && req.socket.remoteAddress) ||
    "unknown";
  return raw.replace(/^::ffff:/, "");
}

function isRateLimited(ip) {
  const now = Date.now();
  let times = rateHits.get(ip) || [];
  times = times.filter((t) => now - t < RATE_WINDOW_MS);
  if (times.length >= RATE_MAX) {
    rateHits.set(ip, times);
    return true;
  }
  times.push(now);
  rateHits.set(ip, times);
  return false;
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

function genericError(res, status) {
  sendJson(res, status, { ok: false, error: GENERIC_ERROR });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on("data", (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > MAX_BODY) {
        done = true;
        const err = new Error("too-large");
        err.code = "too-large";
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (done) return;
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function isTrueConsent(value) {
  return value === true || value === "true" || value === "yes";
}

function parseAndValidate(raw) {
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch (e) {
    return { ok: false, status: 400 };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, status: 400 };
  }

  const honeypot =
    typeof payload.website === "string"
      ? payload.website
      : payload.website == null
        ? ""
        : String(payload.website);
  if (honeypot.length > MAX_HONEYPOT) return { ok: false, status: 400 };
  if (honeypot.trim() !== "") {
    return { ok: false, honeypot: true };
  }

  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  if (!email || email.length > MAX_EMAIL || !EMAIL_RE.test(email)) {
    return { ok: false, status: 400 };
  }
  if (!isTrueConsent(payload.consent)) {
    return { ok: false, status: 400 };
  }

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (name.length > MAX_NAME) return { ok: false, status: 400 };

  const landing_path = typeof payload.landing_path === "string" ? payload.landing_path.trim() : "";
  if (landing_path.length > MAX_LANDING) return { ok: false, status: 400 };

  const referrer = typeof payload.referrer === "string" ? payload.referrer.trim() : "";
  if (referrer.length > MAX_REFERRER) return { ok: false, status: 400 };

  const utm = {};
  for (const key of UTM_KEYS) {
    const value = typeof payload[key] === "string" ? payload[key].trim() : "";
    if (value.length > MAX_UTM) return { ok: false, status: 400 };
    utm[key] = value;
  }

  const sourceKey = resolveSource(payload);
  const sourceCfg = SOURCE_CONFIG[sourceKey];

  return {
    ok: true,
    data: {
      name,
      email,
      consent: true,
      source: sourceCfg.source,
      consentVersion: sourceCfg.consentVersion,
      consentText: sourceCfg.consentText,
      landing_path: landing_path || sourceCfg.landingPath,
      referrer,
      ...utm,
    },
  };
}

function intakePayload(data) {
  const body = {
    email: data.email,
    consent: true,
    consentVersion: data.consentVersion,
    consentText: data.consentText,
    consentAt: data.consentAt,
    source: data.source,
    utm_source: data.utm_source || "",
    utm_medium: data.utm_medium || "",
    utm_campaign: data.utm_campaign || "",
    utm_content: data.utm_content || "",
    utm_term: data.utm_term || "",
    landing_path: data.landing_path,
    referrer: data.referrer || "",
  };
  if (data.name) body.name = data.name;
  return body;
}

function buildRecord(data, forward) {
  const record = {
    email: data.email,
    consent: true,
    consentVersion: data.consentVersion,
    consentText: data.consentText,
    consentAt: data.consentAt,
    source: data.source,
    utm_source: data.utm_source || "",
    utm_medium: data.utm_medium || "",
    utm_campaign: data.utm_campaign || "",
    utm_content: data.utm_content || "",
    utm_term: data.utm_term || "",
    landing_path: data.landing_path,
    referrer: data.referrer || "",
    storedAt: new Date().toISOString(),
    forward: forward,
  };
  if (data.name) record.name = data.name;
  return record;
}

function appendSignup(record) {
  const storePath = path.resolve(SIGNUP_STORE);
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    try {
      fs.chmodSync(dir, 0o700);
    } catch (e) {
      // Directory created; a later chmod failure should not block the write.
    }
  }
  const line = JSON.stringify(record) + "\n";
  const fd = fs.openSync(storePath, "a", 0o600);
  try {
    try {
      fs.fchmodSync(fd, 0o600);
    } catch (e) {
      // Best-effort; the create mode applies when the file is new.
    }
    fs.writeSync(fd, line, null, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

async function postIntake(data) {
  if (!BGP_INTAKE_URL || !BGP_INTAKE_SECRET) {
    const err = new Error("missing-config");
    err.code = "missing-config";
    throw err;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(BGP_INTAKE_URL);
  } catch (e) {
    const err = new Error("invalid-url");
    err.code = "invalid-url";
    throw err;
  }
  if (parsedUrl.username || parsedUrl.password) {
    const err = new Error("secret-in-url");
    err.code = "secret-in-url";
    throw err;
  }

  const payload = intakePayload(data);
  let response;
  try {
    response = await fetch(parsedUrl.href, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-BGP-Intake-Secret": BGP_INTAKE_SECRET,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(INTAKE_TIMEOUT_MS),
    });
  } catch (e) {
    const err = new Error("intake-failed");
    err.code = e && e.name === "TimeoutError" ? "timeout" : "network";
    err.causeName = e && e.name;
    throw err;
  }

  if (response.ok || response.status === 409) {
    return { status: response.status, existing: response.status === 409 };
  }

  const err = new Error("intake-failed");
  err.status = response.status;
  try {
    err.body = (await response.text()).slice(0, 300);
  } catch (e) {
    err.body = "";
  }
  throw err;
}

async function maybeForward(data) {
  if (!BGP_INTAKE_URL || !BGP_INTAKE_SECRET) {
    return { attempted: false };
  }
  try {
    const result = await postIntake(data);
    return { attempted: true, ok: true, status: result.status };
  } catch (e) {
    const reason = (e && e.code) || "error";
    logError("intake forward failed", {
      email: redactEmail(data.email),
      reason: reason,
      status: e && e.status,
    });
    const forward = { attempted: true, ok: false, reason: reason };
    if (e && e.status) forward.status = e.status;
    return forward;
  }
}

async function handleSignup(req, res) {
  const ip = clientIp(req);
  if (isRateLimited(ip)) {
    logWarn("rate limited", { ip: ip });
    return genericError(res, 429);
  }

  let raw;
  try {
    raw = await readBody(req);
  } catch (e) {
    if (e && e.code === "too-large") return genericError(res, 413);
    return genericError(res, 400);
  }

  const parsed = parseAndValidate(raw);
  if (parsed.honeypot) {
    logInfo("honeypot filled; not saved", { ip: ip });
    return sendJson(res, 200, { ok: true });
  }
  if (!parsed.ok) {
    logInfo("validation failed", { ip: ip });
    return genericError(res, parsed.status || 400);
  }

  const data = Object.assign({}, parsed.data, { consentAt: new Date().toISOString() });
  const forward = await maybeForward(data);
  const record = buildRecord(data, forward);

  try {
    appendSignup(record);
  } catch (e) {
    logError("local store write failed", {
      email: redactEmail(data.email),
      message: e && e.message,
    });
    return genericError(res, 500);
  }

  logInfo("saved contact", {
    email: redactEmail(data.email),
    ip: ip,
    forwardAttempted: !!forward.attempted,
    forwardOk: forward.attempted ? !!forward.ok : undefined,
  });
  return sendJson(res, 200, { ok: true });
}

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  const pathName = url.split("?")[0];
  if (req.method === "POST" && pathName === "/api/linkedin-signup") {
    handleSignup(req, res).catch((e) => {
      logError("unhandled", e && e.message);
      if (!res.headersSent) genericError(res, 500);
    });
    return;
  }
  sendJson(res, 404, { ok: false, error: GENERIC_ERROR });
});

server.listen(PORT, HOST, () => {
  const forwardConfigured = !!(BGP_INTAKE_URL && BGP_INTAKE_SECRET);
  logInfo("listening", {
    host: HOST,
    port: PORT,
    storeConfigured: true,
    forwardConfigured: forwardConfigured,
  });
});
