// Walks panel router: /panel, /panel/p/:slug, /panel/w/:id.

import { getJson, hidePanel, onEvents } from "./panel-api.js";
import { h, icon, kbd, loadKit } from "./panel-dom.js";
import { homeView, projectView } from "./panel-home.js";
import { walkView } from "./panel-walk.js";

document.documentElement.classList.toggle("in-shell", Boolean(window.webkit?.messageHandlers?.easel));
const topEl = document.querySelector(".pn-top");
const mainEl = document.querySelector(".pn-main");
const liveEl = document.querySelector(".pn-live");
let barEl = null;
let current = null;
let routeSeq = 0;
const barObserver = new ResizeObserver(([entry]) => {
  document.documentElement.style.setProperty("--pn-bar-h", `${Math.ceil(entry.target.offsetHeight)}px`);
});
let toastTimer = null;

const app = {
  frame({ top, main, bar }) {
    topEl.replaceChildren(...top);
    mainEl.replaceChildren(main);
    mainEl.classList.toggle("no-bar", !bar);
    barEl?.remove();
    barEl = null;
    barObserver.disconnect();
    if (bar) {
      barEl = h("footer", { class: "pn-bar" }, bar);
      document.querySelector(".pn-app").append(barEl);
      barObserver.observe(barEl);
    } else {
      document.documentElement.style.setProperty("--pn-bar-h", "0px");
    }
  },
  announce(text) {
    liveEl.textContent = text;
  },
  toast(text, action, ms = 6000) {
    document.querySelector(".pn-toast")?.remove();
    clearTimeout(toastTimer);
    const el = h("div", { class: "pn-toast", role: "status" }, h("span", {}, text),
      action ? h("button", { on: { click: () => { el.remove(); action.onClick(); } } }, action.label) : null);
    document.body.append(el);
    toastTimer = setTimeout(() => el.remove(), ms);
  },
  navigate(path) {
    history.pushState(null, "", path);
    route();
  },
  replaceUrl(path) {
    history.replaceState(null, "", path);
  },
  refresh() {
    route();
  },
};

function errorView(err) {
  const missing = /^404/.test(err.message);
  const copy = missing
    ? { title: "Not found", body: "This walk or project no longer exists. It may have been deleted." }
    : { title: "Couldn't load this", body: "Easel sent an error or no answer. If it keeps failing, run `easel restart` in a terminal." };
  app.frame({
    top: [h("div", { class: "pn-top-row" },
      h("button", { class: "pn-icon-btn", "aria-label": "All walks (H)", on: { click: () => app.navigate("/panel") } }, icon("home")))],
    main: h("div", { class: "pn-error" },
      h("div", { role: "alert" }, h("h1", { tabindex: "-1" }, copy.title), h("p", {}, copy.body)),
      h("div", { class: "pn-reveal" },
        h("button", { class: "pn-btn primary", on: { click: () => app.navigate("/panel") } }, "All walks", kbd("H")),
        missing ? null : h("button", { class: "pn-btn", on: { click: () => route() } }, "Try again", kbd("R")))),
    bar: null,
  });
  document.querySelector(".pn-error h1")?.focus({ preventScroll: true });
  return {};
}

async function route() {
  current?.destroy?.();
  current = null;
  const seq = ++routeSeq;
  const stale = () => seq !== routeSeq;
  const url = new URL(location.href);
  const [, kind, id] = url.pathname.split("/").filter(Boolean);
  try {
    if (kind === "w" && id) {
      const data = await getJson(`/api/walks/${encodeURIComponent(id)}`);
      if (!stale()) {
        current = walkView(data, url.searchParams, app);
      }
    } else if (kind === "p" && id) {
      const view = await projectView(decodeURIComponent(id), url.searchParams, app, stale);
      if (!stale()) {
        current = view;
      }
    } else {
      const view = await homeView(app, stale);
      if (!stale()) {
        current = view;
      }
    }
  } catch (err) {
    if (!stale()) {
      current = errorView(err);
    }
  }
}

function typing(target) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) {
    return;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    if (typing(e.target)) {
      if (!current?.onEscape?.()) {
        e.target.blur();
      }
      return;
    }
    if (!current?.onEscape?.()) {
      hidePanel();
    }
    return;
  }
  if (typing(e.target)) {
    return;
  }
  if (e.target instanceof HTMLButtonElement && (e.key === "Enter" || e.key === " ")) {
    return;
  }
  const k = e.key.toLowerCase();
  if (k === "h") {
    e.preventDefault();
    app.navigate("/panel");
    return;
  }
  if (k === "r") {
    e.preventDefault();
    route();
    return;
  }
  if (current?.onKey?.(e)) {
    e.preventDefault();
  }
});

window.addEventListener("popstate", route);
window.addEventListener("scroll", () => topEl.classList.toggle("scrolled", window.scrollY > 4), { passive: true });

async function boot() {
  try {
    const { config } = await getJson("/api/config");
    if (config?.preset && config?.theme) {
      document.documentElement.dataset.preset = config.preset;
      document.documentElement.dataset.theme = config.theme;
    }
  } catch {
    /* keep defaults */
  }
  try {
    await loadKit();
  } catch {
    /* step frames fall back to unstyled content */
  }
  const refreshLists = () => {
    if (current?.refreshOnWalk) {
      route();
    }
  };
  onEvents({ walk: refreshLists, changed: refreshLists }, reloadWhenIdle);
  route();
}

/** Reloads to pick up a rebuilt client, waiting while the user has typed text. */
function reloadWhenIdle() {
  const field = document.activeElement;
  const typing = (field?.tagName === "TEXTAREA" || field?.tagName === "INPUT") && field.value.trim() !== "";
  if (typing) {
    setTimeout(reloadWhenIdle, 5000);
    return;
  }
  location.reload();
}

boot();
