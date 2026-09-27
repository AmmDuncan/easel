import express, { type Request, type Response, type NextFunction } from "express";
import { existsSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
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
import { DATA_ROOT, DEFAULT_PROJECT_ROOTS, TOKEN_FILE, WALKS_DIR, resolvePort } from "./paths.js";
import { inlineRemoteImages } from "./inline-images.js";
import { createWalk, findWalk, listProjects, listWalks, saveProgress, saveWalk, walkProjectPath } from "./walk-store.js";
import { parseWalkInput, type WalkAsk, type WalkStep } from "./walk-types.js";
import { resolveProject } from "./project.js";
import { isAllowedOrigin, readOrCreateToken } from "./token.js";
import { buildAskPrompt, parseAskOutput, runAsk } from "./walk-ask.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = resolve(__dirname, "client");

type SseClient = {
  id: number;
  sessionId: string;
  res: Response;
};

// `readConfig()` (config-store.ts) coerces its return to the strict
// `DisplayConfig` shape ({preset,theme,density}) and drops unknown keys, so
// `panel.projectRoots` never survives it. Read the raw config file directly
// for that one key instead of widening `readConfig`'s public type.
function readPanelProjectRoots(): string[] {
  const path = join(DATA_ROOT, "config.json");
  if (!existsSync(path)) {
    return DEFAULT_PROJECT_ROOTS;
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as { panel?: { projectRoots?: unknown } };
    const roots = raw.panel?.projectRoots;
    if (Array.isArray(roots) && roots.every((r) => typeof r === "string")) {
      return roots as string[];
    }
  } catch {
    /* fall through to default */
  }
  return DEFAULT_PROJECT_ROOTS;
}

const clients = new Map<number, SseClient>();
let nextClientId = 1;

// SEPARATE from `clients`: global listeners on `/events` (the walks panel)
// must never be counted as session tabs by `/api/push`'s sessionTabs/otherTabs
// (MCP auto-open logic depends on those counts staying session-scoped).
const globalClients = new Map<number, Response>();

// One ask per walk at a time (Plan 4 constraint): a walk id in this set has an
// ask in flight, guarding against a second request racing it.
const askLocks = new Set<string>();

function broadcastGlobal(event: string, payload: unknown): void {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of globalClients.values()) {
    try {
      res.write(data);
    } catch {
      /* client gone */
    }
  }
}

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

