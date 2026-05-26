import express, { type Request, type Response } from "express";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendPush,
  deletePush,
  deleteSession,
  getSessionView,
  listSessionSummaries,
  registerSession,
  sessionExists,
  sweepIdleSessions,
  touchSession,
  updateSessionMeta,
} from "./session-store.js";
import { readConfig, writeConfig } from "./config-store.js";
import { clearLockIfMine, writeLock } from "./server-manager.js";
import { resolvePort } from "./paths.js";
import { inlineRemoteImages } from "./inline-images.js";

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

function broadcastAll(event: string, payload: unknown): void {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const c of clients.values()) {
    try {
      c.res.write(data);
    } catch {
      /* swallow */
    }
  }
}

function renderViewerHtml(sessionId: string, port: number): string {
  const tpl = readFileSync(resolve(CLIENT_DIR, "viewer.html"), "utf-8");
  return tpl
    .replace(/__SESSION_ID__/g, sessionId)
    .replace(/__PORT__/g, String(port));
}

function renderIndexHtml(port: number): string {
  const tpl = readFileSync(resolve(CLIENT_DIR, "index.html"), "utf-8");
  return tpl.replace(/__PORT__/g, String(port));
}

export function startHttpServer(): void {
  const port = resolvePort();
  const app = express();
  app.use(express.json({ limit: "8mb" }));
  app.use(
    "/static",
    express.static(CLIENT_DIR, {
      fallthrough: false,
      maxAge: "0",
      etag: true,
      lastModified: true,
      // Force the browser to revalidate the client JS/CSS on every load (via
      // ETag) instead of serving a stale cached copy. Without this a plain
      // reload after an easel update keeps the old viewer.js — the user has to
      // hard-reload (⌘⇧R) to pick up new styles, which has bitten us. `no-cache`
      // means "cached copy is fine ONLY after revalidating it's unchanged".
      setHeaders: (res) => {
        res.setHeader("Cache-Control", "no-cache");
      },
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ ok: true, pid: process.pid, port });
  });

  app.get("/", (_req, res) => {
    res.type("text/html").send(renderIndexHtml(port));
  });

  app.get("/api/presence", (_req, res) => {
    res.json({ tabs: clients.size });
  });

  app.get("/api/sessions", (_req, res) => {
    res.json({ sessions: listSessionSummaries() });
  });

  app.get("/api/config", (_req, res) => {
    res.json({ config: readConfig() });
  });

  app.post("/api/config", (req, res) => {
    const { preset, theme, density } = req.body ?? {};
    const patch: { preset?: string; theme?: string; density?: string } = {};
    if (typeof preset === "string") patch.preset = preset;
    if (typeof theme === "string") patch.theme = theme;
    if (typeof density === "string") patch.density = density;
    const next = writeConfig(
      patch as { preset?: never; theme?: never; density?: never },
    );
    broadcastAll("config", next);
    res.json({ config: next });
  });

  app.post("/api/register", (req, res) => {
    const { sessionId, cwd, label } = req.body ?? {};
    if (typeof sessionId !== "string" || !sessionId.trim()) {
      res.status(400).json({ error: "sessionId required" });
      return;
    }
    registerSession(sessionId);
    const patch: { cwd?: string | null; label?: string | null } = {};
    if (typeof cwd === "string") patch.cwd = cwd;
    if (typeof label === "string") patch.label = label;
    const meta = Object.keys(patch).length
      ? updateSessionMeta(sessionId, patch)
      : getSessionView(sessionId).meta;
    res.json({ ok: true, meta });
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
    res.write(
      `event: hello\ndata: ${JSON.stringify({ sessionId: id, config: readConfig() })}\n\n`,
    );

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

  app.delete("/api/sessions/:id/pushes/:pushId", (req, res) => {
    const id = String(req.params.id);
    const pushId = String(req.params.pushId);
    const ok = deletePush(id, pushId);
    if (ok) broadcast(id, "remove", { pushId });
    res.json({ ok });
  });

  app.delete("/api/sessions/:id", (req, res) => {
    const id = String(req.params.id);
    const ok = deleteSession(id);
    res.json({ ok });
  });

  app.post("/api/push", async (req: Request, res: Response) => {
    const { sessionId, html, title, kind } = req.body ?? {};
    if (typeof sessionId !== "string" || !sessionId.trim()) {
      res.status(400).json({ error: "sessionId required" });
      return;
    }
    if (typeof html !== "string" || !html.length) {
      res.status(400).json({ error: "html required" });
      return;
    }

    // Inline remote images server-side so the stored push is self-contained
    // and exportable (cross-origin images are CORS-blocked from client-side
    // rasterisation). Best-effort: on any failure we store the original html.
    let storedHtml = html;
    if (process.env.EASEL_INLINE_IMAGES !== "0") {
      try {
        const result = await inlineRemoteImages(html);
        storedHtml = result.html;
        if (result.failed.length > 0) {
          console.warn(
            `[easel] ${result.failed.length} remote image(s) left un-inlined (won't export): ` +
              result.failed.map((f) => `${f.url} — ${f.reason}`).join("; "),
          );
        }
      } catch (err) {
        console.warn("[easel] image inlining failed; storing original html:", err);
      }
    }

    const push = appendPush(sessionId, { html: storedHtml, title, kind });
    touchSession(sessionId);
    broadcast(sessionId, "push", push);

    if (Math.random() < 0.05) {
      sweepIdleSessions();
    }

    let sessionTabs = 0;
    let otherTabs = 0;
    for (const c of clients.values()) {
      if (c.sessionId === sessionId) {
        sessionTabs++;
      } else {
        otherTabs++;
      }
    }

    res.json({
      url: `http://localhost:${port}/s/${sessionId}`,
      slide_id: push.id,
      index: push.index,
      sessionTabs,
      otherTabs,
    });
  });

  const server = app.listen(port, "127.0.0.1", () => {
    writeLock(port);
    sweepIdleSessions();
  });

  // Periodic GC of idle sessions every 10 minutes (in addition to the
  // probabilistic sweep on each push). Without this, low-traffic servers
  // can hoard sessions long past the 24h TTL.
  const sweepTimer = setInterval(() => {
    try {
      sweepIdleSessions();
    } catch {
      /* swallow */
    }
  }, 10 * 60 * 1000);
  sweepTimer.unref();

  const shutdown = () => {
    clearLockIfMine();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  process.on("exit", clearLockIfMine);
}
