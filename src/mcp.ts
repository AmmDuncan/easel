#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ensureHttpServer } from "./server-manager.js";
import { resolveClaudeSessionId } from "./session-id.js";

const TOOL_NAME = "display_push";

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
  return (await r.json()) as { url: string; slide_id: string; index: number };
}

async function main() {
  const server = new Server(
    { name: "claude-display", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: TOOL_NAME,
        description:
          "Push an HTML card to this session's live browser tab (claude-display). Every card appends to a single scrolling page that the user keeps open in split-screen. Use proactively (per global Rule 33) for wordy explanations, mockups, diagrams, diffs, ≥3-option comparisons, or progress views — do NOT ask permission. Pass full HTML (not Markdown).",
        inputSchema,
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== TOOL_NAME) {
      throw new Error(`unknown tool: ${req.params.name}`);
    }
    const args = (req.params.arguments ?? {}) as {
      html?: string;
      title?: string;
      kind?: string;
    };
    if (typeof args.html !== "string" || !args.html.length) {
      throw new Error("display_push: `html` is required");
    }

    const sessionId = resolveClaudeSessionId();
    if (!sessionId) {
      return {
        content: [
          {
            type: "text" as const,
            text: "claude-display: could not resolve a Claude session id. Run `claude-display setup` to install the SessionStart hook, then restart this Claude session.",
          },
        ],
        isError: true,
      };
    }

    const { port } = await ensureHttpServer();
    const result = await pushToServer({
      sessionId,
      html: args.html,
      title: args.title,
      kind: args.kind,
      port,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `pushed #${result.index} → ${result.url}`,
        },
      ],
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[claude-display mcp] fatal:", err);
  process.exit(1);
});
