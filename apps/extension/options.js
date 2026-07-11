// ScamGraph options — protection level, personal allowlist, telemetry opt-in.
// Settings persist to chrome.storage.local; the background worker rebuilds DNR
// rules automatically via storage.onChanged.
(function () {
  "use strict";

  const H = self.SGHeuristics;
  const $ = (id) => document.getElementById(id);
  const DEFAULTS = { level: "standard", allowlist: [], telemetry: false };

  let settings = { ...DEFAULTS };

  async function load() {
    const { settings: s } = await chrome.storage.local.get("settings");
    settings = { ...DEFAULTS, ...(s || {}) };
    render();
  }

  async function save() {
    await chrome.storage.local.set({ settings });
    flashSaved();
  }

  function flashSaved() {
    const el = $("saved");
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 1500);
  }

  function render() {
    // Level.
    for (const radio of document.querySelectorAll('input[name="level"]')) {
      radio.checked = radio.value === settings.level;
      radio.closest(".level").classList.toggle("sel", radio.checked);
    }
    // Telemetry.
    $("telemetry").checked = !!settings.telemetry;
    // Allowlist.
    renderAllowlist();
  }

  function renderAllowlist() {
    const list = $("allowList");
    list.innerHTML = "";
    if (!settings.allowlist.length) {
      const p = document.createElement("div");
      p.className = "empty";
      p.textContent = "허용목록이 비어 있습니다.";
      list.appendChild(p);
      return;
    }
    for (const domain of settings.allowlist) {
      const row = document.createElement("div");
      row.className = "item";
      const d = document.createElement("span");
      d.className = "d";
      d.textContent = domain;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "제거";
      btn.addEventListener("click", () => removeAllow(domain));
      row.appendChild(d);
      row.appendChild(btn);
      list.appendChild(row);
    }
  }

  function addAllow() {
    const raw = $("allowInput").value;
    const domain = H.normalizeHost(raw);
    if (!domain || !domain.includes(".")) {
      $("allowInput").focus();
      return;
    }
    if (!settings.allowlist.includes(domain)) {
      settings = { ...settings, allowlist: [...settings.allowlist, domain].sort() };
      save();
      renderAllowlist();
    }
    $("allowInput").value = "";
    $("allowInput").focus();
  }

  function removeAllow(domain) {
    settings = { ...settings, allowlist: settings.allowlist.filter((d) => d !== domain) };
    save();
    renderAllowlist();
  }

  function onLevelChange(ev) {
    if (!ev.target.matches('input[name="level"]')) return;
    settings = { ...settings, level: ev.target.value };
    save();
    render();
  }

  function init() {
    $("levels").addEventListener("change", onLevelChange);
    $("addAllow").addEventListener("click", addAllow);
    $("allowInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") addAllow();
    });
    $("telemetry").addEventListener("change", () => {
      settings = { ...settings, telemetry: $("telemetry").checked };
      save();
    });
    load();
  }

  init();
})();
