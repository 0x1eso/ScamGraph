// ScamGraph — interstitial logic for the DNR-redirect block page.
//
// The URL carries only an OPAQUE incident id (?r=<n>). The real domain is
// resolved from session storage via the background worker — the browsed URL is
// never present in this page's query string.
(function () {
  "use strict";

  const H = self.SGHeuristics;
  const params = new URLSearchParams(location.search);
  const ruleId = params.get("r");

  const els = {
    domain: document.getElementById("domain"),
    puny: document.getElementById("puny"),
    reasons: document.getElementById("reasons"),
    back: document.getElementById("back"),
    report: document.getElementById("report"),
    proceed: document.getElementById("proceed"),
    allowMins: document.getElementById("allowMins"),
    toast: document.getElementById("toast"),
  };

  let incident = null; // { domain, severity, source }

  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (res) => {
          if (chrome.runtime.lastError) return resolve({ error: chrome.runtime.lastError.message });
          resolve(res || {});
        });
      } catch (_e) {
        resolve({ error: "context invalidated" });
      }
    });
  }

  function toast(text) {
    els.toast.textContent = text;
    els.toast.classList.add("show");
    setTimeout(() => els.toast.classList.remove("show"), 2600);
  }

  function render() {
    if (!incident || !incident.domain) return;
    const readable = H ? H.toUnicodeHost(incident.domain) : incident.domain;
    els.domain.textContent = readable;
    if (readable !== incident.domain) {
      els.puny.hidden = false;
      els.puny.textContent = "퓨니코드: " + incident.domain;
    }
    const sev = incident.severity === "warning" ? "감시 목록" : "차단 목록";
    els.reasons.innerHTML = "";
    const li1 = document.createElement("li");
    li1.innerHTML = "위협 인텔리전스 <b>" + sev + "</b> 등재";
    els.reasons.appendChild(li1);
    if (incident.source && incident.source !== "unknown") {
      const li2 = document.createElement("li");
      li2.textContent = "출처 피드: " + incident.source;
      els.reasons.appendChild(li2);
    }
    const li3 = document.createElement("li");
    li3.textContent = "로컬 차단 — 방문 주소는 서버로 전송되지 않음";
    els.reasons.appendChild(li3);
  }

  // ---- actions -------------------------------------------------------------
  els.back.addEventListener("click", () => {
    // history.back() returns to the page BEFORE the bad navigation. The DNR
    // redirect did not add its own entry, so this lands safely.
    if (history.length > 1) history.back();
    else location.replace("about:blank");
  });

  els.report.addEventListener("click", async () => {
    if (!incident || !incident.domain) return toast("도메인 정보를 확인할 수 없습니다.");
    els.report.disabled = true;
    const res = await send({
      type: "report",
      target: incident.domain,
      kind: "url",
      note: "오탐 신고 (확장 차단 인터스티셜)",
    });
    els.report.disabled = false;
    toast(res && !res.error ? "오탐 신고를 접수했습니다. 감사합니다." : "게이트웨이에 연결할 수 없어 신고를 보류합니다.");
  });

  els.proceed.addEventListener("click", async () => {
    if (!incident || !incident.domain) return;
    els.proceed.disabled = true;
    await send({ type: "tempAllow", domain: incident.domain });
    // We intentionally did NOT store the full original URL (privacy), so we
    // continue to the domain root. The temporary allow suppresses the block.
    setTimeout(() => {
      location.href = "https://" + incident.domain + "/";
    }, 150);
  });

  // ---- boot ----------------------------------------------------------------
  (async function init() {
    if (ruleId) {
      const res = await send({ type: "incident", id: ruleId });
      if (res && res.incident) incident = res.incident;
    }
    render();
    if (incident && incident.domain) {
      // Count the block locally (badge/stats). No network.
      send({ type: "blocked", domain: incident.domain });
    }
  })();
})();
