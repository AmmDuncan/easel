import { spawn } from "node:child_process";
import type { Walk, WalkSource, WalkStep } from "./walk-types.js";

/**
 * Args passed to the `claude` binary for a read-only ask.
 * `--restricted` ignores user/project settings and hooks; `--tools` limits to
 * read-only tools; `--permission-mode dontAsk` denies anything else instead of
 * prompting (there is no one to answer the prompt).
 */
export const ASK_ARGS: readonly string[] = [
  "-p",
  "--model",
  "sonnet",
  "--output-format",
  "json",
  "--restricted",
  "--strict-mcp-config",
  "--tools",
  "Read,Grep,Glob",
  "--permission-mode",
  "dontAsk",
  "--no-session-persistence",
];

/** Builds the prompt sent to the ask child, grounded in the walk and the current step. */
export function buildAskPrompt(walk: Walk, step: WalkStep, question: string): string {
  const lines: string[] = [];
  lines.push(`Walk: ${walk.title}`);
  lines.push("");
  lines.push(`Orient question: ${walk.orient.question}`);
  lines.push(`Orient answer: ${walk.orient.answer}`);
  lines.push("");
  lines.push("Steps:");
  for (const s of walk.steps) {
    lines.push(`- ${s.name}: ${s.takeaway}`);
  }
  lines.push("");
  lines.push(`Current step: ${step.name}`);
  lines.push(`Takeaway: ${step.takeaway}`);
  lines.push(`Body: ${step.body_html}`);
  if (step.example_html) {
    lines.push(`Example: ${step.example_html}`);
  }
  if (step.sources.length > 0) {
    lines.push(`Sources: ${step.sources.map((s) => `${s.label} (${s.ref})`).join(", ")}`);
  }
  lines.push("");
  lines.push(`Question: ${question}`);
  lines.push("");
  lines.push(
    "Answer the question using the walk and, where useful, files in this folder. Read-only. " +
      'Reply with ONLY a JSON object: {"takeaway": "<one sentence answer>", "body_html": "<1-3 short <p> paragraphs, plain HTML, no scripts>", "sources": [{"label": "...", "ref": "<path or URL>"}]}',
  );
  return lines.join("\n");
}

function extractJsonSpan(text: string): string | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    return null;
  }
  return text.slice(start, end + 1);
}

/** Parses the `claude --output-format json` envelope and the answer JSON inside `.result`. */
export function parseAskOutput(
  stdout: string,
): { takeaway: string; body_html: string; sources: WalkSource[] } | null {
  let envelope: { result?: unknown; is_error?: boolean };
  try {
    envelope = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (envelope.is_error === true) {
    return null;
  }
  if (typeof envelope.result !== "string") {
    return null;
  }
  const span = extractJsonSpan(envelope.result);
  if (!span) {
    return null;
  }
  let answer: { takeaway?: unknown; body_html?: unknown; sources?: unknown };
  try {
    answer = JSON.parse(span);
  } catch {
    return null;
  }
  if (typeof answer.takeaway !== "string" || !answer.takeaway || typeof answer.body_html !== "string") {
    return null;
  }
  const sources: WalkSource[] = Array.isArray(answer.sources)
    ? answer.sources.filter(
        (s): s is WalkSource =>
          typeof s === "object" && s !== null && typeof (s as WalkSource).label === "string" &&
          typeof (s as WalkSource).ref === "string",
      )
    : [];
  return { takeaway: answer.takeaway, body_html: answer.body_html, sources };
}

export type RunAskResult =
  | { ok: true; stdout: string }
  | { ok: false; error: string; timeout?: boolean };

/** Spawns `bin` with `ASK_ARGS`, writes `prompt` to stdin, never through a shell. */
export function runAsk(opts: {
  bin: string;
  cwd: string;
  prompt: string;
  timeoutMs: number;
}): Promise<RunAskResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(opts.bin, [...ASK_ARGS], { cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGKILL");
      resolvePromise({ ok: false, error: "timed out", timeout: true });
    }, opts.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolvePromise({ ok: false, error: err.message });
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        resolvePromise({ ok: false, error: stderr.slice(-300) });
        return;
      }
      resolvePromise({ ok: true, stdout });
    });

    child.stdin.write(opts.prompt);
    child.stdin.end();
  });
}
