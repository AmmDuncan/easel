import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Walk, WalkSource, WalkStep } from "./walk-types.js";

/** A walk's originating Claude session, found live and idle in the agents roster. */
export interface LiveSession {
  name: string;
  pid: number;
}

export interface SessionAnswer {
  takeaway: string;
  body_html: string;
  sources: WalkSource[];
}

type RosterRow = { sessionId?: unknown; name?: unknown; pid?: unknown; status?: unknown };

function rosterRows(parsed: unknown): RosterRow[] {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  const agents = (parsed as { agents?: unknown } | null)?.agents;
  return Array.isArray(agents) ? agents : [];
}

/**
 * Picks the walk's session out of `claude agents --json` output, only when it
 * has a live pid, is idle, and its name addresses exactly one row.
 */
export function pickIdleSession(rosterJson: string, sessionId: string): LiveSession | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rosterJson);
  } catch {
    return null;
  }
  const rows = rosterRows(parsed);
  const row = rows.find((r) => r.sessionId === sessionId);
  if (!row || typeof row.pid !== "number" || row.status !== "idle") {
    return null;
  }
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!name || rows.filter((r) => typeof r.name === "string" && r.name.trim() === name).length !== 1) {
    return null;
  }
  return { name, pid: row.pid };
}

/** The message the originating session receives; it answers through the `walk_answer` tool. */
export function buildSessionMessage(walk: Walk, step: WalkStep, question: string, askId: string): string {
  return [
    `Ammiel asked a question in the easel walks panel, on the walk you made: "${walk.title}".`,
    `Step: ${step.name}. Takeaway: ${step.takeaway}`,
    `Question: ${question}`,
    "",
    "Answer from what you know about this work; read files only if you must, and change nothing.",
    `Then call the easel walk_answer tool once with askId "${askId}", takeaway (one sentence), ` +
      "body_html (1-3 short <p> paragraphs, plain HTML) and sources ([{label, ref}], may be empty).",
    "After that call, carry on with whatever you were doing before; do not reply in chat about it.",
  ].join("\n");
}

function runCapture(bin: string, args: string[], opts: { cwd?: string; timeoutMs: number; env?: NodeJS.ProcessEnv }) {
  return new Promise<{ ok: boolean; stdout: string }>((resolvePromise) => {
    const child = spawn(bin, args, { cwd: opts.cwd, env: opts.env, stdio: ["ignore", "pipe", "ignore"] });
    let stdout = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolvePromise({ ok: false, stdout });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ ok: code === 0, stdout });
    });
  });
}

/** Looks up the walk's session in the live roster; null when it is gone, busy or unaddressable. */
export async function findIdleSession(bin: string, sessionId: string): Promise<LiveSession | null> {
  const { ok, stdout } = await runCapture(bin, ["agents", "--json"], { timeoutMs: 15_000 });
  return ok ? pickIdleSession(stdout, sessionId) : null;
}

/** Sends `message` to the named session through a one-shot helper; true only when the helper reports the send. */
export async function sendToSession(bin: string, cwd: string, name: string, message: string): Promise<boolean> {
  const prompt = [
    "Call the SendMessage tool exactly once, then stop.",
    "",
    `  to: ${name}`,
    "  summary: easel walk question",
    `  message: ${message}`,
    "",
    'SendMessage is a deferred tool: load it first with ToolSearch("select:SendMessage").',
    'Do nothing else. Reply with just "sent" if the send succeeded, otherwise "failed".',
  ].join("\n");
  const { ok, stdout } = await runCapture(
    bin,
    ["-p", "--model", "haiku", "--permission-mode", "acceptEdits", "--output-format", "json", prompt],
    { cwd, timeoutMs: 60_000, env: { ...process.env, EASEL_SUPPRESS_SESSION: "1" } },
  );
  if (!ok) {
    return false;
  }
  try {
    const envelope = JSON.parse(stdout) as { result?: unknown; is_error?: boolean };
    return envelope.is_error !== true && typeof envelope.result === "string" && /^\s*sent\b/i.test(envelope.result);
  } catch {
    return false;
  }
}

/** How long the originating session gets to answer before the fresh call takes over. */
export const SESSION_ANSWER_MS = Number(process.env.EASEL_SESSION_ANSWER_MS) || 90_000;

const pending = new Map<string, { resolve: (answer: SessionAnswer | null) => void; timer: NodeJS.Timeout }>();

/** Resolves with the session's answer for `askId`, or null after `timeoutMs` or a cancel. */
export function waitForSessionAnswer(askId: string, timeoutMs: number): Promise<SessionAnswer | null> {
  return new Promise((resolvePromise) => {
    const timer = setTimeout(() => settleAnswer(askId, null), timeoutMs);
    pending.set(askId, { resolve: resolvePromise, timer });
  });
}

function settleAnswer(askId: string, answer: SessionAnswer | null): boolean {
  const entry = pending.get(askId);
  if (!entry) {
    return false;
  }
  clearTimeout(entry.timer);
  pending.delete(askId);
  entry.resolve(answer);
  return true;
}

/** Hands an answer to the waiting ask; false when nothing is waiting (unknown id or already timed out). */
export function deliverSessionAnswer(askId: string, answer: SessionAnswer): boolean {
  return settleAnswer(askId, answer);
}

/**
 * Asks the session that made the walk, when it is live and idle.
 * Null means "use the fresh call": no session, busy, send failed, or no answer in time.
 */
export async function askOriginSession(
  bin: string,
  cwd: string,
  walk: Walk,
  step: WalkStep,
  question: string,
): Promise<SessionAnswer | null> {
  if (!walk.sessionId || process.env.EASEL_ASK_SESSION === "0") {
    return null;
  }
  const live = await findIdleSession(bin, walk.sessionId);
  if (!live) {
    return null;
  }
  const askId = randomUUID();
  const answer = waitForSessionAnswer(askId, SESSION_ANSWER_MS);
  const sent = await sendToSession(bin, cwd, live.name, buildSessionMessage(walk, step, question, askId));
  if (!sent) {
    settleAnswer(askId, null);
  }
  return answer;
}
