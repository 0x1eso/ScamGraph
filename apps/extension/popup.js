// ScamGraph popup logic.
// Reads the active tab's hostname, asks the background worker to scan it, and
// renders a risk gauge + grade + top reasons. When the grade is warning/danger
// it also offers a community report button (the flywheel) and a compact
// post-detection action guide. All gateway failures degrade to a friendly
// Korean message, and the report/guide sections simply stay hidden on failure —
// they never break the popup.

const GRADE_META = {
  danger: { color: "#ff4d6d", label: "위험", caption: "즉시 이용을 중단하세요" },
  warning: { color: "#ffb020", label: "경고", caption: "주의가 필요합니다" },
  caution: { color: "#ffb020", label: "주의", caption: "확인이 필요합니다" },
  safe: { color: "#00e5c0", label: "안전", caption: "특이사항이 없습니다" },
};

const hostEl = document.getElementById("host");
const scanBtn = document.getElementById("scan-btn");
const resultEl = document.getElementById("result");

let currentHost = null;
// Bumped on every scan so stale async callbacks (guidance) don't append to a
// result that has since been re-rendered.
let activeScanToken = 0;

function setStatus(text, isError) {
  resultEl.innerHTML = "";
  const div = document.createElement("div");
  div.className = isError ? "status error" : "status";
  div.textContent = text;
  resultEl.appendChild(div);
}

function escapeText(value) {
  // textContent assignment already escapes; this helper just coerces to string.
  return value == null ? "" : String(value);
}

// Only allow navigable protocols on gateway-supplied links (defense in depth
// against a javascript: URL slipping into an <a href>).
function isSafeHref(href) {
  return typeof href === "string" && /^(https?:|tel:)/i.test(href.trim());
}

function renderResult(result, token) {
  const grade = result.grade || "safe";
  const meta = GRADE_META[grade] || GRADE_META.safe;
  const score =
    typeof result.risk_score === "number" ? Math.round(result.risk_score) : 0;

  resultEl.innerHTML = "";

  // Gauge: score ring + grade block.
  const gauge = document.createElement("div");
  gauge.className = "gauge";

  const ring = document.createElement("div");
  ring.className = "score-ring";
  ring.style.setProperty("--pct", String(Math.max(0, Math.min(100, score))));
  ring.style.setProperty("--ring-color", meta.color);
  const scoreNum = document.createElement("span");
  scoreNum.className = "score-num";
  scoreNum.textContent = String(score);
  ring.appendChild(scoreNum);
  gauge.appendChild(ring);

  const gradeBlock = document.createElement("div");
  gradeBlock.className = "grade-block";
  const gradeLabel = document.createElement("span");
  gradeLabel.className = "grade-label";
  gradeLabel.style.color = meta.color;
  gradeLabel.textContent = meta.label;
  const gradeCaption = document.createElement("span");
  gradeCaption.className = "grade-caption";
  gradeCaption.textContent = meta.caption;
  gradeBlock.appendChild(gradeLabel);
  gradeBlock.appendChild(gradeCaption);
  gauge.appendChild(gradeBlock);

  resultEl.appendChild(gauge);

  // Top reasons (up to 4).
  const reasons = Array.isArray(result.reasons) ? result.reasons.slice(0, 4) : [];
  if (reasons.length > 0) {
    const list = document.createElement("ul");
    list.className = "reasons";
    reasons.forEach(function (reason) {
      const li = document.createElement("li");

      const left = document.createElement("div");
      const rule = document.createElement("div");
      rule.className = "rule";
      rule.textContent = escapeText(reason.rule || "규칙");
      const detail = document.createElement("div");
      detail.className = "detail";
      detail.textContent = escapeText(reason.detail || "");
      left.appendChild(rule);
      if (reason.detail) {
        left.appendChild(detail);
      }

      const weight = document.createElement("span");
      weight.className = "weight";
      weight.textContent =
        reason.weight != null ? "+" + escapeText(reason.weight) : "";

      li.appendChild(left);
      li.appendChild(weight);
      list.appendChild(li);
    });
    resultEl.appendChild(list);
  }

  // Post-detection: only the actionable grades get the report button + guide.
  if (grade === "warning" || grade === "danger") {
    renderPostDetection(result, grade, token);
  }
}

// Renders the community report button and kicks off the async guidance fetch.
function renderPostDetection(result, grade, token) {
  const kind = result.kind || "";

  const actions = document.createElement("div");
  actions.className = "actions";

  const reportBtn = document.createElement("button");
  reportBtn.type = "button";
  reportBtn.className = "report-btn";
  reportBtn.textContent = "🚩 사기 신고";
  reportBtn.addEventListener("click", function () {
    submitReport(reportBtn, actions, currentHost, kind);
  });
  actions.appendChild(reportBtn);
  resultEl.appendChild(actions);

  loadGuidance(kind, grade, token);
}

// Sends the report to the community feed. On success the button is replaced
// with the flywheel confirmation ("커뮤니티 N건"); on failure it re-enables so
// the user can retry — nothing else changes.
function submitReport(btn, container, target, kind) {
  if (!target) {
    return;
  }

  btn.disabled = true;
  btn.textContent = "신고 중…";

  function restore() {
    btn.disabled = false;
    btn.textContent = "🚩 사기 신고";
  }

  try {
    chrome.runtime.sendMessage(
      { type: "report", target: target, kind: kind, note: "" },
      function (result) {
        if (chrome.runtime.lastError || !result || result.error) {
          restore();
          return;
        }
        showReportDone(btn, container, result);
      }
    );
  } catch (_err) {
    restore();
  }
}

