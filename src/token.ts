import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function readOrCreateToken(file: string): string {
  if (existsSync(file)) {
    const t = readFileSync(file, "utf-8").trim();
    if (/^[0-9a-f]{64}$/.test(t)) {
      return t;
    }
  }
  mkdirSync(dirname(file), { recursive: true });
  const t = randomBytes(32).toString("hex");
  writeFileSync(file, t, { mode: 0o600 });
  return t;
}

export function isAllowedOrigin(origin: string | undefined, port: number): boolean {
  if (origin === undefined) {
    return true;
  }
  return origin === `http://localhost:${port}` || origin === `http://127.0.0.1:${port}`;
}
