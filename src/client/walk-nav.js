// Pure walk navigation: which steps are walked, and how long is left. No DOM.

/** Display names for walk kinds. */
export const KIND_LABEL = { prd: "PRD", trd: "TRD", flow: "Flow", research: "Research", mixed: "Walk" };

/** Top-level steps; answers inserted by Ask carry a `parent` and are excluded. */
export function topSteps(walk) {
  return walk.steps.filter((s) => !s.parent);
}

/** The steps suggested on Orient, or every step when the walk marks none. */
export function defaultPicked(walk) {
  const suggested = new Set(walk.orient.map.filter((m) => m.suggested).map((m) => m.stepId));
  const known = new Set(walk.orient.map.map((m) => m.stepId));
  const picks = topSteps(walk).filter((s) => !known.has(s.id) || suggested.has(s.id)).map((s) => s.id);
  return picks.length ? picks : topSteps(walk).map((s) => s.id);
}

/** Picked steps in walk order. */
export function pickedOrder(walk, picked) {
  return topSteps(walk).filter((s) => picked.includes(s.id));
}

/** Minutes for `n` steps, scaled from the walk's estimate; never under 1. */
export function minutesFor(walk, n) {
  const total = topSteps(walk).length || 1;
  return Math.max(1, Math.round((walk.orient.minutes * n) / total));
}

/** Where an in-progress walk stands: step number, step name and minutes left. */
export function liveSummary(walk, progress) {
  const picked = progress.picked.length ? progress.picked : defaultPicked(walk);
  const order = pickedOrder(walk, picked);
  const index = Math.max(0, Math.min(progress.current, order.length - 1));
  return {
    step: index + 1,
    of: order.length,
    stepName: order[index]?.name ?? "",
    minutesLeft: minutesFor(walk, order.length - index),
  };
}
