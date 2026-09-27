import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readOrCreateToken, isAllowedOrigin } from "../../dist/token.js";

test("token is created once, 0600, stable", () => {
  const f = join(mkdtempSync(join(tmpdir(), "tok-")), "token");
  const a = readOrCreateToken(f);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(readOrCreateToken(f), a);
  assert.equal(statSync(f).mode & 0o777, 0o600);
});

test("origin allow-list", () => {
  assert.equal(isAllowedOrigin(undefined, 7878), true);
  assert.equal(isAllowedOrigin("http://localhost:7878", 7878), true);
  assert.equal(isAllowedOrigin("http://127.0.0.1:7878", 7878), true);
  assert.equal(isAllowedOrigin("https://evil.example", 7878), false);
  assert.equal(isAllowedOrigin("http://localhost:9999", 7878), false);
  assert.equal(isAllowedOrigin("null", 7878), false);
});
