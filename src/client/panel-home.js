// Home (one queue across projects) and Project (Walks + Keep tabs).

import { getJson, putProgress } from "./panel-api.js";
import { h, icon, timeAgo } from "./panel-dom.js";

const STALE_MS = 14 * 24 * 60 * 60 * 1000;

function homeButton(app) {
  return h("button", { class: "pn-icon-btn", "aria-label": "All walks (H)", on: { click: () => app.navigate("/panel") } }, icon("home"));
}

function section(title, rows) {
  if (!rows.length) {
    return null;
  }
  return h("section", {}, h("h2", { class: "pn-section-title" }, title), h("ul", { class: "pn-rows" }, rows));
}

function row({ title, meta, end, bar, onClick, stale }) {
  return h("li", {}, h("button", { class: "pn-row", on: { click: onClick } },
    h("span", { class: "pn-row-main" },
      h("span", { class: "pn-row-title" }, title),
      h("span", { class: "pn-row-meta" }, meta, stale ? h("span", { class: "pn-stale" }, ` · ${stale}`) : null),
      bar === undefined ? null : h("span", { class: "pn-row-bar", "aria-hidden": "true" }, h("i", { style: `width:${Math.round(bar * 100)}%` }))),
    end ? h("span", { class: "pn-row-end" }, end) : null));
}

