/**
 * Export-path regression guard.
 *
 * The bug: html-to-image's toPng/toJpeg/toCanvas resolve via the library's
 * internal createImage(), which waits on requestAnimationFrame. Chrome freezes
 * rAF in hidden/background tabs, so PNG and PDF export hung forever (no
 * timeout, no error) whenever the easel tab wasn't the visible one.
 *
 * The fix stops at htmlToImage.toSvg() (no rAF) and rasterises onto a canvas
 * with a plain Image, whose onload fires in hidden tabs. These tests assert,
 * by reading the built client, that the in-iframe export path never regresses
 * back to the rAF-gated calls and that the parent keeps its watchdog timeout.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const viewer = readFileSync(
  resolve(__dirname, "../../dist/client/viewer.js"),
  "utf8",
);

// Isolate the shared in-iframe export bridge so assertions can't be fooled by
// unrelated mentions of html-to-image elsewhere in the file.
function imageExportBody() {
  const start = viewer.indexOf("function imageExportScript()");
  assert.notEqual(start, -1, "imageExportScript() should exist");
  const end = viewer.indexOf("\n  }", start);
  return viewer.slice(start, end);
}

test("export bridge rasterises via toSvg, not the rAF-gated calls", () => {
  const body = imageExportBody();
  assert.match(body, /\.toSvg\(/, "must use htmlToImage.toSvg()");
  for (const banned of ["toPng", "toJpeg", "toCanvas"]) {
    assert.ok(
      !body.includes(banned),
      `export bridge must not call htmlToImage.${banned} (rAF-gated → hangs in hidden tabs)`,
    );
  }
});

test("export bridge surfaces an error when html-to-image is missing (no silent return)", () => {
  const body = imageExportBody();
  assert.match(
    body,
    /if\(!window\.htmlToImage\)\{fail\(/,
    "missing html-to-image must post image-error, not return silently",
  );
});

test("parent arms an export watchdog timeout so a stall can't spin forever", () => {
  assert.match(viewer, /EXPORT_TIMEOUT_MS/, "watchdog timeout constant present");
  assert.match(viewer, /exportWatchdogs\.set\(/, "watchdog armed on export");
  assert.match(
    viewer,
    /clearExportWatchdog\(data\.pushId\)/,
    "watchdog cleared on image-ready/-error",
  );
});

test("both render paths share the one export bridge (no drift)", () => {
  assert.equal(
    viewer.match(/imageExportScript\(\)/g)?.length,
    3,
    "imageExportScript defined once and referenced by buildDefaultWrapper + injectBridge",
  );
});
