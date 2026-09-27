#!/usr/bin/env node
// Test double for the `claude` CLI, driven by env vars:
// - FAKE_CLAUDE_MODE: ok (default) | fail | hang | garbage | slow
// - FAKE_CLAUDE_STDIN_OUT: if set, the received stdin is written verbatim here.
import { writeFileSync } from "node:fs";

const mode = process.env.FAKE_CLAUDE_MODE || "ok";

let stdin = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
  stdin += chunk;
});
process.stdin.on("end", () => {
  if (process.env.FAKE_CLAUDE_STDIN_OUT) {
    writeFileSync(process.env.FAKE_CLAUDE_STDIN_OUT, stdin);
  }

  if (mode === "hang") {
    setInterval(() => {}, 1000); // keep the event loop alive; never exits on its own
    return;
  }

  if (mode === "fail") {
    process.stderr.write("boom");
    process.exit(1);
  }

  if (mode === "garbage") {
    process.stdout.write("not json");
    process.exit(0);
  }

  const ok = () => {
    const envelope = {
      type: "result",
      is_error: false,
      result:
        '```json\n{"takeaway":"No, a second supervisor must approve.","body_html":"<p>Stub answer.</p>","sources":[{"label":"TRD","ref":"docs/trd.md"}]}\n```',
    };
    process.stdout.write(JSON.stringify(envelope));
    process.exit(0);
  };

  if (mode === "slow") {
    setTimeout(ok, 800);
    return;
  }

  ok();
});
