import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sampleWalk } from "./walk-validate.test.mjs";

const PNG = Buffer.from("iVBORw0KGgo=", "base64");

let imageServer;
let imageUrl;

before(async () => {
  imageServer = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "image/png" });
    res.end(PNG);
  });
  await new Promise((resolve) => imageServer.listen(0, "127.0.0.1", resolve));
  imageUrl = `http://127.0.0.1:${imageServer.address().port}/pic.png`;
});

after(() => imageServer.close());

function walkWithRemoteImage() {
  const w = sampleWalk(1);
  w.steps[0].body_html = `<p>see <img src="${imageUrl}"></p>`;
  return w;
}

async function startServer(inlineImages) {
  const home = mkdtempSync(join(tmpdir(), "easel-inline-http-"));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["dist/http-entry.js"], {
    env: { ...process.env, HOME: home, EASEL_PORT: String(port), EASEL_INLINE_IMAGES: inlineImages },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  const token = readFileSync(join(home, ".easel", "token"), "utf-8").trim();
  return { child, base, token };
}

async function postWalk(base, token, walk) {
  const r = await fetch(`${base}/api/walks`, {
    method: "POST", headers: { "content-type": "application/json", "x-easel-token": token },
    body: JSON.stringify({ walk }),
  });
  assert.equal(r.status, 201);
  const { id } = await r.json();
  return (await (await fetch(`${base}/api/walks/${id}`)).json()).walk;
}

test("default (inlining on) rewrites a remote step image to a data: URL", async () => {
  const { child, base, token } = await startServer("1");
  try {
    const stored = await postWalk(base, token, walkWithRemoteImage());
    assert.match(stored.steps[0].body_html, /src="data:image\/png;base64,/);
  } finally {
    child.kill();
  }
});

test("EASEL_INLINE_IMAGES=0 stores the walk html unchanged", async () => {
  const { child, base, token } = await startServer("0");
  try {
    const walk = walkWithRemoteImage();
    const stored = await postWalk(base, token, walk);
    assert.equal(stored.steps[0].body_html, walk.steps[0].body_html);
    assert.ok(stored.steps[0].body_html.includes(imageUrl));
  } finally {
    child.kill();
  }
});
