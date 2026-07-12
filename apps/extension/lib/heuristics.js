// ScamGraph — shared local risk heuristics (no network).
//
// Loaded in TWO trusted contexts:
//   1) the background service worker via importScripts("lib/heuristics.js")
//   2) content scripts, listed BEFORE content.js in manifest content_scripts[].js
//
// Both share an isolated global (`self`), so we attach a single namespace and
// keep every function PURE + synchronous. Never call the network here — this is
// what lets the extension warn without ever sending browsing URLs to a server.
(function (root) {
  "use strict";

  // ---- Punycode / IDN homograph decoding (RFC 3492, decode-only) -----------
  // We show a readable Unicode form so a user can SEE that xn--80ak6aa92e.com
  // is really "аpple.com" (Cyrillic а). Attackers rely on this being hidden.
  const PUNY = { base: 36, tmin: 1, tmax: 26, skew: 38, damp: 700, initialBias: 72, initialN: 128 };

  function adaptBias(delta, numPoints, firstTime) {
    delta = firstTime ? Math.floor(delta / PUNY.damp) : delta >> 1;
    delta += Math.floor(delta / numPoints);
    let k = 0;
    while (delta > ((PUNY.base - PUNY.tmin) * PUNY.tmax) >> 1) {
      delta = Math.floor(delta / (PUNY.base - PUNY.tmin));
      k += PUNY.base;
    }
    return Math.floor(k + ((PUNY.base - PUNY.tmin + 1) * delta) / (delta + PUNY.skew));
  }

  function punyDecodeLabel(input) {
    const output = [];
    let n = PUNY.initialN;
    let i = 0;
    let bias = PUNY.initialBias;

    let basic = input.lastIndexOf("-");
    if (basic < 0) basic = 0;
    for (let j = 0; j < basic; j++) {
      output.push(input.charCodeAt(j));
    }

    let index = basic > 0 ? basic + 1 : 0;
    while (index < input.length) {
      const oldi = i;
      let w = 1;
      for (let k = PUNY.base; ; k += PUNY.base) {
        if (index >= input.length) throw new Error("puny: truncated");
        const c = input.charCodeAt(index++);
        let digit;
        if (c >= 48 && c <= 57) digit = c - 22;        // 0-9 -> 26..35
        else if (c >= 65 && c <= 90) digit = c - 65;   // A-Z -> 0..25
        else if (c >= 97 && c <= 122) digit = c - 97;  // a-z -> 0..25
        else throw new Error("puny: bad digit");
        if (digit >= PUNY.base) throw new Error("puny: overflow");
        i += digit * w;
        const t = k <= bias ? PUNY.tmin : k >= bias + PUNY.tmax ? PUNY.tmax : k - bias;
        if (digit < t) break;
        w *= PUNY.base - t;
      }
      const out = output.length + 1;
      bias = adaptBias(i - oldi, out, oldi === 0);
      n += Math.floor(i / out);
      i %= out;
      output.splice(i++, 0, n);
    }

    let str = "";
    for (const cp of output) str += String.fromCodePoint(cp);
    return str;
  }

  /** Decode every xn-- label so lookalike hosts render readable. Best-effort. */
  function toUnicodeHost(host) {
    if (!host || host.indexOf("xn--") < 0) return host;
    try {
      return host
        .split(".")
        .map((label) => (/^xn--/i.test(label) ? punyDecodeLabel(label.slice(4)) : label))
        .join(".");
    } catch (_e) {
      return host;
    }
  }

  // ---- Hostname normalization ----------------------------------------------
  /** Extract a bare, lowercased hostname from a URL, host, or messy string. */
  function normalizeHost(raw) {
    let v = (raw == null ? "" : String(raw)).trim().toLowerCase();
    const scheme = v.indexOf("://");
    if (scheme >= 0) v = v.slice(scheme + 3);
    const at = v.indexOf("@");
    if (at >= 0) v = v.slice(at + 1);
    const slash = v.indexOf("/");
    if (slash >= 0) v = v.slice(0, slash);
    const q = v.indexOf("?");
    if (q >= 0) v = v.slice(0, q);
    const colon = v.indexOf(":");
    if (colon >= 0) v = v.slice(0, colon);
    return v.replace(/\.$/, "");
  }

  /** Host + all parent domains, longest first (a.b.c → a.b.c, b.c). */
  function domainChain(host) {
    const parts = host.split(".").filter(Boolean);
    const chain = [];
    for (let i = 0; i < parts.length - 1; i++) {
      chain.push(parts.slice(i).join("."));
    }
    if (chain.length === 0 && host) chain.push(host);
    return chain;
  }

  // ---- Reference data (small, curated — explainability over coverage) -------
  const SUSPICIOUS_TLDS = new Set([
    "xyz", "top", "live", "click", "info", "cn", "ru", "tk", "ml", "ga", "cf",
    "gq", "work", "support", "zip", "mov", "rest", "buzz", "icu", "cyou", "sbs",
  ]);

  // Brand keyword -> official domain. Impersonation = keyword present on a host
  // that is NOT the official domain (or its subdomain).
  const BRANDS = {
    naver: "naver.com",
    shinhan: "shinhan.com",
    kbstar: "kbstar.com",
    kookmin: "kbstar.com",
    toss: "toss.im",
    tosspay: "toss.im",
    kakao: "kakao.com",
    kakaopay: "kakaopay.com",
    payco: "payco.com",
    coupang: "coupang.com",
    woori: "wooribank.com",
    hana: "hanabank.com",
    nonghyup: "nonghyup.com",
    ibk: "ibk.co.kr",
    apple: "apple.com",
    google: "google.com",
    paypal: "paypal.com",
    amazon: "amazon.com",
  };

  function isOfficial(host, official) {
    return host === official || host.endsWith("." + official);
  }

  // ---- declarativeNetRequest domain guard ----------------------------------
  // A value is only usable as a DNR `requestDomains` entry if it is a plain,
  // lowercase, ASCII hostname. chrome.declarativeNetRequest.updateDynamicRules
  // is ALL-OR-NOTHING: a single invalid domain rejects the entire batch, which
  // would silently disable ALL blocking. So we filter defensively here.
  function isDnrDomain(d) {
    if (!d || d.length > 253 || d.indexOf(".") < 0) return false;
    if (!/^[a-z0-9.-]+$/.test(d)) return false; // no unicode, underscores, spaces
    if (d.startsWith(".") || d.endsWith(".") || d.indexOf("..") >= 0) return false;
    for (const label of d.split(".")) {
      if (!label || label.length > 63 || label.startsWith("-") || label.endsWith("-")) return false;
    }
    return true;
  }

  // ---- DNR block-rule builder (pure) ---------------------------------------
  // Turns a blocklist snapshot into declarativeNetRequest redirect rules.
  // CRITICAL: only `kind === "domain"` entries become navigation rules — phone
  // and account entries MUST NEVER become URL block rules. The allowlist is
  // enforced by EXCLUSION (an allowed domain simply never gets a rule), which is
  // equivalent to "allowlist wins over blocklist" for exact hosts.
  //
  // opts: { allowed:Set|string[], level:string, base:number, max:number }
  // Returns { rules:[DNR rule], incidentMap:{ id -> {domain,severity,source} } }.
  function buildBlockRules(entries, opts) {
    const options = opts || {};
    const allowed =
      options.allowed instanceof Set ? options.allowed : new Set(options.allowed || []);
    const base = typeof options.base === "number" ? options.base : 1;
    const max = typeof options.max === "number" ? options.max : 4000;
    const rules = [];
    const incidentMap = {};

    // "monitor" level = observe only, no navigation blocking.
    if (options.level === "monitor") return { rules, incidentMap };

    const seen = new Set();
    let id = base;
    for (const e of entries || []) {
      if (!e || e.kind !== "domain") continue; // only domains are DNR-blockable
      const domain = normalizeHost(e.value);
      if (!isDnrDomain(domain) || seen.has(domain) || allowed.has(domain)) continue;
      seen.add(domain);
      if (rules.length >= max) break;

      incidentMap[id] = {
        domain,
        severity: e.severity === "warning" ? "warning" : "danger",
        source: e.source || "unknown",
      };
      rules.push({
        id,
        priority: 1,
        action: {
          type: "redirect",
          // Opaque incident id only — the visited URL is NEVER placed in the query.
          redirect: { extensionPath: "/blocked.html?r=" + id },
        },
        condition: {
          requestDomains: [domain], // matches the domain and its subdomains
          resourceTypes: ["main_frame"],
        },
      });
      id++;
    }
    return { rules, incidentMap };
  }

  // ---- Core assessment ------------------------------------------------------
  // blockIndex: optional { has(domain), get(domain) } view over the cached
  // blocklist. When a domain is on the blocklist that is the strongest signal.
  //
  // Returns a stable, explainable verdict — NEVER throws.
  const LEVEL_RANK = { safe: 0, caution: 1, warning: 2, danger: 3 };

  function assess(raw, blockIndex) {
    const host = normalizeHost(raw);
    const unicodeHost = toUnicodeHost(host);
    const reasons = [];
    let level = "safe";
    let match = null;

    const bump = (next) => {
      if (LEVEL_RANK[next] > LEVEL_RANK[level]) level = next;
    };

    if (!host || host === "localhost" || host === "127.0.0.1") {
      return { host, unicodeHost, level: "safe", blocked: false, reasons, match: null };
    }

    // 1) Blocklist hit (self or parent domain) — strongest local signal.
    if (blockIndex && typeof blockIndex.get === "function") {
      for (const d of domainChain(host)) {
        const hit = blockIndex.get(d);
        if (hit) {
          match = { domain: d, severity: hit.severity, source: hit.source };
          const sev = hit.severity === "warning" ? "warning" : "danger";
          bump(sev);
          reasons.push({
            code: "blocklist_hit",
            weight: sev === "danger" ? 90 : 60,
            label:
              (sev === "danger" ? "차단 목록 등재" : "감시 목록 등재") +
              " — 위협 피드 " + (hit.source || "unknown"),
          });
          break;
        }
      }
    }

    // 2) IDN / punycode lookalike.
    if (host.indexOf("xn--") >= 0) {
      bump("caution");
      reasons.push({
        code: "idn_homograph",
        weight: 30,
        label: "퓨니코드(IDN) 도메인 — 실제 표기 “" + unicodeHost + "”",
      });
    }

    // 3) Brand impersonation on a non-official host.
    for (const kw of Object.keys(BRANDS)) {
      if (host.indexOf(kw) >= 0 && !isOfficial(host, BRANDS[kw])) {
        bump("caution");
        reasons.push({
          code: "brand_impersonation",
          weight: 35,
          label: "브랜드 사칭 의심 — “" + kw + "” 포함, 공식 도메인(" + BRANDS[kw] + ") 아님",
        });
        break;
      }
    }

    // 4) Suspicious TLD.
    const tld = host.slice(host.lastIndexOf(".") + 1);
    if (SUSPICIOUS_TLDS.has(tld)) {
      bump("caution");
      reasons.push({ code: "suspicious_tld", weight: 20, label: "위험 신호 TLD “." + tld + "”" });
    }

    // 5) Structural noise (hyphen spam / raw IP / digit-heavy host).
    const hyphens = (host.match(/-/g) || []).length;
    if (hyphens >= 3) {
      bump("caution");
      reasons.push({ code: "hyphen_spam", weight: 15, label: "하이픈 과다(" + hyphens + "개) — 위장 도메인 패턴" });
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      bump("caution");
      reasons.push({ code: "raw_ip", weight: 20, label: "도메인 없이 IP 주소로 접속" });
    }

    const score = reasons.reduce((s, r) => s + (r.weight || 0), 0);
    return { host, unicodeHost, level, blocked: level === "danger" && !!match, reasons, match, score };
  }

  root.SGHeuristics = {
    assess,
    normalizeHost,
    toUnicodeHost,
    domainChain,
    isDnrDomain,
    buildBlockRules,
    LEVEL_RANK,
  };
})(typeof self !== "undefined" ? self : this);
