#!/usr/bin/env node
/**
 * diagram-lint — render an easel push/demo HTML file and MEASURE label fit,
 * replacing the "budget 8.5px per character" hand rule.
 *
 * Checks, per <svg> in the file:
 *   1. escape   — a <text> (or .d-note) leaking outside its svg's box
 *   2. clearance— a <text> whose box it sits inside leaves <12px side inset
 *   3. straddle — a <text> half-in half-out of a .d-box/.d-actor/.d-region
 *                 (skipped for .d-elabel/.d-step, which sit on edges by design —
 *                  but ONLY that check: they still get the ones below)
 *   4. collide  — two text labels overlapping each other
 *   5. halo-on-fill — a .d-elabel fully INSIDE a filled box (its halo paints
 *                 a surface-coloured slab there)
 *   6. crowding — a .d-elabel whose halo stops <8px from a box it doesn't cross
 *   7. typefloor— effective rendered px (font x svgWidth/viewBoxWidth) < 13,
 *                 measured at TWO viewports (1000 and 1440), since an uncapped
 *                 svg rescales its type with the window
 * Plus, page-wide:
 *   8. overflow — any HTML element whose content overflows horizontally
 *
 * Usage:
 *   node diagram-lint.mjs <file.html> [--playwright <dir-containing-node_modules>]
 * Playwright resolution: --playwright dir, $EASEL_PLAYWRIGHT, or a plain
 * `import('playwright')` if it's installed next to the kit.
 * Exit 0 = clean, 1 = violations, 2 = could not run.
 */

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
if (!file || !existsSync(file)) {
  console.error('usage: node diagram-lint.mjs <file.html> [--playwright <dir>]');
  process.exit(2);
}

async function loadPlaywright() {
  const flagIdx = args.indexOf('--playwright');
  const hints = [];
  if (flagIdx !== -1 && args[flagIdx + 1]) hints.push(args[flagIdx + 1]);
  if (process.env.EASEL_PLAYWRIGHT) hints.push(process.env.EASEL_PLAYWRIGHT);
  for (const h of hints) {
    for (const p of [
      resolve(h, 'node_modules/playwright/index.mjs'),
      resolve(h, 'playwright/index.mjs'),
      resolve(h, 'index.mjs'),
    ]) {
      if (existsSync(p)) return import(pathToFileURL(p).href);
    }
  }
  try { return await import('playwright'); }
  catch {
    console.error('playwright not found — pass --playwright <dir> or set $EASEL_PLAYWRIGHT');
    process.exit(2);
  }
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
await page.goto(pathToFileURL(resolve(file)).href);
await page.waitForTimeout(300); // let webfonts settle — metrics differ from fallbacks

const measure = () => page.evaluate(() => {
  const out = [];
  const round = r => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
  const overlap = (a, b) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const label = el => (el.textContent || '').trim().slice(0, 40) || `<${el.tagName}>`;

  document.querySelectorAll('svg').forEach((svg, si) => {
    const svgBox = svg.getBoundingClientRect();
    const texts = [...svg.querySelectorAll('text'), ...svg.querySelectorAll('foreignObject')];
    const boxes = [...svg.querySelectorAll('rect.d-box, rect.d-actor, rect.d-region, rect.d-col')]
      .map(r => ({ el: r, box: r.getBoundingClientRect() }));

    texts.forEach(t => {
      const tb = t.getBoundingClientRect();
      if (tb.width === 0) return;
      const onEdge = t.classList.contains('d-elabel') || t.closest('.d-step');

      if (tb.left < svgBox.left - 1 || tb.right > svgBox.right + 1 ||
          tb.top < svgBox.top - 1 || tb.bottom > svgBox.bottom + 1) {
        out.push({ check: 'escape', svg: si, text: label(t), at: round(tb) });
      }

      const isElabel = t.classList.contains('d-elabel');
      boxes.forEach(({ el, box }) => {
        const inside = tb.left >= box.left && tb.right <= box.right &&
                       tb.top >= box.top && tb.bottom <= box.bottom;
        if (overlap(tb, box)) {
          if (inside && isElabel) {
            out.push({ check: 'halo-on-fill', svg: si, text: label(t), box: el.getAttribute('class') });
          } else if (!inside && !onEdge) {
            out.push({ check: 'straddle', svg: si, text: label(t), box: el.getAttribute('class'), at: round(tb) });
          } else if (inside && !onEdge) {
            const inset = Math.min(tb.left - box.left, box.right - tb.right);
            if (inset < 12) {
              out.push({ check: 'clearance', svg: si, text: label(t), insetPx: Math.round(inset) });
            }
          }
        } else if (isElabel) {
          const halo = { x: tb.x - 6, y: tb.y - 6, width: tb.width + 12, height: tb.height + 12 };
          const pad  = { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 };
          if (overlap(halo, pad)) {
            out.push({ check: 'crowding', svg: si, text: label(t), box: el.getAttribute('class') });
          }
        }
      });

      if (t.tagName === 'text') {
        const vb = svg.viewBox?.baseVal;
        if (vb && vb.width > 0) {
          const scale = svg.getBoundingClientRect().width / vb.width;
          const eff = parseFloat(getComputedStyle(t).fontSize) * scale;
          if (eff < 13) {
            out.push({ check: 'typefloor', svg: si, text: label(t), effectivePx: +eff.toFixed(1), viewport: innerWidth });
          }
        }
      }
    });

    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        if (texts[i].closest('.d-step') && texts[i].closest('.d-step') === texts[j].closest('.d-step')) continue;
        const a = texts[i].getBoundingClientRect(), b = texts[j].getBoundingClientRect();
        if (a.width && b.width && overlap(a, b)) {
          out.push({ check: 'collide', svg: si, a: label(texts[i]), b: label(texts[j]) });
        }
      }
    }
  });

  document.querySelectorAll('body *:not(svg):not(svg *)').forEach(el => {
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 &&
        getComputedStyle(el).overflowX !== 'hidden') {
      out.push({ check: 'overflow', el: el.className || el.tagName, by: el.scrollWidth - el.clientWidth });
    }
  });
  return out;
});

const findings = await measure();
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(150);
const wide = await measure();
findings.push(...wide.filter(f => f.check === 'typefloor'));

await browser.close();

if (findings.length === 0) {
  console.log(`diagram-lint: ${file} — clean`);
  process.exit(0);
}
console.log(`diagram-lint: ${file} — ${findings.length} violation(s)`);
for (const f of findings) console.log(' ', JSON.stringify(f));
process.exit(1);
