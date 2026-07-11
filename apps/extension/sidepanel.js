// ScamGraph side panel — full explainable verdict for the current site or a
// context-menu target. This surface is EXPLICIT, so it calls /api/check.
(function () {
  "use strict";

  const H = self.SGHeuristics;
  const $ = (id) => document.getElementById(id);
  const GRADE_LABEL = {
    danger: "위험",
    warning: "경고",
    caution: "주의",
    safe: "안전",
    unknown: "판정불가",
  };

  let currentValue = "";

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

  function setPill(level, label) {
    $("gradePill").className = "pill " + level;
    $("gradeText").textContent = label;
  }

  function reasonText(r) {
    if (typeof r === "string") return r;
    if (r && typeof r === "object") {
      const label = r.label || r.detail || r.rule || "";
      const src = r.source ? " · " + r.source : "";
      const w = typeof r.weight === "number" ? " (+" + r.weight + ")" : "";
      return label + src + w;
    }
    return String(r);
  }

  async function resolveTarget() {
    // Prefer a context-menu target if it arrived recently.
    const res = await send({ type: "pendingCheck" });
    if (res.pendingCheck && Date.now() - res.pendingCheck.at < 15000) {
      return res.pendingCheck.value;
    }
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url) return tab.url;
    } catch (_e) {
      /* ignore */
    }
    return "";
  }

  function renderHost(value) {
    const host = H.normalizeHost(value);
    const readable = H.toUnicodeHost(host);
    $("host").textContent = readable || value || "(대상 없음)";
    if (readable !== host) {
      $("puny").hidden = false;
      $("puny").textContent = "퓨니코드: " + host;
    } else {
      $("puny").hidden = true;
    }
  }

  function renderChips(data) {
    const chips = $("chips");
    chips.innerHTML = "";
    const add = (html) => {
      const c = document.createElement("span");
      c.className = "chip";
      c.innerHTML = html;
      chips.appendChild(c);
    };
    add("종류 <b>" + escapeHtml(data.kind || "url") + "</b>");
    if (data.organization) add("귀속 <b>" + escapeHtml(data.organization) + "</b>");
    if (typeof data.community_reports === "number") add("커뮤니티 신고 <b>" + data.community_reports + "</b>");
    if (Array.isArray(data.feed_sources) && data.feed_sources.length) {
      add("피드 <b>" + escapeHtml(data.feed_sources.join(", ")) + "</b>");
    }
    if (!chips.children.length) add('<span class="muted">추가 정보 없음</span>');
  }

  function renderReasons(reasons) {
    const ul = $("reasons");
    ul.innerHTML = "";
    const list = Array.isArray(reasons) ? reasons : [];
    if (!list.length) {
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = "표시할 근거가 없습니다.";
      ul.appendChild(li);
      return;
    }
    for (const r of list) {
      const li = document.createElement("li");
      li.textContent = reasonText(r);
      ul.appendChild(li);
    }
  }

  async function analyze() {
    currentValue = await resolveTarget();
    renderHost(currentValue);

    if (!currentValue) {
      setPill("unknown", "대상 없음");
      $("reco").textContent = "분석할 사이트가 없습니다.";
      return;
    }

    setPill("unknown", "분석 중");
    $("status").textContent = "게이트웨이 조회 중…";

    const data = await send({ type: "check", value: currentValue });
    if (data.error) {
      // Fall back to local-only verdict so the panel still shows something.
      const { blocklist } = await chrome.storage.local.get("blocklist");
      const map = new Map();
      for (const e of blocklist || []) {
        if (e && e.kind === "domain") map.set(H.normalizeHost(e.value), { severity: e.severity, source: e.source });
      }
      const v = H.assess(currentValue, { get: (d) => map.get(d) || null });
      setPill(v.level, GRADE_LABEL[v.level] || v.level);
      $("score").textContent = typeof v.score === "number" ? String(v.score) : "–";
      $("score").className = "score";
      $("reco").textContent = "게이트웨이 오프라인 — 로컬 판정만 표시합니다.";
      renderChips({ kind: "url" });
      renderReasons(v.reasons.map((r) => r.label));
      $("status").textContent = "오프라인(로컬 판정)";
      return;
    }

    const grade = data.grade || "unknown";
    setPill(grade, GRADE_LABEL[grade] || grade);
    $("score").textContent = typeof data.risk_score === "number" ? String(Math.round(data.risk_score)) : "–";
    $("score").className = "score";
    $("reco").textContent = data.recommendation || "";
    renderChips(data);
    renderReasons(data.reasons);
    $("status").textContent = "게이트웨이 분석 완료";
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Re-run when a new context-menu target arrives while the panel is open.
  chrome.storage.session.onChanged.addListener((changes) => {
    if (changes.pendingCheck) analyze();
  });

  $("recheck").addEventListener("click", analyze);
  analyze();
})();
