// Node built-in test runner (no external deps): `node --test`
//
// Covers lib/heuristics.js — the shared, pure, network-free risk logic used by
// both the service worker (importScripts) and the content/UI surfaces. Focus:
//   * RFC 3492 punycode decode (IDN homograph readability)
//   * hostname normalization + subdomain-suffix domain matching
//   * explainable assess() verdicts
//   * buildBlockRules(): the domain-ONLY declarativeNetRequest filter
//   * isDnrDomain(): the guard that stops one bad entry killing the whole batch
//
// Punycode expectations are cross-checked against Node's ICU decoder
// (node:url domainToUnicode) so the vectors are authoritative, not hand-typed.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { domainToASCII, domainToUnicode } = require("node:url");

const H = require("../lib/heuristics.js").SGHeuristics;

test("module surface is present", () => {
  for (const fn of ["assess", "normalizeHost", "toUnicodeHost", "domainChain", "isDnrDomain", "buildBlockRules"]) {
    assert.equal(typeof H[fn], "function", "missing export: " + fn);
  }
});

// ---------------------------------------------------------------------------
// Punycode / IDN homograph decoding (RFC 3492)
// ---------------------------------------------------------------------------
test("toUnicodeHost decodes known vectors matching ICU", () => {
  const unicodeHosts = [
    "bücher.com", // German umlaut
    "münchen.de",
    "日本語.jp", // Japanese
    "παράδειγμα.gr", // Greek
    "аррӏе.com", // Cyrillic homograph of "apple" (README example)
    "例え.テスト", // multi-label, both labels punycode-encoded
  ];
  for (const u of unicodeHosts) {
    const ascii = domainToASCII(u); // -> xn-- form
    assert.ok(ascii.indexOf("xn--") >= 0, "expected punycode for " + u);
    assert.equal(H.toUnicodeHost(ascii), domainToUnicode(ascii), "decode mismatch for " + ascii);
  }
});

test("toUnicodeHost handles the lead's explicit vector xn--nxasmq6b", () => {
  // βόλος (Greek) — final sigma renders as ς in NFC but punycode carries σ.
  assert.equal(H.toUnicodeHost("xn--nxasmq6b.com"), "βόλοσ.com");
});

test("toUnicodeHost only touches xn-- labels and never throws", () => {
  assert.equal(H.toUnicodeHost("example.com"), "example.com"); // no xn-- -> unchanged
  assert.equal(H.toUnicodeHost("mail.example.co.kr"), "mail.example.co.kr");
  assert.equal(H.toUnicodeHost(""), "");
  assert.equal(H.toUnicodeHost(null), null);
  // Malformed punycode -> best effort, returns the original host (no throw).
  assert.equal(H.toUnicodeHost("xn--!!!.com"), "xn--!!!.com");
});

test("homograph detection: a punycode host renders visibly different from its ASCII", () => {
  const ascii = domainToASCII("аpple.com"); // leading Cyrillic а
  const readable = H.toUnicodeHost(ascii);
  assert.notEqual(readable, ascii, "readable form should differ from xn-- form");
  assert.match(readable, /pple\.com$/);
});

// ---------------------------------------------------------------------------
// normalizeHost
// ---------------------------------------------------------------------------
test("normalizeHost strips scheme/userinfo/path/query/port and lowercases", () => {
  const cases = [
    ["HTTPS://Www.Example.COM/login?x=1", "www.example.com"],
    ["http://user:pass@evil.com:8443/path", "evil.com"],
    ["evil.com.", "evil.com"], // trailing dot
    ["  Shinhan-OTP.xyz  ", "shinhan-otp.xyz"],
    ["ftp://host.tld/a/b", "host.tld"],
    ["plainhost", "plainhost"],
    ["", ""],
    [null, ""],
    [undefined, ""],
  ];
  for (const [input, expected] of cases) {
    assert.equal(H.normalizeHost(input), expected, JSON.stringify(input));
  }
});

// ---------------------------------------------------------------------------
// domainChain (subdomain suffix logic)
// ---------------------------------------------------------------------------
test("domainChain yields host + parents, longest first, excluding the bare TLD", () => {
  assert.deepEqual(H.domainChain("a.b.c.com"), ["a.b.c.com", "b.c.com", "c.com"]);
  assert.deepEqual(H.domainChain("example.com"), ["example.com"]);
  assert.deepEqual(H.domainChain("login.evil.com"), ["login.evil.com", "evil.com"]);
  // Single label falls back to itself (never empty for a real host).
  assert.deepEqual(H.domainChain("localhost"), ["localhost"]);
});

// ---------------------------------------------------------------------------
// assess — explainable verdicts
// ---------------------------------------------------------------------------
function indexOf(map) {
  return { get: (d) => map[d] || null };
}

