#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "node:child_process";
import { ensureHttpServer } from "./server-manager.js";
import { resolveClaudeSessionId } from "./session-id.js";

function openUrlInBrowser(url: string): void {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  const args = platform === "win32" ? ["", url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.unref();
  } catch {
    /* swallow */
  }
}

const TOOL_PUSH = "push";
const TOOL_OPEN = "open";
const TOOL_CONFIG = "config";
const TOOL_LABEL = "label";

// One-shot guard: only auto-open once per MCP-child lifetime. If the user
// closes the tab afterwards, subsequent pushes won't re-open it — the user
// closing the tab is treated as an explicit dismissal we should respect.
let autoOpenAttempted = false;

type AutoOpenResult =
  | { kind: "noop" } // already attempted, or a tab is already showing this session
  | { kind: "opened" } // we just opened a fresh tab
  | { kind: "other-session" }; // easel tab(s) exist but on a different session — defer to user

/**
 * Decide whether to auto-open the session URL on first push.
 *
 * - `sessionTabs > 0`: a tab is already showing THIS session → no-op.
 * - `otherTabs > 0`: easel is open, but on a different session. Don't surprise
 *   the user with another window — return "other-session" so the caller can
 *   tell the agent to ask whether to use the topbar switcher or open a new tab.
 * - both 0: auto-open one tab.
 *
 * One-shot per MCP child lifetime. Closing the tab counts as dismissal;
 * subsequent pushes won't re-open.
 *
 * Note: until 0.2.13, this also short-circuited when the Claude Code
 * SessionStart hook had fired (`hookHasFiredForThisPpid`), because the hook
 * itself opened a tab. As of 0.2.14 `easel setup` no longer installs that
 * hook, so the MCP-side decision is reactive to actual tab presence only —
 * `sessionTabs` is the truthful signal.
 */
function autoOpenIfNeeded(
  url: string,
  sessionTabs: number,
  otherTabs: number,
): AutoOpenResult {
  if (autoOpenAttempted) return { kind: "noop" };

  if (sessionTabs > 0) {
    autoOpenAttempted = true;
    return { kind: "noop" };
  }
  if (otherTabs > 0) {
    // Easel is alive in another session — don't open a new window without asking.
    autoOpenAttempted = true;
    return { kind: "other-session" };
  }
  autoOpenAttempted = true;
  openUrlInBrowser(url);
  return { kind: "opened" };
}

const inputSchema = {
  type: "object" as const,
  properties: {
    html: {
      type: "string",
      description:
        "HTML body to render. Sandboxed in an iframe (allow-scripts). Style for off-white background; assume Rule 30 typography defaults are injected.",
    },
    title: {
      type: "string",
      description: "Short title shown in the card header.",
    },
    kind: {
      type: "string",
      description:
        "Freeform tag: mockup, app, diff, explanation, comparison, diagram, status, progress, etc. SPECIAL: 'mockup' and 'app' switch the iframe into APP-FIDELITY mode — the wrapper skips its presentation defaults (Inter body font, design-token CSS, semantic chips, prose width constraints, body bg/color). Only the box-sizing reset and the html-to-image bridge stay. Use this when the push is a recreation of real UI (app screen, component instance, embedded preview) and you want full control over every pixel without the host theme leaking in. For presentation content (explanations, comparisons, status reports), omit kind or use a non-fidelity value.",
    },
  },
  required: ["html"],
  additionalProperties: false,
};

async function pushToServer(args: {
  sessionId: string;
  html: string;
  title?: string;
  kind?: string;
  port: number;
}) {
  const r = await fetch(`http://127.0.0.1:${args.port}/api/push`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: args.sessionId,
      html: args.html,
      title: args.title,
      kind: args.kind,
    }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`display_push HTTP ${r.status}: ${text}`);
  }
  return (await r.json()) as {
    url: string;
    slide_id: string;
    index: number;
    sessionTabs: number;
    otherTabs: number;
  };
}

