#!/usr/bin/env node
// Standalone lint for a walk JSON file. No imports from dist, no deps.
// Usage: node walk-lint.mjs <walk.json>
// Prints "WALK OK" and exits 0, or one "step <id>: <problem>" / "<field>: <problem>"
// line per problem and exits 1.

import { readFileSync } from "node:fs";

const LIMITS = { steps: 12, map: 12, check: 3, recap: 5, actions: 20 };
const KINDS = new Set(["prd", "trd", "flow", "research", "mixed"]);
const HTML_FIELDS = ["body_html", "picture_html", "example_html", "slower_html", "why_html"];

function isNonEmptyString(v) {
  return typeof v === "string" && v.length > 0;
}

function countWords(s) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function checkOneSentence(s) {
  const trimmed = s.trim();
  // Look for terminal punctuation followed by whitespace and a capital letter,
  // anywhere before the very end of the string.
  const body = trimmed.slice(0, -1);
  return !/[.?!]\s+[A-Z]/.test(body) && !/[.?!]\s+[A-Z]/.test(trimmed);
}

function isPureWhy(step) {
  const name = (step.name || "").trim();
  const takeaway = (step.takeaway || "").trim();
  return /^why/i.test(name) || /^why/i.test(takeaway);
}

function findFirstScriptOrUnsafe(html) {
  if (typeof html !== "string" || html.length === 0) {
    return null;
  }
  if (/<script/i.test(html)) {
    return "<script";
  }
  if (/\son[a-z]+\s*=/i.test(html)) {
    return "on*= attribute";
  }
  if (/<link/i.test(html)) {
    return "<link";
  }
  if (/<iframe/i.test(html)) {
    return "<iframe";
  }
  if (/javascript:/i.test(html)) {
    return "javascript:";
  }
  return null;
}

function checkCompareTables(html, problems, where) {
  if (typeof html !== "string") {
    return;
  }
  const tableRe = /<table[^>]*class="[^"]*\bwk-compare\b[^"]*"[^>]*>([\s\S]*?)<\/table>/gi;
  let m;
  while ((m = tableRe.exec(html))) {
    const tableHtml = m[1];
    const headerMatch = tableHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
    let cellCount = 0;
    if (headerMatch) {
      cellCount = (headerMatch[1].match(/<th[\s>]/gi) || []).length;
    } else {
      const firstRow = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
      if (firstRow) {
        cellCount = (firstRow[1].match(/<td[\s>]/gi) || []).length;
      }
    }
    if (cellCount > 4) {
      problems.push(`${where}: wk-compare table has ${cellCount} columns, max 4`);
    }
  }
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: walk-lint.mjs <walk.json>");
    process.exit(1);
  }

  let raw;
  try {
    raw = readFileSync(file, "utf-8");
  } catch (e) {
    console.log(`file: cannot read ${file} (${e.message})`);
    process.exit(1);
  }

  let walk;
  try {
    walk = JSON.parse(raw);
  } catch (e) {
    console.log(`file: invalid JSON (${e.message})`);
    process.exit(1);
  }

  const problems = [];

  if (!isNonEmptyString(walk.title)) {
    problems.push("title: required non-empty string");
  }
  if (!KINDS.has(walk.kind)) {
    problems.push(`kind: must be one of prd|trd|flow|research|mixed, got "${walk.kind}"`);
  }

  const orient = walk.orient;
  if (!orient || typeof orient !== "object") {
    problems.push("orient: required object");
  } else {
    if (!isNonEmptyString(orient.question)) {
      problems.push("orient.question: required non-empty string");
    }
    if (!isNonEmptyString(orient.answer)) {
      problems.push("orient.answer: required non-empty string");
    } else if (countWords(orient.answer) > 15) {
      problems.push(`orient.answer: ${countWords(orient.answer)} words, max 15`);
    }
    if (typeof orient.minutes !== "number" || !(orient.minutes > 0)) {
      problems.push("orient.minutes: required number > 0");
    }
    if (!Array.isArray(orient.map)) {
      problems.push("orient.map: required array");
    } else if (orient.map.length > LIMITS.map) {
      problems.push(`orient.map: ${orient.map.length} items, max ${LIMITS.map}`);
    }
  }

  const steps = Array.isArray(walk.steps) ? walk.steps : null;
  if (!steps) {
    problems.push("steps: required array");
  } else {
    if (steps.length < 1 || steps.length > LIMITS.steps) {
      problems.push(`steps: ${steps.length} steps, must be 1..${LIMITS.steps}`);
    }
    const seenIds = new Set();
    for (const step of steps) {
      const id = step && step.id;
      const label = isNonEmptyString(id) ? id : "?";
      if (!isNonEmptyString(id)) {
        problems.push(`step ${label}: id is required`);
      } else if (seenIds.has(id)) {
        problems.push(`step ${id}: duplicate step id`);
      } else {
        seenIds.add(id);
      }
      if (!isNonEmptyString(step.name)) {
        problems.push(`step ${label}: name is required`);
      }
      if (!isNonEmptyString(step.takeaway)) {
        problems.push(`step ${label}: takeaway is required`);
      } else {
        if (step.takeaway.length > 160) {
          problems.push(`step ${label}: takeaway is ${step.takeaway.length} chars, max 160`);
        }
        if (!checkOneSentence(step.takeaway)) {
          problems.push(`step ${label}: takeaway is 2 sentences`);
        }
      }
      if (typeof step.body_html !== "string") {
        problems.push(`step ${label}: body_html is required`);
      }
      if (typeof step.slower_html !== "string") {
        problems.push(`step ${label}: slower_html is required`);
      }
      if (typeof step.why_html !== "string") {
        problems.push(`step ${label}: why_html is required`);
      }
      if (!Array.isArray(step.sources)) {
        problems.push(`step ${label}: sources is required`);
      } else if (step.sources.length < 1) {
        problems.push(`step ${label}: needs at least 1 source`);
      }
      if (!isPureWhy(step) && !isNonEmptyString(step.picture_html)) {
        problems.push(`step ${label}: picture_html is required (not a pure-why step)`);
      }
      for (const field of HTML_FIELDS) {
        const html = step[field];
        const bad = findFirstScriptOrUnsafe(html);
        if (bad) {
          problems.push(`step ${label}: ${field} contains unsafe markup (${bad})`);
        }
        checkCompareTables(html, problems, `step ${label}: ${field}`);
      }
    }
    if (orient && Array.isArray(orient.map)) {
      for (const m of orient.map) {
        if (m && !seenIds.has(m.stepId)) {
          problems.push(`orient.map: stepId "${m.stepId}" matches no step`);
        }
      }
    }
  }

  if (!Array.isArray(walk.check)) {
    problems.push("check: required array");
  } else if (walk.check.length > LIMITS.check) {
    problems.push(`check: ${walk.check.length} items, max ${LIMITS.check}`);
  }
  if (!Array.isArray(walk.recap)) {
    problems.push("recap: required array");
  } else if (walk.recap.length > LIMITS.recap) {
    problems.push(`recap: ${walk.recap.length} items, max ${LIMITS.recap}`);
  }
  if (!Array.isArray(walk.actions)) {
    problems.push("actions: required array");
  } else if (walk.actions.length > LIMITS.actions) {
    problems.push(`actions: ${walk.actions.length} items, max ${LIMITS.actions}`);
  }
  if (!Array.isArray(walk.sources)) {
    problems.push("sources: required array");
  }

  if (problems.length === 0) {
    console.log("WALK OK");
    process.exit(0);
  }

  for (const p of problems) {
    console.log(p);
  }
  process.exit(1);
}

main();
