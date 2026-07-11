// ScamGraph background service worker.
// Performs the actual gateway fetch on behalf of content scripts and the popup.
// Fetching here (with host_permissions) bypasses page-level CORS restrictions,
// which is why content.js delegates scanning to this worker instead of calling
// the gateway directly.

const GATEWAY_BASE = "http://localhost:8080";
const GATEWAY_SCAN_URL = GATEWAY_BASE + "/api/scan";
const GATEWAY_REPORT_URL = GATEWAY_BASE + "/api/report";
const GATEWAY_GUIDANCE_URL = GATEWAY_BASE + "/api/guidance";
const REQUEST_TIMEOUT_MS = 5000;

// Shared fetch helper: never throws, always resolves to parsed JSON or {error}.
async function fetchJson(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });

    if (!response.ok) {
      return { error: `gateway responded ${response.status}` };
    }

    return await response.json();
  } catch (err) {
    // Never throw: the demo must fail silently when the gateway is unreachable.
    return { error: (err && err.message) || "gateway unreachable" };
  } finally {
    clearTimeout(timeout);
  }
}

function scanTarget(target) {
  return fetchJson(GATEWAY_SCAN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target }),
  });
}

// Community report: forwards {target, kind, note} to the gateway, which returns
// the running community report count for the flywheel message.
function reportTarget(target, kind, note) {
  return fetchJson(GATEWAY_REPORT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target,
      kind: kind || "",
      note: note || "",
    }),
  });
}

// Post-detection guidance: kind/grade drive the "what to do now" steps + hotlines.
function fetchGuidance(kind, grade) {
  const params = new URLSearchParams();
  if (kind) {
    params.set("kind", kind);
  }
  if (grade) {
    params.set("grade", grade);
  }
  const query = params.toString();
  const url = query ? `${GATEWAY_GUIDANCE_URL}?${query}` : GATEWAY_GUIDANCE_URL;
  return fetchJson(url, { method: "GET" });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) {
    return false;
  }

  let handler = null;
  if (message.type === "scan" && message.target) {
    handler = scanTarget(message.target);
  } else if (message.type === "report" && message.target) {
    handler = reportTarget(message.target, message.kind, message.note);
  } else if (message.type === "guidance") {
    handler = fetchGuidance(message.kind, message.grade);
  }

  if (!handler) {
    return false;
  }

  handler
    .then((result) => sendResponse(result))
    .catch((err) => sendResponse({ error: (err && err.message) || "unknown error" }));

  // Keep the message channel open for the async sendResponse above.
  return true;
});
