// Walk view: orient + pick -> steps -> check -> end (auto-saved to Keep).

import { askStep, putProgress } from "./panel-api.js";
import { checkIcon, h, htmlFrame, icon, kbd, plural, sourceList } from "./panel-dom.js";
import { KIND_LABEL as KIND, defaultPicked, minutesFor, pickedOrder, topSteps } from "./walk-nav.js";

const STAGE_OF = { orient: "orient", check: "check", end: "done" };
const CLOSED_ASK = { open: false, busy: false, error: null, text: "", question: "" };

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

export function walkView({ walk, progress, projectLabel }, params, app) {
  const projectName = projectLabel ?? walk.project;
  let destroyed = false;
  const mapInfo = new Map(walk.orient.map.map((m) => [m.stepId, m]));

  let picked = progress.picked.length ? [...progress.picked] : defaultPicked(walk);
  const statuses = { ...progress.steps };
  const checks = walk.check.map((_, i) => progress.checks[i] ?? { answer: "", mark: null });
  const revealed = new Set(checks.map((c, i) => (c.mark ? i : -1)).filter((i) => i >= 0));
  let actionsDone = [...progress.actionsDone];
  let startedAt = progress.startedAt;
  let layer = null;
  let overlay = null;
  let ask = { ...CLOSED_ASK };
  let focusHeading = false;
  let mapOpener = null;
  let focusTarget = null;

  const order = () => pickedOrder(walk, picked);
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
    ask = ask.busy ? { ...ask, open: false } : { ...CLOSED_ASK };
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
    for (const s of topSteps(walk)) {
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
      row.append(h("button", { class: "pn-icon-btn", "aria-label": "Map of steps (M)", on: { click: openMap } }, icon("map"), "Map", kbd("M")));
    }
    return [row];
  }

  function progressBlock() {
    const steps = order();
    const n = at + 1;
    return h("div", { class: "pn-progress" },
      h("div", { class: "pn-progress-label" },
        h("span", {}, h("b", {}, `Step ${n} of ${steps.length}`), ` · ${steps[at].name}`),
        h("span", {}, `about ${minutesFor(walk, steps.length - at)} min left`)),
      h("div", { class: "pn-meter", role: "img", "aria-label": `Step ${n} of ${steps.length}` }, h("i", { style: `width:${Math.round((n / steps.length) * 100)}%` })));
  }

  function stepRail() {
    return h("aside", { class: "pn-step-rail", "aria-label": "Steps" }, h("ol", {}, order().map((s, i) => h("li", {
      "aria-current": i === at ? "step" : false,
    }, h("span", { class: "n" }, statuses[s.id] === "got" && i !== at ? "✓" : String(i + 1)), s.name))));
  }

  // ---------- orient ----------
  function orientMain() {
    const rows = topSteps(walk).map((s, i) => {
      const info = mapInfo.get(s.id);
      const on = picked.includes(s.id);
      return h("li", {},
        h("button", {
          class: "pn-map-row", role: "checkbox", "aria-checked": String(on),
          on: {
            click: () => {
              picked = on ? picked.filter((id) => id !== s.id) : topSteps(walk).map((x) => x.id).filter((id) => id === s.id || picked.includes(id));
              render(true);
            },
          },
        },
        checkIcon(),
        h("span", {},
          h("span", { class: "pn-map-name" }, h("span", { class: "pn-map-num" }, `${i + 1}`), info?.name ?? s.name),
          h("span", { class: "pn-map-take" }, info?.takeaway ?? s.takeaway))));
    });
    const total = topSteps(walk).length;
    const facts = [h("span", {}, h("b", {}, KIND[walk.kind] ?? "Walk")), h("span", {}, h("b", {}, String(total)), " steps"), h("span", {}, "about ", h("b", {}, `${walk.orient.minutes} min`))];
    if (walk.example) {
      facts.push(h("span", {}, "Example: ", h("b", {}, walk.example.name)));
    }
    return h("div", { class: "pn-step-enter pn-col" },
      h("p", { class: "pn-question" }, walk.orient.question),
      h("h1", { class: "pn-answer", tabindex: "-1" }, walk.orient.answer),
      h("div", { class: "pn-facts" }, facts),
      h("div", { class: "pn-path-h" }, h("h2", {}, "Your path"), h("span", {}, `${picked.length} of ${total} steps · about ${minutesFor(walk, picked.length)} min`)),
      h("p", { class: "pn-hint" }, "Turn off any step you already know."),
      h("ul", { class: "pn-map", "aria-label": "Steps to walk" }, rows));
  }

  function orientBar() {
    const n = picked.length;
    const verb = startedAt !== null ? "Continue" : "Start";
    const label = n === 0 ? "Pick at least one step" : `${verb} · ${plural(n, "step")}`;
    return [h("span", { class: "pn-spacer" }),
      h("button", { class: "pn-btn primary", disabled: n === 0, on: { click: start } }, label, kbd("⏎"))];
  }

  // ---------- step ----------
  function stepMain() {
    const step = order()[at];
    const parts = [progressBlock(), h("h1", { class: "pn-takeaway", tabindex: "-1" }, step.takeaway)];
    if (layer) {
      parts.push(h("section", { class: "pn-layer pn-well", "aria-label": layer === "slower" ? "Slower" : "Why" },
        h("p", { class: "pn-kicker" }, layerLabel()),
        htmlFrame(layer === "slower" ? step.slower_html : step.why_html, layer)));
    }
    if (ask.open || waitingHere()) {
      parts.push(askBlock(step));
    }
    parts.push(h("div", { class: "pn-prose" }, htmlFrame(step.body_html, step.name)));
    if (step.picture_html) {
      parts.push(h("div", { class: "pn-well" }, htmlFrame(step.picture_html, `${step.name} picture`)));
    }
    if (step.example_html) {
      parts.push(h("div", { class: "pn-card" },
        h("p", { class: "pn-kicker" }, walk.example ? `Example: ${walk.example.name}` : "Example"),
        htmlFrame(step.example_html, "Example", "wk-example")));
    }
    parts.push(...answers(step));
    parts.push(sourceList(step.sources));
    return h("div", { class: layer || ask.open ? "pn-step-split" : "pn-step-enter pn-step-split" }, stepRail(), h("div", {}, parts));
  }

  function layerLabel() {
    if (layer === "why") {
      return "Why this matters";
    }
    return walk.example ? `Slower, with ${walk.example.name}` : "Slower";
  }

  function answerBody(kid) {
    if (!kid.points?.length) {
      return [htmlFrame(kid.body_html, "Answer")];
    }
    return [
      h("ul", { class: "pn-points" }, kid.points.map((p) => h("li", {}, p.label ? h("b", {}, p.label) : null, h("span", {}, p.text)))),
      kid.answer_example ? h("p", { class: "pn-answer-example" }, h("b", {}, "Example"), h("span", {}, kid.answer_example)) : null,
      kid.unsure ? h("p", { class: "pn-answer-unsure" }, h("b", {}, "Not confirmed"), h("span", {}, kid.unsure)) : null,
    ];
  }

  function answers(step) {
    const kids = walk.steps.filter((s) => s.parent === step.id);
    return kids.map((kid) => h("section", { class: "pn-card", id: `ans-${kid.id}`, "data-k": `ans-${kid.id}`, tabindex: "-1", "aria-label": "Answer to your question" },
      h("p", { class: "pn-kicker" }, `You asked: ${kid.name}`),
      h("p", { class: "pn-answer-take" }, kid.takeaway),
      ...answerBody(kid),
      sourceList(kid.sources),
      h("div", { class: "pn-answer-foot" },
        h("span", { class: "pn-sub" }, kid.answeredBy === "session" ? "Answered by the session that made this walk" : ""),
        h("button", { class: "pn-btn quiet", "data-k": `reask-${kid.id}`, disabled: ask.busy, on: { click: () => reAsk(step, kid) } }, "Ask again"))));
  }

  function waitingHere() {
    return ask.busy && typeof at === "number" && order()[at]?.id === ask.origin;
  }

  /** "step 3" while the step is picked, else its name. */
  function stepRef(stepId) {
    const pos = order().findIndex((s) => s.id === stepId);
    return pos === -1 ? walk.steps.find((s) => s.id === stepId)?.name ?? "a step" : `step ${pos + 1}`;
  }

  function askBlock(step) {
    if (waitingHere()) {
      return h("section", { class: "pn-ask", role: "status", "aria-label": "Asking" },
        h("p", {}, "You asked: ", h("b", {}, ask.question)),
        h("ol", { class: "pn-ask-steps" },
          h("li", { class: "ok" }, h("span", { class: "dot" }), "Question sent"),
          h("li", { class: "now" }, h("span", { class: "dot" }), "Finding the answer"),
          h("li", {}, h("span", { class: "dot" }), "Answer goes under this step")),
        h("p", { class: "pn-sub", style: "margin-top:12px" }, "This can take a minute or two. You can keep reading or move to another step."));
    }
    const input = h("textarea", {
      id: "pn-ask-q", "data-k": "ask-input", class: "pn-input pn-ask-input", rows: "3", maxlength: "500", placeholder: "Ask about this step",
      on: {
        input: (e) => { ask.text = e.target.value; },
        keydown: (e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            sendAsk(step);
          }
        },
      },
    });
    input.value = ask.text;
    const error = ask.error
      ? h("div", { class: "pn-alert", role: "alert" }, icon("warn"),
        h("span", {}, h("b", {}, "Question not answered"), `${ask.error.replace(/[.\s]+$/, "")}.`))
      : null;
    return h("section", { class: "pn-ask", "aria-label": "Ask about this step" },
      error,
      h("label", { for: "pn-ask-q" }, "Your question"),
      input,
      h("div", { class: "pn-ask-row" },
        h("span", {}, "Answered from this walk and the project files. Can take up to 90 seconds."),
        h("button", { class: "pn-btn primary", on: { click: () => sendAsk(step) } }, ask.error ? "Try again" : "Send question", kbd("⌘⏎"))));
  }

  function openAsk() {
    if (typeof at !== "number") {
      return;
    }
    if (ask.busy) {
      app.toast(`One question at a time. The answer for ${stepRef(ask.origin)} is still coming.`);
      return;
    }
    ask.open = true;
    focusTarget = "ask-input";
    render(true);
  }

  function closeAsk() {
    if (ask.busy || !ask.open) {
      return false;
    }
    ask = { ...CLOSED_ASK };
    focusTarget = "ask";
    render(true);
    return true;
  }

  /** Sends the same question again; the new answer replaces `kid` only if it arrives. */
  function reAsk(step, kid) {
    if (ask.busy) {
      return;
    }
    ask = { ...CLOSED_ASK, text: kid.name };
    sendAsk(step, kid.id);
  }

  async function sendAsk(step, replaces = null) {
    const question = ask.text.trim();
    if (!question || ask.busy) {
      return;
    }
    ask = { ...ask, busy: true, error: null, question, origin: step.id };
    focusTarget = "ask";
    render(true);
    try {
      const { step: answer, replaced } = await askStep(walk.id, step.id, question, replaces ?? undefined);
      const replaceAt = replaced ? walk.steps.findIndex((s) => s.id === replaced) : -1;
      if (replaceAt === -1) {
        const lastKid = walk.steps.map((s) => s.id === step.id || s.parent === step.id).lastIndexOf(true);
        walk.steps.splice(lastKid + 1, 0, answer);
      } else {
        walk.steps.splice(replaceAt, 1, answer);
      }
      walk.asks = [...(walk.asks ?? []), { stepId: step.id, question, outcome: "ok" }];
      statuses[step.id] = statuses[step.id] === "got" ? "got" : "asked";
      ask = { ...CLOSED_ASK };
      if (destroyed) {
        app.toast(`Answer ready in ${walk.title}`);
        return;
      }
      save();
      const pos = order().findIndex((s) => s.id === step.id);
      if (pos === at) {
        focusTarget = `ans-${answer.id}`;
      }
      render(true);
      if (pos === at) {
        app.announce(`Answer added: ${answer.takeaway}`);
      } else if (pos === -1) {
        app.toast(`Answer ready under ${step.name}`);
      } else {
        app.toast(`Answer ready on step ${pos + 1}`, { label: "Show", onClick: () => go(pos) });
      }
    } catch (err) {
      const raw = err.message || "no reply from easel";
      const message = raw.charAt(0).toUpperCase() + raw.slice(1);
      if (!destroyed && order()[at]?.id === step.id) {
        ask = { ...CLOSED_ASK, open: true, error: message, text: question };
        focusTarget = "ask-input";
        render(true);
      } else {
        ask = { ...CLOSED_ASK };
        app.toast(`No answer for ${stepRef(step.id)} in ${walk.title}: ${message}`);
      }
    }
  }

  function stepBar() {
    const last = at === order().length - 1;
    const typing = ask.open && !ask.busy;
    const nextLabel = last && !walk.check.length ? "Finish" : "Got it";
    return [
      h("button", { class: "pn-btn quiet", "data-k": "back", "aria-label": "Back", on: { click: back } }, icon("left"), h("span", { class: "pn-label-wide" }, "Back")),
      h("span", { class: "pn-spacer" }),
      h("button", { class: "pn-btn quiet", "data-k": "slower", "aria-pressed": String(layer === "slower"), on: { click: () => toggleLayer("slower") } }, "Slower", kbd("S")),
      h("button", { class: "pn-btn quiet", "data-k": "why", "aria-pressed": String(layer === "why"), on: { click: () => toggleLayer("why") } }, "Why", kbd("W")),
      h("button", { class: "pn-btn quiet", "data-k": "ask", "aria-pressed": String(ask.open || waitingHere()), on: { click: () => (ask.open ? closeAsk() : openAsk()) } }, "Ask", kbd("A")),
      typing
        ? h("button", { class: "pn-btn quiet", "data-k": "next", on: { click: next } }, nextLabel)
        : h("button", { class: "pn-btn primary", "data-k": "next", on: { click: next } }, nextLabel, kbd("⏎")),
    ];
  }

  // ---------- check ----------
  function checkMain() {
    const items = walk.check.map((c, i) => {
      const id = `pn-check-${i}`;
      const input = h("input", {
        id, "data-k": `check-${i}-input`, class: "pn-input", type: "text", value: checks[i].answer, placeholder: "Your answer, from memory",
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
      const item = h("div", { class: "pn-check-item" }, h("label", { class: "pn-check-prompt", for: id }, `${i + 1}. ${c.prompt}`), input);
      if (revealed.has(i)) {
        item.append(
          h("div", { class: "pn-expected" }, h("small", {}, "Expected"), c.expected),
          h("div", { class: "pn-reveal", role: "group", "aria-label": "How did you do?" },
            h("button", { class: "pn-btn", "data-k": `check-${i}-right`, "aria-pressed": String(checks[i].mark === "right"), on: { click: () => mark(i, "right") } }, "I had it"),
            h("button", { class: "pn-btn", "data-k": `check-${i}-wrong`, "aria-pressed": String(checks[i].mark === "wrong"), on: { click: () => mark(i, "wrong") } }, "Not quite")));
      } else {
        item.append(h("div", { class: "pn-reveal" }, h("button", { class: "pn-btn", "data-k": `check-${i}-reveal`, on: { click: () => reveal(i) } }, "Reveal answer")));
      }
      return item;
    });
    return h("div", { class: "pn-step-enter pn-col" },
      h("h1", { class: "pn-takeaway", style: "margin-top:16px", tabindex: "-1" }, "Say it back"),
      h("p", { class: "pn-sub" }, "Optional. Answer from memory, then reveal and mark yourself."),
      items);
  }

  function reveal(i) {
    revealed.add(i);
    focusTarget = `check-${i}-right`;
    save();
    render(true);
  }

  function mark(i, value) {
    checks[i].mark = checks[i].mark === value ? null : value;
    save();
    render(true);
  }

  function backButton() {
    return h("button", { class: "pn-btn quiet", "aria-label": "Back", on: { click: back } }, icon("left"), h("span", { class: "pn-label-wide" }, "Back"));
  }

  function checkBar() {
    return [backButton(), h("span", { class: "pn-spacer" }), h("button", { class: "pn-btn primary", "data-k": "finish", on: { click: next } }, "Finish")];
  }

  // ---------- end ----------
  function endMain() {
    const marked = checks.filter((c) => c.mark);
    const right = marked.filter((c) => c.mark === "right").length;
    const actions = walk.actions.map((a, i) => {
      const done = actionsDone.includes(i);
      return h("li", {}, h("button", {
        class: "pn-action", "data-k": `action-${i}`, role: "checkbox", "aria-checked": String(done),
        on: {
          click: () => {
            actionsDone = done ? actionsDone.filter((x) => x !== i) : [...actionsDone, i];
            save();
            render(true);
          },
        },
      }, checkIcon(), h("span", {}, a)));
    });
    const sec = (title, count, body) => h("section", { class: "pn-sec" },
      h("div", { class: "pn-sec-h" }, h("h2", {}, title), h("span", { class: "pn-n" }, String(count))), body);
    return h("div", { class: "pn-step-enter pn-col" },
      h("p", { class: "pn-saved" }, icon("saved"), h("span", {}, "Saved to ", h("b", {}, projectName), " · Keep")),
      h("h1", { class: "pn-answer", style: "margin-top:12px", tabindex: "-1" }, walk.orient.answer),
      marked.length ? h("p", { class: "pn-meta", style: "margin-top:12px" }, `Say it back: ${right} of ${marked.length} right`) : null,
      walk.recap.length ? sec("Recap", walk.recap.length, h("ul", { class: "pn-list" }, walk.recap.map((r) => h("li", {}, r)))) : null,
      walk.actions.length ? sec("Actions", walk.actions.length, h("ul", { class: "pn-rows" }, actions)) : null,
      sourceList(walk.sources));
  }

  function endBar() {
    return [
      backButton(),
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
      class: `pn-row${i === at ? " here" : ""}`, "aria-current": i === at ? "step" : false, on: { click: () => { closeMap(); go(i); } },
    },
    h("span", { class: "pn-row-main" },
      h("span", { class: "pn-row-title" }, `${i + 1}. ${s.name}`),
      h("span", { class: "pn-row-meta" }, s.takeaway)),
    h("span", { class: "pn-row-end" }, statusText(s, i)))));
    const extra = [];
    if (walk.check.length) {
      extra.push(h("li", {}, h("button", { class: `pn-row${at === "check" ? " here" : ""}`, "aria-current": at === "check" ? "step" : false, on: { click: () => { closeMap(); go("check"); } } },
        h("span", { class: "pn-row-main" }, h("span", { class: "pn-row-title" }, "Say it back"), h("span", { class: "pn-row-meta" }, "Optional check")))));
    }
    extra.push(h("li", {}, h("button", { class: "pn-row", on: { click: () => { closeMap(); go("orient"); } } },
      h("span", { class: "pn-row-main" }, h("span", { class: "pn-row-title" }, "Change your path"), h("span", { class: "pn-row-meta" }, "Back to the overview")))));
    mapOpener = document.activeElement;
    overlay = h("dialog", { class: "pn pn-overlay", "aria-label": "Map of steps" },
      h("div", { class: "pn-top" }, h("div", { class: "pn-top-row" },
        h("div", { class: "pn-context", style: "padding-left:12px" }, h("b", {}, "Map"), ` · ${walk.title}`),
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
      if (!keepScroll) {
        app.announce(`Step ${at + 1} of ${order().length}: ${order()[at].takeaway}`);
      }
    } else if (at === "check") {
      app.frame({ top: top(), main: checkMain(), bar: checkBar() });
    } else {
      app.frame({ top: top(), main: endMain(), bar: endBar() });
    }
    window.scrollTo(0, keepScroll ? y : 0);
    const key = focusTarget ?? activeKey;
    focusTarget = null;
    if (focusHeading) {
      focusHeading = false;
      document.querySelector(".pn-main h1")?.focus({ preventScroll: true });
    } else if (key) {
      const el = document.querySelector(`[data-k="${key}"]`);
      el?.focus({ preventScroll: true });
      (el?.closest("section") ?? el)?.scrollIntoView({ block: "nearest" });
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
      if ((k === "enter" || e.key === "ArrowRight") && at !== "check") {
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
        render(true);
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
