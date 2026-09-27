// Walk view: orient + pick -> steps -> check -> end (auto-saved to Keep).

import { putProgress } from "./panel-api.js";
import { h, htmlFrame, icon, kbd, sourceList } from "./panel-dom.js";

const STAGE_OF = { orient: "orient", check: "check", end: "done" };

function checkIcon() {
  return h("span", {
    class: "pn-check",
    html: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.2l2.6 2.6L10 3.4"/></svg>',
  });
}

function initialAt(params, progress, orderLength) {
  const at = params.get("at");
  if (at === "orient" || at === "check" || at === "end") {
    return at;
  }
  const step = Number(params.get("step"));
  if (Number.isInteger(step) && step >= 1 && step <= orderLength) {
    return step - 1;
  }
  if (progress.startedAt === null || progress.stage === "orient") {
    return "orient";
  }
  if (progress.stage === "check") {
    return "check";
  }
  if (progress.stage === "done") {
    return "end";
  }
  return Math.min(progress.current, orderLength - 1);
}

export function walkView({ walk, progress }, params, app) {
  const suggested = new Set(walk.orient.map.filter((m) => m.suggested).map((m) => m.stepId));
  const mapInfo = new Map(walk.orient.map.map((m) => [m.stepId, m]));
  const isSuggested = (id) => (mapInfo.has(id) ? suggested.has(id) : true);

  let picked = progress.picked.length ? [...progress.picked] : walk.steps.filter((s) => isSuggested(s.id)).map((s) => s.id);
  if (!picked.length) {
    picked = walk.steps.map((s) => s.id);
  }
  const statuses = { ...progress.steps };
  const checks = walk.check.map((_, i) => progress.checks[i] ?? { answer: "", mark: null });
  const revealed = new Set(checks.map((c, i) => (c.mark ? i : -1)).filter((i) => i >= 0));
  let actionsDone = [...progress.actionsDone];
  let startedAt = progress.startedAt;
  let layer = null;
  let overlay = null;

  const order = () => walk.steps.filter((s) => picked.includes(s.id));
  const minutesFor = (n) => Math.max(1, Math.round((walk.orient.minutes * n) / walk.steps.length));
  let at = initialAt(params, progress, order().length);

  function stageOf(pos) {
    return typeof pos === "number" ? "walk" : STAGE_OF[pos];
  }

  async function save() {
    try {
      await putProgress(walk.id, {
        stage: stageOf(at), picked, current: typeof at === "number" ? at : progress.current,
        steps: statuses, checks, actionsDone, startedAt,
      });
    } catch {
      app.toast("Couldn't save your place. It will retry on the next step.");
    }
  }

  function urlFor(pos) {
    const base = `/panel/w/${walk.id}`;
    return typeof pos === "number" ? `${base}?step=${pos + 1}` : `${base}?at=${pos}`;
  }

  function go(pos) {
    at = pos;
    layer = null;
    if (typeof pos === "number") {
      progress.current = pos;
    }
    app.replaceUrl(urlFor(pos));
    save();
    render();
  }

  function next() {
    if (at === "orient") {
      start();
      return;
    }
    if (typeof at === "number") {
      const step = order()[at];
      statuses[step.id] = "got";
      if (at < order().length - 1) {
        go(at + 1);
      } else {
        go(walk.check.length ? "check" : "end");
      }
      return;
    }
    if (at === "check") {
      go("end");
    }
  }

  function back() {
    if (typeof at === "number") {
      go(at === 0 ? "orient" : at - 1);
    } else if (at === "check") {
      go(order().length - 1);
    } else if (at === "end") {
      go(walk.check.length ? "check" : order().length - 1);
    }
  }

  function start() {
    if (!picked.length) {
      return;
    }
    const wasStarted = startedAt !== null;
    if (!wasStarted) {
      startedAt = Date.now();
    }
    for (const s of walk.steps) {
      if (!picked.includes(s.id)) {
        statuses[s.id] = "skipped";
      } else if (statuses[s.id] === "skipped") {
        delete statuses[s.id];
      }
    }
    go(wasStarted ? Math.min(progress.current, order().length - 1) : 0);
  }

  function toggleLayer(kind) {
    if (typeof at !== "number") {
      return;
    }
    layer = layer === kind ? null : kind;
    const step = order()[at];
    if (layer && statuses[step.id] !== "got") {
      statuses[step.id] = layer;
      save();
    }
    render();
  }

  // ---------- top ----------
  function top() {
    const home = h("button", { class: "pn-icon-btn", "aria-label": "Home (H)", on: { click: () => app.navigate("/panel") } }, icon("home"));
    const ctx = h("div", { class: "pn-context" }, h("b", {}, walk.project), " · ", walk.title);
    const row = h("div", { class: "pn-top-row" }, home, ctx);
    if (at !== "orient") {
      row.append(h("button", { class: "pn-icon-btn", "aria-label": "Map of steps (M)", on: { click: openMap } }, icon("map"), "Map"));
    }
    const nodes = [row];
    if (at !== "orient") {
      const steps = order();
      const idx = typeof at === "number" ? at : steps.length;
      const ticks = h("div", { class: "pn-ticks", "aria-hidden": "true" },
        steps.map((s, i) => h("span", { class: `pn-tick${i < idx ? " done" : ""}${i === at ? " current" : ""}` })));
      const label = typeof at === "number"
        ? h("div", { class: "pn-progress-label" }, h("b", {}, `${at + 1} of ${steps.length}`), ` · ${steps[at].name}`)
        : h("div", { class: "pn-progress-label" }, h("b", {}, `${steps.length} of ${steps.length}`), at === "check" ? " · Say it back" : " · Done");
      nodes.push(h("div", { class: "pn-progress" }, ticks, label));
    }
    return nodes;
  }

  // ---------- orient ----------
  function orientMain() {
    const rows = walk.steps.map((s, i) => {
      const info = mapInfo.get(s.id);
      const on = picked.includes(s.id);
      return h("li", {},
        h("button", {
          class: "pn-map-row", role: "checkbox", "aria-checked": String(on),
          on: {
            click: () => {
              picked = on ? picked.filter((id) => id !== s.id) : walk.steps.map((x) => x.id).filter((id) => id === s.id || picked.includes(id));
              render();
            },
          },
        },
        checkIcon(),
        h("span", {},
          h("span", { class: "pn-map-name" }, h("span", { class: "pn-map-num" }, `${i + 1}`), info?.name ?? s.name),
          h("span", { class: "pn-map-take", style: "display:block" }, info?.takeaway ?? s.takeaway))));
    });
    const meta = [h("b", {}, `${walk.steps.length} steps`), ` · about ${walk.orient.minutes} min`];
    if (walk.example) {
      meta.push(" · example: ", h("b", {}, walk.example.name));
    }
    return h("div", { class: "pn-step-enter" },
      h("p", { class: "pn-question" }, walk.orient.question),
      h("h1", { class: "pn-answer" }, walk.orient.answer),
      h("p", { class: "pn-meta" }, ...meta),
      h("h2", { class: "pn-section-title" }, "Your path. Untick what you already know."),
      h("ul", { class: "pn-map", "aria-label": "Steps to walk" }, rows));
  }

  function orientBar() {
    const n = picked.length;
    const resumed = startedAt !== null;
    const label = n === 0 ? "Pick at least one step" : `${resumed ? "Continue" : "Start"} · ${n} ${n === 1 ? "step" : "steps"}, ${minutesFor(n)} min`;
    return [h("span", { class: "pn-spacer" }),
      h("button", { class: "pn-btn primary", disabled: n === 0, on: { click: start } }, label, kbd("Enter"))];
  }

  // ---------- step ----------
  function stepMain() {
    const step = order()[at];
    const body = [step.body_html, step.picture_html ? `<div style="margin-top:20px">${step.picture_html}</div>` : ""].join("");
    const parts = [h("h1", { class: "pn-takeaway" }, step.takeaway)];
    if (layer) {
      parts.push(h("section", { class: "pn-layer", "aria-label": layer === "slower" ? "Slower" : "Why" },
        h("p", { class: "pn-layer-label" }, layer === "slower" ? "Slower, with the example" : "Why this matters"),
        htmlFrame(layer === "slower" ? step.slower_html : step.why_html, layer)));
    }
    parts.push(h("div", { class: "pn-block" }, htmlFrame(body, step.name)));
    if (step.example_html) {
      parts.push(h("div", { class: "pn-example" },
        h("p", { class: "pn-example-label" }, walk.example ? `Example: ${walk.example.name}` : "Example"),
        htmlFrame(step.example_html, "Example")));
    }
    parts.push(sourceList(step.sources));
    return h("div", { class: "pn-step-enter" }, parts);
  }

  function stepBar() {
    const last = at === order().length - 1;
    return [
      h("button", { class: "pn-btn quiet", on: { click: back } }, "Back", kbd("←")),
      h("button", { class: "pn-btn", "aria-pressed": String(layer === "slower"), on: { click: () => toggleLayer("slower") } }, "Slower", kbd("S")),
      h("button", { class: "pn-btn", "aria-pressed": String(layer === "why"), on: { click: () => toggleLayer("why") } }, "Why?", kbd("W")),
      h("span", { class: "pn-spacer" }),
      h("button", { class: "pn-btn primary", on: { click: next } }, last && !walk.check.length ? "Finish" : "Got it", kbd("→")),
    ];
  }

  // ---------- check ----------
  function checkMain() {
    const items = walk.check.map((c, i) => {
      const input = h("input", {
        class: "pn-input", type: "text", value: checks[i].answer, "aria-label": c.prompt, placeholder: "Your answer, from memory",
        on: {
          input: (e) => { checks[i].answer = e.target.value; },
          keydown: (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              reveal(i);
            }
          },
        },
      });
      const item = h("div", { class: "pn-check-item" }, h("p", { class: "pn-check-prompt" }, `${i + 1}. ${c.prompt}`), input);
      if (revealed.has(i)) {
        item.append(
          h("div", { class: "pn-expected" }, h("small", {}, "Expected"), c.expected),
          h("div", { class: "pn-reveal", role: "group", "aria-label": "How did you do?" },
            h("button", { class: "pn-btn", "aria-pressed": String(checks[i].mark === "right"), on: { click: () => mark(i, "right") } }, "I had it"),
            h("button", { class: "pn-btn", "aria-pressed": String(checks[i].mark === "wrong"), on: { click: () => mark(i, "wrong") } }, "Not quite")));
      } else {
        item.append(h("div", { class: "pn-reveal" }, h("button", { class: "pn-btn", on: { click: () => reveal(i) } }, "Reveal answer")));
      }
      return item;
    });
    return h("div", { class: "pn-step-enter" },
      h("h1", { class: "pn-takeaway" }, "Say it back"),
      h("p", { class: "pn-sub" }, "Optional. Answer from memory, then reveal and mark yourself."),
      items);
  }

  function reveal(i) {
    revealed.add(i);
    save();
    render();
  }

  function mark(i, value) {
    checks[i].mark = checks[i].mark === value ? null : value;
    save();
    render();
  }

  function checkBar() {
    return [
      h("button", { class: "pn-btn quiet", on: { click: back } }, "Back", kbd("←")),
      h("span", { class: "pn-spacer" }),
      h("button", { class: "pn-btn primary", on: { click: next } }, "Finish", kbd("Enter")),
    ];
  }

  // ---------- end ----------
  function endMain() {
    const marked = checks.filter((c) => c.mark);
    const right = marked.filter((c) => c.mark === "right").length;
    const actions = walk.actions.map((a, i) => {
      const done = actionsDone.includes(i);
      return h("li", {}, h("button", {
        class: "pn-action", role: "checkbox", "aria-checked": String(done),
        on: {
          click: () => {
            actionsDone = done ? actionsDone.filter((x) => x !== i) : [...actionsDone, i];
            save();
            render();
          },
        },
      }, checkIcon(), h("span", {}, a)));
    });
    return h("div", { class: "pn-step-enter" },
      h("p", { class: "pn-saved" }, icon("saved"), h("span", {}, "Saved to ", h("b", {}, walk.project), " · Keep")),
      h("h1", { class: "pn-answer", style: "margin-top:16px" }, walk.orient.answer),
      marked.length ? h("p", { class: "pn-meta" }, `Check: ${right} of ${marked.length} right`) : null,
      walk.recap.length ? h("h2", { class: "pn-section-title" }, "Recap") : null,
      walk.recap.length ? h("ul", { class: "pn-list" }, walk.recap.map((r) => h("li", {}, r))) : null,
      walk.actions.length ? h("h2", { class: "pn-section-title" }, "Actions") : null,
      walk.actions.length ? h("ul", { class: "pn-rows", style: "gap:0" }, actions) : null,
      sourceList(walk.sources));
  }

  function endBar() {
    return [
      h("button", { class: "pn-btn quiet", on: { click: back } }, "Back", kbd("←")),
      h("span", { class: "pn-spacer" }),
      h("button", { class: "pn-btn", on: { click: () => app.navigate(`/panel/p/${walk.project}?tab=keep`) } }, `Open ${walk.project} Keep`),
      h("button", { class: "pn-btn primary", on: { click: () => app.navigate("/panel") } }, "Home", kbd("H")),
    ];
  }

  // ---------- map overlay ----------
  function openMap() {
    closeMap();
    const steps = order();
    const statusText = (s, i) => {
      if (i === at) {
        return "You are here";
      }
      if (statuses[s.id] === "got") {
        return "Done";
      }
      return "Not yet";
    };
    const rows = steps.map((s, i) => h("li", {}, h("button", {
      class: "pn-row", "aria-current": i === at ? "step" : false, on: { click: () => { closeMap(); go(i); } },
    },
    h("span", { class: "pn-row-main" },
      h("span", { class: "pn-row-title" }, `${i + 1}. ${s.name}`),
      h("span", { class: "pn-row-meta" }, s.takeaway)),
    h("span", { class: "pn-row-end" }, statusText(s, i)))));
    const extra = [];
    if (walk.check.length) {
      extra.push(h("li", {}, h("button", { class: "pn-row", "aria-current": at === "check" ? "step" : false, on: { click: () => { closeMap(); go("check"); } } },
        h("span", { class: "pn-row-main" }, h("span", { class: "pn-row-title" }, "Say it back"), h("span", { class: "pn-row-meta" }, "Optional check")))));
    }
    extra.push(h("li", {}, h("button", { class: "pn-row", on: { click: () => { closeMap(); go("orient"); } } },
      h("span", { class: "pn-row-main" }, h("span", { class: "pn-row-title" }, "Change your path"), h("span", { class: "pn-row-meta" }, "Back to the overview")))));
    overlay = h("div", { class: "pn pn-overlay", role: "dialog", "aria-modal": "true", "aria-label": "Map of steps" },
      h("div", { class: "pn-top" }, h("div", { class: "pn-top-row" },
        h("div", { class: "pn-context" }, h("b", {}, "Map"), ` · ${walk.title}`),
        h("button", { class: "pn-icon-btn", "aria-label": "Close map (Esc)", on: { click: closeMap } }, icon("close"), "Close"))),
      h("div", { class: "pn-overlay-inner" }, h("ul", { class: "pn-rows" }, rows, extra)));
    document.body.append(overlay);
    (overlay.querySelector('[aria-current="step"]') ?? overlay.querySelector("button"))?.focus();
  }

  function closeMap() {
    if (overlay) {
      overlay.remove();
      overlay = null;
      return true;
    }
    return false;
  }

  // ---------- render ----------
  function render() {
    if (at === "orient") {
      app.frame({ top: top(), main: orientMain(), bar: orientBar() });
    } else if (typeof at === "number") {
      app.frame({ top: top(), main: stepMain(), bar: stepBar() });
      app.announce(`Step ${at + 1} of ${order().length}: ${order()[at].takeaway}`);
    } else if (at === "check") {
      app.frame({ top: top(), main: checkMain(), bar: checkBar() });
    } else {
      app.frame({ top: top(), main: endMain(), bar: endBar() });
    }
    window.scrollTo(0, 0);
  }

  render();
  if (at === "end" && progress.stage !== "done") {
    save();
  }

  return {
    onKey(e) {
      const k = e.key.toLowerCase();
      if (k === "enter" || e.key === "ArrowRight") {
        next();
        return true;
      }
      if (e.key === "ArrowLeft") {
        back();
        return true;
      }
      if (k === "s") {
        toggleLayer("slower");
        return true;
      }
      if (k === "w") {
        toggleLayer("why");
        return true;
      }
      if (k === "m" && at !== "orient") {
        if (!closeMap()) {
          openMap();
        }
        return true;
      }
      return false;
    },
    onEscape() {
      if (closeMap()) {
        return true;
      }
      if (layer) {
        layer = null;
        render();
        return true;
      }
      return false;
    },
    destroy() {
      closeMap();
    },
  };
}