test("assess: blocklist hit is danger and matches on a parent domain (subdomain)", () => {
  const idx = indexOf({ "evil.com": { severity: "danger", source: "openphish" } });
  const v = H.assess("login.secure.evil.com", idx);
  assert.equal(v.level, "danger");
  assert.equal(v.blocked, true);
  assert.equal(v.match.domain, "evil.com");
  assert.ok(v.reasons.some((r) => r.code === "blocklist_hit"));
});

test("assess: warning-severity blocklist entry stays warning (not blocked)", () => {
  const idx = indexOf({ "watch.co.kr": { severity: "warning", source: "police_kr" } });
  const v = H.assess("watch.co.kr", idx);
  assert.equal(v.level, "warning");
  assert.equal(v.blocked, false); // blocked is danger-only
});

test("assess: localhost / loopback is always safe", () => {
  assert.equal(H.assess("localhost").level, "safe");
  assert.equal(H.assess("127.0.0.1").level, "safe");
});

test("assess: punycode host raises idn_homograph", () => {
  const v = H.assess("xn--80ak6aa92e.com");
  assert.ok(v.reasons.some((r) => r.code === "idn_homograph"));
  assert.equal(v.unicodeHost, "аррӏе.com");
  assert.ok(H.LEVEL_RANK[v.level] >= H.LEVEL_RANK.caution);
});

test("assess: brand keyword on a non-official host flags impersonation", () => {
  const v = H.assess("shinhan-otp.xyz");
  assert.ok(v.reasons.some((r) => r.code === "brand_impersonation"));
});

test("assess: official brand domain and its subdomains are NOT flagged as impersonation", () => {
  assert.ok(!H.assess("naver.com").reasons.some((r) => r.code === "brand_impersonation"));
  assert.ok(!H.assess("mail.naver.com").reasons.some((r) => r.code === "brand_impersonation"));
});

test("assess: suspicious TLD, hyphen spam, and raw IP each add a reason", () => {
  assert.ok(H.assess("foo.xyz").reasons.some((r) => r.code === "suspicious_tld"));
  assert.ok(H.assess("a-b-c-d.com").reasons.some((r) => r.code === "hyphen_spam"));
  assert.ok(H.assess("203.0.113.9").reasons.some((r) => r.code === "raw_ip"));
});

test("assess never throws and always returns a stable shape", () => {
  for (const input of ["", null, undefined, "::::", "a", "xn--", "https://"]) {
    const v = H.assess(input);
    assert.ok(v && typeof v.level === "string" && Array.isArray(v.reasons));
  }
});

// ---------------------------------------------------------------------------
// isDnrDomain — the guard that prevents one bad entry killing the batch
// ---------------------------------------------------------------------------
test("isDnrDomain accepts plain ASCII hostnames including punycode", () => {
  for (const d of ["evil.com", "a.b.co.kr", "xn--bcher-kva.com", "sub-domain.example.io"]) {
    assert.equal(H.isDnrDomain(d), true, d);
  }
});

test("isDnrDomain rejects anything DNR requestDomains cannot accept", () => {
  const bad = [
    "", // empty
    "evil", // no dot / single label
    "evil_domain.com", // underscore
    "ουτοπία.gr", // raw unicode (must be punycode first)
    "-evil.com", // leading hyphen label
    "evil-.com", // trailing hyphen label
    "a..b.com", // empty label
    ".evil.com", // leading dot
    "evil.com.", // trailing dot (normalizeHost removes it, but guard is standalone)
    "has space.com", // space
    "EVIL.com", // uppercase (must be lowercased first)
  ];
  for (const d of bad) assert.equal(H.isDnrDomain(d), false, d);
});

// ---------------------------------------------------------------------------
// buildBlockRules — CRITICAL: domain-ONLY DNR filter
// ---------------------------------------------------------------------------
const SNAPSHOT = [
  { value: "secure-tosspay.info", kind: "domain", source: "urlhaus", severity: "danger" },
  { value: "naver-security-check.xyz", kind: "domain", source: "openphish", severity: "danger" },
  { value: "watch-only.co.kr", kind: "domain", source: "police_kr", severity: "warning" },
  { value: "070-8890-1234", kind: "phone", source: "police_kr", severity: "warning" },
  { value: "110-231-45678", kind: "account", source: "police_kr", severity: "danger" },
];

