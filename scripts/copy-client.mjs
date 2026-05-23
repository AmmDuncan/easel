import { cpSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, "../src/client");
const dst = resolve(__dirname, "../dist/client");

mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
console.log(`[easel] copied client → ${dst}`);

// Syntax-check the client JS. These files are plain browser JS copied as-is
// (not run through tsc), so a stray backtick inside a CSS comment embedded in
// a template literal — which silently corrupts buildDefaultWrapper and blanks
// every card at runtime — would otherwise ship undetected. node --check
// catches that class of error at build time.
for (const file of ["viewer.js", "index.js"]) {
  const path = resolve(dst, file);
  try {
    execFileSync(process.execPath, ["--check", path], { stdio: "pipe" });
  } catch (err) {
    console.error(`[easel] SYNTAX ERROR in client/${file}:`);
    console.error(err.stderr?.toString() || err.message);
    process.exit(1);
  }
}
console.log(`[easel] client JS syntax OK`);
