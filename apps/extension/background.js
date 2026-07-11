// ScamGraph — background service worker ("브라우저 방화벽" control plane).
//
// Privacy-preserving design (emphasized in README):
//   The blocklist is fetched ONCE per ~30 min and enforced 100% LOCALLY via
//   declarativeNetRequest redirect rules. Browsing URLs are NEVER sent to the
//   server for the blocking decision. The only requests that leave the device
//   are user-initiated ("상세검사", "신고") and the periodic blocklist pull.
//
// Classic (non-module) worker so importScripts() is available for shared code.
importScripts("lib/heuristics.js");

const GATEWAY_BASE = "http://localhost:8080";
const SNAPSHOT_URL = GATEWAY_BASE + "/api/blocklist/snapshot";
const CHECK_URL = GATEWAY_BASE + "/api/check";
const REPORT_URL = GATEWAY_BASE + "/api/report";

const SYNC_ALARM = "sg-sync";
const SYNC_PERIOD_MIN = 30;
const ALLOW_ALARM_PREFIX = "sg-allow:";
const TEMP_ALLOW_MINUTES = 10;
const REQUEST_TIMEOUT_MS = 6000;

// Dynamic rule id space. We own ALL dynamic rules, so a full replace is safe.
const BLOCK_RULE_BASE = 1;
const MAX_BLOCK_RULES = 4000;

const DEFAULT_SETTINGS = { level: "standard", allowlist: [], telemetry: false };

// ---------------------------------------------------------------------------
// Small storage helpers
// ---------------------------------------------------------------------------
async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

async function getBlocklist() {
  const { blocklist } = await chrome.storage.local.get("blocklist");
  return Array.isArray(blocklist) ? blocklist : [];
}

async function getTempAllow() {
  const { tempAllow } = await chrome.storage.session.get("tempAllow");
  const now = Date.now();
  const out = {};
  let changed = false;
  for (const [domain, exp] of Object.entries(tempAllow || {})) {
    if (exp > now) out[domain] = exp;
    else changed = true;
  }
  if (changed) await chrome.storage.session.set({ tempAllow: out });
  return out;
}

// ---------------------------------------------------------------------------
// Network — never throws, always resolves to parsed JSON or {error}
// ---------------------------------------------------------------------------
async function fetchJson(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) return { error: "gateway responded " + res.status };
    return await res.json();
  } catch (err) {
    return { error: (err && err.message) || "gateway unreachable" };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Integrity — recompute the gateway's hash locally (sha256 of value+"\n", 16 hex)
// ---------------------------------------------------------------------------
async function computeHash16(entries) {
  const enc = new TextEncoder();
  const parts = [];
  for (const e of entries) parts.push(String(e.value), "\n");
  const buf = enc.encode(parts.join(""));
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex.slice(0, 16);
}

// ---------------------------------------------------------------------------
// Blocklist sync — validate count + hash, keep last-good rules on any failure
// ---------------------------------------------------------------------------
async function syncBlocklist(trigger) {
  const snap = await fetchJson(SNAPSHOT_URL, { method: "GET" });
  if (!snap || snap.error || !Array.isArray(snap.entries)) {
    await mergeMeta({ ok: false, lastError: (snap && snap.error) || "invalid snapshot", lastTry: Date.now() });
    return { ok: false, reason: (snap && snap.error) || "invalid snapshot" };
  }

  // Structural validation.
  if (typeof snap.count === "number" && snap.count !== snap.entries.length) {
    await mergeMeta({ ok: false, lastError: "count mismatch", lastTry: Date.now() });
    return { ok: false, reason: "count mismatch" };
  }
  if (snap.hash) {
    const local = await computeHash16(snap.entries);
    if (local !== snap.hash) {
      await mergeMeta({ ok: false, lastError: "hash mismatch", lastTry: Date.now() });
      return { ok: false, reason: "hash mismatch" };
    }
  }

  await chrome.storage.local.set({ blocklist: snap.entries });
  await mergeMeta({
    ok: true,
    version: snap.version || null,
    hash: snap.hash || null,
    count: snap.entries.length,
    syncedAt: Date.now(),
    trigger: trigger || "manual",
    lastError: null,
  });
  await rebuildRules();
  return { ok: true, count: snap.entries.length, version: snap.version };
}

async function mergeMeta(patch) {
  const { blMeta } = await chrome.storage.local.get("blMeta");
  await chrome.storage.local.set({ blMeta: { ...(blMeta || {}), ...patch } });
}

// ---------------------------------------------------------------------------
// declarativeNetRequest — domain entries -> redirect rules to the interstitial
// ---------------------------------------------------------------------------
async function rebuildRules() {
  const [entries, settings, tempAllow] = await Promise.all([
    getBlocklist(),
    getSettings(),
    getTempAllow(),
  ]);

  const allowed = new Set(
    [...(settings.allowlist || []), ...Object.keys(tempAllow)].map((d) =>
      self.SGHeuristics.normalizeHost(d)
    )
  );

  const rules = [];
  const incidentMap = {};

  // "monitor" level = observe only, no navigation blocking.
  if (settings.level !== "monitor") {
    const seen = new Set();
    let id = BLOCK_RULE_BASE;
    for (const e of entries) {
      if (!e || e.kind !== "domain") continue; // only domains are DNR-blockable
      const domain = self.SGHeuristics.normalizeHost(e.value);
      if (!domain || !domain.includes(".") || seen.has(domain) || allowed.has(domain)) continue;
      seen.add(domain);
      if (rules.length >= MAX_BLOCK_RULES) break;

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
  }

  // The incident map lives in session storage (local, trusted) so blocked.js can
  // resolve ?r=<id> back to a domain without the raw URL ever touching the query.
  await chrome.storage.session.set({ incidentMap });

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules: rules,
  });
  return rules.length;
}