test("buildBlockRules: ONLY domain kinds become rules — phone/account are never URL rules", () => {
  const { rules, incidentMap } = H.buildBlockRules(SNAPSHOT, { base: 1, max: 4000 });
  assert.equal(rules.length, 3, "3 domain entries -> 3 rules");

  const blockedDomains = rules.map((r) => r.condition.requestDomains[0]);
  assert.deepEqual(blockedDomains, ["secure-tosspay.info", "naver-security-check.xyz", "watch-only.co.kr"]);

  // The phone and account values must not appear anywhere in the rules.
  const serialized = JSON.stringify({ rules, incidentMap });
  assert.ok(!serialized.includes("070-8890-1234"), "phone leaked into a rule");
  assert.ok(!serialized.includes("110-231-45678"), "account leaked into a rule");
});

test("buildBlockRules: each rule is a main_frame redirect to the opaque interstitial", () => {
  const { rules, incidentMap } = H.buildBlockRules(SNAPSHOT, { base: 1 });
  for (const r of rules) {
    assert.equal(r.priority, 1);
    assert.equal(r.action.type, "redirect");
    assert.equal(r.action.redirect.extensionPath, "/blocked.html?r=" + r.id);
    assert.deepEqual(r.condition.resourceTypes, ["main_frame"]);
    assert.equal(r.condition.requestDomains.length, 1);
    // No raw URL, only the opaque incident id, appears in the redirect target.
    assert.ok(!/https?:/.test(r.action.redirect.extensionPath));
    // incidentMap resolves the id back to the same domain.
    assert.equal(incidentMap[r.id].domain, r.condition.requestDomains[0]);
  }
});

test("buildBlockRules: ids are contiguous from base and key the incident map", () => {
  const { rules, incidentMap } = H.buildBlockRules(SNAPSHOT, { base: 1 });
  assert.deepEqual(rules.map((r) => r.id), [1, 2, 3]);
  assert.deepEqual(Object.keys(incidentMap).map(Number), [1, 2, 3]);
});

test("buildBlockRules: severity maps warning->warning, everything else->danger", () => {
  const { incidentMap } = H.buildBlockRules(SNAPSHOT, { base: 1 });
  const bySeverity = {};
  for (const id of Object.keys(incidentMap)) bySeverity[incidentMap[id].domain] = incidentMap[id].severity;
  assert.equal(bySeverity["secure-tosspay.info"], "danger");
  assert.equal(bySeverity["watch-only.co.kr"], "warning");
});

test("buildBlockRules: allowlist excludes a domain (allowlist wins over blocklist)", () => {
  const allowed = new Set(["naver-security-check.xyz"]);
  const { rules } = H.buildBlockRules(SNAPSHOT, { allowed, base: 1 });
  const domains = rules.map((r) => r.condition.requestDomains[0]);
  assert.ok(!domains.includes("naver-security-check.xyz"));
  assert.equal(rules.length, 2);
});

test("buildBlockRules: duplicate domain entries are de-duplicated", () => {
  const dupes = [
    { value: "dup.com", kind: "domain", source: "a", severity: "danger" },
    { value: "DUP.com", kind: "domain", source: "b", severity: "danger" }, // normalizes to same host
    { value: "https://dup.com/login", kind: "domain", source: "c", severity: "danger" },
  ];
  const { rules } = H.buildBlockRules(dupes, { base: 1 });
  assert.equal(rules.length, 1);
  assert.equal(rules[0].condition.requestDomains[0], "dup.com");
});

test("buildBlockRules: monitor level produces no navigation rules", () => {
  const { rules, incidentMap } = H.buildBlockRules(SNAPSHOT, { level: "monitor", base: 1 });
  assert.equal(rules.length, 0);
  assert.deepEqual(incidentMap, {});
});

test("buildBlockRules: respects the max cap", () => {
  const many = [];
  for (let i = 0; i < 50; i++) many.push({ value: "d" + i + ".com", kind: "domain", severity: "danger" });
  const { rules } = H.buildBlockRules(many, { base: 1, max: 10 });
  assert.equal(rules.length, 10);
});

test("buildBlockRules: an invalid/unicode/underscore domain entry is skipped, not fatal", () => {
  const dirty = [
    { value: "good.com", kind: "domain", severity: "danger" },
    { value: "ουτοπία.gr", kind: "domain", severity: "danger" }, // raw unicode -> skipped
    { value: "bad_underscore.com", kind: "domain", severity: "danger" }, // underscore -> skipped
    { value: "no-dot-host", kind: "domain", severity: "danger" }, // single label -> skipped
  ];
  const { rules } = H.buildBlockRules(dirty, { base: 1 });
  assert.equal(rules.length, 1);
  assert.equal(rules[0].condition.requestDomains[0], "good.com");
});

test("buildBlockRules: tolerates empty / missing input", () => {
  assert.deepEqual(H.buildBlockRules([], {}).rules, []);
  assert.deepEqual(H.buildBlockRules(undefined, {}).rules, []);
  assert.deepEqual(H.buildBlockRules(null).rules, []);
});