function renderPanelHtml(port: number, token: string): string {
  const tpl = readFileSync(resolve(CLIENT_DIR, "panel.html"), "utf-8");
  return tpl.replace(/__PORT__/g, String(port)).replace(/__TOKEN__/g, token);
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
    const { sessionId, html, title, kind, theme } = req.body ?? {};
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

    const push = appendPush(sessionId, { html: storedHtml, title, kind, theme });
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

  const walkToken = readOrCreateToken(TOKEN_FILE);
  const requireWalkToken = (req: Request, res: Response, next: NextFunction) => {
    if (!isAllowedOrigin(req.get("origin"), port) || req.get("x-easel-token") !== walkToken) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };

  app.get(["/panel", "/panel/p/:slug", "/panel/w/:id"], (_req, res) => {
    res.type("html").send(renderPanelHtml(port, walkToken));
  });

  app.get("/events", (req: Request, res: Response) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.write(`event: hello\ndata: {}\n\n`);
    const id = nextClientId++;
    globalClients.set(id, res);
    const ka = setInterval(() => {
      try {
        res.write(`: keep-alive ${Date.now()}\n\n`);
      } catch {
        /* ignore */
      }
    }, 25_000);
    req.on("close", () => {
      clearInterval(ka);
      globalClients.delete(id);
    });
  });

  app.post("/api/walks", requireWalkToken, (req: Request, res: Response) => {
    const { sessionId, cwd, walk } = req.body ?? {};
    const parsed = parseWalkInput(walk);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const roots = readPanelProjectRoots();
    const project = resolveProject(typeof cwd === "string" ? cwd : null, roots, homedir());
    const created = createWalk(WALKS_DIR, parsed.walk, project, {
      sessionId: typeof sessionId === "string" ? sessionId : null,
      cwd: typeof cwd === "string" ? cwd : null,
    });
    broadcastGlobal("walk", { project: project.slug, walkId: created.id, title: created.title });
    res.status(201).json({
      id: created.id, project: project.slug, url: `/panel/w/${created.id}`, globalClients: globalClients.size,
    });
  });

  app.get("/api/projects", (_req, res) => {
    res.json(listProjects(WALKS_DIR));
  });

  app.get("/api/projects/:slug/walks", (req, res) => {
    const list = listWalks(WALKS_DIR, String(req.params.slug));
    if (!list) {
      res.status(404).json({ error: "unknown project" });
      return;
    }
    res.json(list);
  });

  app.get("/api/walks/:id", (req, res) => {
    const found = findWalk(WALKS_DIR, String(req.params.id));
    if (!found) {
      res.status(404).json({ error: "unknown walk" });
      return;
    }
    res.json(found);
  });

  app.put("/api/walks/:id/progress", requireWalkToken, (req, res) => {
    const { walkId: _ignored, ...patch } = req.body ?? {};
    const next = saveProgress(WALKS_DIR, String(req.params.id), patch);
    if (!next) {
      res.status(404).json({ error: "unknown walk" });
      return;
    }
    broadcastGlobal("progress", { walkId: next.walkId });
    res.json(next);
  });

  app.post("/api/walks/:id/ask", requireWalkToken, async (req: Request, res: Response) => {
    const walkId = String(req.params.id);
    const found = findWalk(WALKS_DIR, walkId);
    if (!found) {
      res.status(404).json({ error: "unknown walk" });
      return;
    }
    const { stepId, question } = req.body ?? {};
    const q = typeof question === "string" ? question.trim() : "";
    if (!q || q.length > 500) {
      res.status(400).json({ error: "question must be 1..500 characters" });
      return;
    }
    const step = found.walk.steps.find((s) => s.id === stepId);
    if (typeof stepId !== "string" || !step) {
      res.status(400).json({ error: "unknown stepId" });
      return;
    }
    if (askLocks.has(walkId)) {
      res.status(409).json({ error: "An answer is already on its way for this walk." });
      return;
    }
    askLocks.add(walkId);
    try {
      const bin = process.env.EASEL_CLAUDE_BIN || "claude";
      const projectPath = walkProjectPath(WALKS_DIR, found.walk.project);
      const cwd = (found.walk.cwd && existsSync(found.walk.cwd))
        ? found.walk.cwd
        : (projectPath && existsSync(projectPath) ? projectPath : tmpdir());
      const prompt = buildAskPrompt(found.walk, step, q);
      const startedAt = Date.now();
      const result = await runAsk({ bin, cwd, prompt, timeoutMs: 90_000 });
      const ms = Date.now() - startedAt;

      const logAsk = (outcome: WalkAsk["outcome"], error?: string) => {
        const asks: WalkAsk[] = [
          ...(found.walk.asks ?? []),
          { stepId, question: q, at: startedAt, ms, outcome, ...(error ? { error } : {}) },
        ];
        saveWalk(WALKS_DIR, { ...found.walk, asks });
      };

      if (!result.ok) {
        logAsk(result.timeout ? "timeout" : "error", result.error);
        res.status(502).json({ error: result.error });
        return;
      }

      const parsed = parseAskOutput(result.stdout);
      if (!parsed) {
        logAsk("error", "unparseable output");
        res.status(502).json({ error: "unparseable output" });
        return;
      }

      const childCount = found.walk.steps.filter((s) => s.parent === stepId).length;
      const newStep: WalkStep = {
        id: `${stepId}-a${childCount + 1}`,
        parent: stepId,
        asked: true,
        name: q,
        takeaway: parsed.takeaway,
        body_html: parsed.body_html,
        slower_html: "",
        why_html: "",
        sources: parsed.sources,
      };
      let insertAt = found.walk.steps.length;
      for (let i = found.walk.steps.length - 1; i >= 0; i--) {
        const s = found.walk.steps[i];
        if (s.id === stepId || s.parent === stepId) {
          insertAt = i + 1;
          break;
        }
      }
      const steps = [...found.walk.steps];
      steps.splice(insertAt, 0, newStep);
      const asks: WalkAsk[] = [...(found.walk.asks ?? []), { stepId, question: q, at: startedAt, ms, outcome: "ok" }];
      saveWalk(WALKS_DIR, { ...found.walk, steps, asks });
      broadcastGlobal("changed", { walkId, project: found.walk.project });
      res.json({ step: newStep });
    } finally {
      askLocks.delete(walkId);
    }
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
