// Home (one queue across projects) and Project (Walks + Keep tabs).

import { clearDone, deleteProject, deleteWalk, getJson, moveWalk, putProgress, renameProject, restoreTrash } from "./panel-api.js";
import { checkIcon, h, icon, kbd, openMenu, plural, timeAgo } from "./panel-dom.js";
import { KIND_LABEL as KIND, liveSummary, progressRatio, rowSummary } from "./walk-nav.js";

const STALE_MS = 14 * 24 * 60 * 60 * 1000;
const NEW_SHOWN = 5;

function homeButton(app) {
  return h("button", { class: "pn-icon-btn", "aria-label": "All walks (H)", on: { click: () => app.navigate("/panel") } }, icon("home"));
}

function section(title, rows, count) {
  if (!rows.length) {
    return null;
  }
  return h("section", { class: "pn-sec" },
    h("div", { class: "pn-sec-h" }, h("h2", {}, title), count === undefined ? null : h("span", { class: "pn-n" }, String(count))),
    h("ul", { class: "pn-rows" }, rows));
}

function row({ title, meta, end, bar, glyph, onClick, stale }) {
  return h("li", {}, h("button", { class: "pn-row", title, on: { click: onClick } },
    glyph ? h("span", { class: "pn-row-glyph" }, icon(glyph)) : null,
    h("span", { class: "pn-row-main" },
      h("span", { class: "pn-row-title" }, title),
      h("span", { class: "pn-row-meta" }, meta, stale ? h("span", { class: "pn-stale" }, ` · ${stale}`) : null)),
    rowEnd(end, bar)));
}

function rowEnd(end, bar) {
  if (!end && bar === undefined) {
    return null;
  }
  const meter = bar === undefined ? null : h("span", { class: "pn-row-bar", "aria-hidden": "true" }, h("i", { style: `width:${Math.round(bar * 100)}%` }));
  return h("span", { class: "pn-row-end" }, end ?? "", meter);
}

/** Hero and row line for an in-progress walk; Orient and Say it back name the stage. */
function liveMeta(w, withName) {
  if (w.stage === "orient") {
    return "Choosing steps";
  }
  if (w.stage === "check") {
    return "Say it back · optional";
  }
  const where = withName && w.stepName ? `Step ${w.step} of ${w.of}: ${w.stepName}` : `Step ${w.step} of ${w.of}`;
  return w.minutesLeft === null ? where : `${where} · about ${w.minutesLeft} min left`;
}

/** Run a trash-backed action, then offer Undo for 10 s. */
async function undoable(app, action, message, verb) {
  try {
    const res = await action();
    const undo = res?.trashId
      ? {
        label: "Undo",
        onClick: async () => {
          try {
            await restoreTrash(res.trashId);
            app.refresh();
          } catch (err) {
            app.toast(`Couldn't undo: ${err.message}`);
          }
        },
      }
      : null;
    app.toast(message, undo, 10000);
    return res;
  } catch (err) {
    app.toast(`Couldn't ${verb}: ${err.message}`);
    return null;
  }
}

