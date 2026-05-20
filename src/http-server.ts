import express, { type Request, type Response } from "express";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendPush,
  getSessionView,
  registerSession,
  sessionExists,
  sweepIdleSessions,
  touchSession,
} from "./session-store.js";
import { clearLockIfMine, writeLock } from "./server-manager.js";
import { DEFAULT_PORT } from "./paths.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = resolve(__dirname, "client");

type SseClient = {
  id: number;
  sessionId: string;
  res: Response;
};

const clients = new Map<number, SseClient>();
let nextClientId = 1;

function broadcast(sessionId: string, event: string, payload: unknown): void {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const c of clients.values()) {
    if (c.sessionId === sessionId) {
      try {
        c.res.write(data);
      } catch {
        /* client gone — cleanup on next disconnect */
      }
    }
  }
}

function renderViewerHtml(sessionId: string, port: number): string {
  const tpl = readFileSync(resolve(CLIENT_DIR, "viewer.html"), "utf-8");
  return tpl
    .replace(/__SESSION_ID__/g, sessionId)
    .replace(/__PORT__/g, String(port));
}

export function startHttpServer(): void {
  const port = Number(process.env.CLAUDE_DISPLAY_PORT) || DEFAULT_PORT;
  const app = express();
  app.use(express.json({ limit: "8mb" }));
  app.use(
    "/static",
    express.static(CLIENT_DIR, {
      fallthrough: false,
      maxAge: "0",
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ ok: true, pid: process.pid, port });
  });

  app.get("/", (_req, res) => {
    res
      .status(200)
      .type("text/plain")
      .send(
        "claude-display is running. Open /s/<session-id> for a session feed.",
      );
  });

  app.get("/s/:id", (req: Request, res: Response) => {
    const id = String(req.params.id);
    registerSession(id);
    res.type("text/html").send(renderViewerHtml(id, port));
  });

  app.get("/s/:id/state", (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!sessionExists(id)) {
      registerSession(id);
    }
    res.json(getSessionView(id));
  });

  app.get("/s/:id/events", (req: Request, res: Response) => {
    const id = String(req.params.id);
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.write(`event: hello\ndata: ${JSON.stringify({ sessionId: id })}\n\n`);

    const client: SseClient = { id: nextClientId++, sessionId: id, res };
    clients.set(client.id, client);

    const ka = setInterval(() => {
      try {
        res.write(`: keep-alive ${Date.now()}\n\n`);
      } catch {
        /* ignore */
      }
    }, 25_000);

    req.on("close", () => {
      clearInterval(ka);
      clients.delete(client.id);
    });
  });

  app.post("/api/push", (req: Request, res: Response) => {
    const { sessionId, html, title, kind } = req.body ?? {};
    if (typeof sessionId !== "string" || !sessionId.trim()) {
      res.status(400).json({ error: "sessionId required" });
      return;
    }
    if (typeof html !== "string" || !html.length) {
      res.status(400).json({ error: "html required" });
      return;
    }
    const push = appendPush(sessionId, { html, title, kind });
    touchSession(sessionId);
    broadcast(sessionId, "push", push);

    if (Math.random() < 0.05) {
      sweepIdleSessions();
    }

    res.json({
      url: `http://localhost:${port}/s/${sessionId}`,
      slide_id: push.id,
      index: push.index,
    });
  });

  const server = app.listen(port, "127.0.0.1", () => {
    writeLock(port);
    sweepIdleSessions();
  });

  const shutdown = () => {
    clearLockIfMine();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  process.on("exit", clearLockIfMine);
}
