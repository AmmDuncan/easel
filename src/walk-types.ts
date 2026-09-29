import { z } from "zod";

export type WalkKind = "prd" | "trd" | "flow" | "research" | "mixed";
export type WalkSource = { label: string; ref: string };
export type WalkStep = {
  id: string; name: string; takeaway: string;
  body_html: string; picture_html?: string; example_html?: string;
  slower_html: string; why_html: string;
  sources: WalkSource[]; asked?: boolean; parent?: string;
  /** Set when the session that made the walk answered the question. */
  answeredBy?: "session";
};
export type WalkAsk = {
  stepId: string; question: string; at: number; ms: number;
  outcome: "ok" | "error" | "timeout"; error?: string;
};
export type WalkMapItem = { stepId: string; name: string; takeaway: string; suggested: boolean };
export type WalkInput = {
  title: string; kind: WalkKind;
  orient: { question: string; answer: string; minutes: number; map: WalkMapItem[] };
  example?: { name: string; line: string };
  steps: WalkStep[];
  check: { prompt: string; expected: string }[];
  recap: string[]; actions: string[]; sources: WalkSource[];
};
export type Walk = WalkInput & {
  id: string; project: string; createdAt: number;
  sessionId: string | null; cwd: string | null;
  /** The making session's easel has the walk_answer tool, so Ask may route to it. */
  canAnswer?: boolean;
  asks?: WalkAsk[];
};
export type WalkStage = "orient" | "pick" | "walk" | "check" | "keep" | "done";
export type StepStatus = "unseen" | "got" | "slower" | "why" | "asked" | "skipped";
export type WalkProgress = {
  walkId: string; stage: WalkStage; picked: string[]; current: number;
  steps: Record<string, StepStatus>;
  checks: { answer: string; mark: "right" | "wrong" | null }[];
  actionsDone: number[]; startedAt: number | null; updatedAt: number;
  finishedAt?: number | null;
};
export type WalkStatus = "waiting" | "in_progress" | "done";
export type WalkSummary = {
  id: string; title: string; kind: WalkKind; createdAt: number; updatedAt: number;
  steps: number; minutes: number; status: WalkStatus; current: number; openActions: number;
  finishedAt: number | null; stage: WalkStage;
};
export type ProjectInfo = { slug: string; label: string; path: string };
export type ProjectSummary = ProjectInfo & {
  waiting: number; inProgress: number; done: number; lastActivity: number; openActions: number;
  resume: { walkId: string; title: string; step: number; total: number; stage: WalkStage }[];
};

export const WALK_LIMITS = { steps: 12, map: 12, check: 3, recap: 5, actions: 20 } as const;

const Source = z.object({ label: z.string().min(1), ref: z.string().min(1) });
const Step = z.object({
  id: z.string().min(1), name: z.string().min(1), takeaway: z.string().min(1),
  body_html: z.string(), picture_html: z.string().optional(), example_html: z.string().optional(),
  slower_html: z.string(), why_html: z.string(),
  sources: z.array(Source), asked: z.boolean().optional(),
});

export const WalkInputSchema = z.object({
  title: z.string().min(1),
  kind: z.enum(["prd", "trd", "flow", "research", "mixed"]),
  // `steps` is declared before `orient` so that a walk violating both limits
  // at once (e.g. 13 steps with a 1:1 map) reports the `steps` issue first —
  // zod's safeParse issue order follows shape declaration order.
  steps: z.array(Step).min(1).max(WALK_LIMITS.steps),
  orient: z.object({
    question: z.string().min(1), answer: z.string().min(1), minutes: z.number().positive(),
    map: z.array(z.object({
      stepId: z.string(), name: z.string(), takeaway: z.string(), suggested: z.boolean(),
    })).max(WALK_LIMITS.map),
  }),
  example: z.object({ name: z.string(), line: z.string() }).optional(),
  check: z.array(z.object({ prompt: z.string().min(1), expected: z.string().min(1) })).max(WALK_LIMITS.check),
  recap: z.array(z.string()).max(WALK_LIMITS.recap),
  actions: z.array(z.string()).max(WALK_LIMITS.actions),
  sources: z.array(Source),
});

export const ProgressPatchSchema = z
  .object({
    stage: z.enum(["orient", "pick", "walk", "check", "keep", "done"]).optional(),
    picked: z.array(z.string()).max(12).optional(),
    current: z.number().int().min(0).optional(),
    steps: z.record(z.enum(["unseen", "got", "slower", "why", "asked", "skipped"])).optional(),
    checks: z
      .array(z.object({ answer: z.string().max(500), mark: z.enum(["right", "wrong"]).nullable() }))
      .max(3)
      .optional(),
    actionsDone: z.array(z.number().int().min(0)).max(20).optional(),
    startedAt: z.number().nullable().optional(),
  })
  .strict();

export function parseProgressPatch(
  raw: unknown,
): { ok: true; patch: z.infer<typeof ProgressPatchSchema> } | { ok: false; error: string } {
  const parsed = ProgressPatchSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `${first.path.join(".") || "progress"}: ${first.message}` };
  }
  return { ok: true, patch: parsed.data };
}

export function parseWalkInput(raw: unknown): { ok: true; walk: WalkInput } | { ok: false; error: string } {
  const parsed = WalkInputSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `${first.path.join(".")}: ${first.message}` };
  }
  const walk = parsed.data as WalkInput;
  const ids = new Set<string>();
  for (const s of walk.steps) {
    if (ids.has(s.id)) {
      return { ok: false, error: `steps: duplicate step id "${s.id}"` };
    }
    ids.add(s.id);
  }
  for (const m of walk.orient.map) {
    if (!ids.has(m.stepId)) {
      return { ok: false, error: `orient.map: stepId "${m.stepId}" matches no step` };
    }
  }
  return { ok: true, walk };
}