function staleLabel(w) {
  const age = Date.now() - w.updatedAt;
  return w.status === "waiting" && age > STALE_MS ? `untouched for ${Math.floor(age / 86400000)} days` : null;
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

function newMeta(w, withProject) {
  return `${withProject ? `${w.project.label} · ` : ""}${KIND[w.kind] ?? "Walk"} · ${plural(w.steps, "step")} · ${w.minutes} min`;
}

function homeTop(summary) {
  return [h("div", { class: "pn-top-row" }, h("h1", { class: "pn-title" }, "Walks"), h("span", { class: "pn-context" }, summary))];
}

function skeleton() {
  const line = (w, ht) => h("span", { class: "pn-sk", style: `width:${w};height:${ht}px` });
  const skRow = () => h("div", { class: "pn-sk-row" }, line("62%", 16), line("40%", 12));
  return h("div", { role: "status", "aria-label": "Loading walks" },
    h("div", { class: "pn-hero", style: "display:grid;gap:10px" }, line("30%", 12), line("70%", 20), line("100%", 4)),
    h("div", { class: "pn-sec" }, skRow(), skRow(), skRow(), skRow()));
}

/** In-progress walks with their real picked step and time left, most recent first. */
async function liveWalks(projects) {
  const resume = projects.flatMap((p) => p.resume.map((r) => ({ ...r, project: p })));
  const live = await Promise.all(resume.map((r) => getJson(`/api/walks/${encodeURIComponent(r.walkId)}`)
    .then(({ walk, progress }) => ({ id: r.walkId, title: r.title, project: r.project, updatedAt: progress.updatedAt ?? 0, ...liveSummary(walk, progress) }))
    .catch(() => ({
      id: r.walkId, title: r.title, project: r.project, updatedAt: 0,
      ...rowSummary({ stage: r.stage, current: r.step, steps: r.total }),
    }))));
  return live.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function homeView(app, stale = () => false) {
  const slow = setTimeout(() => {
    if (!stale()) {
      app.frame({ top: homeTop(""), main: skeleton(), bar: null });
    }
  }, 200);
  let projects;
  let waiting;
  let live;
  try {
    projects = await getJson("/api/projects");
    [waiting, live] = await Promise.all([
      Promise.all(projects.filter((p) => p.waiting > 0).map((p) =>
        getJson(`/api/projects/${encodeURIComponent(p.slug)}/walks`).then((ws) =>
          ws.filter((w) => w.status === "waiting").map((w) => ({ ...w, project: p })))))
        .then((lists) => lists.flat().sort((a, b) => b.createdAt - a.createdAt)),
      liveWalks(projects),
    ]);
  } finally {
    clearTimeout(slow);
  }
  if (stale()) {
    return {};
  }

  const totals = projects.reduce((t, p) => ({ waiting: t.waiting + p.waiting, inProgress: t.inProgress + p.inProgress }), { waiting: 0, inProgress: 0 });
  const summary = [totals.waiting ? `${totals.waiting} new` : null, totals.inProgress ? `${totals.inProgress} in progress` : null]
    .filter(Boolean).join(" · ");

  if (!projects.length) {
    app.frame({
      top: homeTop(""),
      main: h("div", { class: "pn-empty center" },
        h("h2", {}, "No walks yet"),
        h("p", {}, "When Claude finishes research, a PRD or a flow explanation, it arrives here as a walk you can step through."),
        h("p", {}, "In any session, say ", h("code", {}, "walk me through"), " and add what you want explained.")),
      bar: null,
    });
    return {};
  }

  const open = (id) => () => app.navigate(`/panel/w/${id}`);
  const lead = live[0] ?? waiting[0] ?? null;
  let showAll = false;

  function hero() {
    if (!lead) {
      return null;
    }
    if (live[0]) {
      const w = live[0];
      return h("section", { class: "pn-hero" },
        h("p", { class: "pn-kicker" }, `In progress · ${w.project.label}`),
        h("h2", { class: "pn-hero-title" }, w.title),
        h("p", { class: "pn-meta" }, liveMeta(w, true)),
        h("div", { class: "pn-meter", "aria-hidden": "true" }, h("i", { style: `width:${Math.round(progressRatio(w.step, w.of) * 100)}%` })),
        h("div", { class: "pn-hero-actions" }, h("button", { class: "pn-btn primary", on: { click: open(w.id) } }, "Continue", kbd("⏎"))));
    }
    const w = waiting[0];
    return h("section", { class: "pn-hero" },
      h("p", { class: "pn-kicker" }, `Up next · ${w.project.label}`),
      h("h2", { class: "pn-hero-title" }, w.title),
      h("p", { class: "pn-meta" }, `${newMeta(w, false)} · arrived ${timeAgo(w.createdAt)}`),
      h("div", { class: "pn-hero-actions" }, h("button", { class: "pn-btn primary", on: { click: open(w.id) } }, "Start", kbd("⏎"))));
  }

  function projectRows() {
    return projects.map((p) => row({
      title: p.label,
      meta: countsLine(p),
      onClick: () => app.navigate(`/panel/p/${encodeURIComponent(p.slug)}`),
    }));
  }

  function render() {
    const also = live.slice(1).map((w) => row({
      title: w.title,
      meta: `${w.project.label} · ${liveMeta(w, false)}`,
      end: w.updatedAt ? timeAgo(w.updatedAt) : "",
      bar: progressRatio(w.step, w.of),
      onClick: open(w.id),
    }));
    const fresh = waiting.filter((w) => w !== lead);
    const shown = showAll ? fresh : fresh.slice(0, NEW_SHOWN);
    const freshRows = shown.map((w) => row({
      title: w.title, meta: newMeta(w, true), end: timeAgo(w.createdAt), stale: staleLabel(w), onClick: open(w.id),
    }));
    const hidden = fresh.length - shown.length;
    const actions = projects.filter((p) => p.openActions > 0).map((p) => row({
      title: plural(p.openActions, "open action"),
      meta: `${p.label} · in Keep`,
      glyph: "list",
      onClick: () => app.navigate(`/panel/p/${encodeURIComponent(p.slug)}?tab=keep`),
    }));
    const newSection = section("New", freshRows, fresh.length);
    if (newSection && hidden > 0) {
      newSection.append(h("button", { class: "pn-more", on: { click: () => { showAll = true; render(); } } }, `Show ${hidden} more`));
    }
    const rail = projects.length > 1 ? h("aside", { class: "pn-rail" }, section("Projects", projectRows(), projects.length)) : null;
    const projectsList = section("Projects", projectRows(), projects.length);
    projectsList?.querySelector(".pn-rows").classList.add("pn-pgrid");
    if (rail) {
      projectsList?.classList.add("pn-narrow-only");
    }
    const caughtUp = lead ? null : h("div", { class: "pn-hero" },
      h("h2", { class: "pn-hero-title" }, "All caught up"),
      h("p", { class: "pn-meta", style: "margin-top:4px" }, "Nothing new or in progress. Finished walks stay in each project's Keep."));
    const queue = h("div", {}, caughtUp, hero(), section("Also in progress", also, also.length), newSection, section("Open actions", actions, actions.length), projectsList);
    app.frame({
      top: homeTop(summary),
      main: h("div", { class: "pn-step-enter" }, rail ? h("div", { class: "pn-split" }, rail, queue) : queue),
      bar: null,
    });
  }

  render();
  return {
    refreshOnWalk: true,
    onKey(e) {
      if (e.key === "Enter" && lead) {
        open(lead.id)();
        return true;
      }
      return false;
    },
  };
}

export async function projectView(slug, params, app, stale = () => false) {
  const [projects, walks] = await Promise.all([
    getJson("/api/projects"),
    getJson(`/api/projects/${encodeURIComponent(slug)}/walks`),
  ]);
  if (stale()) {
    return {};
  }
  const project = projects.find((p) => p.slug === slug) ?? { slug, label: slug };
  let tab = params.get("tab") === "keep" ? "keep" : "walks";
  const done = walks.filter((w) => w.status === "done").sort((a, b) => b.finishedAt - a.finishedAt);
  let kept = null;
  let keepError = false;
  let renaming = false;
  const others = projects.filter((p) => p.slug !== slug);
  const view = { refreshOnWalk: true, destroy: () => { view.destroyed = true; } };

  function projectMenu(e) {
    openMenu(e.currentTarget, [
      { label: "Rename", onSelect: () => { renaming = true; render(); } },
      { label: done.length ? `Clear ${plural(done.length, "done walk")}` : "Clear done walks", disabled: !done.length, onSelect: clear },
      { label: "Delete project", danger: true, onSelect: removeProject },
    ], "Project actions");
  }

  async function clear() {
    const res = await undoable(app, () => clearDone(slug), `Cleared ${plural(done.length, "done walk")}`, "clear done walks");
    if (res) {
      app.refresh();
    }
  }

  async function removeProject() {
    view.refreshOnWalk = false;
    const total = (project.waiting ?? 0) + (project.inProgress ?? 0) + (project.done ?? 0);
    const res = await undoable(app, () => deleteProject(slug), `Deleted ${project.label} and its ${plural(total, "walk")}`, "delete the project");
    if (res) {
      app.navigate("/panel");
    } else {
      view.refreshOnWalk = true;
    }
  }

  async function saveName(value) {
    const label = value.trim();
    renaming = false;
    if (!label || label === project.label) {
      render();
      return;
    }
    try {
      const info = await renameProject(slug, label);
      project.label = info.label;
    } catch (err) {
      app.toast(`Couldn't rename: ${err.message}`);
    }
    render();
  }

  function titleNode() {
    if (!renaming) {
      return h("h1", { class: "pn-title", style: "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" }, project.label);
    }
    const input = h("input", {
      class: "pn-title-input", value: project.label, maxlength: "60", "aria-label": "Project name",
      on: {
        keydown: (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.target.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            renaming = false;
            render();
          }
        },
        blur: (e) => {
          if (renaming) {
            saveName(e.target.value);
          }
        },
      },
    });
    queueMicrotask(() => { input.focus(); input.select(); });
    return input;
  }

  function walkMenu(e, w) {
    const anchor = e.currentTarget;
    openMenu(anchor, [
      {
        label: "Move to...", disabled: !others.length,
        onSelect: () => openMenu(anchor, others.map((p) => ({
          label: p.label,
          onSelect: async () => {
            try {
              await moveWalk(w.id, p.slug);
              app.toast(`Moved to ${p.label}`);
              app.refresh();
            } catch (err) {
              app.toast(`Couldn't move: ${err.message}`);
            }
          },
        })), "Move to project"),
      },
      { label: "Delete walk", danger: true, onSelect: () => removeWalk(w) },
    ], `Actions for ${w.title}`);
  }

  async function removeWalk(w) {
    const res = await undoable(app, () => deleteWalk(w.id), `Deleted ${w.title}`, "delete the walk");
    if (res) {
      app.refresh();
    }
  }

  function walkRow(w, opts) {
    const r = row(opts);
    const btn = r.querySelector(".pn-row");
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        removeWalk(w);
      }
    });
    const more = h("button", { class: "pn-row-more", "aria-label": `Actions for ${w.title}`, "aria-haspopup": "menu", on: { click: (e) => walkMenu(e, w) } }, icon("more"));
    r.replaceChildren(h("div", { class: "pn-row-wrap" }, btn, more));
    return r;
  }

  const top = () => [
    h("div", { class: "pn-top-row" }, homeButton(app), titleNode(),
      h("button", { class: "pn-icon-btn", "aria-label": "Project actions", "aria-haspopup": "menu", on: { click: projectMenu } }, icon("more"))),
  ];

  function tabs() {
    const t = (id, label) => h("button", {
      class: "pn-tab", "data-k": `tab-${id}`, "aria-current": tab === id ? "page" : false,
      on: { click: () => { tab = id; app.replaceUrl(`/panel/p/${encodeURIComponent(slug)}${id === "keep" ? "?tab=keep" : ""}`); render(); } },
    }, label);
    return h("div", { class: "pn-tabs" }, t("walks", "Walks"), t("keep", "Keep"));
  }

  function walksTab() {
    const open = (w) => () => app.navigate(`/panel/w/${w.id}`);
    const inProgress = walks.filter((w) => w.status === "in_progress").map((w) => {
      const live = rowSummary(w);
      return walkRow(w, { title: w.title, meta: liveMeta(live, false), bar: progressRatio(live.step, live.of), end: timeAgo(w.updatedAt), onClick: open(w) });
    });
    const fresh = walks.filter((w) => w.status === "waiting").map((w) => walkRow(w, {
      title: w.title, meta: `${KIND[w.kind] ?? "Walk"} · ${plural(w.steps, "step")} · ${w.minutes} min`, end: timeAgo(w.createdAt), stale: staleLabel(w), onClick: open(w),
    }));
    const finished = done.map((w) => walkRow(w, { title: w.title, meta: `Done · ${plural(w.steps, "step")}`, end: timeAgo(w.finishedAt), onClick: open(w) }));
    if (!walks.length) {
      return h("div", { class: "pn-empty" }, h("p", {}, "No walks in this project yet."));
    }
    return h("div", {}, section("In progress", inProgress, inProgress.length), section("New", fresh, fresh.length), section("Done", finished, finished.length));
  }

  function keepTab() {
    if (!done.length) {
      return h("div", { class: "pn-empty" },
        h("h2", {}, "Nothing kept yet"),
        h("p", {}, `Finish a walk in ${project.label} and its recap and actions land here.`));
    }
    if (keepError) {
      return h("div", { class: "pn-error" },
        h("h2", {}, "Couldn't load Keep"),
        h("div", { class: "pn-reveal" }, h("button", { class: "pn-btn", on: { click: () => { keepError = false; render(); } } }, "Try again")));
    }
    if (!kept) {
      Promise.all(done.map((w) => getJson(`/api/walks/${w.id}`))).then((list) => {
        kept = list;
      }).catch(() => {
        keepError = true;
      }).finally(() => {
        if (!view.destroyed) {
          render();
        }
      });
      return h("p", { class: "pn-sub", style: "margin-top:24px", role: "status" }, "Loading...");
    }
    return h("div", {}, kept.map(({ walk, progress }) => {
      const actions = walk.actions.map((a, i) => {
        const isDone = progress.actionsDone.includes(i);
        return h("li", {}, h("button", {
          class: "pn-action", "data-k": `keep-${walk.id}-${i}`, role: "checkbox", "aria-checked": String(isDone),
          on: {
            click: async () => {
              const before = progress.actionsDone;
              progress.actionsDone = isDone ? before.filter((x) => x !== i) : [...before, i];
              render();
              try {
                await putProgress(walk.id, { actionsDone: progress.actionsDone });
              } catch {
                progress.actionsDone = before;
                render();
                app.toast("Couldn't save that. It's back to how it was.");
              }
            },
          },
        }, checkIcon(), h("span", {}, a)));
      });
      return h("section", { class: "pn-sec" },
        h("div", { class: "pn-sec-h" }, h("h2", {}, walk.title), h("span", { class: "pn-n" }, `finished ${timeAgo(progress.finishedAt ?? progress.updatedAt)}`)),
        walk.recap.length ? h("ul", { class: "pn-list" }, walk.recap.map((r) => h("li", {}, r))) : null,
        walk.actions.length ? h("ul", { class: "pn-rows", style: "margin-top:8px" }, actions) : null);
    }));
  }

  function render() {
    if (view.destroyed) {
      return;
    }
    const activeKey = document.activeElement?.dataset?.k;
    app.frame({
      top: top(),
      main: h("div", { class: "pn-col" }, h("p", { class: "pn-sub", style: "margin-top:8px" }, countsLine(project)), tabs(), tab === "keep" ? keepTab() : walksTab()),
      bar: null,
    });
    if (activeKey) {
      document.querySelector(`[data-k="${activeKey}"]`)?.focus({ preventScroll: true });
    }
  }

  render();
  return view;
}
