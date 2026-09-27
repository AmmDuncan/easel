// Walks panel router: /panel, /panel/p/:slug, /panel/w/:id.

import { getJson, hidePanel, onEvents } from "./panel-api.js";
import { h, loadKit } from "./panel-dom.js";
import { homeView, projectView } from "./panel-home.js";
import { walkView } from "./panel-walk.js";

const topEl = document.querySelector(".pn-top");
const mainEl = document.querySelector(".pn-main");
const liveEl = document.querySelector(".pn-live");
let barEl = null;
let current = null;
let toastTimer = null;

const app = {
  frame({ top, main, bar }) {
    topEl.replaceChildren(...top);
    mainEl.replaceChildren(main);
    mainEl.classList.toggle("no-bar", !bar);
    barEl?.remove();
    barEl = null;
    if (bar) {
      barEl = h("footer", { class: "pn-bar" }, bar);
      document.querySelector(".pn-app").append(barEl);
    }
  },
  announce(text) {
    liveEl.textContent = text;
  },
  toast(text, action) {
    document.querySelector(".pn-toast")?.remove();
    clearTimeout(toastTimer);
    const el = h("div", { class: "pn-toast", role: "status" }, h("span", {}, text),
      action ? h("button", { on: { click: () => { el.remove(); action.onClick(); } } }, action.label) : null);
    document.body.append(el);
    toastTimer = setTimeout(() => el.remove(), 6000);
  },
  navigate(path) {
    history.pushState(null, "", path);
    route();
  },
  replaceUrl(path) {
    history.replaceState(null, "", path);
  },
};

function errorView(err) {
  const missing = /^404/.test(err.message);
  app.frame({
    top: [h("div", { class: "pn-top-row" }, h("h1", { class: "pn-context" }, h("b", {}, missing ? "Not found" : "Can't reach easel")))],
    main: h("div", { class: "pn-error" },
      h("p", {}, missing ? "This walk or project no longer exists." : "The easel server did not answer."),
      h("p", { class: "pn-sub" }, missing ? "It may have been deleted. Press H for all walks." : "Run `easel restart` in a terminal, then press R to retry.")),
    bar: null,
  });
  return {};
}

async function route() {
  current?.destroy?.();
  current = null;
  const url = new URL(location.href);
  const [, kind, id] = url.pathname.split("/").filter(Boolean);
  try {
    if (kind === "w" && id) {
      current = walkView(await getJson(`/api/walks/${encodeURIComponent(id)}`), url.searchParams, app);
    } else if (kind === "p" && id) {
      current = await projectView(decodeURIComponent(id), url.searchParams, app);
    } else {
      current = await homeView(app);
    }
  } catch (err) {
    current = errorView(err);
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
      e.target.blur();
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
  await loadKit();
  onEvents({
    walk: () => {
      if (current?.refreshOnWalk) {
        route();
      }
    },
  });
  route();
}

boot();
