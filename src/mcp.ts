#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ensureHttpServer } from "./server-manager.js";
import { resolveClaudeSessionId } from "./session-id.js";
import { HOOK_DIR } from "./paths.js";

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

/**
 * True if a SessionStart hook (e.g. Claude Code's) has already written a
 * session-id file for this MCP child's PPID. Tells us a hook-aware client is
 * managing tab lifecycle, so the MCP server should NOT also auto-open.
 */
function hookHasFiredForThisPpid(): boolean {
  return existsSync(join(HOOK_DIR, `cc-session-${process.ppid}.txt`));
}

// One-shot guard: only auto-open once per MCP-child lifetime. If the user
// closes the tab afterwards, subsequent pushes won't re-open it.
let autoOpenAttempted = false;

function maybeAutoOpenTab(url: string): void {
  if (autoOpenAttempted) return;
  autoOpenAttempted = true;
  if (hookHasFiredForThisPpid()) return; // Claude Code already opened it
  openUrlInBrowser(url);
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
        "Freeform tag: mockup, diff, explanation, comparison, diagram, status, progress, etc.",
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
          "Push an HTML card to this session's live browser tab (easel). Every card appends to a single scrolling page that the user keeps open in split-screen. Use proactively (per global Rule 33) for wordy explanations, mockups, diagrams, diffs, ≥3-option comparisons, or progress views — do NOT ask permission. Pass full HTML (not Markdown).",
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
          "Set or update this Claude session's display label — a short, human phrase that names what the session is about (e.g. 'Roadworthy 401 fix', 'Bulk-add cost items redesign', 'Investigating slow query'). The label appears in the topbar, switcher dropdown, and session index, replacing the cwd basename. Call this proactively whenever the work's theme shifts so the user can navigate sessions by what they ARE, not where they live. Pass an empty string to clear back to cwd basename.",
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

    // Non-Claude-Code clients have no SessionStart hook to open the tab —
    // we do it ourselves on the first tool call instead.
    maybeAutoOpenTab(`http://localhost:${port}/s/${sessionId}`);

    if (req.params.name === TOOL_OPEN) {
      const url = `http://localhost:${port}/s/${sessionId}`;
      openUrlInBrowser(url);
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

    const tabHint =
      result.sessionTabs === 0
        ? " · NO TAB OPEN for this session — ask the user if you should open one (call `open`)"
        : "";
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
