/* 접근성 자동 스캔 — axe-core로 주요 라우트의 라벨·ARIA·대비를 점검.
   실행: node scripts/a11y-scan.mjs [chromium|webkit]
   결과: 위반 0이면 PASS. critical/serious 위반이 있으면 실패 코드로 종료. */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const LOCAL_BROWSERS = 'C:\\tools\\ms-playwright';
if (fs.existsSync(LOCAL_BROWSERS)) process.env.PLAYWRIGHT_BROWSERS_PATH = LOCAL_BROWSERS;
const pw = await import('playwright');
const browserName = process.argv[2] || 'chromium';
const engine = pw[browserName] || pw.chromium;

const BASE = 'http://127.0.0.1:3219';

function serve() {
  const MIME = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
  };
  return new Promise((res) => {
    const srv = http
      .createServer((req, rq) => {
        const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html';
        const fp = path.resolve(process.cwd(), rel);
        fs.readFile(fp, (e, d) => {
          if (e || !fp.startsWith(process.cwd() + path.sep)) {
            rq.writeHead(404);
            rq.end();
            return;
          }
          rq.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
          rq.end(d);
        });
      })
      .listen(3219, '127.0.0.1', () => res(srv));
  });
}

const ROUTES = ['home', 'settle', 'shopping', 'calendar', 'space', 'settings', 'privacy'];

const srv = await serve();
const browser = await engine.launch();
const page = await browser.newPage();

let totalViol = 0;
for (const theme of ['light', 'dark']) {
  await page.goto(BASE + '/#/home', { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => localStorage.setItem('ds-theme', t), theme);
  for (const r of ROUTES) {
    await page.goto(BASE + '/#/' + r, { waitUntil: 'networkidle' });
    await page.waitForTimeout(350);
    /* CSP script-src 'self' 때문에 node_modules의 axe를 같은 출처 URL로 로드 */
    await page.addScriptTag({ url: BASE + '/node_modules/axe-core/axe.min.js' });
    /* 카드 stagger 애니메이션 도중의 opacity를 위반으로 잡지 않도록 최종 상태에서 측정 */
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
    const res = await page.evaluate(async () => {
      // @ts-ignore
      const out = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      });
      return out.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        desc: v.help,
        nodes: v.nodes.slice(0, 3).map((n) => ({
          t: n.target.join(' '),
          d: n.any && n.any[0] && n.any[0].data ? JSON.stringify(n.any[0].data).slice(0, 160) : '',
        })),
      }));
    });
    const serious = res.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    totalViol += serious.length;
    console.log(`\n== [${theme}] /#/${r} — 위반 ${res.length} (심각 ${serious.length}) ==`);
    res.forEach((v) => {
      console.log(`  [${v.impact}] ${v.id}: ${v.desc}`);
      v.nodes.forEach((n) => console.log(`      → ${n.t} ${n.d}`));
    });
  }
}

await browser.close();
srv.close();
console.log(`\n== 합계: 심각 위반 ${totalViol}건 ==`);
process.exit(totalViol > 0 ? 1 : 0);
