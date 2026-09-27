// Walk view: orient + pick -> steps -> check -> end (auto-saved to Keep).

import { askStep, putProgress } from "./panel-api.js";
import { checkIcon, h, htmlFrame, icon, kbd, plural, sourceList } from "./panel-dom.js";

const STAGE_OF = { orient: "orient", check: "check", end: "done" };

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

function progressText(at, steps) {
  if (typeof at === "number") {
    return [`${at + 1} of ${steps.length}`, ` · ${steps[at].name}`];
  }
  return [`${steps.length} of ${steps.length}`, at === "check" ? " · Say it back" : " · Done"];
}

export function walkView({ walk, progress, projectLabel }, params, app) {
  const projectName = projectLabel ?? walk.project;
  let destroyed = false;
  const topSteps = () => walk.steps.filter((s) => !s.parent);
  const suggested = new Set(walk.orient.map.filter((m) => m.suggested).map((m) => m.stepId));
  const mapInfo = new Map(walk.orient.map.map((m) => [m.stepId, m]));
  const isSuggested = (id) => (mapInfo.has(id) ? suggested.has(id) : true);

  let picked = progress.picked.length ? [...progress.picked] : topSteps().filter((s) => isSuggested(s.id)).map((s) => s.id);
  if (!picked.length) {
    picked = topSteps().map((s) => s.id);
  }
  const statuses = { ...progress.steps };
  const checks = walk.check.map((_, i) => progress.checks[i] ?? { answer: "", mark: null });
  const revealed = new Set(checks.map((c, i) => (c.mark ? i : -1)).filter((i) => i >= 0));
  let actionsDone = [...progress.actionsDone];
  let startedAt = progress.startedAt;
  let layer = null;
  let overlay = null;
  let ask = { open: false, busy: false, error: null, text: "" };
  let focusHeading = false;
  let mapOpener = null;

  const order = () => topSteps().filter((s) => picked.includes(s.id));
  const minutesFor = (n) => Math.max(1, Math.round((walk.orient.minutes * n) / topSteps().length));
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
      app.toast("Couldn't save your place. Easel tries again on your next move.");
    }
  }

  function urlFor(pos) {
    const base = `/panel/w/${walk.id}`;
    return typeof pos === "number" ? `${base}?step=${pos + 1}` : `${base}?at=${pos}`;
  }

  function go(pos) {
    at = pos;
    layer = null;
    ask = { open: false, busy: false, error: null, text: "" };
    focusHeading = true;
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
    for (const s of topSteps()) {
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
    render(true);
  }

  // ---------- top ----------
  function top() {
    const home = h("button", { class: "pn-icon-btn", "aria-label": "All walks (H)", on: { click: () => app.navigate("/panel") } }, icon("home"));
    const ctx = h("div", { class: "pn-context" }, h("b", {}, projectName), " · ", walk.title);
    const row = h("div", { class: "pn-top-row" }, home, ctx);
    if (at !== "orient") {
      row.append(h("button", { class: "pn-icon-btn", "aria-label": "Map of steps (M)", on: { click: openMap } }, icon("map"), "Map"));
    }
    const nodes = [row];
    if (at !== "orient") {
      const steps = order();
      const idx = typeof at === "number" ? at : steps.length;
      const ticks = h("div", { class: "pn-ticks", "aria-hidden": "true" },
        steps.map((s, i) => h("span", { class: `pn-tick${statuses[s.id] === "got" && i !== at ? " done" : ""}${i === at ? " current" : ""}` })));
      const [count, name] = progressText(at, steps);
      const label = h("div", { class: "pn-progress-label" }, h("b", {}, count), name);
      nodes.push(h("div", { class: "pn-progress" }, ticks, label));
    }
    return nodes;
  }

  // ---------- orient ----------
  function orientMain() {
    const rows = topSteps().map((s, i) => {
      const info = mapInfo.get(s.id);
      const on = picked.includes(s.id);
      return h("li", {},
        h("button", {
          class: "pn-map-row", role: "checkbox", "aria-checked": String(on),
          on: {
            click: () => {
              picked = on ? picked.filter((id) => id !== s.id) : topSteps().map((x) => x.id).filter((id) => id === s.id || picked.includes(id));
              render();
            },
          },
        },
        checkIcon(),
        h("span", {},
          h("span", { class: "pn-map-name" }, h("span", { class: "pn-map-num" }, `${i + 1}`), info?.name ?? s.name),
          h("span", { class: "pn-map-take", style: "display:block" }, info?.takeaway ?? s.takeaway))));
    });
    const meta = [h("b", {}, `${topSteps().length} steps`), ` · about ${walk.orient.minutes} min`];
    if (walk.example) {
      meta.push(" · example: ", h("b", {}, walk.example.name));
    }
    return h("div", { class: "pn-step-enter" },
      h("p", { class: "pn-question" }, walk.orient.question),
      h("h1", { class: "pn-answer", tabindex: "-1" }, walk.orient.answer),
      h("p", { class: "pn-meta" }, ...meta),
      h("h2", { class: "pn-section-title" }, "Your path. Untick what you already know."),
      h("ul", { class: "pn-map", "aria-label": "Steps to walk" }, rows));
  }

  function orientBar() {
    const n = picked.length;
    const resumed = startedAt !== null;
    const verb = resumed ? "Continue" : "Start";
    const label = n === 0 ? "Pick at least one step" : `${verb} · ${plural(n, "step")}, ${minutesFor(n)} min`;
    return [h("span", { class: "pn-spacer" }),
      h("button", { class: "pn-btn primary", disabled: n === 0, on: { click: start } }, label, kbd("Enter"))];
  }

  // ---------- step ----------
  function stepMain() {
    const step = order()[at];
    const body = [step.body_html, step.picture_html ? `<div style="margin-top:20px">${step.picture_html}</div>` : ""].join("");
    const parts = [h("h1", { class: "pn-takeaway", tabindex: "-1" }, step.takeaway)];
    if (layer) {
      parts.push(h("section", { class: "pn-layer", "aria-label": layer === "slower" ? "Slower" : "Why" },
        h("p", { class: "pn-layer-label" }, layerLabel()),
        htmlFrame(layer === "slower" ? step.slower_html : step.why_html, layer)));
    }
    parts.push(h("div", { class: "pn-block" }, htmlFrame(body, step.name)));
    if (step.example_html) {
      parts.push(h("div", { class: "pn-example" },
        h("p", { class: "pn-example-label" }, walk.example ? `Example: ${walk.example.name}` : "Example"),
        htmlFrame(step.example_html, "Example")));
    }
    parts.push(sourceList(step.sources));
    parts.push(...answers(step));
    if (ask.open) {
      parts.push(askBox(step));
    }
    return h("div", { class: layer || ask.open ? "" : "pn-step-enter" }, parts);
  }

  function layerLabel() {
    if (layer === "why") {
      return "Why this matters";
    }
    return walk.example ? `Slower, with ${walk.example.name}` : "Slower";
  }

  function questionsFor(stepId) {
    return (walk.asks ?? []).filter((a) => a.stepId === stepId && a.outcome === "ok").map((a) => a.question);
  }

  function answers(step) {
    const kids = walk.steps.filter((s) => s.parent === step.id);
    const questions = questionsFor(step.id);
    return kids.map((kid, i) => h("section", { class: "pn-answer-block", id: `ans-${kid.id}`, "aria-label": "Answer to your question" },
      h("p", { class: "pn-layer-label" }, questions[i] ? `You asked: ${questions[i]}` : "You asked"),
      h("p", { class: "pn-answer-take" }, kid.takeaway),
      htmlFrame(kid.body_html, "Answer"),
      sourceList(kid.sources)));
  }

  function askBox(step) {
    const input = h("textarea", {
      class: "pn-input pn-ask-input", rows: "2", maxlength: "500", "aria-label": "Your question about this step",
      placeholder: "Enter sends · Shift+Enter for a new line", disabled: ask.busy,
      on: {
        input: (e) => { ask.text = e.target.value; },
        keydown: (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendAsk(step);
          }
        },
      },
    });
    input.value = ask.text;
    const status = ask.busy
      ? h("p", { class: "pn-sub", role: "status" }, "Finding the answer. This can take up to 90 seconds.")
      : null;
    const error = ask.error
      ? h("p", { class: "pn-ask-error", role: "alert" }, `Couldn't get an answer: ${ask.error.replace(/[.\s]+$/, "")}. Press Enter to try again.`)
      : null;
    const box = h("section", { class: "pn-layer pn-ask", "aria-label": "Ask about this step" },
      h("p", { class: "pn-layer-label" }, "Ask about this step"),
      input,
      h("div", { class: "pn-reveal" },
        h("button", { class: "pn-btn primary", disabled: ask.busy || !ask.text.trim(), on: { click: () => sendAsk(step) } }, ask.busy ? "Sending..." : "Send question"),
        h("button", { class: "pn-btn quiet", disabled: ask.busy, on: { click: closeAsk } }, "Cancel")),
      status, error);
    queueMicrotask(() => {
      if (!ask.busy) {
        input.focus();
      }
    });
    return box;
  }

  function openAsk() {
    if (typeof at !== "number" || ask.busy) {
      return;
    }
    ask.open = true;
    render(true);
    document.querySelector(".pn-ask")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function closeAsk() {
    if (ask.busy) {
      return false;
    }
    if (ask.open) {
      ask = { open: false, busy: false, error: null, text: "" };
      render(true);
      return true;
    }
    return false;
  }

  async function sendAsk(step) {
    const question = ask.text.trim();
    if (!question || ask.busy) {
      return;
    }
    ask.busy = true;
    ask.error = null;
    render(true);
    try {
      const { step: answer } = await askStep(walk.id, step.id, question);
      const lastKid = walk.steps.map((s) => s.id === step.id || s.parent === step.id).lastIndexOf(true);
      walk.steps.splice(lastKid + 1, 0, answer);
      walk.asks = [...(walk.asks ?? []), { stepId: step.id, question, outcome: "ok" }];
      statuses[step.id] = statuses[step.id] === "got" ? "got" : "asked";
      save();
      ask = { open: false, busy: false, error: null, text: "" };
      render(true);
      document.getElementById(`ans-${answer.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
      app.announce(`Answer added: ${answer.takeaway}`);
    } catch (err) {
      ask.busy = false;
      ask.error = err.message || "no reply from easel";
      render(true);
    }
  }

  function stepBar() {
    const last = at === order().length - 1;
    return [
      h("button", { class: "pn-btn quiet", "data-k": "back", on: { click: back } }, "Back", kbd("←")),
      h("button", { class: "pn-btn", "data-k": "slower", "aria-pressed": String(layer === "slower"), on: { click: () => toggleLayer("slower") } }, "Slower", kbd("S")),
      h("button", { class: "pn-btn", "data-k": "why", "aria-pressed": String(layer === "why"), on: { click: () => toggleLayer("why") } }, "Why?", kbd("W")),
      h("button", { class: "pn-btn", "data-k": "ask", "aria-pressed": String(ask.open), on: { click: () => (ask.open ? closeAsk() : openAsk()) } }, "Ask", kbd("A")),
      h("span", { class: "pn-spacer" }),
      h("button", { class: ask.open ? "pn-btn" : "pn-btn primary", "data-k": "next", on: { click: next } }, last && !walk.check.length ? "Finish" : "Got it", kbd("Enter")),
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
      h("h1", { class: "pn-takeaway", tabindex: "-1" }, "Say it back"),
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
      h("p", { class: "pn-saved" }, icon("saved"), h("span", {}, "Saved to ", h("b", {}, projectName), " · Keep")),
      h("h1", { class: "pn-answer", style: "margin-top:16px", tabindex: "-1" }, walk.orient.answer),
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
      h("button", { class: "pn-btn", on: { click: () => app.navigate(`/panel/p/${encodeURIComponent(walk.project)}?tab=keep`) } }, "Open in Keep"),
      h("button", { class: "pn-btn primary", on: { click: () => app.navigate("/panel") } }, "All walks", kbd("H")),
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
    mapOpener = document.activeElement;
    overlay = h("dialog", { class: "pn pn-overlay", "aria-label": "Map of steps" },
      h("div", { class: "pn-top" }, h("div", { class: "pn-top-row" },
        h("div", { class: "pn-context" }, h("b", {}, "Map"), ` · ${walk.title}`),
        h("button", { class: "pn-icon-btn", "aria-label": "Close map (Esc)", on: { click: closeMap } }, icon("close"), "Close"))),
      h("div", { class: "pn-overlay-inner" }, h("ul", { class: "pn-rows" }, rows, extra)));
    document.body.append(overlay);
    overlay.addEventListener("cancel", (e) => {
      e.preventDefault();
      closeMap();
    });
    overlay.showModal();
    (overlay.querySelector('[aria-current="step"]') ?? overlay.querySelector("button"))?.focus();
  }

  function closeMap() {
    if (!overlay) {
      return false;
    }
    overlay.close();
    overlay.remove();
    overlay = null;
    const target = mapOpener?.isConnected ? mapOpener : document.querySelector(".pn-main h1");
    target?.focus({ preventScroll: true });
    return true;
  }

  // ---------- render ----------
  function render(keepScroll = false) {
    if (destroyed) {
      return;
    }
    const y = window.scrollY;
    const activeKey = document.activeElement?.dataset?.k;
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
    window.scrollTo(0, keepScroll ? y : 0);
    if (focusHeading) {
      focusHeading = false;
      document.querySelector(".pn-main h1")?.focus({ preventScroll: true });
    } else if (activeKey) {
      document.querySelector(`.pn-bar [data-k="${activeKey}"]`)?.focus({ preventScroll: true });
    }
  }

  render();

  return {
    onKey(e) {
      const k = e.key.toLowerCase();
      if (overlay) {
        if (k === "m") {
          closeMap();
          return true;
        }
        return false;
      }
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
      if (k === "a") {
        openAsk();
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
      if (closeAsk()) {
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
      destroyed = true;
      closeMap();
    },
  };
}
