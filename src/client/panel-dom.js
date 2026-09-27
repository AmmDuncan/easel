// DOM helpers for the walks panel. Strings passed as children become text
// nodes; walk HTML only ever renders inside htmlFrame's script-less sandbox.

import { openExternal } from "./panel-api.js";

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) {
      continue;
    }
    if (k === "class") {
      el.className = v;
    } else if (k === "on") {
      for (const [ev, fn] of Object.entries(v)) {
        el.addEventListener(ev, fn);
      }
    } else if (k === "html") {
      el.innerHTML = v; // trusted, static markup only (icons)
    } else {
      el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) {
      continue;
    }
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5M5.5 8.8V20h13V8.8"/>',
  map: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  saved: '<circle cx="12" cy="12" r="9"/><path d="M7.5 12.5l3 3 6-6.5"/>',
  more: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  list: '<path d="M3.5 6.5l1.5 1.5 3-3M3.5 13l1.5 1.5 3-3M11 6.5h9.5M11 13h9.5M11 19h9.5"/>',
  warn: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.1"/>',
};

export function icon(name) {
  return h("span", {
    "aria-hidden": "true",
    style: "display:inline-flex",
    html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`,
  });
}

export function checkIcon() {
  return h("span", {
    class: "pn-check",
    html: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.2l2.6 2.6L10 3.4"/></svg>',
  });
}

export function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function kbd(label) {
  return h("span", { class: "pn-kbd", "aria-hidden": "true" }, label);
}

const TOKENS = [
  "--ds-bg", "--ds-bg-elev", "--ds-surface", "--ds-surface-soft", "--ds-ink", "--ds-ink-soft",
  "--ds-muted", "--ds-line", "--ds-line-soft", "--ds-accent", "--ds-accent-soft", "--ds-accent-ink",
  "--ds-success", "--ds-danger", "--ds-shadow-sm", "--ds-shadow-md", "--ds-code-bg", "--ds-code-ink",
];

let kitCss = "";

export async function loadKit() {
  const r = await fetch("/static/walk-kit.css");
  kitCss = r.ok ? await r.text() : "";
}

function tokenCss() {
  const cs = getComputedStyle(document.documentElement);
  return `:root{${TOKENS.map((t) => `${t}:${cs.getPropertyValue(t)}`).join(";")}}`;
}

const CSP =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline' https://rsms.me; font-src https://rsms.me";

/**
 * Render untrusted walk HTML: sandboxed without allow-scripts (nothing in it
 * can run or reach the panel's token), same-origin only so we can size it.
 */
const frameHeights = new Map();

export function htmlFrame(html, title, bodyClass = "") {
  const frame = h("iframe", { class: "pn-frame", sandbox: "allow-same-origin", title });
  const key = `${bodyClass}|${html}`;
  if (frameHeights.has(key)) {
    frame.style.height = `${frameHeights.get(key)}px`;
  }
  let loaded = false;
  frame.srcdoc =
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">` +
    `<link rel="stylesheet" href="https://rsms.me/inter/inter.css">` +
    `<style>${tokenCss()}${kitCss}</style></head><body class="${bodyClass}">${html}</body></html>`;
  const fit = () => {
    const doc = frame.contentDocument;
    if (!loaded || !doc?.documentElement) {
      return;
    }
    frame.style.height = "0px";
    const height = doc.documentElement.scrollHeight;
    frame.style.height = `${height}px`;
    if (frameHeights.size > 200) {
      frameHeights.clear();
    }
    frameHeights.set(key, height);
  };
  let lastWidth = 0;
  new ResizeObserver(([entry]) => {
    const width = Math.round(entry.contentRect.width);
    if (width !== lastWidth) {
      lastWidth = width;
      fit();
    }
  }).observe(frame);
  frame.addEventListener("load", () => {
    const doc = frame.contentDocument;
    if (!doc) {
      return;
    }
    loaded = true;
    fit();
    new ResizeObserver(fit).observe(doc.body);
    doc.fonts?.ready.then(fit);
    doc.addEventListener("click", (e) => {
      const link = e.target.closest?.("a, area");
      if (!link) {
        return;
      }
      e.preventDefault();
      const raw = link.getAttribute("href") ?? link.getAttributeNS("http://www.w3.org/1999/xlink", "href") ?? "";
      if (/^https?:/i.test(raw)) {
        openExternal(raw);
      }
    }, true);
  });
  return frame;
}

/** Sources render from structured data as text; only http(s) refs become links. */
export function sourceList(sources) {
  if (!sources?.length) {
    return null;
  }
  return h("div", { class: "pn-sources" },
    h("span", {}, sources.length === 1 ? "Source: " : "Sources: "),
    ...sources.map((s, i) => {
      const ref = /^https?:/i.test(s.ref)
        ? h("a", { href: s.ref, on: { click: (e) => { e.preventDefault(); openExternal(s.ref); } } }, s.label)
        : h("span", { title: s.ref }, s.label, " · ", h("code", {}, s.ref.split("/").pop().split("#")[0]));
      return h("span", {}, i > 0 ? " · " : "", ref);
    }),
  );
}

export function timeAgo(ms) {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) {
    return "just now";
  }
  if (mins < 60) {
    return `${mins} min ago`;
  }
  const hours = Math.round(mins / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

let closeOpenMenu = null;

/**
 * Popover menu under `anchor`. items: { label, onSelect, disabled?, danger? }.
 * Arrow keys move, Esc or an outside click closes and returns focus.
 */
export function openMenu(anchor, items, label) {
  closeOpenMenu?.();
  const buttons = items.map((it) => h("button", {
    class: `pn-menu-item${it.danger ? " danger" : ""}`, role: "menuitem", disabled: it.disabled,
    on: { click: () => { close(); it.onSelect(); } },
  }, it.label));
  const menu = h("div", { class: "pn pn-menu", role: "menu", "aria-label": label }, buttons);
  const r = anchor.getBoundingClientRect();
  menu.style.top = `${r.bottom + 6}px`;
  menu.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  document.body.append(menu);
  const enabled = () => buttons.filter((b) => !b.disabled);
  enabled()[0]?.focus();
  const onKey = (e) => {
    const list = enabled();
    const i = list.indexOf(document.activeElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    }
  };
  const onDown = (e) => {
    if (!menu.contains(e.target) && e.target !== anchor) {
      close();
    }
  };
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("pointerdown", onDown, true);
  function close() {
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("pointerdown", onDown, true);
    menu.remove();
    closeOpenMenu = null;
    anchor.focus();
  }
  closeOpenMenu = close;
  return close;
}
