#!/usr/bin/env node
// Test double for the `claude` CLI, driven by env vars:
// - FAKE_CLAUDE_MODE: ok (default) | fail | hang | garbage | slow
// - FAKE_CLAUDE_STDIN_OUT: if set, the received stdin is written verbatim here.
// - FAKE_ROSTER: JSON printed for `claude agents --json` (default "[]").
// - FAKE_SESSION: answer | silent — how the originating session reacts to a sent question.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const mode = process.env.FAKE_CLAUDE_MODE || "ok";
const args = process.argv.slice(2);

if (args[0] === "agents") {
  process.stdout.write(process.env.FAKE_ROSTER || "[]");
  process.exit(0);
}

const sendPrompt = args.find((a) => a.includes("Call the SendMessage tool"));
if (sendPrompt) {
  const askId = sendPrompt.match(/askId \\?"([0-9a-f-]+)/)?.[1];
  if (process.env.FAKE_SESSION === "answer" && askId) {
    const token = readFileSync(join(process.env.HOME, ".easel", "token"), "utf-8").trim();
    await fetch(`http://127.0.0.1:${process.env.EASEL_PORT}/api/asks/${askId}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-easel-token": token },
      body: JSON.stringify({ takeaway: "From the session that made it.", points: [{ label: "Why", text: "It knows the work." }], sources: [] }),
    });
  }
  process.stdout.write(JSON.stringify({ type: "result", is_error: false, result: "sent" }));
  process.exit(0);
}

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

  if (mode === "structured") {
    const answer = {
      takeaway: "Each word is one check the service runs on a pass: is it genuine, who made it, and who it is for.",
      points: [
        { label: "Signature", text: "A stamp only Auth0 can make, so a forged pass fails the check." },
        { label: "Issuer", text: "Who printed the pass. Only our Auth0 tenant is accepted." },
        { label: "Audience", text: "Who the pass is for. Isaac's pass says webwiz-api, so other services refuse it." },
      ],
      example: "Isaac's pass from our Auth0, made for webwiz-api, passes all three checks.",
      unsure: "Not checked which of the three JwtValidation.java actually runs; ask Harold.",
      sources: [{ label: "Login check", ref: "src/main/java/JwtValidation.java" }],
    };
    setTimeout(() => {
      process.stdout.write(JSON.stringify({ type: "result", is_error: false, result: JSON.stringify(answer) }));
      process.exit(0);
    }, Number(process.env.FAKE_DELAY_MS) || 0);
    return;
  }

  if (mode === "slow") {
    setTimeout(ok, 800);
    return;
  }

  ok();
});
