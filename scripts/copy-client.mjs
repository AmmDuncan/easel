import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, "../src/client");
const dst = resolve(__dirname, "../dist/client");

mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
console.log(`[claude-display] copied client → ${dst}`);