function showReportDone(btn, container, result) {
  btn.remove();
  const done = document.createElement("div");
  done.className = "report-done";
  const count = typeof result.reports === "number" ? result.reports : null;
  done.textContent =
    count != null ? "✅ 신고 완료 · 커뮤니티 " + count + "건" : "✅ 신고 완료";
  container.appendChild(done);
}

// Fetches "what to do now" guidance. Silent on any failure (section hidden).
function loadGuidance(kind, grade, token) {
  try {
    chrome.runtime.sendMessage(
      { type: "guidance", kind: kind, grade: grade },
      function (result) {
        // Drop stale responses from a superseded scan.
        if (token !== activeScanToken) {
          return;
        }
        if (chrome.runtime.lastError || !result || result.error) {
          return;
        }
        renderGuidance(result);
      }
    );
  } catch (_err) {
    // Stay silent: the guide is a bonus, never a blocker.
  }
}

function renderGuidance(guidance) {
  const steps = Array.isArray(guidance.steps) ? guidance.steps : [];
  const hotlines = Array.isArray(guidance.hotlines) ? guidance.hotlines : [];
  if (steps.length === 0 && hotlines.length === 0) {
    return;
  }

  const section = document.createElement("section");
  section.className = "guide";

  const heading = document.createElement("div");
  heading.className = "guide-title";
  heading.textContent = "🆘 지금 할 일";
  section.appendChild(heading);

  if (guidance.headline) {
    const headline = document.createElement("div");
    headline.className = "guide-headline";
    headline.textContent = escapeText(guidance.headline);
    section.appendChild(headline);
  }

  if (steps.length > 0) {
    const ol = document.createElement("ol");
    ol.className = "guide-steps";
    steps.slice(0, 5).forEach(function (step) {
      if (!step) {
        return;
      }
      const li = document.createElement("li");

      const title = document.createElement("div");
      title.className = "step-title";
      title.textContent = escapeText(step.title || "");
      li.appendChild(title);

      if (step.detail) {
        const detail = document.createElement("div");
        detail.className = "step-detail";
        detail.textContent = escapeText(step.detail);
        li.appendChild(detail);
      }

      const action = step.action;
      if (action && action.label && isSafeHref(action.href)) {
        const a = document.createElement("a");
        a.className = "step-action";
        a.textContent = escapeText(action.label);
        a.href = action.href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        li.appendChild(a);
      }

      ol.appendChild(li);
    });
    section.appendChild(ol);
  }

  if (hotlines.length > 0) {
    const hotWrap = document.createElement("div");
    hotWrap.className = "hotlines";
    hotlines.slice(0, 4).forEach(function (hotline) {
      if (!hotline || !hotline.contact) {
        return;
      }
      const a = document.createElement("a");
      a.className = "hotline";
      a.href = "tel:" + String(hotline.contact).replace(/[^0-9+]/g, "");

      const name = document.createElement("span");
      name.className = "hotline-name";
      name.textContent = escapeText(hotline.name || "신고 전화");

      const contact = document.createElement("span");
      contact.className = "hotline-contact";
      contact.textContent = escapeText(hotline.contact);

      a.appendChild(name);
      a.appendChild(contact);
      hotWrap.appendChild(a);
    });
    section.appendChild(hotWrap);
  }

  resultEl.appendChild(section);
}

function requestScan() {
  if (!currentHost) {
    setStatus("검사할 사이트를 찾을 수 없습니다.", true);
    return;
  }

  activeScanToken += 1;
  const token = activeScanToken;

  scanBtn.disabled = true;
  setStatus("검사 중…", false);

  try {
    chrome.runtime.sendMessage(
      { type: "scan", target: currentHost },
      function (result) {
        scanBtn.disabled = false;

        // Ignore a scan response that a newer scan has already superseded.
        if (token !== activeScanToken) {
          return;
        }
        if (chrome.runtime.lastError) {
          setStatus("게이트웨이에 연결할 수 없습니다.", true);
          return;
        }
        if (!result || result.error) {
          setStatus("게이트웨이에 연결할 수 없습니다.", true);
          return;
        }
        renderResult(result, token);
      }
    );
  } catch (_err) {
    scanBtn.disabled = false;
    setStatus("게이트웨이에 연결할 수 없습니다.", true);
  }
}

function init() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const tab = tabs && tabs[0];
    if (!tab || !tab.url) {
      hostEl.textContent = "—";
      setStatus("현재 탭 정보를 읽을 수 없습니다.", true);
      scanBtn.disabled = true;
      return;
    }

    let host = null;
    try {
      const url = new URL(tab.url);
      if (url.protocol === "http:" || url.protocol === "https:") {
        host = url.hostname;
      }
    } catch (_err) {
      host = null;
    }

    if (!host) {
      hostEl.textContent = "검사할 수 없는 페이지";
      setStatus("이 페이지는 검사 대상이 아닙니다.", false);
      scanBtn.disabled = true;
      return;
    }

    currentHost = host;
    hostEl.textContent = host;
  });

  scanBtn.addEventListener("click", requestScan);
}

document.addEventListener("DOMContentLoaded", init);
