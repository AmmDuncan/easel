import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveProject } from "../../dist/project.js";

const home = mkdtempSync(join(tmpdir(), "easel-proj-"));
const roots = ["~/work/studios", "~/work/tools"];
const dvla = join(home, "work/studios/dvla");
mkdirSync(join(dvla, "dvla-self-service/.git"), { recursive: true });
mkdirSync(join(dvla, "dvla-self-service/src/pages"), { recursive: true });
const other = join(home, "code/thing");
mkdirSync(join(other, ".git"), { recursive: true });
mkdirSync(join(other, "lib"), { recursive: true });

test("root child is the project", () => {
  assert.equal(resolveProject(dvla, roots, home).slug, "dvla");
});

test("deep inside a sub-repo under a root still resolves to the root child", () => {
  const p = resolveProject(join(dvla, "dvla-self-service/src/pages"), roots, home);
  assert.equal(p.slug, "dvla");
  assert.equal(p.path, dvla);
});

test("outside roots uses the git top level", () => {
  const p = resolveProject(join(other, "lib"), roots, home);
  assert.equal(p.slug, "thing");
  assert.equal(p.path, other);
});

test("outside roots and no git uses the cwd", () => {
  const plain = join(home, "Desktop/notes");
  mkdirSync(plain, { recursive: true });
  assert.equal(resolveProject(plain, roots, home).slug, "notes");
});

test("null cwd is misc", () => {
  assert.equal(resolveProject(null, roots, home).slug, "misc");
});

test("the root itself is not a project", () => {
  assert.equal(resolveProject(join(home, "work/studios"), roots, home).slug, "studios");
});

const studios = join(home, "work/studios");
for (const d of ["dvla-stores-frontend", "dvla-stores-frontend-worktrees/feat-x", "wellvo-ai", "afcas-payment-system", "afcas-payment-system-worktrees", "max-zip"]) {
  mkdirSync(join(studios, d), { recursive: true });
}
writeFileSync(join(studios, "max"), "");

test("a dashed folder joins the sibling named by its prefix", () => {
  const p = resolveProject(join(studios, "dvla-stores-frontend"), roots, home);
  assert.equal(p.slug, "dvla");
  assert.equal(p.path, dvla);
});

test("the shortest sibling prefix wins", () => {
  assert.equal(resolveProject(join(studios, "dvla-stores-frontend-worktrees/feat-x"), roots, home).slug, "dvla");
});

test("a dashed folder with no bare sibling stays its own project", () => {
  assert.equal(resolveProject(join(studios, "wellvo-ai"), roots, home).slug, "wellvo-ai");
});

test("a worktrees folder joins its repo", () => {
  assert.equal(resolveProject(join(studios, "afcas-payment-system-worktrees"), roots, home).slug, "afcas-payment-system");
});

test("a sibling file with the prefix name does not group", () => {
  assert.equal(resolveProject(join(studios, "max-zip"), roots, home).slug, "max-zip");
});
