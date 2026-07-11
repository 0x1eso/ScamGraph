// ScamGraph content script.
// Runs on every page, asks the background worker to scan the current hostname,
// and injects a warning banner when the site is graded "warning" or "danger".
// Everything here is demo-safe: any failure is swallowed so the host page never
// breaks.

(function () {
  const BANNER_ID = "scamgraph-warning-banner";

  const GRADE_STYLES = {
    danger: { color: "#ff4d6d", label: "위험" },
    warning: { color: "#ffb020", label: "경고" },
  };

  function shouldSkip() {
    const proto = location.protocol;
    if (proto !== "http:" && proto !== "https:") {
      return true;
    }
    const host = location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
      return true;
    }
    return false;
  }

  function injectBanner(grade, riskScore) {
    // Guard against double-injection (e.g. bfcache restores, SPA navigations).
    if (document.getElementById(BANNER_ID)) {
      return;
    }

    const style = GRADE_STYLES[grade];
    if (!style) {
      return;
    }

    const banner = document.createElement("div");
    banner.id = BANNER_ID;
    banner.setAttribute("role", "alert");
    banner.style.cssText = [
      "position: fixed",
      "top: 0",
      "left: 0",
      "right: 0",
      "z-index: 2147483647",
      "display: flex",
      "align-items: center",
      "justify-content: center",
      "gap: 12px",
      "box-sizing: border-box",
      "padding: 10px 16px",
      `background: ${style.color}`,
      "color: #0c1018",
      "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      "font-size: 14px",
      "font-weight: 600",
      "line-height: 1.4",
      "box-shadow: 0 2px 10px rgba(0,0,0,0.35)",
      "pointer-events: auto",
    ].join(";");

    const scoreText =
      typeof riskScore === "number" ? Math.round(riskScore) : "?";
    const text = document.createElement("span");
    text.textContent = `⚠ ScamGraph 경고 — 이 사이트는 ${style.label} (위험도 ${scoreText}). 주의하세요.`;
    banner.appendChild(text);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "닫기");
    closeBtn.textContent = "×";
    closeBtn.style.cssText = [
      "background: transparent",
      "border: none",
      "color: #0c1018",
      "font-size: 20px",
      "font-weight: 700",
      "line-height: 1",
      "cursor: pointer",
      "padding: 0 4px",
    ].join(";");
    closeBtn.addEventListener("click", function () {
      const el = document.getElementById(BANNER_ID);
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
    banner.appendChild(closeBtn);

    const root = document.body || document.documentElement;
    if (root) {
      root.appendChild(banner);
    }
  }

  function run() {
    if (shouldSkip()) {
      return;
    }

    try {
      chrome.runtime.sendMessage(
        { type: "scan", target: location.hostname },
        function (result) {
          // Reading lastError prevents "Unchecked runtime.lastError" console noise
          // when the background worker is unavailable.
          if (chrome.runtime.lastError) {
            return;
          }
          if (!result || result.error) {
            return;
          }
          if (result.grade === "danger" || result.grade === "warning") {
            injectBanner(result.grade, result.risk_score);
          }
        }
      );
    } catch (_err) {
      // Extension context may be invalidated (reload/update). Stay silent.
    }
  }

  run();
})();