export async function main() {
  const server = new Server(
    { name: "easel", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: TOOL_PUSH,
        description:
          "Push an HTML card to this session's live browser tab. Renders in a sandboxed iframe over a host-controlled canvas that can be LIGHT or DARK depending on the user's OS theme. Treat each card as a presentation slide — generous whitespace, presentation-scale type, tangible visuals. Your HTML MUST adapt to both light and dark modes.\n\n" +
          "═══ ADAPTIVE COLOR (gets wrong most often) ═══\n" +
          "• Do NOT set `background` on `body` or your root wrapper. The host paints the canvas — setting bg fights it and creates a wrong-shade block in the opposite mode.\n" +
          "• Use `light-dark()` for ALL text colors, card backgrounds, borders, and decorative shades. Add `:root { color-scheme: light dark; }` so the function resolves. Hardcoded `color: #475569` goes invisible in dark mode; hardcoded `border: 1px solid #e5e5e5` becomes a hard white line.\n" +
          "• After setting `.wrap { color: light-dark(...); }`, re-scope `color: inherit` to every descendant so child elements don't fall back to the host's default.\n" +
          "• Inverse rule: if you DO paint a fixed background on a container (a code block locked to dark, a brand-color hero), you MUST also set its text color AND re-scope `color: inherit` to its children. Background and text are a pair.\n\n" +
          "═══ COPY-PASTE STARTER (adaptive) ═══\n" +
          "  :root { color-scheme: light dark; }\n" +
          "  .wrap { color: light-dark(#111, #e8e8e8); padding: 56px 48px; font-family: -apple-system, 'Inter', system-ui, sans-serif; max-width: 820px; }\n" +
          "  .wrap *, .wrap h1, .wrap h2, .wrap h3, .wrap p, .wrap li, .wrap span { color: inherit; }\n" +
          "  .card { background: light-dark(#fff, #161616); border: 1px solid light-dark(#e0d9c3, #2a2a2a); border-radius: 12px; padding: 24px; }\n\n" +
          "═══ COPY-PASTE STARTER (LOCKED-MODE container — terminal, code block, brand hero) ═══\n" +
          "If a container has a FIXED background (not `light-dark()`), you MUST set its own text color AND re-scope `color: inherit` to its children. Otherwise the children inherit `light-dark(...)` from `.wrap` and the text flips to the wrong shade in one mode (e.g. dark text on a locked-dark terminal in light host mode → invisible). This is the #1 thing that goes wrong on terminals and code blocks.\n" +
          "  .terminal { background: #0f172a; color: #e6edf3; border-radius: 12px; padding: 20px 24px; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 13.5px; line-height: 1.7; }\n" +
          "  .terminal *, .terminal span, .terminal pre { color: inherit; }\n" +
          "  .terminal .muted { color: #94a3b8; }\n" +
          "  .terminal .accent { color: #6ee7b7; }\n" +
          "• Same pairing applies in the OPPOSITE direction — locked-LIGHT containers (e.g. a white card on the host canvas). A `.card { background: #fff }` with no `color:` inherits `.wrap`'s light-dark() text, which in dark host mode resolves to a light cream/gray → invisible titles on a white card. Commit text too AND re-scope inherit on children. This bites just as often as the dark case.\n" +
          "  .card { background: #ffffff; color: #111111; border: 1px solid #e5e5e5; border-radius: 12px; padding: 24px 32px; }\n" +
          "  .card * { color: inherit; }\n" +
          "• Syntax-highlighted code in a locked-bg block: EVERY token color must be verified readable against the bg, not just the body color. Recurring bug: locking to #0f172a then giving 'property' / 'punctuation' / 'comment' tokens something like #2c2c40 because it 'looked subtle' — against #0f172a it's nearly invisible and identifiers disappear. Either use a tested theme designed for your bg (Shiki github-dark / vitesse-dark / one-dark-pro for #0f172a-ish, github-light / vitesse-light for #f5f7fa-ish), or pick from this verified palette for #0f172a: keyword #ff7b72, string #a5d6ff, function #d2a8ff, property #79c0ff, number #ffa657, comment #8b949e, default text #e6edf3. If you can't articulate why each token reads against the bg, drop highlighting and use single-color monospace — that always works.\n\n" +
          "═══ TYPOGRAPHY (presentation scale, NOT dashboard) ═══\n" +
          "• Hero title: 44–52px, weight 500, letter-spacing -0.025em\n" +
          "• Section titles: 28–36px, weight 500\n" +
          "• Body: 18–22px, line-height 1.55+\n" +
          "• Eyebrow / kicker: 13–14px uppercase, letter-spacing 0.14em+, colored as a muted accent\n" +
          "• Inter or system sans-serif. Never go below 13px for readable content.\n\n" +
          "═══ WHITESPACE ═══\n" +
          "• Page padding: 56–80px vertical, 40–56px horizontal\n" +
          "• Card padding: 24–32px\n" +
          "• Between major sections: 56–96px\n\n" +
          "═══ VISUALS — tangible beats abstract ═══\n" +
          "The test: 'Could a bullet list communicate this just as well?' If yes, the visual is decoration not explanation — rebuild it as something tangible.\n" +
          "• YES: skeuomorphic browser chrome (3 traffic-light dots + URL bar), terminal windows with monospace + prompt, code-editor frames with line gutters, real device mockups, proportional timeline bars with phase markers, pipe-shaped funnels.\n" +
          "• NO: 5 labeled rectangles connected by arrows; abstract 'sequence diagrams' of thin lines with text labels; numbered-box explainers where each box is just a title + 1 sentence.\n\n" +
          "═══ LAYOUT ═══\n" +
          "• Stack desktop mockups VERTICALLY with labels ('Now', 'Proposed') — don't squeeze them side-by-side. The iframe is ~900px wide; two desktop screens at half-width crush columns, wrap headings to 3 lines, and turn tables unreadable.\n" +
          "• Side-by-side is fine only for narrow mobile mockups, small cards, or short text columns that genuinely fit in half-width.\n" +
          "• Mockup embedded mid-explanation? Prose has a ~880px reading-width cap, but a mockup section should fill the full card. Wrap JUST the mockup in <div class=\"full-bleed\">…</div> — it breaks out of the body padding + prose cap to span the full card width, while surrounding prose stays in the reading column. (If the WHOLE push is a UI recreation, use kind:'mockup'/'app' instead — that strips the entire frame.)\n" +
          "• MATCH THE SOURCE'S REAL FRAME — faithful height, not minimal, in both directions. Mocking a COMPONENT (card, modal, row, toolbar)? Size to content — do NOT pad with min-height:560px / height:100vh to feel 'desktop-y'; that floats content in dead whitespace. Mocking a FULL DESKTOP SCREEN (login page, dashboard)? Give it realistic viewport proportions (e.g. height:760px or 16:10) and lay content out inside as the real screen does (centred form, top nav) — cropping a real screen down to just its content height misrepresents it just as much. Either way copy the source's exact height if it has one. Test: cropped the same way, would your mock look like a screenshot of the real thing? Empty bands = over-padded; a screen squashed to a strip = under-sized.\n" +
          "• When recreating real app UI, hug the source — pull exact colors, spacing, sizing, radii, fonts from the component/theme/Figma/DevTools. A close-but-wrong recreation misleads more than no recreation. If you can't reach the actuals, say so in chat and don't pass the mock off as accurate.\n" +
          "• One accent color, 3–4 instances max per card. Status colors (red/amber/green) only when state genuinely maps to status.\n\n" +
          "═══ WHEN TO PUSH ═══\n" +
          "A response that would otherwise contain: >2 paragraphs of explanation, any UI mockup, a diagram, a code diff, a ≥3-option comparison, or a multi-step progress view. Do NOT ask permission — push proactively. After pushing, reply in chat with ONE LINE: 'pushed to easel ↗ — #<index>'. Don't restate the card's content.\n\n" +
          "═══ BEFORE YOUR FIRST PUSH — LABEL THE SESSION ═══\n" +
          "Sessions without a label show up in the session switcher as the cwd basename (often something useless like 'ammielyawson' or 'home'), which is unfindable when the user has multiple tabs open. If you haven't called the `label` tool yet in this session, CALL IT NOW before pushing — pass a 1–8 word sentence-case name that describes what the session is about (good: 'SSE explainer', 'Onboarding flow comparison'; bad: 'Helping the user', 'Pushing some cards'). Re-call `label` when the work's theme shifts meaningfully.\n\n" +
          "═══ OTHER ═══\n" +
          "• Pass full HTML only — no Markdown. The iframe injects baseline typography so plain `<h1>/<p>` works without extra CSS, but for anything multi-section define your own `<style>` block.\n" +
          "• `<script>` tags trying to mutate the parent window are sandbox-blocked; in-iframe `<script>` (for animations, charts, interactivity) is fine.",
        inputSchema,
      },
      {
        name: TOOL_OPEN,
        description:
          "Force-open a fresh browser tab for the current easel session. Call this when the user asks for a new window, side-by-side view, or to re-open a closed tab. The default SessionStart hook only opens a tab if none are alive; this tool overrides that.",
        inputSchema: {
          type: "object" as const,
          properties: {},
          additionalProperties: false,
        },
      },
      {
        name: TOOL_LABEL,
        description:
          "Set this session's display label — a short, human phrase that names what the chat is about (e.g. 'Roadworthy 401 fix', 'SSE explainer', 'Onboarding flow comparison'). The label replaces the cwd basename in the topbar, switcher dropdown, and session index, making the user's tabs findable.\n\n" +
          "CALL THIS PROACTIVELY:\n" +
          "• As soon as the user's intent is clear in this chat — and NO LATER than your first `push`.\n" +
          "• Without a label, the session shows up as the cwd basename (often something useless like 'home' or 'ammielyawson' for desktop clients), which is unfindable when the user has multiple chat tabs open.\n" +
          "• Re-call whenever the work's theme shifts meaningfully (e.g. user pivots from 'auth flow design' to 'session cleanup').\n\n" +
          "FORMAT:\n" +
          "• 1–8 words, sentence case, no trailing punctuation.\n" +
          "• Name the ARTEFACT, not the verb. Good: 'RegistrationNumberInput extraction', 'SSE explainer', 'Onboarding A/B'. Bad: 'Extracting RegistrationNumberInput', 'Helping with onboarding', 'Pushing some cards'.\n\n" +
          "Pass an empty string to clear back to the cwd basename.",
        inputSchema: {
          type: "object" as const,
          properties: {
            label: {
              type: "string",
              description:
                "Short human label (1–8 words). Pass empty string to clear.",
            },
          },
          required: ["label"],
          additionalProperties: false,
        },
      },
      {
        name: TOOL_CONFIG,
        description:
          "Update the easel viewer's preset, theme, and/or density. Changes apply live across every open tab (SSE-broadcast) and persist. Presets: `paper` (pitstop warm canvas, amber accent — default), `aurora` (deep canvas + violet/blue glow halos), `slate` (cool slate, cyan accent). Themes: `light` or `dark`. Density: `carded` (default — each push is a bordered card) or `flat` (no card chrome — pushes flow as sections with whitespace between). Pass only the field(s) you want to change.",
        inputSchema: {
          type: "object" as const,
          properties: {
            preset: {
              type: "string",
              enum: ["paper", "aurora", "slate"],
              description: "Visual preset to apply globally.",
            },
            theme: {
              type: "string",
              enum: ["light", "dark"],
              description: "Light or dark mode.",
            },
            density: {
              type: "string",
              enum: ["carded", "flat"],
              description:
                "Layout density. `flat` removes card borders/shadow/bg and uses whitespace to separate pushes.",
            },
          },
          additionalProperties: false,
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const sessionId = resolveClaudeSessionId();
    const { port } = await ensureHttpServer();

    if (req.params.name === TOOL_OPEN) {
      const url = `http://localhost:${port}/s/${sessionId}`;
      openUrlInBrowser(url);
      // Explicit open also counts as "we've opened it" — if the user closes
      // this tab later, a subsequent push shouldn't auto-reopen.
      autoOpenAttempted = true;
      return {
        content: [
          {
            type: "text" as const,
            text: `opened a new tab → ${url}`,
          },
        ],
      };
    }

    if (req.params.name === TOOL_LABEL) {
      const args = (req.params.arguments ?? {}) as { label?: string };
      const label = typeof args.label === "string" ? args.label.trim() : "";
      await fetch(`http://127.0.0.1:${port}/api/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, label }),
      });
      return {
        content: [
          {
            type: "text" as const,
            text: label
              ? `session labelled: ${label}`
              : `session label cleared`,
          },
        ],
      };
    }

    if (req.params.name === TOOL_CONFIG) {
      const args = (req.params.arguments ?? {}) as {
        preset?: string;
        theme?: string;
        density?: string;
      };
      const body: Record<string, string> = {};
      if (args.preset) body.preset = args.preset;
      if (args.theme) body.theme = args.theme;
      if (args.density) body.density = args.density;
      const r = await fetch(`http://127.0.0.1:${port}/api/config`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await r.json()) as { config?: unknown };
      return {
        content: [
          {
            type: "text" as const,
            text: `display config now ${JSON.stringify(data.config)}`,
          },
        ],
      };
    }

    if (req.params.name !== TOOL_PUSH) {
      throw new Error(`unknown tool: ${req.params.name}`);
    }
    const args = (req.params.arguments ?? {}) as {
      html?: string;
      title?: string;
      kind?: string;
    };
    if (typeof args.html !== "string" || !args.html.length) {
      throw new Error("easel.push: `html` is required");
    }

    const result = await pushToServer({
      sessionId,
      html: args.html,
      title: args.title,
      kind: args.kind,
      port,
    });

    const url = `http://localhost:${port}/s/${sessionId}`;
    const openResult = autoOpenIfNeeded(
      url,
      result.sessionTabs,
      result.otherTabs,
    );

    let tabHint = "";
    if (openResult.kind === "opened") {
      tabHint = " · opened a tab for this session";
    } else if (openResult.kind === "other-session") {
      tabHint =
        " · easel is open in another tab on a different session — ASK the user whether to switch via the topbar 'switch ▾' dropdown to this session, or call `open` to launch a new tab/window for it";
    } else if (result.sessionTabs === 0) {
      tabHint =
        " · no tab open for this session — user previously closed it; call `open` to force a new one if needed";
    }
    return {
      content: [
        {
          type: "text" as const,
          text: `pushed #${result.index} → ${result.url}${tabHint}`,
        },
      ],
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Auto-run only when invoked directly (e.g. `node dist/mcp.js`), not when
// imported (e.g. by the CLI's no-arg / `mcp` subcommand path). The strict
// equality is what guarantees this — anything fuzzier (like an endsWith
// check) matches on import too and ends up running main() twice, which the
// stdio transport then connects to the same stdin → every message
// processed twice → every push duplicated. Don't add fallbacks here.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("[easel mcp] fatal:", err);
    process.exit(1);
  });
}