function staleLabel(w) {
  const age = Date.now() - w.updatedAt;
  return w.status === "waiting" && age > STALE_MS ? `untouched for ${Math.floor(age / 86400000)} days` : null;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function countsLine(p) {
  const parts = [];
  if (p.waiting) {
    parts.push(`${p.waiting} new`);
  }
  if (p.inProgress) {
    parts.push(`${p.inProgress} in progress`);
  }
  if (p.done) {
    parts.push(`${p.done} done`);
  }
  return parts.join(" · ") || "No walks";
}

export async function homeView(app) {
  const projects = await getJson("/api/projects");
  const waiting = (await Promise.all(projects.filter((p) => p.waiting > 0).map((p) =>
    getJson(`/api/projects/${encodeURIComponent(p.slug)}/walks`).then((ws) =>
      ws.filter((w) => w.status === "waiting").map((w) => ({ ...w, project: p }))))))
    .flat()
    .sort((a, b) => b.createdAt - a.createdAt);

  const top = [h("div", { class: "pn-top-row" }, h("h1", { class: "pn-context pn-title" }, "All walks"))];

  if (!projects.length) {
    app.frame({
      top,
      main: h("div", { class: "pn-empty" },
        h("p", { class: "pn-h1" }, "Nothing to walk yet"),
        h("p", {}, "Ask Claude to walk you through a PRD, TRD, flow or report. It lands here, and a toast shows in the corner.")),
      bar: null,
    });
    return {};
  }

  const totals = projects.reduce((t, p) => ({ waiting: t.waiting + p.waiting, inProgress: t.inProgress + p.inProgress }), { waiting: 0, inProgress: 0 });
  const summary = [totals.waiting ? `${totals.waiting} new` : null, totals.inProgress ? `${totals.inProgress} in progress` : null]
    .filter(Boolean).join(" · ") || "All caught up";

  const cont = projects.flatMap((p) => p.resume.map((r) => row({
    title: r.title,
    meta: `${p.label} · step ${Math.min(r.step + 1, r.total)} of ${r.total}`,
    bar: r.total ? r.step / r.total : 0,
    onClick: () => app.navigate(`/panel/w/${r.walkId}`),
  })));
  const fresh = waiting.map((w) => row({
    title: w.title,
    meta: `${w.project.label} · ${plural(w.steps, "step")}, ${w.minutes} min`,
    end: timeAgo(w.createdAt),
    stale: staleLabel(w),
    onClick: () => app.navigate(`/panel/w/${w.id}`),
  }));
  const actions = projects.filter((p) => p.openActions > 0).map((p) => row({
    title: p.label,
    meta: plural(p.openActions, "open action"),
    onClick: () => app.navigate(`/panel/p/${encodeURIComponent(p.slug)}?tab=keep`),
  }));
  const all = projects.map((p) => row({
    title: p.label,
    meta: countsLine(p),
    end: p.lastActivity ? timeAgo(p.lastActivity) : null,
    onClick: () => app.navigate(`/panel/p/${encodeURIComponent(p.slug)}`),
  }));

  app.frame({
    top,
    main: h("div", { class: "pn-step-enter" },
      h("p", { class: "pn-sub" }, summary),
      section("Continue", cont),
      section("New", fresh),
      section("Open actions", actions),
      section("Projects", all)),
    bar: null,
  });
  return { refreshOnWalk: true };
}

export async function projectView(slug, params, app) {
  const [projects, walks] = await Promise.all([
    getJson("/api/projects"),
    getJson(`/api/projects/${encodeURIComponent(slug)}/walks`),
  ]);
  const project = projects.find((p) => p.slug === slug) ?? { slug, label: slug };
  let tab = params.get("tab") === "keep" ? "keep" : "walks";
  const done = walks.filter((w) => w.status === "done");
  let kept = null;

  const top = () => [
    h("div", { class: "pn-top-row" }, homeButton(app), h("h1", { class: "pn-context pn-title" }, project.label)),
  ];

  function tabs() {
    const t = (id, label) => h("button", {
      class: "pn-tab", role: "tab", "aria-selected": String(tab === id),
      on: { click: () => { tab = id; app.replaceUrl(`/panel/p/${encodeURIComponent(slug)}${id === "keep" ? "?tab=keep" : ""}`); render(); } },
    }, label);
    return h("div", { class: "pn-tabs", role: "tablist" }, t("walks", "Walks"), t("keep", "Keep"));
  }

  function walksTab() {
    const open = (w) => () => app.navigate(`/panel/w/${w.id}`);
    const inProgress = walks.filter((w) => w.status === "in_progress").map((w) => row({
      title: w.title, meta: `step ${w.current + 1} of ${w.steps}`, bar: w.current / w.steps, onClick: open(w),
    }));
    const fresh = walks.filter((w) => w.status === "waiting").map((w) => row({
      title: w.title, meta: `${plural(w.steps, "step")}, ${w.minutes} min`, end: timeAgo(w.createdAt), stale: staleLabel(w), onClick: open(w),
    }));
    const finished = done.map((w) => row({ title: w.title, meta: `Done · ${plural(w.steps, "step")}`, end: timeAgo(w.updatedAt), onClick: open(w) }));
    if (!walks.length) {
      return h("div", { class: "pn-empty" }, h("p", {}, "No walks in this project yet."));
    }
    return h("div", {}, section("In progress", inProgress), section("New", fresh), section("Done", finished));
  }

  function keepTab() {
    if (!done.length) {
      return h("div", { class: "pn-empty" },
        h("p", { class: "pn-h1" }, "Nothing kept yet"),
        h("p", {}, `Finish a walk in ${project.label} and its recap and actions land here.`));
    }
    if (!kept) {
      Promise.all(done.map((w) => getJson(`/api/walks/${w.id}`))).then((list) => {
        kept = list;
        render();
      }).catch(() => app.toast("Couldn't load the Keep page. Press R to retry."));
      return h("p", { class: "pn-sub" }, "Loading...");
    }
    return h("div", {}, kept.map(({ walk, progress }) => {
      const actions = walk.actions.map((a, i) => {
        const isDone = progress.actionsDone.includes(i);
        return h("li", {}, h("button", {
          class: "pn-action", role: "checkbox", "aria-checked": String(isDone),
          on: {
            click: async () => {
              progress.actionsDone = isDone ? progress.actionsDone.filter((x) => x !== i) : [...progress.actionsDone, i];
              render();
              try {
                await putProgress(walk.id, { actionsDone: progress.actionsDone });
              } catch {
                app.toast("Couldn't save that. Try again.");
              }
            },
          },
        }, h("span", {
          class: "pn-check",
          html: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.2l2.6 2.6L10 3.4"/></svg>',
        }), h("span", {}, a)));
      });
      return h("section", { style: "margin-top:28px" },
        h("h2", { class: "pn-row-title", style: "font-size:17px" }, walk.title),
        h("p", { class: "pn-row-meta" }, `Finished ${timeAgo(progress.updatedAt)}`),
        walk.recap.length ? h("ul", { class: "pn-list", style: "margin-top:12px" }, walk.recap.map((r) => h("li", {}, r))) : null,
        walk.actions.length ? h("ul", { class: "pn-rows", style: "gap:0;margin-top:8px" }, actions) : null);
    }));
  }

  function render() {
    app.frame({
      top: top(),
      main: h("div", {}, h("p", { class: "pn-sub" }, countsLine(project)), tabs(), tab === "keep" ? keepTab() : walksTab()),
      bar: null,
    });
  }

  render();
  return {};
}
