// ScamGraph — content script (link-hover shield + credential/OTP submit guard).
//
// PRIVACY: everything here is 100% local. Hover verdicts are computed from the
// CACHED blocklist + local heuristics (see lib/heuristics.js, loaded first).
// No page URL is sent anywhere on hover. Only reads input TYPE / name / form
// action for the form guard — NEVER input values.
//
// Runs in an isolated world; any failure is swallowed so the host page is safe.
(function () {
  "use strict";

  const H = self.SGHeuristics;
  if (!H) return; // heuristics.js must load first

  const proto = location.protocol;
  if (proto !== "http:" && proto !== "https:") return;

  const HOVER_DEBOUNCE_MS = 150;
  const LEVEL_META = {
    danger: { color: "#ff4d6d", label: "위험" },
    warning: { color: "#ffb020", label: "경고" },
    caution: { color: "#7cf03d", label: "주의" },
  };

  // ---- Cached blocklist view (refreshed on storage change) -----------------
  let blockMap = new Map();
  let level = "standard";

  function toIndex() {
    return { get: (domain) => blockMap.get(domain) || null };
  }

  async function loadCache() {
    try {
      const { blocklist, settings } = await chrome.storage.local.get(["blocklist", "settings"]);
      const next = new Map();
      for (const e of blocklist || []) {
        if (e && e.kind === "domain") {
          next.set(H.normalizeHost(e.value), { severity: e.severity, source: e.source });
        }
      }
      blockMap = next;
      level = (settings && settings.level) || "standard";
    } catch (_e) {
      /* extension context invalidated (reload) — keep prior cache */
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.blocklist || changes.settings)) loadCache();
  });

  // ---- Shadow-DOM UI host (isolated from page styles) ----------------------
  let shadow = null;
  let tooltipEl = null;
  let modalHost = null;

  function ensureShadow() {
    if (shadow) return shadow;
    const host = document.createElement("div");
    host.id = "scamgraph-shield-root";
    host.style.cssText = "all:initial;position:fixed;z-index:2147483647;top:0;left:0;";
    (document.documentElement || document.body).appendChild(host);
    shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = [
      ":host{ all: initial; }",
      ".sg-tip{position:fixed;max-width:320px;padding:10px 12px;border-radius:10px;",
      "background:#0c1018;color:#e7ecf4;font:500 12.5px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans KR',sans-serif;",
      "border:1px solid #1b2231;box-shadow:0 12px 32px rgba(0,0,0,.5);pointer-events:none;opacity:0;",
      "transform:translateY(4px);transition:opacity .14s,transform .14s;}",
      ".sg-tip.show{opacity:1;transform:translateY(0);}",
      ".sg-tip .hd{display:flex;align-items:center;gap:8px;font-weight:700;margin-bottom:6px;}",
      ".sg-tip .dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto;}",
      ".sg-tip .host{font:600 11px/1.3 ui-monospace,'SF Mono',Menlo,monospace;color:#8a97ad;word-break:break-all;margin-bottom:6px;}",
      ".sg-tip ul{margin:0;padding-left:14px;}",
      ".sg-tip li{margin:2px 0;color:#c7d0de;}",
      // Full-screen credential guard modal.
      ".sg-modal{position:fixed;inset:0;background:rgba(4,6,10,.82);display:flex;align-items:center;justify-content:center;",
      "backdrop-filter:blur(3px);z-index:2147483647;}",
      ".sg-card{max-width:440px;margin:20px;background:#10151f;border:1px solid #2a3346;border-radius:16px;padding:24px;",
      "font:400 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans KR',sans-serif;color:#e7ecf4;",
      "box-shadow:0 24px 64px rgba(0,0,0,.6);}",
      ".sg-card h2{margin:0 0 8px;font-size:19px;color:#ff4d6d;display:flex;align-items:center;gap:8px;}",
      ".sg-card .host{font:600 12px/1.4 ui-monospace,Menlo,monospace;color:#ffb020;word-break:break-all;margin:8px 0 12px;}",
      ".sg-card p{margin:0 0 16px;color:#c7d0de;}",
      ".sg-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;}",
      ".sg-btn{appearance:none;border:1px solid #2a3346;background:#0c1018;color:#e7ecf4;padding:10px 16px;border-radius:10px;",
      "font-weight:600;font-size:13px;cursor:pointer;}",
      ".sg-btn.primary{background:#00e5c0;border-color:#00e5c0;color:#052b26;}",
      ".sg-btn.danger{color:#ff4d6d;}",
    ].join("");
    shadow.appendChild(style);

    tooltipEl = document.createElement("div");
    tooltipEl.className = "sg-tip";
    tooltipEl.setAttribute("role", "status");
    shadow.appendChild(tooltipEl);
    return shadow;
  }

  // ---- Link-hover tooltip --------------------------------------------------
  function shouldShow(verdict) {
    if (verdict.level === "safe") return false;
    if (verdict.level === "caution") return level === "strict";
    return true; // warning / danger always
  }

  function renderTooltip(verdict, x, y) {
    ensureShadow();
    const meta = LEVEL_META[verdict.level] || LEVEL_META.caution;
    const items = verdict.reasons
      .slice(0, 4)
      .map((r) => "<li>" + escapeHtml(r.label) + "</li>")
      .join("");
    tooltipEl.innerHTML =
      '<div class="hd"><span class="dot" style="background:' + meta.color + '"></span>' +
      "ScamGraph — " + meta.label +
      "</div>" +
      '<div class="host">' + escapeHtml(verdict.unicodeHost || verdict.host) +
      (verdict.unicodeHost && verdict.unicodeHost !== verdict.host
        ? " <span style=\"color:#78849a\">(" + escapeHtml(verdict.host) + ")</span>"
        : "") +
      "</div>" +
      (items ? "<ul>" + items + "</ul>" : "");
    tooltipEl.style.borderColor = meta.color;
    positionTooltip(x, y);
    tooltipEl.classList.add("show");
  }

  function positionTooltip(x, y) {
    const pad = 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x + pad;
    let top = y + pad;
    const rect = tooltipEl.getBoundingClientRect();
    if (left + rect.width + pad > vw) left = Math.max(pad, x - rect.width - pad);
    if (top + rect.height + pad > vh) top = Math.max(pad, y - rect.height - pad);
    tooltipEl.style.left = left + "px";
    tooltipEl.style.top = top + "px";
  }

  function hideTooltip() {
    if (tooltipEl) tooltipEl.classList.remove("show");
  }

  let hoverTimer = 0;
  let hoverAnchor = null;

  function onOver(ev) {
    const a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
    if (!a || a === hoverAnchor) return;
    hoverAnchor = a;
    clearTimeout(hoverTimer);
    const href = a.href;
    const cx = ev.clientX;
    const cy = ev.clientY;
    hoverTimer = window.setTimeout(() => {
      let host;
      try {
        host = new URL(href, location.href).hostname;
      } catch (_e) {
        return;
      }
      if (!host || host === location.hostname) return; // skip same-site nav noise
      const verdict = H.assess(host, toIndex());
      if (shouldShow(verdict)) renderTooltip(verdict, cx, cy);
    }, HOVER_DEBOUNCE_MS);
  }

  function onOut(ev) {
    const a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
    if (a && a === hoverAnchor) {
      hoverAnchor = null;
      clearTimeout(hoverTimer);
      hideTooltip();
    }
  }

  // ---- Credential / OTP submit guard --------------------------------------
  // Reads only field TYPE / name / autocomplete + form action host. No values.
  const OTP_HINT = /(otp|one[-_ ]?time|verif|인증|pin|passcode|보안카드|security[-_ ]?code)/i;

  function formHasSensitiveField(form) {
    const inputs = form.querySelectorAll("input");
    for (const el of inputs) {
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (type === "password") return "password";
      const name = (el.getAttribute("name") || "") + " " + (el.getAttribute("id") || "") +
        " " + (el.getAttribute("autocomplete") || "") + " " + (el.getAttribute("inputmode") || "");
      if (type === "text" || type === "tel" || type === "number") {
        if (OTP_HINT.test(name) || el.getAttribute("autocomplete") === "one-time-code") return "otp";
      }
    }
    return null;
  }

  function pageVerdict() {
    return H.assess(location.hostname, toIndex());
  }

  function onSubmitCapture(ev) {
    const form = ev.target;
    if (!form || form.tagName !== "FORM") return;
    const verdict = pageVerdict();
    if (verdict.level !== "danger" && verdict.level !== "warning") return;
    const field = formHasSensitiveField(form);
    if (!field) return;

    ev.preventDefault();
    ev.stopImmediatePropagation();

    let actionHost = location.hostname;
    try {
      actionHost = new URL(form.getAttribute("action") || location.href, location.href).hostname;
    } catch (_e) {
      /* ignore */
    }
    showGuardModal(verdict, field, actionHost, () => {
      // User chose to proceed: submit without re-triggering the guard.
      try {
        form.submit();
      } catch (_e) {
        /* form.submit may be shadowed; fall back to requestSubmit */
        try { form.requestSubmit(); } catch (_e2) {}
      }
    });
  }

  function showGuardModal(verdict, field, actionHost, onProceed) {
    ensureShadow();
    if (modalHost) modalHost.remove();
    const kindLabel = field === "password" ? "비밀번호" : "인증번호(OTP)";
    modalHost = document.createElement("div");
    modalHost.className = "sg-modal";
    modalHost.setAttribute("role", "alertdialog");
    modalHost.setAttribute("aria-modal", "true");
    modalHost.innerHTML =
      '<div class="sg-card">' +
      "<h2>⚠ 위험한 페이지에서 " + kindLabel + " 입력</h2>" +
      '<div class="host">' + escapeHtml(verdict.unicodeHost || verdict.host) + "</div>" +
      "<p>이 사이트는 <b>" + (LEVEL_META[verdict.level] || {}).label + "</b>으로 분류됐습니다. " +
      "입력한 " + kindLabel + "가 <b>" + escapeHtml(actionHost) + "</b>(으)로 전송됩니다. " +
      "피싱이면 계정이 탈취될 수 있습니다.</p>" +
      '<div class="sg-actions">' +
      '<button class="sg-btn primary" data-act="cancel">입력 취소(안전)</button>' +
      '<button class="sg-btn danger" data-act="proceed">위험을 감수하고 계속</button>' +
      "</div></div>";
    shadow.appendChild(modalHost);

    modalHost.addEventListener("click", (e) => {
      const act = e.target && e.target.getAttribute ? e.target.getAttribute("data-act") : null;
      if (act === "proceed") {
        modalHost.remove();
        modalHost = null;
        onProceed();
      } else if (act === "cancel" || e.target === modalHost) {
        modalHost.remove();
        modalHost = null;
      }
    });
  }

  // ---- utils ---------------------------------------------------------------
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---- boot ----------------------------------------------------------------
  loadCache().then(() => {
    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("mouseout", onOut, true);
    document.addEventListener("submit", onSubmitCapture, true);
    window.addEventListener("scroll", hideTooltip, { passive: true });
  });
})();
