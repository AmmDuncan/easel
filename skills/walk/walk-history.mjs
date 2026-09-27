#!/usr/bin/env node
// Standalone walk-history tracker. No imports from dist, no deps.
// Usage:
//   node walk-history.mjs check <walk.json>
//   node walk-history.mjs add <walk.json>
// History file: ~/.easel/walk-history.jsonl (override with WALK_HISTORY env var).

import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

function historyPath() {
  return process.env.WALK_HISTORY || join(homedir(), ".easel", "walk-history.jsonl");
}

function firstWkClass(html) {
  if (typeof html !== "string" || html.length === 0) {
    return "none";
  }
  const wkMatch = html.match(/\bwk-[a-z]+\b/);
  if (wkMatch) {
    return wkMatch[0];
  }
  if (/<svg/i.test(html)) {
    return "svg";
  }
  return "none";
}

function shapeSequence(walk) {
  const steps = Array.isArray(walk.steps) ? walk.steps : [];
  return steps.map((s) => firstWkClass(s.picture_html));
}

function readEntries() {
  const path = historyPath();
  if (!existsSync(path)) {
    return [];
  }
  const raw = readFileSync(path, "utf-8");
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function sameSequence(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((v, i) => v === b[i]);
}

function loadWalk(file) {
  return JSON.parse(readFileSync(file, "utf-8"));
}

function cmdCheck(file) {
  const walk = loadWalk(file);
  const shapes = shapeSequence(walk);
  const entries = readEntries();
  if (entries.length === 0) {
    console.log("FRESH");
    process.exit(0);
  }
  const prev = entries[entries.length - 1];
  if (prev.title !== walk.title && sameSequence(prev.shapes, shapes)) {
    console.log(`STALE: same picture shapes as "${prev.title}" (${shapes.join(", ")})`);
    process.exit(1);
  }
  console.log("FRESH");
  process.exit(0);
}

function cmdAdd(file) {
  const walk = loadWalk(file);
  const shapes = shapeSequence(walk);
  const entry = {
    date: new Date().toISOString(),
    title: walk.title,
    kind: walk.kind,
    shapes,
  };
  const path = historyPath();
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(entry) + "\n");
}

function main() {
  const [cmd, file] = process.argv.slice(2);
  if (!cmd || !file || !["check", "add"].includes(cmd)) {
    console.error("usage: walk-history.mjs check|add <walk.json>");
    process.exit(1);
  }
  if (cmd === "check") {
    cmdCheck(file);
  } else {
    cmdAdd(file);
  }
}

main();
