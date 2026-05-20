(function () {
  "use strict";

  const cfg = window.__CLAUDE_DISPLAY__ || {};
  const sessionId = cfg.sessionId;

  const cardsEl = document.getElementById("cards");
  const emptyEl = document.getElementById("empty-state");
  const countEl = document.getElementById("push-count");
  const prunedEl = document.getElementById("pruned-marker");
  const liveDotEl = document.getElementById("live-dot");
  const liveLabelEl = document.getElementById("live-label");
  const newPillEl = document.getElementById("new-pill");
  const newPillText = document.getElementById("new-pill-text");
  const themeToggleEl = document.getElementById("theme-toggle");

  const BOTTOM_THRESHOLD_PX = 220;
  const THEME_KEY = "claude-display:theme";

  let unreadCount = 0;
  let totalPushes = 0;
  const iframes = new Set();

  /* ============================================================
     Self-measure message bridge — iframes post their measured body
     height; we apply it. Reliable across font loads, image loads,
     and dynamic content (the iframe knows when its DOM mutates).
     ============================================================ */

  window.addEventListener("message", (e) => {
    const data = e && e.data;
    if (!data || data.type !== "claude-display:size") return;
    if (!data.pushId || typeof data.height !== "number") return;
    const iframe = cardsEl.querySelector(
      'iframe[data-push-id="' + cssEscape(data.pushId) + '"]',
    );
    if (!iframe) return;
    const stickToBottom = nearBottom();
    iframe.style.height = Math.max(0, Math.ceil(data.height)) + "px";
    if (stickToBottom) {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "auto",
      });
    }
  });

  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  /* ============================================================
     Theming
     ============================================================ */

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || "dark";
  }

  function applyTheme(theme, opts) {
    const t = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", t);
    if (!opts || !opts.skipPersist) {
      try {
        localStorage.setItem(THEME_KEY, t);
      } catch (e) {
        /* ignore */
      }
    }
    broadcastThemeToIframes(t);
  }

  function broadcastThemeToIframes(theme) {
    iframes.forEach((iframe) => {
      try {
        iframe.contentWindow &&
          iframe.contentWindow.postMessage(
            { type: "claude-display:theme", theme },
            "*",
          );
      } catch (e) {
        /* ignore */
      }
    });
  }

  themeToggleEl.addEventListener("click", () => {
    applyTheme(currentTheme() === "dark" ? "light" : "dark");
  });

  // Track system changes only if user hasn't set a preference.
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", (e) => {
      try {
        if (localStorage.getItem(THEME_KEY)) return;
      } catch (err) {
        return;
      }
      applyTheme(e.matches ? "light" : "dark", { skipPersist: true });
    });
  }

  /* ============================================================
     Scroll helpers
     ============================================================ */

  function nearBottom() {
    const remaining =
      document.documentElement.scrollHeight -
      window.scrollY -
      window.innerHeight;
    return remaining <= BOTTOM_THRESHOLD_PX;
  }

  function scrollToBottom(smooth) {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }

  /* ============================================================
     Formatting
     ============================================================ */

  function formatTime(ts) {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return hh + ":" + mm;
  }

  function setPushCount(n) {
    totalPushes = n;
    countEl.textContent = n === 1 ? "1 push" : n + " pushes";
    emptyEl.hidden = n > 0;
  }

  function setPrunedCount(n) {
    if (n > 0) {
      prunedEl.hidden = false;
      prunedEl.textContent =
        "… " + n + " earlier push" + (n === 1 ? "" : "es") + " pruned";
    } else {
      prunedEl.hidden = true;
    }
  }

  function updateLive(connected) {
    if (connected) {
      liveDotEl.classList.remove("offline");
      liveLabelEl.textContent = "live";
    } else {
      liveDotEl.classList.add("offline");
      liveLabelEl.textContent = "reconnecting…";
    }
  }

  /* ============================================================
     Card rendering
     ============================================================ */

  function renderPush(push, opts) {
    const card = document.createElement("article");
    card.className = "push";
    if (opts && opts.fresh) card.classList.add("fresh");
    card.id = "push-" + push.id;

    const meta = document.createElement("div");
    meta.className = "push-meta";

    const idx = document.createElement("span");
    idx.className = "push-index";
    idx.textContent = "#" + push.index;
    meta.appendChild(idx);

    const title = document.createElement("span");
    title.className = "push-title";
    title.textContent = push.title || "(untitled)";
    meta.appendChild(title);

    if (push.kind) {
      const kind = document.createElement("span");
      kind.className = "push-kind";
      kind.textContent = push.kind;
      meta.appendChild(kind);
    }

    const time = document.createElement("span");
    time.className = "push-time";
    time.textContent = formatTime(push.createdAt);
    meta.appendChild(time);

    card.appendChild(meta);

    const body = document.createElement("div");
    body.className = "push-body";

    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.setAttribute("scrolling", "no");
    iframe.setAttribute("title", push.title || "push " + push.index);
    iframe.dataset.pushId = push.id;
    iframe.srcdoc = wrapPushedHtml(push.html, currentTheme(), push.id);
    iframe.addEventListener("load", () => {
      iframes.add(iframe);
      // Primary path: the iframe self-measures and posts back size via
      // `claude-display:size` — handled by the message listener at the
      // top of this module. No DOM peeking from the parent (would fail
      // under cross-origin sandbox anyway).
    });
    body.appendChild(iframe);

    card.appendChild(body);
    return card;
  }

  /* ============================================================
     Wrapper for pushed HTML
     Bakes in: design tokens (light + dark), Rule 30 typography
     defaults, generous whitespace, theme postMessage listener.
     Authors can either:
       - write plain HTML (<h1>, <h2>, <p>, etc.) — gets styled for free, OR
       - write their own <style> and override anything.
     ============================================================ */
  function wrapPushedHtml(html, theme, pushId) {
    const trimmed = (html || "").trimStart().toLowerCase();
    if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
      return injectBridge(html, theme, pushId);
    }
    return buildDefaultWrapper(html, theme, pushId);
  }

  function selfMeasureScript(pushId) {
    return (
      "(function(){var ID=" +
      JSON.stringify(pushId) +
      ";function measure(){var b=document.body,h=document.documentElement;if(!b)return 0;return Math.max(b.getBoundingClientRect().bottom,b.scrollHeight,h.scrollHeight)}function send(){try{parent.postMessage({type:'claude-display:size',pushId:ID,height:measure()},'*')}catch(e){}}send();window.addEventListener('load',send);window.addEventListener('resize',send);if(document.fonts&&document.fonts.ready){document.fonts.ready.then(send).catch(function(){})}if(window.ResizeObserver){var ro=new ResizeObserver(send);if(document.body)ro.observe(document.body);ro.observe(document.documentElement)}var mo=new MutationObserver(send);mo.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true});setTimeout(send,250);setTimeout(send,800);setTimeout(send,1600)})();"
    );
  }

  function buildDefaultWrapper(body, theme, pushId) {
    return `<!DOCTYPE html>
<html data-theme="${theme}">
<head>
<meta charset="utf-8" />
<base target="_blank" />
<link rel="preconnect" href="https://rsms.me/" />
<link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
<style>
:root,
:root[data-theme="light"] {
  --ds-bg: #ecebe5;
  --ds-bg-elev: #f6f4ee;
  --ds-surface: #f6f4ee;
  --ds-surface-soft: #ecebe3;
  --ds-ink: #1a1916;
  --ds-ink-soft: #34322d;
  --ds-muted: #76746c;
  --ds-line: #d8d5cb;
  --ds-accent: #2f5fd1;
  --ds-accent-soft: #e4ebfb;
  --ds-success: #0f9d6b;
  --ds-danger: #d64545;
  --ds-code-bg: #1c1b18;
  --ds-code-ink: #f1ede1;
  --ds-pattern-dot: rgba(40, 30, 10, 0.085);
  color-scheme: light;
}
:root[data-theme="dark"] {
  --ds-bg: #0c0d10;
  --ds-bg-elev: #15171c;
  --ds-surface: #15171c;
  --ds-surface-soft: #1c1f25;
  --ds-ink: #f5f5f5;
  --ds-ink-soft: #d4d4d8;
  --ds-muted: #9ca3af;
  --ds-line: #23262d;
  --ds-accent: #7aa8ff;
  --ds-accent-soft: rgba(122, 168, 255, 0.16);
  --ds-success: #34d399;
  --ds-danger: #f87171;
  --ds-code-bg: #07080a;
  --ds-code-ink: #f5f5f5;
  --ds-pattern-dot: rgba(255, 255, 255, 0.045);
  color-scheme: dark;
}
*, *::before, *::after { box-sizing: border-box; }
html, body {
  margin: 0;
  background: var(--ds-bg-elev);
  color: var(--ds-ink);
  font-family: "Inter", -apple-system, "SF Pro Text", system-ui, sans-serif;
  font-feature-settings: "cv11", "ss01";
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  transition: background 200ms ease, color 200ms ease;
}
body {
  padding: 36px 40px 44px;
  max-width: 880px;
  margin: 0 auto;
}
body > *:first-child { margin-top: 0 !important; }
body > *:last-child { margin-bottom: 0 !important; }
.wrap { display: block; }
.kicker {
  display: block;
  font-size: 13px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ds-muted);
  font-weight: 500;
  margin-bottom: 14px;
}
h1 {
  font-size: 40px;
  font-weight: 500;
  letter-spacing: -0.025em;
  line-height: 1.08;
  margin: 0 0 18px;
}
.deck, .lede {
  font-size: 19px;
  line-height: 1.55;
  color: var(--ds-ink-soft);
  margin: 0 0 28px;
  max-width: 720px;
}
h2 {
  font-size: 26px;
  font-weight: 500;
  letter-spacing: -0.02em;
  margin: 36px 0 12px;
}
h3 {
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.005em;
  margin: 24px 0 8px;
}
h4 { font-size: 15px; font-weight: 600; margin: 20px 0 6px; }
p {
  font-size: 18px;
  margin: 0 0 14px;
  color: var(--ds-ink-soft);
}
a { color: var(--ds-accent); text-decoration: none; border-bottom: 1px solid color-mix(in srgb, var(--ds-accent) 40%, transparent); }
a:hover { border-bottom-color: var(--ds-accent); }
ul, ol { padding-left: 22px; margin: 0 0 18px; }
li { font-size: 18px; margin-bottom: 6px; color: var(--ds-ink-soft); }
code {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 0.92em;
  background: var(--ds-surface-soft);
  color: var(--ds-ink);
  padding: 2px 6px;
  border-radius: 5px;
}
pre {
  background: var(--ds-code-bg);
  color: var(--ds-code-ink);
  padding: 18px 22px;
  border-radius: 12px;
  overflow: auto;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 13.5px;
  line-height: 1.7;
  margin: 16px 0 24px;
}
pre code { background: transparent; padding: 0; color: inherit; font-size: inherit; }
blockquote {
  border-left: 3px solid var(--ds-accent);
  margin: 18px 0;
  padding: 4px 0 4px 20px;
  color: var(--ds-ink-soft);
  font-size: 18px;
}
.card, .panel {
  background: var(--ds-surface);
  border: 1px solid var(--ds-line);
  border-radius: 14px;
  padding: 24px 28px;
  margin: 0 0 20px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04);
}
hr {
  border: 0;
  border-top: 1px solid var(--ds-line);
  margin: 36px 0;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 15px;
  margin: 18px 0 24px;
}
th, td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--ds-line);
}
th { color: var(--ds-muted); font-weight: 500; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; }
img { max-width: 100%; height: auto; border-radius: 10px; }
</style>
</head>
<body>
${body}
<script>
(function(){
  function apply(theme){
    document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark");
    window.__claudeDisplayTheme = theme;
  }
  window.addEventListener("message", function(e){
    if (e && e.data && e.data.type === "claude-display:theme") apply(e.data.theme);
  });
})();
</script>
<script>${selfMeasureScript(pushId)}</script>
</body>
</html>`;
  }

  function injectBridge(html, theme, pushId) {
    const themeScript =
      '<script>(function(){function a(t){document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark");window.__claudeDisplayTheme=t}a(' +
      JSON.stringify(theme) +
      ');window.addEventListener("message",function(e){if(e&&e.data&&e.data.type==="claude-display:theme")a(e.data.theme)})})();</script>';
    const measureScript = "<script>" + selfMeasureScript(pushId) + "</script>";
    const combined = themeScript + measureScript;
    if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, combined + "</body>");
    return html + combined;
  }

  /* ============================================================
     Feed updates
     ============================================================ */

  function appendPush(push, opts) {
    const wasNearBottom = nearBottom();
    const card = renderPush(push, opts);
    cardsEl.appendChild(card);
    setPushCount(totalPushes + 1);
    return { wasNearBottom, card };
  }

  function bumpUnread() {
    unreadCount += 1;
    newPillEl.hidden = false;
    newPillText.textContent =
      unreadCount + " new push" + (unreadCount === 1 ? "" : "es");
  }

  function clearUnread() {
    unreadCount = 0;
    newPillEl.hidden = true;
  }

  newPillEl.addEventListener("click", () => {
    clearUnread();
    scrollToBottom(true);
  });

  window.addEventListener("scroll", () => {
    if (nearBottom() && !newPillEl.hidden) clearUnread();
  });

  /* ============================================================
     Hydrate + SSE
     ============================================================ */

  async function hydrate() {
    try {
      const r = await fetch("/s/" + sessionId + "/state");
      const view = await r.json();
      setPrunedCount((view.meta && view.meta.prunedCount) || 0);
      cardsEl.innerHTML = "";
      iframes.clear();
      setPushCount(0);
      for (const p of view.pushes || []) {
        appendPush(p, { fresh: false });
      }
      requestAnimationFrame(() => scrollToBottom(false));
    } catch (err) {
      console.error("[claude-display] hydrate failed", err);
    }
  }

  function connectSse() {
    const es = new EventSource("/s/" + sessionId + "/events");
    es.addEventListener("hello", () => updateLive(true));
    es.addEventListener("push", (e) => {
      try {
        const push = JSON.parse(e.data);
        const { wasNearBottom } = appendPush(push, { fresh: true });
        if (wasNearBottom) {
          scrollToBottom(true);
        } else {
          bumpUnread();
        }
      } catch (err) {
        console.error("[claude-display] bad push payload", err);
      }
    });
    es.onerror = () => {
      updateLive(false);
      es.close();
      setTimeout(connectSse, 1500);
    };
  }

  hydrate().then(connectSse);
})();
