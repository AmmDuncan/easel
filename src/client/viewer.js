(function () {
  "use strict";

  const cfg = window.__EASEL__ || {};
  const sessionId = cfg.sessionId;

  const cardsEl = document.getElementById("cards");
  const emptyEl = document.getElementById("empty-state");
  const countEl = document.getElementById("push-count");

  // Per-push export watchdog timers. If the iframe never posts back
  // image-ready / image-error (e.g. a render stall), the watchdog clears the
  // button spinner and surfaces an error instead of spinning forever.
  // Generous (2 min) so large/heavy PDF/PNG exports have time to rasterize.
  const EXPORT_TIMEOUT_MS = 120000;
  const exportWatchdogs = new Map();
  function clearExportSpinner(pushId) {
    const iframeEl = cardsEl.querySelector(
      'iframe[data-push-id="' + cssEscape(pushId) + '"]',
    );
    const push = iframeEl && iframeEl.closest(".push");
    const ex = push && push.querySelector(".push-export");
    if (ex) delete ex.dataset.loading;
  }
  function clearExportWatchdog(pushId) {
    const t = exportWatchdogs.get(pushId);
    if (t) {
      clearTimeout(t);
      exportWatchdogs.delete(pushId);
    }
  }
  const prunedEl = document.getElementById("pruned-marker");
  const liveDotEl = document.getElementById("live-dot");
  const liveLabelEl = document.getElementById("live-label");
  const newPillEl = document.getElementById("new-pill");
  const newPillText = document.getElementById("new-pill-text");
  const themeToggleEl = document.getElementById("theme-toggle");
  const presetBtnEls = Array.from(document.querySelectorAll(".preset-btn"));
  const densityBtnEls = Array.from(document.querySelectorAll(".density-btn"));
  const switcherBtnEl = document.getElementById("switcher-btn");
  const switcherMenuEl = document.getElementById("switcher-menu");
  const projectLabelEl = document.getElementById("project-label");

  const BOTTOM_THRESHOLD_PX = 220;
  const CONFIG_KEY = "easel:config";
  const LAST_VISITED_KEY = "easel:last-visited";
  const PRESETS = ["paper", "aurora", "slate"];
  const DENSITIES = ["carded", "flat"];

  /* The token block injected into every iframe wrapper — six combos so
     pushed HTML themes correctly regardless of host preset/mode. */
  const PRESET_TOKENS_CSS = `
:root[data-preset="paper"][data-theme="light"] {
  --ds-bg:#f4efe2;--ds-bg-elev:#f8f3e6;--ds-surface:#faf6ee;--ds-surface-soft:#f0ead9;
  --ds-ink:#2a261e;--ds-ink-soft:#524b3c;--ds-muted:#756c57;
  --ds-line:#d5cdb6;--ds-line-soft:#e3dcc6;
  --ds-accent:#c97a1c;--ds-accent-soft:#f7e8c0;--ds-accent-ink:#fff;
  --ds-code-bg:#2a261e;--ds-code-ink:#eae5d5;
  --ds-shadow-md:0 1px 2px rgba(70,50,10,.06),0 18px 36px rgba(70,50,10,.1);
  color-scheme:light;
}
:root[data-preset="paper"][data-theme="dark"] {
  --ds-bg:#1c1b18;--ds-bg-elev:#25241f;--ds-surface:#25241f;--ds-surface-soft:#20201c;
  --ds-ink:#ede9e0;--ds-ink-soft:#bbb5a8;--ds-muted:#888273;
  --ds-line:#423f37;--ds-line-soft:#312f29;
  --ds-accent:#f4bf5e;--ds-accent-soft:#3d3322;--ds-accent-ink:#1f1d18;
  --ds-code-bg:#161514;--ds-code-ink:#eae5d5;
  --ds-shadow-md:inset 0 1px 0 rgba(255,255,255,.045),0 1px 2px rgba(0,0,0,.55),0 18px 38px rgba(0,0,0,.45);
  color-scheme:dark;
}
:root[data-preset="aurora"][data-theme="light"] {
  --ds-bg:#f5f3fa;--ds-bg-elev:#fafaff;--ds-surface:#fff;--ds-surface-soft:#f0eef7;
  --ds-ink:#1c1d24;--ds-ink-soft:#4a4d5a;--ds-muted:#7a7d8c;
  --ds-line:#e1dff0;--ds-line-soft:#ebe9f5;
  --ds-accent:#6d4eff;--ds-accent-soft:#ebe7ff;--ds-accent-ink:#fff;
  --ds-code-bg:#1c1d24;--ds-code-ink:#ebe7ff;
  --ds-shadow-md:0 1px 2px rgba(60,50,120,.05),0 18px 36px rgba(60,50,120,.08);
  color-scheme:light;
}
:root[data-preset="aurora"][data-theme="dark"] {
  --ds-bg:#0d0f14;--ds-bg-elev:#14171f;--ds-surface:#161a23;--ds-surface-soft:#11141a;
  --ds-ink:#e7e9ee;--ds-ink-soft:#b9bdc6;--ds-muted:#8b909a;
  --ds-line:rgba(143,160,200,.14);--ds-line-soft:rgba(143,160,200,.08);
  --ds-accent:#b8c8ff;--ds-accent-soft:rgba(140,170,255,.12);--ds-accent-ink:#0d0f14;
  --ds-code-bg:#07080a;--ds-code-ink:#e7e9ee;
  --ds-shadow-md:inset 0 1px 0 rgba(255,255,255,.045),0 0 0 1px rgba(123,97,255,.06),0 24px 60px rgba(0,0,0,.55),0 0 80px -20px rgba(123,97,255,.25);
  color-scheme:dark;
}
:root[data-preset="slate"][data-theme="light"] {
  --ds-bg:#ecebe5;--ds-bg-elev:#f6f4ee;--ds-surface:#f6f4ee;--ds-surface-soft:#ecebe3;
  --ds-ink:#1a1916;--ds-ink-soft:#34322d;--ds-muted:#76746c;
  --ds-line:#d8d5cb;--ds-line-soft:#e1ddd2;
  --ds-accent:#2f5fd1;--ds-accent-soft:#e4ebfb;--ds-accent-ink:#fff;
  --ds-code-bg:#1c1b18;--ds-code-ink:#f1ede1;
  --ds-shadow-md:0 1px 2px rgba(40,30,10,.05),0 16px 32px rgba(40,30,10,.08);
  color-scheme:light;
}
:root[data-preset="slate"][data-theme="dark"] {
  --ds-bg:#0c0d10;--ds-bg-elev:#15171c;--ds-surface:#15171c;--ds-surface-soft:#1c1f25;
  --ds-ink:#f5f5f5;--ds-ink-soft:#d4d4d8;--ds-muted:#9ca3af;
  --ds-line:#23262d;--ds-line-soft:#1c1f25;
  --ds-accent:#7dd3fc;--ds-accent-soft:rgba(125,211,252,.16);--ds-accent-ink:#07242e;
  --ds-code-bg:#07080a;--ds-code-ink:#f5f5f5;
  --ds-shadow-md:0 1px 2px rgba(0,0,0,.4),0 12px 28px rgba(0,0,0,.45);
  color-scheme:dark;
}
`;

  /* Semantic chips — universal across presets. Authors use:
       <span class="chip bug">BUG</span> / .ux / .polish / .ok / .info
     to get accessible, glow-haloed badges that work in both modes. */
  const SEMANTIC_CHIPS_CSS = `
.chip {
  display: inline-block;
  font-size: 11px;
  letter-spacing: 0.08em;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  padding: 3px 9px;
  border-radius: 999px;
  text-transform: uppercase;
  border: 1px solid transparent;
  font-weight: 600;
}
:root[data-theme="light"] .chip.bug { background:#fef2f2; color:#b91c1c; border-color:#fecaca; box-shadow:0 0 12px -6px rgba(185,28,28,.5); }
:root[data-theme="dark"]  .chip.bug { background:#2a1518; color:#ffaba0; border-color:#4a1f25; box-shadow:0 0 12px -4px rgba(255,119,119,.45); }
:root[data-theme="light"] .chip.ux  { background:#eff6ff; color:#1d4ed8; border-color:#bfdbfe; box-shadow:0 0 12px -6px rgba(29,78,216,.45); }
:root[data-theme="dark"]  .chip.ux  { background:#15212b; color:#93cef0; border-color:#1f3848; box-shadow:0 0 12px -4px rgba(140,170,255,.4); }
:root[data-theme="light"] .chip.polish { background:#faf5ff; color:#7c3aed; border-color:#e9d5ff; box-shadow:0 0 12px -6px rgba(124,58,237,.45); }
:root[data-theme="dark"]  .chip.polish { background:#1b2230; color:#b8bfd2; border-color:#2a334b; box-shadow:0 0 12px -4px rgba(186,130,255,.4); }
:root[data-theme="light"] .chip.ok  { background:#f0fdf4; color:#028043; border-color:#bbf7d0; box-shadow:0 0 12px -6px rgba(2,128,67,.45); }
:root[data-theme="dark"]  .chip.ok  { background:#052e16; color:#6ee7b7; border-color:#134e29; box-shadow:0 0 12px -4px rgba(110,231,183,.4); }
:root[data-theme="light"] .chip.info { background:#ecfeff; color:#0e7490; border-color:#a5f3fc; box-shadow:0 0 12px -6px rgba(14,116,144,.45); }
:root[data-theme="dark"]  .chip.info { background:#0a1c22; color:#67e8f9; border-color:#155060; box-shadow:0 0 12px -4px rgba(103,232,249,.4); }
.chip.accent { background:var(--ds-accent-soft); color:var(--ds-accent); border-color:transparent; box-shadow:0 0 12px -4px color-mix(in srgb, var(--ds-accent) 40%, transparent); }
`;

  /* Self-contained structural primitives — window chrome + locked code/terminal.
     These pin their own background and ink with fixed (theme-independent) colours,
     so unlike the preset-token presentation styles they CAN'T leak the host theme.
     Injected in BOTH the normal wrapper AND app-fidelity (mockup/app) mode: a UI
     recreation is exactly where an agent reaches for a window frame or a code
     block, so stripping these in fidelity mode left the skill's own guidance
     ("wrap a mockup in .window") producing unstyled output. */
  const STRUCTURAL_PRIMITIVES_CSS = `
/* Bind the CSS color-scheme to the host theme so any author CSS that uses
   light-dark() (text ink, surfaces, borders) tracks the easel light/dark
   TOGGLE rather than the OS preference. The default wrapper already gets this
   via PRESET_TOKENS_CSS, but app-fidelity (kind:"mockup") pushes omit the
   preset tokens — without this rule their light-dark() ink follows the OS
   scheme and washes out whenever the OS disagrees with the easel toggle. */
:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"]  { color-scheme: dark; }

/* Skeuomorphic macOS-style window chrome for UI mockups. Usage:
     <div class="window" data-title="App name"> …mockup content… </div>
   Draws a 40px title bar with the three traffic-light dots (red/yellow/green)
   and an optional centred title from data-title. Content sits below the bar.
   Add the desktop class for a full desktop-screen canvas — min-height 900px,
   i.e. the 1440x900 (16:10) standard design canvas — so a screen mockup looks
   like a real window with viewport breathing room rather than a short strip.
   Omit desktop for dialogs / small components so they stay content-sized.

   A mockup renders an app's own UI, so it owns a STABLE surface that does NOT
   flip with the host theme — otherwise a light dashboard mockup renders on a dark
   window in a dark-mode viewer and every subtle gray label washes out (same
   surface-vs-ink mismatch the .code primitive locks against). Default is a light
   canvas with pinned dark ink and color:inherit re-scoped to every child so the
   host's light-dark() ink can never leak in. Add the dark class
   (class="window dark") for a genuinely dark-UI mockup. */
.window {
  position: relative;
  padding-top: 40px;
  border-radius: 12px;
  border: 1px solid #e2e2e2;
  box-shadow: 0 14px 48px rgba(0, 0, 0, 0.16);
  overflow: hidden;
  background: #ffffff;
  color: #1a1a1a;
}
.window * { color: inherit; }
.window::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 40px;
  background-color: #f1f1f1;
  border-bottom: 1px solid #e2e2e2;
  background-image:
    radial-gradient(circle at 19px 20px, #ff5f57 6px, transparent 6.5px),
    radial-gradient(circle at 39px 20px, #febc2e 6px, transparent 6.5px),
    radial-gradient(circle at 59px 20px, #28c840 6px, transparent 6.5px);
  background-repeat: no-repeat;
}
.window::after {
  content: attr(data-title);
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 500;
  color: #6b6b6b;
  pointer-events: none;
}
.window.dark {
  border-color: #2a2a2a;
  background: #161616;
  color: #e6edf3;
  box-shadow: 0 14px 48px rgba(0, 0, 0, 0.4);
}
.window.dark::before {
  background-color: #1f1f1f;
  border-bottom-color: #2a2a2a;
}
.window.dark::after { color: #9b9b9b; }
.window.desktop {
  min-height: 900px;
}
/* Locked-dark code / terminal primitive. Reach for this instead of hand-rolling
   a dark code container — the recurring failure is a custom dark <div> that sets
   its own background but lets base text inherit .wrap's light-dark() ink, which
   resolves to near-black in light host mode and vanishes against the dark panel.
   This class locks BOTH background and ink, and re-scopes color:inherit to every
   child so the host theme can never leak in. Ships the verified github-dark token
   palette so syntax highlighting reads against #0f172a without per-token tuning.
   Usage: <div class="code"><span class="kw">gcloud</span> services enable …</div>
   .terminal is an alias; add .terminal for a prompt feel (same colors). */
.code, .terminal {
  background: #0f172a;
  color: #e6edf3;
  border-radius: 12px;
  padding: 18px 22px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 13.5px;
  line-height: 1.7;
  overflow: auto;
  margin: 16px 0 24px;
}
.code *, .terminal * { color: inherit; }
.code .kw,      .terminal .kw      { color: #ff7b72; }  /* keywords, control flow */
.code .string,  .terminal .string  { color: #a5d6ff; }  /* strings, attr values */
.code .fn,      .terminal .fn      { color: #d2a8ff; }  /* function names */
.code .prop,    .terminal .prop    { color: #79c0ff; }  /* identifiers, properties */
.code .num,     .terminal .num     { color: #ffa657; }  /* numbers, constants */
.code .comment, .terminal .comment { color: #8b949e; }  /* comments */
.code .muted,   .terminal .muted   { color: #94a3b8; }  /* dim / secondary */
.code .accent,  .terminal .accent  { color: #6ee7b7; }  /* highlight / success */
@media print {
  /* Force the locked-dark primitives light for print — browsers drop background
     colours by default, which would otherwise strand their light ink on white
     paper. Applies in both normal and app-fidelity mode. The !important here
     also (intentionally) overrides the normal branch's non-print-gated pre/code
     theming, so code reads as dark-on-light on paper regardless of host theme. */
  pre, code, .code, .terminal { background: #f4f3ed !important; color: #111 !important; border: 1px solid #ddd; }
  .code *, .terminal * { color: #111 !important; }
  .window.dark { background: #ffffff !important; color: #111 !important; }
  .window.dark * { color: #111 !important; }
}
`;

  const unreadIds = new Set();
  let totalPushes = 0;
  const iframes = new Set();
  const cardObservers = new Map(); // pushId → IntersectionObserver
  let bumpAt = 0;

  /* ============================================================
     Self-measure message bridge — iframes post their measured body
     height; we apply it. Reliable across font loads, image loads,
     and dynamic content (the iframe knows when its DOM mutates).

     100vh auto-guard: a root sized with viewport units (100vh/dvh/svh)
     resolves `vh` against THIS iframe, which has no intrinsic viewport,
     so it would otherwise collapse to the iframe's default ~150px. The
     bridge reports a non-floored `content` height plus the iframe's own
     `vp`; when content exactly fills vp (the viewport-lock signature) we
     probe at a distinct viewport and, if content tracks it, pin the card
     to the desktop canvas instead of letting it collapse. Normal cards
     never enter the probe — they size to the measured `height` exactly
     as before, so this is zero-change for non-viewport-relative content.
     ============================================================ */

  const EASEL_DESKTOP_CANVAS = 900; // matches .window.desktop min-height
  const EASEL_PROBE_PX = 720; // distinct probe viewport for vh-lock detection
  const EASEL_MIN_CARD_PX = 150; // historical floor (the iframe's default height)
  const iframeSizeState = new Map(); // pushId → { phase }

  function setIframeHeight(iframe, px) {
    iframe.style.height = Math.max(0, Math.ceil(px)) + "px";
  }

  // Card height = the iframe's NON-floored content height (never the viewport-
  // floored documentElement.scrollHeight, which would re-inflate short content
  // to whatever viewport we last set — fatal once the probe bumps it to 720).
  function trackedHeight(content) {
    return Math.max(EASEL_MIN_CARD_PX, content);
  }

  function applyMeasuredSize(iframe, data) {
    const content = typeof data.content === "number" ? data.content : data.height;
    const vp = typeof data.vp === "number" ? data.vp : null;

    // Legacy bridge / no viewport signal: size to the measured height, as before.
    if (vp === null) {
      setIframeHeight(iframe, data.height);
      return;
    }

    let st = iframeSizeState.get(data.pushId);
    if (!st) {
      st = { phase: "initial" };
      iframeSizeState.set(data.pushId, st);
    }

    if (st.phase === "pinned") {
      // Viewport-locked root pinned to the desktop canvas; still grow if real
      // overflow content exceeds it.
      setIframeHeight(iframe, Math.max(EASEL_DESKTOP_CANVAS, content));
      return;
    }
    if (st.phase === "tracking") {
      setIframeHeight(iframe, trackedHeight(content));
      return;
    }
    if (st.phase === "probing") {
      // Trust only measurements taken AT the probe viewport — ignore stale
      // pre-resize messages still carrying the old (initial) viewport.
      if (Math.abs(vp - EASEL_PROBE_PX) > 4) return;
      if (content >= EASEL_PROBE_PX - 2) {
        // Content grew to fill the probe viewport → viewport-relative root.
        st.phase = "pinned";
        setIframeHeight(iframe, Math.max(EASEL_DESKTOP_CANVAS, content));
      } else {
        // Content stayed at its intrinsic height → not viewport-locked.
        st.phase = "tracking";
        setIframeHeight(iframe, trackedHeight(content));
      }
      return;
    }
    // st.phase === "initial"
    if (vp > 0 && Math.abs(content - vp) <= 2) {
      // Content exactly fills the iframe's natural viewport — ambiguous: a
      // collapsed viewport-relative (100vh) root, OR content that just happens
      // to equal this height. Probe at a distinct viewport to disambiguate.
      st.phase = "probing";
      setIframeHeight(iframe, EASEL_PROBE_PX);
    } else {
      st.phase = "tracking";
      setIframeHeight(iframe, trackedHeight(content));
    }
  }

  window.addEventListener("message", (e) => {
    const data = e && e.data;
    if (!data) return;
    if (data.type === "easel:size") {
      if (!data.pushId || typeof data.height !== "number") return;
      const iframe = cardsEl.querySelector(
        'iframe[data-push-id="' + cssEscape(data.pushId) + '"]',
      );
      if (!iframe) return;
      applyMeasuredSize(iframe, data);
      return;
    }
    if (data.type === "easel:click") {
      // An iframe was clicked — close any open dropdowns in the parent.
      if (switcherMenuEl && !switcherMenuEl.hidden) {
        switcherMenuEl.hidden = true;
        switcherBtnEl.setAttribute("aria-expanded", "false");
      }
      return;
    }
    if (data.type === "easel:contrast-warn") {
      stampContrastWarning(data.pushId, data.count, data.samples);
      return;
    }
    if (data.type === "easel:image-error") {
      console.error("[easel] iframe export error", data);
      clearExportWatchdog(data.pushId);
      clearExportSpinner(data.pushId);
      alert("Export failed (" + (data.format || "?") + "): " + (data.message || "unknown"));
      return;
    }
    if (data.type === "easel:image-ready") {
      const format = data.format === "pdf" ? "pdf" : "png";
      clearExportWatchdog(data.pushId);
      const clearLoading = () => clearExportSpinner(data.pushId);

      if (format === "pdf") {
        downloadAsPdf(data.dataUrl, data.filename || "push.pdf")
          .catch((err) => {
            console.error("[easel] pdf export failed", err);
            alert("PDF export failed: " + (err && err.message ? err.message : err));
          })
          .finally(clearLoading);
        return;
      }

      // PNG — direct anchor download.
      const a = document.createElement("a");
      a.href = data.dataUrl;
      a.download = data.filename || "push.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      clearLoading();
      return;
    }
  });

  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  /**
   * Embed a rasterised dataURL into a single-page PDF sized to the image's
   * pixel dimensions, producing a continuous (no page-breaks) document, then
   * save. The iframe sends a JPEG dataURL for PDF targets — PDFs natively use
   * DCT compression for JPEGs, so embedding stays compact (vs PNGs which
   * balloon the file). We detect format from the dataURL prefix; PNG still
   * works as a fallback for any legacy caller that sends one.
   */
  function downloadAsPdf(dataUrl, filename) {
    return new Promise((resolve, reject) => {
      const jspdfNs = window.jspdf;
      if (!jspdfNs || !jspdfNs.jsPDF) {
        reject(new Error("jsPDF not loaded"));
        return;
      }
      const isJpeg = dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg");
      const imageType = isJpeg ? "JPEG" : "PNG";
      const img = new Image();
      img.onload = () => {
        try {
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          const pdf = new jspdfNs.jsPDF({
            unit: "px",
            format: [w, h],
            orientation: w > h ? "landscape" : "portrait",
            hotfixes: ["px_scaling"],
            compress: true,
          });
          pdf.addImage(dataUrl, imageType, 0, 0, w, h, undefined, "FAST");
          pdf.save(filename);
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error("image decode failed"));
      img.src = dataUrl;
    });
  }

  // Dismiss any open push-export menu on outside click / Escape.
  document.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest(".push-export-wrap")) return;
    document.querySelectorAll(".push-export-menu").forEach((m) => {
      if (!m.hidden) {
        m.hidden = true;
        const sib = m.previousElementSibling;
        if (sib) sib.setAttribute("aria-expanded", "false");
      }
    });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".push-export-menu").forEach((m) => {
      if (!m.hidden) {
        m.hidden = true;
        const sib = m.previousElementSibling;
        if (sib) sib.setAttribute("aria-expanded", "false");
      }
    });
  });

  /* ============================================================
     Theming
     ============================================================ */

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || "dark";
  }
  function currentPreset() {
    return document.documentElement.getAttribute("data-preset") || "paper";
  }
  function currentDensity() {
    return document.documentElement.getAttribute("data-density") || "carded";
  }

  function applyConfig(patch, opts) {
    const theme = patch.theme === "light" || patch.theme === "dark"
      ? patch.theme
      : currentTheme();
    const preset = PRESETS.includes(patch.preset) ? patch.preset : currentPreset();
    const density = DENSITIES.includes(patch.density) ? patch.density : currentDensity();
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-preset", preset);
    document.documentElement.setAttribute("data-density", density);
    syncPresetButtons(preset);
    syncDensityButtons(density);
    if (!opts || !opts.skipPersist) {
      try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify({ preset, theme, density }));
      } catch (e) {
        /* ignore */
      }
    }
    broadcastConfigToIframes({ preset, theme, density });
    if (!opts || !opts.skipServer) {
      pushConfigToServer({ preset, theme, density });
    }
  }

  function syncPresetButtons(active) {
    presetBtnEls.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.preset === active);
    });
  }
  function syncDensityButtons(active) {
    densityBtnEls.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.density === active);
    });
  }

  function broadcastConfigToIframes(cfg) {
    iframes.forEach((iframe) => {
      try {
        iframe.contentWindow &&
          iframe.contentWindow.postMessage(
            { type: "easel:config", ...cfg },
            "*",
          );
      } catch (e) {
        /* ignore */
      }
    });
  }

  async function pushConfigToServer(cfg) {
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cfg),
      });
    } catch {
      /* server will catch up via SSE on next event */
    }
  }

  themeToggleEl.addEventListener("click", () => {
    applyConfig({ theme: currentTheme() === "dark" ? "light" : "dark" });
  });
  presetBtnEls.forEach((btn) => {
    btn.addEventListener("click", () => {
      applyConfig({ preset: btn.dataset.preset });
    });
  });
  densityBtnEls.forEach((btn) => {
    btn.addEventListener("click", () => {
      applyConfig({ density: btn.dataset.density });
    });
  });
  syncPresetButtons(currentPreset());
  syncDensityButtons(currentDensity());

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

  function scrollToLatestCard(smooth) {
    const last = cardsEl.lastElementChild;
    if (!last) {
      scrollToBottom(smooth);
      return;
    }
    last.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
      block: "start",
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

    const exportWrap = document.createElement("div");
    exportWrap.className = "push-export-wrap";

    const exportBtn = document.createElement("button");
    exportBtn.className = "push-export";
    exportBtn.type = "button";
    exportBtn.title = "Download";
    exportBtn.setAttribute("aria-label", "Download this push");
    exportBtn.setAttribute("aria-haspopup", "menu");
    exportBtn.setAttribute("aria-expanded", "false");
    exportBtn.innerHTML =
      '<svg class="push-export-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>' +
      '<svg class="push-export-spinner" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9" stroke-opacity="0.25"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>';

    const exportMenu = document.createElement("div");
    exportMenu.className = "push-export-menu";
    exportMenu.setAttribute("role", "menu");
    exportMenu.hidden = true;
    exportMenu.innerHTML =
      '<button type="button" role="menuitem" data-format="png">PNG</button>' +
      '<button type="button" role="menuitem" data-format="pdf">PDF</button>';

    const safeTitle = () =>
      (push.title || "push-" + push.index)
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "push";

    function closeExportMenu() {
      if (exportMenu.hidden) return;
      exportMenu.hidden = true;
      exportBtn.setAttribute("aria-expanded", "false");
    }

    function openExportMenu() {
      // Close any other open export menus first.
      cardsEl.querySelectorAll(".push-export-menu").forEach((m) => {
        if (m !== exportMenu) {
          m.hidden = true;
          const sib = m.previousElementSibling;
          if (sib) sib.setAttribute("aria-expanded", "false");
        }
      });
      exportMenu.hidden = false;
      exportBtn.setAttribute("aria-expanded", "true");
    }

    exportBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (exportMenu.hidden) {
        openExportMenu();
      } else {
        closeExportMenu();
      }
    });

    exportMenu.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-format]");
      if (!btn) return;
      e.stopPropagation();
      e.preventDefault();
      const format = btn.dataset.format === "pdf" ? "pdf" : "png";
      closeExportMenu();
      requestExport(format);
    });

    function requestExport(format) {
      exportBtn.dataset.loading = "true";

      clearExportWatchdog(push.id);
      exportWatchdogs.set(
        push.id,
        setTimeout(() => {
          exportWatchdogs.delete(push.id);
          clearExportSpinner(push.id);
          alert(
            "Export timed out after " +
              EXPORT_TIMEOUT_MS / 1000 +
              "s. Try again with the easel tab in the foreground.",
          );
        }, EXPORT_TIMEOUT_MS),
      );

      // Match the export bg to what the user sees inside this card:
      //   carded → card's elevated surface (--ds-bg-elev)
      //   flat   → page canvas (--ds-bg) since the iframe body is transparent
      const rootStyle = getComputedStyle(document.documentElement);
      const isFlat = currentDensity() === "flat";
      const bgVar = isFlat ? "--ds-bg" : "--ds-bg-elev";
      const bgColor = rootStyle.getPropertyValue(bgVar).trim() || "#ffffff";
      const filename = safeTitle() + (format === "pdf" ? ".pdf" : ".png");

      try {
        iframe.contentWindow &&
          iframe.contentWindow.postMessage(
            {
              type: "easel:image",
              pushId: push.id,
              filename,
              format,
              bgColor,
            },
            "*",
          );
      } catch (err) {
        clearExportWatchdog(push.id);
        delete exportBtn.dataset.loading;
        console.error("[easel] export failed", err);
      }
    }

    exportWrap.appendChild(exportBtn);
    exportWrap.appendChild(exportMenu);
    meta.appendChild(exportWrap);

    const del = document.createElement("button");
    del.className = "push-del";
    del.type = "button";
    del.title = "Delete this push";
    del.setAttribute("aria-label", "Delete this push");
    del.innerHTML =
      '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3.5 4h9M6 4V2.5h4V4M5 4l.5 9a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1L11 4M7 6.5v5M9 6.5v5"/></svg>';
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const label = push.title ? `"${push.title}"` : `push #${push.index}`;
      if (!window.confirm(`Delete ${label}? This can't be undone.`)) return;
      try {
        await fetch(
          "/api/sessions/" +
            encodeURIComponent(sessionId) +
            "/pushes/" +
            encodeURIComponent(push.id),
          { method: "DELETE" },
        );
        removeCardFromDom(push.id);
      } catch (err) {
        console.error("[easel] delete failed", err);
      }
    });
    meta.appendChild(del);

    card.appendChild(meta);

    const body = document.createElement("div");
    body.className = "push-body";

    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts allow-modals");
    iframe.setAttribute("scrolling", "no");
    iframe.setAttribute("title", push.title || "push " + push.index);
    iframe.dataset.pushId = push.id;
    iframe.srcdoc = wrapPushedHtml(push.html, currentTheme(), push.id, push.kind);
    iframe.addEventListener("load", () => {
      iframes.add(iframe);
      // Primary path: the iframe self-measures and posts back size via
      // `easel:size` — handled by the message listener at the
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
  function wrapPushedHtml(html, theme, pushId, kind) {
    // Authors sometimes wrap payloads in <![CDATA[ ... ]]> (treating html
    // like CDATA-in-XML). Strip the XML-ism before doing anything else —
    // otherwise the iframe renders the CDATA tags as visible text.
    let cleaned = (html || "").trim();
    if (cleaned.startsWith("<![CDATA[") && cleaned.endsWith("]]>")) {
      cleaned = cleaned.slice(9, -3).trim();
    }
    // Make nested iframes capturable on export (no-op when there are none).
    cleaned = injectNestedCaptureBridge(cleaned);
    const preset = currentPreset();
    const lower = cleaned.toLowerCase();
    if (lower.startsWith("<!doctype") || lower.startsWith("<html")) {
      return injectBridge(cleaned, theme, preset, pushId);
    }
    const isAppFidelity = kind === "mockup" || kind === "app";
    return buildDefaultWrapper(cleaned, theme, preset, pushId, isAppFidelity);
  }

  function selfMeasureScript(pushId) {
    return (
      "(function(){var ID=" +
      JSON.stringify(pushId) +
      ";function measure(){var b=document.body,h=document.documentElement;if(!b)return 0;return Math.max(b.getBoundingClientRect().bottom,b.scrollHeight,h.scrollHeight)}function content(){var b=document.body;if(!b)return 0;var m=Math.max(b.getBoundingClientRect().bottom,b.scrollHeight);var k=b.children;for(var i=0;i<k.length;i++){var bo=k[i].getBoundingClientRect().bottom;if(bo>m){m=bo}}return m}function vp(){return document.documentElement.clientHeight||0}function send(){try{parent.postMessage({type:'easel:size',pushId:ID,height:measure(),content:content(),vp:vp()},'*')}catch(e){}}send();window.addEventListener('load',send);window.addEventListener('resize',send);if(document.fonts&&document.fonts.ready){document.fonts.ready.then(send).catch(function(){})}if(window.ResizeObserver){var ro=new ResizeObserver(send);if(document.body)ro.observe(document.body);ro.observe(document.documentElement)}var mo=new MutationObserver(send);mo.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true});setTimeout(send,250);setTimeout(send,800);setTimeout(send,1600)})();"
    );
  }

  /**
   * Capture bridge injected into every NESTED iframe's srcdoc at wrap time.
   *
   * html-to-image clones the DOM into an SVG <foreignObject>; it cannot reach
   * inside an <iframe> document (and the outer push iframe is opaque-origin, so
   * it can't read nested contentDocuments either — verified empirically). So a
   * push built from nested iframes used to export with every panel blank.
   *
   * This listener lives INSIDE each nested iframe: on `easel:capture-nested` it
   * loads html-to-image (if absent), renders its own visible viewport region to
   * an SVG dataURL, and posts it back tagged with the request token. The outer
   * export bridge then composites these onto the final canvas. Inert until asked.
   */
  function nestedCaptureScript() {
    return `(function(){
if(window.__easelNestedCapture)return;
window.__easelNestedCapture=1;
function reply(m){try{parent.postMessage(m,'*')}catch(_){}}
function load(cb){
if(window.htmlToImage)return cb();
var s=document.createElement('script');
s.src='https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js';
s.onload=function(){cb()};
s.onerror=function(){cb()};
(document.head||document.documentElement).appendChild(s);
}
window.addEventListener('message',function(e){
var d=e&&e.data;
if(!d||d.type!=='easel:capture-nested')return;
var tok=d.token;
load(function(){
if(!window.htmlToImage){reply({type:'easel:nested-error',token:tok,message:'html-to-image not loaded'});return}
var de=document.documentElement;
var w=de.clientWidth||de.scrollWidth;
var h=de.clientHeight||de.scrollHeight;
window.htmlToImage.toSvg(de,{width:w,height:h,cacheBust:true})
.then(function(u){reply({type:'easel:nested-ready',token:tok,dataUrl:u})})
.catch(function(err){reply({type:'easel:nested-error',token:tok,message:String(err&&err.message||err)})});
});
});
})();`;
  }

  /**
   * Append the nested-capture bridge into each `srcdoc="…"` in the pushed HTML
   * so nested iframes can be composited on export. Encodes only `&` and `"`
   * (the attribute delimiter) so it survives regardless of how the author
   * encoded the rest of the srcdoc; the script is appended after the value's
   * existing markup (a <script> after </html> still runs). No-ops when there
   * are no nested iframes, and skips any srcdoc already carrying the bridge.
   */
  function injectNestedCaptureBridge(html) {
    if (!/srcdoc=/i.test(html)) return html;
    // Full entity-encode (matches the common fully-encoded srcdoc style and
    // decodes correctly under minimal-encoded ones too) and insert BEFORE the
    // closing body/html so the listener registers during parse — a trailing
    // <script> after the document end did not reliably execute in sandboxed
    // srcdoc iframes.
    const enc = ("<script>" + nestedCaptureScript() + "</scr" + "ipt>")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;");
    return html.replace(/srcdoc="([^"]*)"/gi, (m, sd) => {
      if (sd.indexOf("__easelNestedCapture") !== -1) return m;
      let at = sd.lastIndexOf("&lt;/body&gt;");
      if (at === -1) at = sd.lastIndexOf("&lt;/html&gt;");
      const next = at >= 0 ? sd.slice(0, at) + enc + sd.slice(at) : sd + enc;
      return 'srcdoc="' + next + '"';
    });
  }

  /**
   * In-iframe message listener that turns the rendered push into a PNG/JPEG
   * dataURL on `easel:image` and posts back `easel:image-ready` / `-error`.
   *
   * Deliberately stops at htmlToImage.toSvg() and does the canvas rasterisation
   * by hand. toPng/toJpeg/toCanvas resolve via the library's internal
   * createImage(), which waits on requestAnimationFrame — and Chrome freezes
   * rAF in hidden/background tabs, so the export hung forever whenever the
   * easel tab wasn't the visible one. toSvg has no rAF, and a plain Image's
   * onload fires even in hidden tabs, so this path works regardless of tab
   * visibility. Quality is unchanged: the SVG is vector, drawn onto a
   * PIXEL_RATIO-scaled canvas → still crisp at DPR 4.
   *
   * Shared verbatim by buildDefaultWrapper and injectBridge so the two render
   * paths can't drift.
   */
  function imageExportScript() {
    return (
      "(function(){" +
      // PIXEL_RATIO 4 for crisp output, but clamp so the biggest canvas side
      // stays under Chrome's safe ceiling — very tall pushes used to blank/throw.
      "function ratio(w,h){var MAX=32760;var big=Math.max(w,h);var pr=4;if(big*pr>MAX){pr=Math.max(1,Math.floor(MAX/big*100)/100)}return pr}" +
      "function fail(id,fmt,err){console.error('[easel] export failed',err);" +
      "parent.postMessage({type:'easel:image-error',pushId:id,format:fmt,message:(err&&err.message)?err.message:String(err)},'*')}" +
      // Ask each nested iframe to render itself; resolves to [{iframe,dataUrl}]
      // (dataUrl null on timeout / no bridge, so that panel stays as-is).
      "function captureNested(frames){return Promise.all(frames.map(function(f,i){return new Promise(function(resolve){" +
      "var tok='easelN'+i+'_'+(window.performance&&performance.now?Math.round(performance.now()):i);var done=false;" +
      "function finish(u){if(done)return;done=true;window.removeEventListener('message',onMsg);clearTimeout(t);resolve({iframe:f,dataUrl:u})}" +
      "function onMsg(e){var d=e&&e.data;if(!d||d.token!==tok)return;if(d.type==='easel:nested-ready'){finish(d.dataUrl)}else if(d.type==='easel:nested-error'){finish(null)}}" +
      "window.addEventListener('message',onMsg);var t=setTimeout(function(){finish(null)},9000);" +
      "try{f.contentWindow.postMessage({type:'easel:capture-nested',token:tok},'*')}catch(e){finish(null)}" +
      "})}))}" +
      // Base snapshot → fill bg → draw page → overlay each nested capture at its
      // on-screen rect (SVG stays crisp when scaled into the frame box).
      "function rasterize(svgUrl,w,h,pr,bg,shots){return new Promise(function(resolve,reject){" +
      "var img=new Image();" +
      "img.onload=function(){try{var c=document.createElement('canvas');" +
      "c.width=Math.max(1,Math.round(w*pr));c.height=Math.max(1,Math.round(h*pr));" +
      "var x=c.getContext('2d');x.fillStyle=bg;x.fillRect(0,0,c.width,c.height);" +
      "x.drawImage(img,0,0,c.width,c.height);" +
      "var pend=shots.filter(function(s){return s.dataUrl});if(!pend.length){return resolve(c)}" +
      "var left=pend.length;" +
      "pend.forEach(function(s){var r=s.iframe.getBoundingClientRect();var ni=new Image();" +
      "ni.onload=function(){try{x.drawImage(ni,(r.left+window.scrollX)*pr,(r.top+window.scrollY)*pr,r.width*pr,r.height*pr)}catch(_){}if(--left===0)resolve(c)};" +
      "ni.onerror=function(){if(--left===0)resolve(c)};ni.src=s.dataUrl})" +
      "}catch(e){reject(e)}};" +
      "img.onerror=function(){reject(new Error('SVG snapshot failed to load'))};img.src=svgUrl})}" +
      "function run(d){var id=d.pushId;var fn=d.filename||'push.png';var fmt=d.format==='pdf'?'pdf':'png';" +
      "var bg=d.bgColor||getComputedStyle(document.documentElement).getPropertyValue('--ds-bg-elev').trim()||'#ffffff';" +
      "function render(){if(!window.htmlToImage){fail(id,fmt,new Error('html-to-image not loaded'));return}" +
      "var frames=Array.prototype.slice.call(document.querySelectorAll('iframe'));" +
      // Force lazy nested iframes to load before capture, else off-screen panels
      // export blank. Settle briefly so their srcdoc bridge is live, then capture.
      "frames.forEach(function(f){try{f.loading='eager'}catch(_){}});" +
      "var w=document.documentElement.clientWidth;" +
      "var h=Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0);" +
      "var pr=ratio(w,h);" +
      "new Promise(function(res){setTimeout(res,frames.length?700:0)}).then(function(){return captureNested(frames)}).then(function(shots){" +
      "return window.htmlToImage.toSvg(document.documentElement,{width:w,height:h,cacheBust:true})" +
      ".then(function(u){return rasterize(u,w,h,pr,bg,shots)})})" +
      ".then(function(c){var u=fmt==='pdf'?c.toDataURL('image/jpeg',1.0):c.toDataURL('image/png');" +
      "parent.postMessage({type:'easel:image-ready',pushId:id,dataUrl:u,filename:fn,format:fmt},'*')})" +
      ".catch(function(e){fail(id,fmt,e)})}" +
      "if(document.fonts&&document.fonts.ready){document.fonts.ready.then(render).catch(render)}else{render()}}" +
      "window.addEventListener('message',function(e){if(e&&e.data&&e.data.type==='easel:image')run(e.data)})})();"
    );
  }

  /**
   * In-iframe contrast guard. Scans rendered text-bearing elements and flags
   * any whose computed text colour fails a WCAG contrast ratio of 3:1 against
   * its effective background (climbs ancestors past transparent fills).
   *
   * Catches BOTH directions of the recurring locked-mode bug from Rule 30:
   *   - dark text on a hand-rolled dark code container (the #1 case — author
   *     skipped the .code/.terminal primitive and base text inherits a
   *     light-mode ink against #0f172a)
   *   - light text on a hand-rolled bright container
   *
   * Runs once after fonts ready + a 400ms settle. Bounded at 2000 text-bearing
   * elements scanned to stay cheap on large pushes. Posts a single
   * easel:contrast-warn to the parent with up to 5 offender samples; parent
   * stamps a chip on the card so the author actually notices.
   *
   * Shared verbatim by buildDefaultWrapper (both branches) and injectBridge.
   */
  function contrastGuardScript(pushId) {
    return (
      "(function(){var ID=" +
      JSON.stringify(pushId) +
      ";function parseColor(c){if(!c)return null;var m=c.match(/rgba?\\(([^)]+)\\)/);if(!m)return null;var p=m[1].split(',').map(function(s){return parseFloat(s.trim())});if(p.length<3||p.some(isNaN))return null;return{r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}}" +
      "function lum(c){function ch(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)}return 0.2126*ch(c.r)+0.7152*ch(c.g)+0.0722*ch(c.b)}" +
      "function contrast(a,b){var la=lum(a),lb=lum(b);var hi=Math.max(la,lb),lo=Math.min(la,lb);return(hi+0.05)/(lo+0.05)}" +
      "function effBg(el){var n=el;while(n&&n.nodeType===1){var cs=getComputedStyle(n);var bg=parseColor(cs.backgroundColor);if(bg&&bg.a>0.05)return bg;n=n.parentElement}return{r:255,g:255,b:255,a:1}}" +
      "function hasDirectText(el){for(var i=0;i<el.childNodes.length;i++){var n=el.childNodes[i];if(n.nodeType===3&&n.nodeValue.trim().length>0)return true}return false}" +
      "function fmt(c){return'rgb('+Math.round(c.r)+','+Math.round(c.g)+','+Math.round(c.b)+')'}" +
      "function scan(){if(!document.body)return;var offenders=[];var seen=0;var all=document.body.querySelectorAll('*');for(var i=0;i<all.length&&seen<2000;i++){var el=all[i];if(!hasDirectText(el))continue;seen++;var cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none')continue;var fg=parseColor(cs.color);if(!fg||fg.a<0.05)continue;var bg=effBg(el);var ratio=contrast(fg,bg);if(ratio<3){offenders.push({tag:el.tagName.toLowerCase(),cls:(el.className&&el.className.toString?el.className.toString():'').slice(0,80),text:(el.textContent||'').trim().slice(0,60),ratio:Math.round(ratio*100)/100,fg:fmt(fg),bg:fmt(bg)})}}" +
      "if(offenders.length){console.warn('[easel] low-contrast text detected ('+offenders.length+' element(s), threshold 3:1). The #1 cause is a hand-rolled dark code container — use <div class=\"code\"> or <div class=\"terminal\"> instead; they lock background AND ink and re-scope color:inherit to children. Offenders:',offenders.slice(0,10));try{parent.postMessage({type:'easel:contrast-warn',pushId:ID,count:offenders.length,samples:offenders.slice(0,5)},'*')}catch(e){}}}" +
      "function run(){setTimeout(scan,400)}" +
      "if(document.fonts&&document.fonts.ready){document.fonts.ready.then(run).catch(run)}else{run()}" +
      "})();"
    );
  }

  function buildDefaultWrapper(body, theme, preset, pushId, appFidelity) {
    const density = currentDensity();
    // app-fidelity mode: skip presentation defaults (presets, semantic chips,
    // body font/bg/color, prose constraints). Agent paints everything. Only
    // keeps box-sizing reset + the html-to-image bridge script.
    if (appFidelity) {
      return `<!DOCTYPE html>
<html data-theme="${theme}" data-preset="${preset}" data-density="${density}" data-app-fidelity="true">
<head>
<meta charset="utf-8" />
<base target="_blank" />
<script src="https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js"></script>
<style>
*, *::before, *::after { box-sizing: border-box; }
/* Sane sans-serif floor so an unstyled mockup doesn't fall back to Times serif.
   No CDN font here (that's the agent's call in fidelity mode) — the pushed HTML
   can override font-family inline / in its own <style>, which wins the cascade. */
html, body { margin: 0; padding: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
${STRUCTURAL_PRIMITIVES_CSS}
</style>
</head>
<body>
${body}
<script>${imageExportScript()}</script>
<script>${contrastGuardScript(pushId)}</script>
<script>${selfMeasureScript(pushId)}</script>
</body>
</html>`;
    }
    return `<!DOCTYPE html>
<html data-theme="${theme}" data-preset="${preset}" data-density="${density}">
<head>
<meta charset="utf-8" />
<base target="_blank" />
<link rel="preconnect" href="https://rsms.me/" />
<link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
<script src="https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js"></script>
<style>
*, *::before, *::after { box-sizing: border-box; }
${PRESET_TOKENS_CSS}
${SEMANTIC_CHIPS_CSS}
${STRUCTURAL_PRIMITIVES_CSS}
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
  padding: 40px clamp(28px, 4vw, 64px) 48px;
  max-width: 1400px;
  margin: 0 auto;
}
@media (min-width: 2000px) {
  body { max-width: 1600px; }
}
/* Constrain prose to a comfortable reading length and LEFT-ALIGN it to the
   content column's left edge. Visual blocks (cards, grids, mockups, .full-bleed)
   fill the wider content column from the SAME left edge — so prose and mockups
   share one left margin down the card. Match prose both as direct body children
   AND one level deep through a .wrap container (the skill recommends wrapping
   content in div.wrap; without the .wrap branch the cap silently misses). */
body > p, body > .deck, body > .lede, body > ul, body > ol, body > blockquote,
body > h1, body > h2, body > h3, body > h4,
body > .wrap > p, body > .wrap > .deck, body > .wrap > .lede,
body > .wrap > ul, body > .wrap > ol, body > .wrap > blockquote,
body > .wrap > h1, body > .wrap > h2, body > .wrap > h3, body > .wrap > h4 {
  /* ~56ch of "0"-width lands ~66 actual characters in proportional Inter
     (avg glyph is narrower than "0"), i.e. Bringhurst's reading-measure sweet
     spot — not 56 literal characters. */
  max-width: 56ch;
}
body > *:first-child { margin-top: 0 !important; }
body > *:last-child { margin-bottom: 0 !important; }
/* Wide-content escape for embedded mockups mid-presentation. Wrap a section in
   <div class="full-bleed"> and it fills the content column's full width —
   wider than the 880px prose cap — while sharing the prose's LEFT edge. It does
   NOT break out to the card's physical edge: the body's horizontal padding
   stays as a gutter, so neither the mockup nor the surrounding text ever touches
   the card border. (The name is historical — it's "full content width", not
   "bleed to the card edge".) Capped at 100% of the content column, which the
   body's max-width already limits to desktop-realistic proportions.
   Vertical margin gives an embedded mockup breathing room from the prose above
   and below it (without it, the next paragraph hugs the frame). */
.full-bleed {
  width: 100%;
  max-width: 100% !important;
  margin: 32px 0;
}
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
:root[data-density="flat"] html,
:root[data-density="flat"] body { background: transparent; }

@media print {
  /* Always print on white paper with dark text — ignore the host theme. */
  :root, html, body {
    background: #ffffff !important;
    color: #111 !important;
    color-scheme: light !important;
  }
  body { padding: 24px !important; max-width: none !important; }
  body > p, body > .deck, body > .lede, body > ul, body > ol, body > blockquote,
  body > h1, body > h2, body > h3, body > h4 { max-width: none !important; }
  /* .code/.terminal/.window.dark print overrides live in STRUCTURAL_PRIMITIVES_CSS. */
  .card, .panel { background: #fff !important; border: 1px solid #ddd !important; box-shadow: none !important; }
  a { color: #111 !important; text-decoration: underline; border-bottom: 0 !important; }
}
</style>
</head>
<body>
${body}
<script>
(function(){
  function apply(cfg){
    if (!cfg) return;
    if (cfg.theme === "light" || cfg.theme === "dark") {
      document.documentElement.setAttribute("data-theme", cfg.theme);
      window.__claudeDisplayTheme = cfg.theme;
    }
    if (cfg.preset === "paper" || cfg.preset === "aurora" || cfg.preset === "slate") {
      document.documentElement.setAttribute("data-preset", cfg.preset);
      window.__claudeDisplayPreset = cfg.preset;
    }
    if (cfg.density === "carded" || cfg.density === "flat") {
      document.documentElement.setAttribute("data-density", cfg.density);
      window.__claudeDisplayDensity = cfg.density;
    }
  }
  window.addEventListener("message", function(e){
    if (!e || !e.data) return;
    if (e.data.type === "easel:config") apply(e.data);
    if (e.data.type === "easel:theme") apply({ theme: e.data.theme });
    if (e.data.type === "easel:print") {
      try { window.print(); } catch(_) {}
    }
  });
})();
</script>
<script>${imageExportScript()}</script>
<script>${contrastGuardScript(pushId)}</script>
<script>${selfMeasureScript(pushId)}</script>
</body>
</html>`;
  }

  function injectBridge(html, theme, preset, pushId) {
    const density = currentDensity();
    const configScript =
      "<script src='https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js'></script><script>(function(){function a(c){if(!c)return;if(c.theme==='light'||c.theme==='dark'){document.documentElement.setAttribute('data-theme',c.theme);window.__claudeDisplayTheme=c.theme}if(c.preset==='paper'||c.preset==='aurora'||c.preset==='slate'){document.documentElement.setAttribute('data-preset',c.preset);window.__claudeDisplayPreset=c.preset}if(c.density==='carded'||c.density==='flat'){document.documentElement.setAttribute('data-density',c.density);window.__claudeDisplayDensity=c.density}}a(" +
      JSON.stringify({ theme, preset, density }) +
      ");window.addEventListener('message',function(e){if(!e||!e.data)return;if(e.data.type==='easel:config')a(e.data);if(e.data.type==='easel:theme')a({theme:e.data.theme});if(e.data.type==='easel:print'){try{window.print()}catch(_){}}})})();</script>";
    const imageScript = "<script>" + imageExportScript() + "</script>";
    const guardScript = "<script>" + contrastGuardScript(pushId) + "</script>";
    const measureScript = "<script>" + selfMeasureScript(pushId) + "</script>";
    const combined = configScript + imageScript + guardScript + measureScript;
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
    // requestAnimationFrame so layout settles before pill recomputes.
    requestAnimationFrame(updatePill);
    return { wasNearBottom, card };
  }

  /**
   * Stamp a "contrast" warning chip on a push card's meta row after the
   * iframe reports low-contrast text. Idempotent: only inserts once per push.
   * Tooltip lists the first few offenders so the author can locate them
   * without opening DevTools. The console.warn fires inside the iframe too,
   * so DevTools still shows the full sample list and computed rgb pairs.
   */
  function stampContrastWarning(pushId, count, samples) {
    if (!pushId) return;
    const card = document.getElementById("push-" + pushId);
    if (!card) return;
    const meta = card.querySelector(".push-meta");
    if (!meta || meta.querySelector(".push-warn")) return;
    const chip = document.createElement("span");
    chip.className = "push-warn";
    chip.textContent = "⚠ contrast";
    const head = `${count} low-contrast element(s) detected (WCAG ratio < 3:1).\nMost common cause: a hand-rolled dark code container — use class="code" or class="terminal".\n`;
    const list = (samples || [])
      .map((s) => `• <${s.tag}${s.cls ? "." + s.cls.split(/\s+/).join(".") : ""}> "${s.text}" (${s.ratio}:1, ${s.fg} on ${s.bg})`)
      .join("\n");
    chip.title = head + list;
    const time = meta.querySelector(".push-time");
    if (time) {
      meta.insertBefore(chip, time);
    } else {
      meta.appendChild(chip);
    }
  }

  function removeCardFromDom(pushId) {
    const card = document.getElementById("push-" + pushId);
    if (card) card.remove();
    const obs = cardObservers.get(pushId);
    if (obs) {
      obs.disconnect();
      cardObservers.delete(pushId);
    }
    iframeSizeState.delete(pushId);
    unreadIds.delete(pushId);
    totalPushes = Math.max(0, totalPushes - 1);
    setPushCount(totalPushes);
    updatePill();
  }

  function bumpUnread(pushId) {
    if (pushId && !unreadIds.has(pushId)) {
      unreadIds.add(pushId);
      bumpAt = Date.now();
      observeUnreadCard(pushId);
    }
    updatePill();
  }

  /* One observer per unread card. The card counts as 'read' when its top
     edge crosses into the upper half of the viewport — works regardless
     of card height (the earlier 0.4 ratio threshold broke for cards
     taller than the viewport, where 40% intersection is unreachable).

     rootMargin "0px 0px -50% 0px" shrinks the bottom 50% of viewport from
     the observer's root, so the card only intersects when ANY part of it
     reaches the top half.

     Bursts of layout-shift from iframe self-measure are still ignored
     for 900ms after the most recent bump so resize-anchoring scrolls
     don't spuriously mark cards read. */
  function observeUnreadCard(pushId) {
    const card = document.getElementById("push-" + pushId);
    if (!card) return;
    if (cardObservers.has(pushId)) {
      cardObservers.get(pushId).disconnect();
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (Date.now() - bumpAt < 900) return;
        if (entries.some((e) => e.isIntersecting)) {
          markCardRead(pushId);
        }
      },
      { threshold: 0, rootMargin: "0px 0px -50% 0px" },
    );
    obs.observe(card);
    cardObservers.set(pushId, obs);
  }

  function markCardRead(pushId) {
    if (!unreadIds.has(pushId)) return;
    unreadIds.delete(pushId);
    const obs = cardObservers.get(pushId);
    if (obs) {
      obs.disconnect();
      cardObservers.delete(pushId);
    }
    updatePill();
  }

  /* True when the LATEST card's header is still below the viewport — i.e.
     you haven't reached it yet. Once the header crosses in (or past), you're
     inside/past the latest card and the 'Scroll to last' pill should hide. */
  function lastCardHeaderBelowViewport() {
    const last = cardsEl.lastElementChild;
    if (!last) return false;
    const rect = last.getBoundingClientRect();
    return rect.top > window.innerHeight - 100;
  }

  /* Pill state machine:
     - any unread                    → "N new push(es)", click → oldest unread
     - none, last header still below → "Scroll to last", click → last card
     - none, last header reached     → hidden */
  function updatePill() {
    const n = unreadIds.size;
    if (n > 0) {
      newPillEl.hidden = false;
      newPillEl.dataset.mode = "unread";
      newPillText.textContent =
        n + " new push" + (n === 1 ? "" : "es");
    } else if (lastCardHeaderBelowViewport()) {
      newPillEl.hidden = false;
      newPillEl.dataset.mode = "scroll";
      newPillText.textContent = "Scroll to last";
    } else {
      newPillEl.hidden = true;
      delete newPillEl.dataset.mode;
    }
  }

  function scrollToFirstUnread(smooth) {
    const first = [...unreadIds][0]; // Set preserves insertion order
    if (!first) {
      scrollToLatestCard(smooth);
      return;
    }
    const card = document.getElementById("push-" + first);
    if (!card) {
      scrollToLatestCard(smooth);
      return;
    }
    card.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
      block: "start",
    });
  }

  newPillEl.addEventListener("click", () => {
    if (newPillEl.dataset.mode === "unread") {
      scrollToFirstUnread(true);
    } else {
      scrollToLatestCard(true);
    }
  });

  window.addEventListener("scroll", updatePill, { passive: true });
  window.addEventListener("resize", updatePill);

  // Clearing is driven by IntersectionObserver, not scroll events —
  // resize-anchoring scrolls used to spuriously reset the counter.

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
      requestAnimationFrame(() => {
        scrollToBottom(false);
        updatePill();
      });
    } catch (err) {
      console.error("[easel] hydrate failed", err);
    }
  }

  function connectSse() {
    const es = new EventSource("/s/" + sessionId + "/events");
    es.addEventListener("hello", (e) => {
      updateLive(true);
      try {
        const data = JSON.parse(e.data);
        if (data && data.config) {
          applyConfig(data.config, { skipServer: true });
        }
      } catch {}
    });
    es.addEventListener("config", (e) => {
      try {
        const cfg = JSON.parse(e.data);
        applyConfig(cfg, { skipServer: true });
      } catch {}
    });
    es.addEventListener("remove", (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data && data.pushId) removeCardFromDom(data.pushId);
      } catch {}
    });
    es.addEventListener("push", (e) => {
      try {
        const push = JSON.parse(e.data);
        const { wasNearBottom } = appendPush(push, { fresh: true });
        if (wasNearBottom) {
          requestAnimationFrame(() => scrollToLatestCard(true));
        } else {
          bumpUnread(push.id);
        }
      } catch (err) {
        console.error("[easel] bad push payload", err);
      }
    });
    es.onerror = () => {
      updateLive(false);
      es.close();
      setTimeout(connectSse, 1500);
    };
  }

  /* ============================================================
     Last-visited tracking + session switcher dropdown
     ============================================================ */

  function markVisited() {
    try {
      const map = JSON.parse(localStorage.getItem(LAST_VISITED_KEY) || "{}");
      map[sessionId] = Date.now();
      localStorage.setItem(LAST_VISITED_KEY, JSON.stringify(map));
    } catch (e) {
      /* ignore */
    }
  }

  function basenameOf(p) {
    if (!p) return null;
    const t = String(p).replace(/\/+$/, "");
    const i = t.lastIndexOf("/");
    return i >= 0 ? t.slice(i + 1) : t;
  }

  function relTime(ts) {
    if (!ts) return "—";
    const diff = Date.now() - ts;
    if (diff < 30_000) return "just now";
    const s = Math.floor(diff / 1000);
    if (s < 60) return s + "s";
    const m = Math.floor(s / 60);
    if (m < 60) return m + "m";
    const h = Math.floor(m / 60);
    if (h < 24) return h + "h";
    return Math.floor(h / 24) + "d";
  }

  async function loadSessionsForSwitcher() {
    try {
      const r = await fetch("/api/sessions");
      const data = await r.json();
      renderSwitcher(data.sessions || []);
    } catch (e) {
      renderSwitcher([]);
    }
  }

  let switcherSessions = [];
  let switcherQuery = "";

  function renderSwitcher(sessions) {
    switcherSessions = sessions || [];
    switcherMenuEl.innerHTML = "";

    // Search box
    const searchBar = document.createElement("div");
    searchBar.className = "switcher-search";
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Filter by project or id…";
    search.value = switcherQuery;
    search.addEventListener("input", (e) => {
      switcherQuery = e.target.value;
      renderSwitcherList();
    });
    searchBar.appendChild(search);
    switcherMenuEl.appendChild(searchBar);

    // Scrollable list
    const list = document.createElement("div");
    list.className = "switcher-list";
    list.id = "switcher-list";
    switcherMenuEl.appendChild(list);

    // Footer
    const footerbar = document.createElement("div");
    footerbar.className = "switcher-footerbar";
    const allLink = document.createElement("a");
    allLink.href = "/";
    allLink.className = "switcher-footer";
    allLink.textContent = "View all sessions →";
    footerbar.appendChild(allLink);
    switcherMenuEl.appendChild(footerbar);

    renderSwitcherList();
    // Focus the search input when the menu opens.
    setTimeout(() => search.focus(), 30);
  }

  function renderSwitcherList() {
    const list = switcherMenuEl.querySelector("#switcher-list");
    if (!list) return;
    list.innerHTML = "";

    let lastVisited = {};
    try {
      lastVisited = JSON.parse(localStorage.getItem(LAST_VISITED_KEY) || "{}");
    } catch {}

    const q = switcherQuery.trim().toLowerCase();
    const filtered = switcherSessions.filter((s) => {
      if (!q) return true;
      const name = (basenameOf(s.cwd) || "").toLowerCase();
      return name.includes(q) || s.id.toLowerCase().includes(q);
    });

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "switcher-footer";
      empty.textContent = q ? "No sessions match." : "No sessions registered.";
      list.appendChild(empty);
      return;
    }

    for (const s of filtered) {
      const item = document.createElement("a");
      item.className = "switcher-item";
      if (s.id === sessionId) item.classList.add("current");
      item.href = "/s/" + encodeURIComponent(s.id);

      const project = document.createElement("span");
      project.className = "project";
      project.textContent = s.label || basenameOf(s.cwd) || s.id.slice(0, 8);
      project.title = [s.label, s.cwd, s.id].filter(Boolean).join(" · ");
      item.appendChild(project);

      const count = document.createElement("span");
      count.className = "count";
      count.textContent = s.pushCount + " · " + relTime(s.lastActivity);
      item.appendChild(count);

      if (
        s.id !== sessionId &&
        s.pushCount > 0 &&
        s.lastActivity > (lastVisited[s.id] || 0)
      ) {
        const dot = document.createElement("span");
        dot.className = "unread-dot";
        item.appendChild(dot);
      }

      // Keep the brand label in sync with the current session.
      if (s.id === sessionId && projectLabelEl && !projectLabelEl.dataset.editing) {
        projectLabelEl.textContent =
          s.label || basenameOf(s.cwd) || "easel";
        projectLabelEl.dataset.cwd = s.cwd || "";
        projectLabelEl.dataset.hasLabel = s.label ? "true" : "false";
      }

      // Delete button (skip on the current session — can't delete the one you're viewing)
      if (s.id !== sessionId) {
        const del = document.createElement("button");
        del.className = "switcher-del";
        del.type = "button";
        del.title = "Delete this session";
        del.setAttribute("aria-label", "Delete session");
        del.innerHTML =
          '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3.5 4h9M6 4V2.5h4V4M5 4l.5 9a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1L11 4"/></svg>';
        del.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const name = s.label || basenameOf(s.cwd) || s.id.slice(0, 8);
          if (!window.confirm(`Delete session "${name}" and all its pushes?`)) return;
          await fetch("/api/sessions/" + encodeURIComponent(s.id), {
            method: "DELETE",
          });
          loadSessionsForSwitcher();
        });
        item.appendChild(del);
      }

      list.appendChild(item);
    }
  }

  switcherBtnEl.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = switcherMenuEl.hidden;
    if (open) {
      switcherMenuEl.hidden = false;
      switcherBtnEl.setAttribute("aria-expanded", "true");
      loadSessionsForSwitcher();
    } else {
      switcherMenuEl.hidden = true;
      switcherBtnEl.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("click", (e) => {
    if (!switcherMenuEl.hidden && !switcherMenuEl.contains(e.target) && e.target !== switcherBtnEl) {
      closeSwitcher();
    }
  });

  // Clicks inside sandboxed iframes don't bubble — but they steal window
  // focus. When that happens, close the menu.
  window.addEventListener("blur", () => {
    if (!switcherMenuEl.hidden) {
      // Defer one tick so the focus change settles and the activeElement check
      // is reliable across browsers.
      setTimeout(() => {
        if (document.activeElement && document.activeElement.tagName === "IFRAME") {
          closeSwitcher();
        }
      }, 0);
    }
  });

  function closeSwitcher() {
    switcherMenuEl.hidden = true;
    switcherBtnEl.setAttribute("aria-expanded", "false");
  }

  /* === Click-to-edit session label in the topbar === */
  if (projectLabelEl) {
    projectLabelEl.style.cursor = "text";
    projectLabelEl.title = "Click to rename this session";
    projectLabelEl.addEventListener("click", startEditingLabel);
  }

  function startEditingLabel() {
    if (projectLabelEl.dataset.editing) return;
    projectLabelEl.dataset.editing = "true";
    const current =
      projectLabelEl.dataset.hasLabel === "true"
        ? projectLabelEl.textContent
        : "";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "project-label-input";
    input.value = current;
    input.placeholder = basenameOf(projectLabelEl.dataset.cwd) || "Name this session…";
    input.maxLength = 80;

    projectLabelEl.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    const finish = async (save) => {
      if (done) return;
      done = true;
      input.removeEventListener("blur", onBlur);
      input.removeEventListener("keydown", onKeydown);
      const newLabel = save ? input.value.trim() : current;
      input.replaceWith(projectLabelEl);
      delete projectLabelEl.dataset.editing;
      projectLabelEl.textContent =
        newLabel || basenameOf(projectLabelEl.dataset.cwd) || "easel";
      projectLabelEl.dataset.hasLabel = newLabel ? "true" : "false";
      if (save) {
        try {
          await fetch("/api/register", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId, label: newLabel }),
          });
        } catch {}
        loadSessionsForSwitcher();
      }
    };
    const onBlur = () => finish(true);
    const onKeydown = (e) => {
      if (e.key === "Enter") finish(true);
      if (e.key === "Escape") finish(false);
    };
    input.addEventListener("blur", onBlur);
    input.addEventListener("keydown", onKeydown);
  }

  markVisited();
  window.addEventListener("focus", markVisited);
  setInterval(markVisited, 15_000);
  loadSessionsForSwitcher();
  setInterval(loadSessionsForSwitcher, 8_000);

  hydrate().then(connectSse);
})();