// ---------------------------------------------------------------------------
// Temporary "continue anyway" allow — short-lived, auto-expires via alarm
// ---------------------------------------------------------------------------
async function addTempAllow(domain) {
  const d = self.SGHeuristics.normalizeHost(domain);
  if (!d) return;
  const tempAllow = await getTempAllow();
  const expiry = Date.now() + TEMP_ALLOW_MINUTES * 60 * 1000;
  tempAllow[d] = expiry;
  await chrome.storage.session.set({ tempAllow });
  await chrome.alarms.create(ALLOW_ALARM_PREFIX + d, { when: expiry });
  await rebuildRules();
}

// ---------------------------------------------------------------------------
// Stats + badge — the interstitial reports blocks locally (no server call)
// ---------------------------------------------------------------------------
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function recordBlocked(domain) {
  const { stats } = await chrome.storage.local.get("stats");
  const today = todayKey();
  const cur = stats && stats.date === today ? stats : { date: today, blockedToday: 0 };
  const total = (stats && stats.blockedTotal) || 0;
  const next = {
    date: today,
    blockedToday: (cur.blockedToday || 0) + 1,
    blockedTotal: total + 1,
    lastDomain: domain || null,
    lastAt: Date.now(),
  };
  await chrome.storage.local.set({ stats: next });
  await refreshBadge(next.blockedToday);
  notifyBlocked(domain);
}

function notifyBlocked(domain) {
  try {
    chrome.notifications.create("sg-block-" + Date.now(), {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "ScamGraph 방화벽 — 접속 차단",
      message: (domain || "위험 사이트") + " 접속을 로컬에서 차단했습니다.",
      priority: 1,
    });
  } catch (_e) {
    /* notifications unavailable — non-fatal */
  }
}

async function refreshBadge(count) {
  try {
    const n = typeof count === "number" ? count : await todayBlockedCount();
    await chrome.action.setBadgeBackgroundColor({ color: "#ff4d6d" });
    await chrome.action.setBadgeText({ text: n > 0 ? String(n > 99 ? "99+" : n) : "" });
  } catch (_e) {
    /* action badge may be unavailable during early startup */
  }
}

async function todayBlockedCount() {
  const { stats } = await chrome.storage.local.get("stats");
  return stats && stats.date === todayKey() ? stats.blockedToday || 0 : 0;
}

