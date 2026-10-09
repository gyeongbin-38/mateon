/** Actual deployed app -> Chromium paint -> PDF -> SVG geometry.
 * No hand-written CSS approximation, no screenshots embedded as whole pages.
 * Browser references + rendered SVGs are compared for every exported state.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import sharp from 'sharp';
import labels from './svg-screen-labels.mjs';

const root = process.cwd();
const baseUrl = process.env.MATEON_SOURCE_URL || 'https://gyeongbin-38.github.io/mateon/';
const artifactDir = path.join(root, 'artifacts');
const screenDir = path.join(artifactDir, 'svg-pages');
const captureDir = path.join(artifactDir, 'svg-fidelity');
const definitions = [
  ['01-home-first-visit', 'home', 'empty'],
  ['01-home-connected', 'home', 'sample'],
  ['02-onboarding', 'onboarding', 'empty'],
  ['03-survey', 'survey', 'empty'],
  ['04-result', 'result', 'sample'],
  ['05-invite-connected', 'invite', 'sample'],
  ['06-compatibility-report', 'report', 'sample'],
  ['07-agreement', 'agreement', 'sample'],
  ['08-type-catalog', 'types', 'sample'],
  ['09-type-detail', 'types', 'sample', 'type'],
  ['10-life-check', 'lifecheck', 'sample'],
  ['11-move-in-checklist', 'checklist', 'sample'],
  ['12-our-space', 'space', 'sample'],
  ['13-settings', 'settings', 'sample'],
  ['14-privacy-policy', 'privacy', 'sample'],
  ['15-terms-of-service', 'terms', 'sample'],
  ['16-today-conversation', 'home', 'sample', 'talk'],
  ['exception-01-empty-conversation', 'home', 'sample', 'empty-talk'],
  ['exception-02-name-required', 'onboarding', 'empty', 'name'],
  ['exception-03-invalid-type-code', 'invite', 'me-only', 'code'],
  ['exception-04-no-partner', 'invite', 'me-only'],
  ['exception-05-empty-rule', 'report', 'sample', 'rule'],
  ['exception-06-reset-warning', 'settings', 'sample', 'reset'],
  ['scroll-home-full', 'home', 'sample', null, true],
  ['scroll-survey-full', 'survey', 'empty', null, true],
  ['scroll-result-full', 'result', 'sample', null, true],
  ['scroll-report-full', 'report', 'sample', null, true],
];
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
await fs.mkdir(captureDir, { recursive: true });
await fs.mkdir(screenDir, { recursive: true });
// Preserve previous manual canvas/source work before replacing generated files.
const backup = path.join(artifactDir, 'svg-before-faithful-export');
try {
  await fs.access(backup);
} catch {
  await fs.cp(screenDir, backup, { recursive: true });
}
const browser = await chromium.launch({ channel: process.env.MATEON_CHROME_CHANNEL || 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 1,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
  colorScheme: 'light',
  serviceWorkers: 'block',
});
const page = await context.newPage();
const verifyContext = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1 });
const verify = await verifyContext.newPage();
const sourceAssets = {};
page.on('response', async (response) => {
  if (response.url().startsWith(baseUrl) && /\.(?:css|js)(?:\?|$)/.test(response.url())) {
    try {
      sourceAssets[response.url()] = createHash('sha256')
        .update(await response.body())
        .digest('hex');
    } catch {}
  }
});
const results = [];
const steadyCss = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}
html{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;scroll-behavior:auto!important}
html,body{width:393px!important;min-width:393px!important;max-width:393px!important}
@page{margin:0}
/* Chromium print repeats transformed negative fixed elements onto a page edge. */
.skip-link:not(:focus){visibility:hidden!important}`;
async function ready() {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}
async function compare(referenceFile, svgFile, outputFile, width, height) {
  await verify.setViewportSize({ width, height });
  const svg = await fs.readFile(svgFile, 'utf8');
  await verify.setContent('<html><body style="margin:0;background:white">' + svg + '</body></html>');
  await verify.screenshot({ path: outputFile });
  const a = await sharp(referenceFile).removeAlpha().raw().toBuffer();
  const b = await sharp(outputFile).removeAlpha().raw().toBuffer();
  if (a.length !== b.length) throw new Error('Comparison dimensions differ');
  let sum = 0,
    changed = 0;
  for (let i = 0; i < a.length; i += 3) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    if (d > 24) changed++;
  }
  return { meanAbsoluteChannelError: +(sum / a.length).toFixed(3), pixelsOver24Percent: +((100 * changed) / (width * height)).toFixed(3) };
}
try {
  await page.goto(baseUrl + '#/home', { waitUntil: 'networkidle' });
  const sample = await page.evaluate(() => JSON.parse(JSON.stringify(SAMPLE_RESULTS)));
  for (const [name, route, mode, action, full] of definitions) {
    if (only && name !== only) continue;
    await page.setViewportSize({ width: 393, height: 852 });
    await page.evaluate(
      ({ mode, sample }) => {
        localStorage.clear();
        localStorage.setItem('ds-theme', 'light');
        if (mode !== 'empty') localStorage.setItem('mateon.me', JSON.stringify({ ...sample.me, ts: Date.now() }));
        if (mode === 'sample') localStorage.setItem('mateon.partner', JSON.stringify({ ...sample.partner, ts: Date.now() }));
      },
      { mode, sample }
    );
    // Reload isolates transient UI, toast timers, form state, and open dialogs.
    await page.goto(baseUrl + '?capture=' + name + '#/' + route, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: steadyCss });
    await page.emulateMedia({ media: 'screen' });
    await ready();
    if (action === 'type') await page.locator('[data-action="type"][data-id="12"]').click();
    if (action === 'talk' || action === 'empty-talk') await page.locator('[data-action="talk-open"]').first().click();
    if (action === 'empty-talk') await page.locator('[data-sheet-save]').click();
    if (action === 'name') await page.locator('[data-action="survey"]').click();
    if (action === 'code') {
      await page.locator('#code-connect-in').fill('E9R9');
      await page.locator('[data-action="code-connect"]').click();
    }
    if (action === 'rule') await page.locator('[data-action="add-rule"]').click();
    if (action === 'reset') await page.locator('[data-action="reset-all"]').click();
    await ready();
    // Freeze only a toast that the scenario actually opened. Prevent expiry
    // between the browser reference and the PDF paint.
    const toast = await page.locator('#toast.show').count();
    if (toast)
      await page.addStyleTag({ content: '#toast{opacity:1!important;transform:translateX(-50%) translateY(0)!important;visibility:visible!important}' });
    let height = 852;
    if (full) {
      height = await page.evaluate(() => Math.max(852, document.documentElement.scrollHeight, document.body.scrollHeight));
      await page.setViewportSize({ width: 393, height });
      await ready();
    }
    if (!action || action === 'type' || full) await page.evaluate(() => scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    await page.evaluate(() => document.activeElement?.blur());
    await ready();
    const textLayers = await page.evaluate(() => {
      const out = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode,
          el = node.parentElement,
          st = getComputedStyle(el);
        if (!node.textContent.trim() || ['SCRIPT', 'STYLE'].includes(el.tagName) || st.display === 'none' || st.visibility === 'hidden') continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const r = range.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        out.push({
          text: node.textContent,
          fontFamily: st.fontFamily,
          fontSize: st.fontSize,
          fontWeight: st.fontWeight,
          letterSpacing: st.letterSpacing,
          lineHeight: st.lineHeight,
          color: st.color,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
        });
      }
      return out;
    });
    const stem = path.join(captureDir, name);
    const svgFile = path.join(screenDir, name + '.svg');
    await page.screenshot({ path: stem + '.reference.png' });
    await fs.writeFile(stem + '.text.json', JSON.stringify(textLayers, null, 2));
    // Print the current viewport, including its scroll position and top-layer
    // dialog. Freeze sticky/fixed boxes before changing the print containing
    // block; prevent pagination and printer-only line reflow in long cards.
    await page.evaluate(
      ({ height }) => {
        const offset = scrollY;
        const total = document.documentElement.scrollHeight;
        const positioned = [...document.querySelectorAll('body *')]
          .map((el) => ({ el, st: getComputedStyle(el), r: el.getBoundingClientRect() }))
          .filter(({ st, r }) => ['fixed', 'sticky'].includes(st.position) && st.display !== 'none' && r.width && r.height);
        for (const { el, st, r } of positioned) {
          if (st.position === 'sticky') {
            const spacer = document.createElement('div');
            spacer.style.cssText = `height:${r.height}px;width:${r.width}px;flex-shrink:0;`;
            el.before(spacer);
          }
          const props = {
            position: 'fixed',
            left: r.left + 'px',
            top: r.top + 'px',
            right: 'auto',
            bottom: 'auto',
            width: r.width + 'px',
            height: r.height + 'px',
            margin: '0',
            transform: 'none',
            boxSizing: 'border-box',
          };
          for (const [k, v] of Object.entries(props))
            el.style.setProperty(
              k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()),
              v,
              'important'
            );
        }
        Object.assign(document.body.style, { position: 'fixed', left: '0', top: -offset + 'px', width: '393px', height: total + 'px', margin: '0' });
        Object.assign(document.documentElement.style, { height: height + 'px', overflow: 'hidden' });
        scrollTo({ top: 0, left: 0, behavior: 'instant' });
      },
      { height }
    );
    await page.pdf({
      path: stem + '.pdf',
      width: '393px',
      height: height + 'px',
      printBackground: true,
      margin: { top: 0, left: 0, bottom: 0, right: 0 },
      pageRanges: '1',
    });
    const conversion = JSON.parse(
      execFileSync('python', [path.join(root, 'scripts/pdf-to-svg.py'), stem + '.pdf', svgFile, '393', String(height)], { encoding: 'utf8' }).trim()
    );
    const comparison = await compare(stem + '.reference.png', svgFile, stem + '.svg.png', 393, height);
    const label = labels[name + '.svg'] || name;
    const item = {
      file: name + '.svg',
      label,
      width: 393,
      height,
      route,
      profile: mode,
      fullScroll: !!full,
      bytes: (await fs.stat(svgFile)).size,
      ...conversion,
      ...comparison,
    };
    results.push(item);
    console.log(JSON.stringify(item));
  }
  const report = {
    generatedAt: new Date().toISOString(),
    sourceUrl: baseUrl,
    viewport: { width: 393, height: 852 },
    pipeline: 'Chromium screen media / embedded webfonts / PDF paint / PyMuPDF SVG paths',
    textMode: 'outlined vectors; original Unicode and typography in svg-fidelity/*.text.json',
    sourceAssets,
    screens: results,
  };
  await fs.writeFile(path.join(captureDir, only ? 'probe-report.json' : 'report.json'), JSON.stringify(report, null, 2));
  if (!only) await fs.writeFile(path.join(screenDir, 'manifest.json'), JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
