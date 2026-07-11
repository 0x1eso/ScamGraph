// ScamGraph popup — current tab verdict, blocklist status, explicit re-check.
//
// The LOCAL verdict (blocklist + heuristics) renders instantly with NO network.
// A server round-trip happens only when the user explicitly presses 상세검사/신고.
(function () {
  "use strict";

  const H = self.SGHeuristics;
  const $ = (id) => document.getElementById(id);

  const LEVEL_LABEL = { standard: "표준 보호", strict: "엄격 보호", monitor: "모니터만" };
  const GRADE_LABEL = {
    danger: "위험",
    warning: "경고",
    caution: "주의",
    safe: "안전",
    unknown: "판정불가",
  };
  const LOCAL_LABEL = { danger: "위험", warning: "경고", caution: "주의", safe: "안전" };

  let currentTab = null;
  let currentHost = "";

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

  function setPill(el, textEl, level, label) {
    el.className = "pill " + level;
    textEl.textContent = label;
  }

  function relTime(ts) {
    if (!ts) return "없음";
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return "방금 전";
    if (min < 60) return min + "분 전";
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + "시간 전";
    return Math.floor(hr / 24) + "일 전";
  }

  async function loadLocalVerdict() {
    const { blocklist } = await chrome.storage.local.get("blocklist");
    const map = new Map();
    for (const e of blocklist || []) {
      if (e && e.kind === "domain") map.set(H.normalizeHost(e.value), { severity: e.severity, source: e.source });
    }
    const index = { get: (d) => map.get(d) || null };
    const verdict = H.assess(currentHost, index);

    $("host").textContent = verdict.unicodeHost || currentHost || "(로컬 페이지)";
    if (verdict.unicodeHost && verdict.unicodeHost !== verdict.host) {
      $("puny").hidden = false;
      $("puny").textContent = "퓨니코드: " + verdict.host;
    }
    setPill($("localPill"), $("localText"), verdict.level, LOCAL_LABEL[verdict.level] || "안전");
    if (verdict.reasons.length) {
      $("note").textContent = verdict.reasons[0].label;
    } else {
      $("note").textContent = "로컬 목록/휴리스틱상 특이 신호 없음. 필요 시 상세검사 하세요.";
    }
  }

  async function loadStatus() {
    const res = await send({ type: "status" });
    if (res.error) return;
    const meta = res.meta || {};
    const level = (res.settings && res.settings.level) || "standard";
    const stats = res.stats || {};

    setPill($("levelPill"), $("levelText"), level === "monitor" ? "unknown" : "safe", LEVEL_LABEL[level] || level);
    $("blVersion").textContent = meta.version
      ? meta.version + (meta.count != null ? " · " + meta.count + "개" : "")
      : "미동기화";
    $("blSync").textContent = meta.ok === false
      ? "실패 · 마지막 정상본 사용"
      : relTime(meta.syncedAt);
    $("blockedToday").textContent = String(stats.blockedToday || 0);
  }

  function renderDetail(data) {
    $("detail").classList.add("show");
    const grade = data.grade || "unknown";
    setPill($("gradePill"), $("gradeText"), grade, GRADE_LABEL[grade] || grade);
    $("score").textContent = typeof data.risk_score === "number" ? String(Math.round(data.risk_score)) : "–";
    $("score").className = "score";
    $("reco").textContent = data.recommendation || "";

    const ul = $("reasons");
    ul.innerHTML = "";
    const reasons = Array.isArray(data.reasons) ? data.reasons : [];
    for (const r of reasons.slice(0, 6)) {
      const li = document.createElement("li");
      li.textContent = reasonText(r);
      ul.appendChild(li);
    }
    if (data.organization) {
      const li = document.createElement("li");
      li.textContent = "귀속 조직: " + data.organization;
      ul.appendChild(li);
    }
    if (Array.isArray(data.feed_sources) && data.feed_sources.length) {
      const li = document.createElement("li");
      li.textContent = "위협 피드: " + data.feed_sources.join(", ");
      ul.appendChild(li);
    }
    if (typeof data.community_reports === "number" && data.community_reports > 0) {
      const li = document.createElement("li");
      li.textContent = "커뮤니티 신고 " + data.community_reports + "건";
      ul.appendChild(li);
    }
  }

  function reasonText(r) {
    if (typeof r === "string") return r;
    if (r && typeof r === "object") {
      return r.label || r.detail || r.rule || JSON.stringify(r);
    }
    return String(r);
  }

  async function onInspect() {
    const target = currentTab && currentTab.url ? currentTab.url : currentHost;
    if (!target) return;
    $("inspect").disabled = true;
    $("inspect").textContent = "검사 중…";
    const res = await send({ type: "check", value: target });
    $("inspect").disabled = false;
    $("inspect").textContent = "이 페이지 상세검사";
    if (res.error) {
      $("detail").classList.add("show");
      $("reco").textContent = "게이트웨이(localhost:8080)에 연결할 수 없습니다. 로컬 판정만 사용하세요.";
      $("reasons").innerHTML = "";
      setPill($("gradePill"), $("gradeText"), "unknown", "오프라인");
      $("score").textContent = "–";
      return;
    }
    renderDetail(res);
  }

  async function onReport() {
    if (!currentHost) return;
    $("report").disabled = true;
    const res = await send({ type: "report", target: currentHost, kind: "url", note: "확장 팝업 신고" });
    $("report").disabled = false;
    $("report").textContent = res.error ? "신고 보류" : "신고됨 ✓";
    setTimeout(() => ($("report").textContent = "신고"), 2200);
  }

  async function onSync() {
    $("sync").disabled = true;
    $("sync").textContent = "동기화 중…";
    await send({ type: "sync" });
    await loadStatus();
    await loadLocalVerdict();
    $("sync").disabled = false;
    $("sync").textContent = "지금 동기화";
  }

  async function onPanel() {
    try {
      if (currentTab && currentTab.windowId != null) {
        await chrome.sidePanel.open({ windowId: currentTab.windowId });
        window.close();
      }
    } catch (_e) {
      /* ignore */
    }
  }

  async function init() {
    $("inspect").addEventListener("click", onInspect);
    $("report").addEventListener("click", onReport);
    $("sync").addEventListener("click", onSync);
    $("panel").addEventListener("click", onPanel);
    $("options").addEventListener("click", () => chrome.runtime.openOptionsPage());

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      currentTab = tab || null;
      if (tab && tab.url) {
        try {
          currentHost = new URL(tab.url).hostname;
        } catch (_e) {
          currentHost = "";
        }
      }
    } catch (_e) {
      /* tabs unavailable */
    }

    await Promise.all([loadLocalVerdict(), loadStatus()]);
  }

  init();
})();