// ---------------------------------------------------------------------------
// Explicit, user-initiated server calls (gated by user action, not by browsing)
// ---------------------------------------------------------------------------
function checkValue(value) {
  const url = CHECK_URL + "?value=" + encodeURIComponent(value || "");
  return fetchJson(url, { method: "GET" });
}

function reportTarget(target, kind, note) {
  return fetchJson(REPORT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target: target || "", kind: kind || "url", note: note || "" }),
  });
}

// ---------------------------------------------------------------------------
// Context menus + side panel
// ---------------------------------------------------------------------------
function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "sg-check-link",
      title: "ScamGraph로 이 링크 검사",
      contexts: ["link"],
    });
    chrome.contextMenus.create({
      id: "sg-check-selection",
      title: "ScamGraph로 선택 텍스트 검사",
      contexts: ["selection"],
    });
  });
}

async function openDetailFor(value, tab) {
  // Stash the pending target so the side panel can render the full verdict.
  await chrome.storage.session.set({ pendingCheck: { value, at: Date.now() } });
  try {
    if (tab && tab.windowId != null) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } else if (tab && tab.id != null) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  } catch (_e) {
    /* side panel open requires a user gesture; the context-menu click is one */
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
async function bootstrap(trigger) {
  const settings = await getSettings();
  await chrome.storage.local.set({ settings }); // persist defaults on first run
  await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MIN });
  createContextMenus();
  try {
    await chrome.sidePanel.setOptions({ path: "sidepanel.html", enabled: true });
  } catch (_e) {
    /* sidePanel unavailable on older Chrome — non-fatal */
  }
  await refreshBadge();
  await syncBlocklist(trigger);
}

chrome.runtime.onInstalled.addListener(() => bootstrap("install"));
chrome.runtime.onStartup.addListener(() => bootstrap("startup"));

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SYNC_ALARM) {
    await syncBlocklist("alarm");
    return;
  }
  if (alarm.name.startsWith(ALLOW_ALARM_PREFIX)) {
    const domain = alarm.name.slice(ALLOW_ALARM_PREFIX.length);
    const tempAllow = await getTempAllow();
    if (tempAllow[domain]) {
      delete tempAllow[domain];
      await chrome.storage.session.set({ tempAllow });
    }
    await rebuildRules();
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const value = info.menuItemId === "sg-check-link" ? info.linkUrl : info.selectionText;
  if (value) openDetailFor(value.trim(), tab);
});

// React to settings/allowlist edits from the options page.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) {
    rebuildRules();
  }
});

// ---------------------------------------------------------------------------
// Message hub — content scripts, popup, options, side panel, interstitial
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return false;

  const reply = (p) => {
    p.then((r) => sendResponse(r)).catch((e) =>
      sendResponse({ error: (e && e.message) || "unknown error" })
    );
    return true; // keep the channel open for async sendResponse
  };

  switch (msg.type) {
    case "check":
      return reply(checkValue(msg.value));
    case "report":
      return reply(reportTarget(msg.target, msg.kind, msg.note));
    case "sync":
      return reply(syncBlocklist("manual"));
    case "status":
      return reply(
        Promise.all([
          chrome.storage.local.get(["blMeta", "settings", "stats"]),
          getTempAllow(),
        ]).then(([store, tempAllow]) => ({
          meta: store.blMeta || null,
          settings: { ...DEFAULT_SETTINGS, ...(store.settings || {}) },
          stats: store.stats || { date: todayKey(), blockedToday: 0, blockedTotal: 0 },
          tempAllow,
        }))
      );
    case "incident":
      // blocked.js: resolve ?r=<id> to a stored incident (no raw URL involved).
      return reply(
        chrome.storage.session.get("incidentMap").then(({ incidentMap }) => ({
          incident: (incidentMap || {})[msg.id] || null,
        }))
      );
    case "blocked":
      return reply(recordBlocked(msg.domain).then(() => ({ ok: true })));
    case "tempAllow":
      return reply(addTempAllow(msg.domain).then(() => ({ ok: true })));
    case "pendingCheck":
      return reply(
        chrome.storage.session.get("pendingCheck").then(({ pendingCheck }) => ({ pendingCheck: pendingCheck || null }))
      );
    default:
      return false;
  }
});
