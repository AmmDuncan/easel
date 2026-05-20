(function () {
  "use strict";

  const listEl = document.getElementById("session-list");
  const emptyEl = document.getElementById("empty-state");
  const countEl = document.getElementById("session-count");
  const themeToggleEl = document.getElementById("theme-toggle");
  const presetBtnEls = Array.from(document.querySelectorAll(".preset-btn"));
  const densityBtnEls = Array.from(document.querySelectorAll(".density-btn"));

  const CONFIG_KEY = "claude-display:config";
  const LAST_VISITED_KEY = "claude-display:last-visited";
  const PRESETS = ["paper", "aurora", "slate"];
  const DENSITIES = ["carded", "flat"];

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || "dark";
  }
  function currentPreset() {
    return document.documentElement.getAttribute("data-preset") || "paper";
  }
  function currentDensity() {
    return document.documentElement.getAttribute("data-density") || "carded";
  }

  function syncPresetButtons(active) {
    presetBtnEls.forEach((b) => b.classList.toggle("active", b.dataset.preset === active));
  }
  function syncDensityButtons(active) {
    densityBtnEls.forEach((b) => b.classList.toggle("active", b.dataset.density === active));
  }

  function applyConfig(patch, opts) {
    const theme = patch.theme === "light" || patch.theme === "dark" ? patch.theme : currentTheme();
    const preset = PRESETS.includes(patch.preset) ? patch.preset : currentPreset();
    const density = DENSITIES.includes(patch.density) ? patch.density : currentDensity();
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-preset", preset);
    document.documentElement.setAttribute("data-density", density);
    syncPresetButtons(preset);
    syncDensityButtons(density);
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify({ preset, theme, density }));
    } catch {}
    if (!opts || !opts.skipServer) {
      fetch("/api/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preset, theme, density }),
      }).catch(() => {});
    }
  }

  themeToggleEl.addEventListener("click", () => {
    applyConfig({ theme: currentTheme() === "dark" ? "light" : "dark" });
  });
  presetBtnEls.forEach((btn) => {
    btn.addEventListener("click", () => applyConfig({ preset: btn.dataset.preset }));
  });
  densityBtnEls.forEach((btn) => {
    btn.addEventListener("click", () => applyConfig({ density: btn.dataset.density }));
  });
  syncPresetButtons(currentPreset());
  syncDensityButtons(currentDensity());

  // Hydrate from server on load — in case another tab changed config.
  fetch("/api/config")
    .then((r) => r.json())
    .then((d) => {
      if (d && d.config) applyConfig(d.config, { skipServer: true });
    })
    .catch(() => {});

  function readLastVisited() {
    try {
      return JSON.parse(localStorage.getItem(LAST_VISITED_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function basenameOf(path) {
    if (!path || typeof path !== "string") return null;
    const trimmed = path.replace(/\/+$/, "");
    const idx = trimmed.lastIndexOf("/");
    return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
  }

  function relTime(ts) {
    if (!ts) return "—";
    const diff = Date.now() - ts;
    if (diff < 0) return "just now";
    const s = Math.floor(diff / 1000);
    if (s < 30) return "just now";
    if (s < 60) return s + "s ago";
    const m = Math.floor(s / 60);
    if (m < 60) return m + "m ago";
    const h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    const d = Math.floor(h / 24);
    if (d < 7) return d + "d ago";
    const dt = new Date(ts);
    return dt.toLocaleDateString();
  }

  function shortId(id) {
    if (!id) return "";
    return id.length > 12 ? id.slice(0, 8) : id;
  }

  function renderRow(session, lastVisited) {
    const a = document.createElement("a");
    a.className = "session-row";
    a.href = "/s/" + encodeURIComponent(session.id);

    const left = document.createElement("div");
    left.className = "session-left";

    const head = document.createElement("div");
    head.className = "session-head";

    const project = document.createElement("span");
    project.className = "session-project";
    const name = session.label || basenameOf(session.cwd) || "Untitled session";
    project.textContent = name;
    project.title = [session.label, session.cwd, session.id]
      .filter(Boolean)
      .join(" · ");
    head.appendChild(project);

    const idChip = document.createElement("span");
    idChip.className = "session-id";
    idChip.textContent = shortId(session.id);
    head.appendChild(idChip);

    const visitedAt = lastVisited[session.id] || 0;
    if (session.lastActivity > visitedAt && session.pushCount > 0) {
      const dot = document.createElement("span");
      dot.className = "session-unread";
      dot.title = "Unread pushes";
      head.appendChild(dot);
    }
    left.appendChild(head);

    const lastPush = document.createElement("p");
    lastPush.className = "session-last-push";
    if (session.lastPushTitle) {
      lastPush.textContent = session.lastPushTitle;
    } else {
      const span = document.createElement("span");
      span.className = "none";
      span.textContent = "no pushes yet";
      lastPush.appendChild(span);
    }
    left.appendChild(lastPush);

    const meta = document.createElement("div");
    meta.className = "session-meta";
    const parts = [];
    if (session.cwd) parts.push(session.cwd);
    if (session.lastPushKind) parts.push(session.lastPushKind);
    meta.textContent = parts.join("  ·  ");
    if (parts.length === 0) meta.hidden = true;
    left.appendChild(meta);

    a.appendChild(left);

    const right = document.createElement("div");
    right.className = "session-right";

    const count = document.createElement("div");
    count.className = "session-pushcount";
    count.textContent =
      session.pushCount === 1 ? "1 push" : session.pushCount + " pushes";
    right.appendChild(count);

    const when = document.createElement("div");
    when.className = "session-when";
    when.textContent = relTime(session.lastActivity);
    right.appendChild(when);

    // Hover-revealed delete — placed inside the right column so it sits
    // above the count text in the reserved 22px slot.
    const del = document.createElement("button");
    del.className = "session-del";
    del.type = "button";
    del.title = "Delete this session";
    del.setAttribute("aria-label", "Delete session");
    del.innerHTML =
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>';
    del.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!window.confirm(`Delete session "${name}" and all its pushes?`)) return;
      await fetch("/api/sessions/" + encodeURIComponent(session.id), {
        method: "DELETE",
      });
      load();
    });
    right.appendChild(del);

    a.appendChild(right);

    return a;
  }

  async function load() {
    let sessions = [];
    try {
      const r = await fetch("/api/sessions");
      const data = await r.json();
      sessions = data.sessions || [];
    } catch (err) {
      console.error("[easel] failed to load sessions", err);
    }

    const lastVisited = readLastVisited();
    listEl.innerHTML = "";
    if (sessions.length === 0) {
      emptyEl.hidden = false;
      countEl.textContent = "— sessions";
      return;
    }
    emptyEl.hidden = true;
    countEl.textContent =
      sessions.length === 1 ? "1 session" : sessions.length + " sessions";

    for (const s of sessions) {
      const row = renderRow(s, lastVisited);
      listEl.appendChild(row);
    }
  }

  load();
  setInterval(load, 4000);
})();
