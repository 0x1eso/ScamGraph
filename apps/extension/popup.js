// ScamGraph popup logic.
// Reads the active tab's hostname, asks the background worker to scan it, and
// renders a risk gauge + grade + top reasons. All gateway failures degrade to a
// friendly Korean message.

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

function renderResult(result) {
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
}

function requestScan() {
  if (!currentHost) {
    setStatus("검사할 사이트를 찾을 수 없습니다.", true);
    return;
  }

  scanBtn.disabled = true;
  setStatus("검사 중…", false);

  try {
    chrome.runtime.sendMessage(
      { type: "scan", target: currentHost },
      function (result) {
        scanBtn.disabled = false;

        if (chrome.runtime.lastError) {
          setStatus("게이트웨이에 연결할 수 없습니다.", true);
          return;
        }
        if (!result || result.error) {
          setStatus("게이트웨이에 연결할 수 없습니다.", true);
          return;
        }
        renderResult(result);
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
