import { existsSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import type { ProjectInfo } from "./walk-types.js";

export function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "misc";
}

function expandHome(p: string, home: string): string {
  return p.startsWith("~") ? join(home, p.slice(1)) : p;
}

function gitTopLevel(start: string): string | null {
  let dir = start;
  while (true) {
    if (existsSync(join(dir, ".git"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

function info(path: string): ProjectInfo {
  const label = basename(path);
  return { slug: slugify(label), label, path };
}

/** cwd -> project: first folder under a workspace root, else git top level, else cwd. */
export function resolveProject(cwd: string | null, roots: string[], home: string): ProjectInfo {
  if (!cwd) {
    return { slug: "misc", label: "misc", path: "" };
  }
  const abs = resolve(cwd);
  for (const r of roots) {
    const root = resolve(expandHome(r, home));
    const rel = relative(root, abs);
    if (rel && !rel.startsWith("..") && !rel.startsWith(sep)) {
      return info(join(root, rel.split(sep)[0]));
    }
  }
  return info(gitTopLevel(abs) ?? abs);
}
