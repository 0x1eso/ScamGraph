// ScamGraph background service worker.
// Performs the actual gateway fetch on behalf of content scripts and the popup.
// Fetching here (with host_permissions) bypasses page-level CORS restrictions,
// which is why content.js delegates scanning to this worker instead of calling
// the gateway directly.

const GATEWAY_URL = "http://localhost:8080/api/scan";
const REQUEST_TIMEOUT_MS = 5000;

async function scanTarget(target) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { error: `gateway responded ${response.status}` };
    }

    const data = await response.json();
    return data;
  } catch (err) {
    // Never throw: the demo must fail silently when the gateway is unreachable.
    return { error: (err && err.message) || "gateway unreachable" };
  } finally {
    clearTimeout(timeout);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "scan" || !message.target) {
    return false;
  }

  scanTarget(message.target)
    .then((result) => sendResponse(result))
    .catch((err) => sendResponse({ error: (err && err.message) || "unknown error" }));

  // Keep the message channel open for the async sendResponse above.
  return true;
});
