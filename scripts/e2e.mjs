/* 실브라우저 E2E — 앱을 띄우고 핵심 플로우를 실제 DOM에서 검증.
   실행: node scripts/e2e.mjs  (브라우저: npx playwright install chromium)
   플로우: 홈 → 온보딩 → 20문항 → 결과 → 초대 링크 → 상대 수락 → 상대 설문
          → 리포트 → 합의서 서명 → 생활도구 → 설정 투어. */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const LOCAL_BROWSERS = 'C:\\tools\\ms-playwright';
if (fs.existsSync(LOCAL_BROWSERS)) process.env.PLAYWRIGHT_BROWSERS_PATH = LOCAL_BROWSERS;
const { chromium } = await import('playwright');

const BASE = 'http://127.0.0.1:3217';
let pass = 0, fail = 0;
const check = (name, ok) => { console.log(`  ${ok ? 'OK' : 'FAIL'} ${name}`); ok ? pass++ : fail++; };

function serve() {
  const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gz': 'application/gzip', '.wasm': 'application/wasm' };
  return new Promise(res => {
    const srv = http.createServer((req, rq) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html';
      const fp = path.resolve(process.cwd(), rel);
      fs.readFile(fp, (e, d) => {
        if (e || !fp.startsWith(process.cwd() + path.sep)) { rq.writeHead(404); rq.end(); return; }
        rq.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
        rq.end(d);
      });
    }).listen(3217, '127.0.0.1', () => res(srv));
  });
}

async function dismissTutorial(page) {
  const t = page.locator('[data-action="tutorial-close"]');
  for (let i = 0; i < 3 && (await t.count()); i++) { await t.click().catch(() => { }); await page.waitForTimeout(150); }
}

async function answerSurvey(page, name, offset = 0) {
  await dismissTutorial(page);
  await page.locator('#pf-name').fill(name);
  await page.locator('[data-action="rel"]').first().click();
  await page.locator('[data-action="stage"]').first().click();
  await page.locator('[data-action="survey"]').click();
  for (let i = 0; i < 25; i++) {
    if ((await page.evaluate(() => location.hash)) !== '#/survey') break;
    const opt = page.locator('[data-action="answer"]').nth((i + offset) % 4);
    try { await opt.waitFor({ state: 'visible', timeout: 1500 }); }
    catch {
      console.log(`   [dbg] survey stalled at iteration ${i}, answers:`,
        await page.evaluate(() => window.__mateon?.state?.answers?.length),
        'hash:', await page.evaluate(() => location.hash));
      await page.screenshot({ path: `e2e-stall-${i}.png` });
      break;
    }
    await opt.click();
    /* 220ms 전환 대기(선택 변경 허용 창) 이후 다음 문항이 렌더된다 */
    await page.waitForTimeout(320);
  }
}

const srv = await serve();
const browser = await chromium.launch();
const errors = [];
const newPage = async () => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => errors.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  return p;
};

try {
  const page = await newPage();
  console.log('== 부팅 ==');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  check('홈 렌더', await page.locator('[data-action="start"]').first().isVisible());
  check('MateLife 로드', await page.evaluate(() => typeof window.MateLife?.parseReceiptText === 'function'));
  check('Tesseract 지연 로딩', await page.evaluate(() => window.Tesseract === undefined));
  check('TinyBase 로드', await page.evaluate(() => typeof window.TinyBase?.createMergeableStore === 'function'));
  /* 첫 방문 소개 오버레이는 실제 플로우의 일부 — 닫고 진행 */
  const tutClose = page.locator('[data-action="tutorial-close"]');
  if (await tutClose.count()) { await tutClose.click(); }

  console.log('== 설문 20문항 ==');
  await page.locator('[data-action="start"]').first().click();
  await answerSurvey(page, '다원', 0);
  const resultText = await page.locator('body').innerText();
  check('결과 화면 도달', /결과|유형/.test(resultText) && (await page.locator('[data-action="invite"]').count()) > 0);

  console.log('== 초대 링크 왕복 ==');
  await page.locator('[data-action="invite"]').first().click();
  const inviteUrl = await page.locator('.invite-link-box code').innerText();
  check('초대 URL 생성', /invite=|data=|#\//.test(inviteUrl) || inviteUrl.startsWith('http'));
  check('QR 렌더', await page.locator('.qr-box svg, .qr-svg').first().isVisible().catch(() => false));

  const page2 = await newPage();
  await page2.goto(inviteUrl.trim(), { waitUntil: 'networkidle' });
  const p2text = await page2.locator('body').innerText();
  check('초대 수신 화면', /초대|확인|수락/.test(p2text));
  const confirm = page2.locator('[data-action="confirm-partner"], [data-action="preview-partner"]').first();
  if (await confirm.count()) { await confirm.click(); }
  const conf = page2.locator('[data-action="confirm-partner"]').first();
  if (await conf.count()) { await conf.click(); }
  await page2.locator('[data-action="partner-survey"], [data-action="survey"]').first().click().catch(() => { });
  if (await page2.locator('#pf-name').count()) {
    await answerSurvey(page2, '메이트', 2);
  }
  check('상대 진단 완료', /결과|유형|리포트/.test(await page2.locator('body').innerText()));
  const reportBtn = page2.locator('[data-action="report"]').first();
  if (await reportBtn.count()) await reportBtn.click();
  check('궁합 리포트', /궁합|리포트|갈등/.test(await page2.locator('body').innerText()));

  console.log('== 합의서 ==');
  const agree = page2.locator('[data-action="agreement"]').first();
  if (await agree.count()) {
    await agree.click();
    const signBtn = page2.locator('[data-action="sign"]').first();
    if (await signBtn.count()) {
      for (const w of ['me', 'partner']) {
        const b = page2.locator(`[data-action="sign"][data-who="${w}"]`);
        if (await b.count()) await b.click();
      }
      const save = page2.locator('[data-action="save-agree"]');
      if (await save.count()) await save.click();
    }
    check('합의서 화면', /합의/.test(await page2.locator('body').innerText()));
  }

  console.log('== 생활도구·체크리스트 ==');
  for (const [route, needle] of [['settle', '정산'], ['shopping', '같이 살'], ['lovemap', '러브맵'], ['chores', '분담'], ['calendar', '일정'], ['checkin', '체크인'], ['checklist', '체크리스트'], ['settings', '설정']]) {
    await page2.goto(`${BASE}/#/${route}`, { waitUntil: 'networkidle' });
    check(`${route} 화면`, (await page2.locator('body').innerText()).includes(needle));
  }
  /* 체크리스트 실제 토글 */
  await page2.goto(`${BASE}/#/checklist`, { waitUntil: 'networkidle' });
  const ck = page2.locator('[data-action="check"]').first();
  if (await ck.count()) {
    await ck.click();
    check('체크리스트 토글 저장', await page2.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('mateon.checklist') || '{}')).length > 0));
  }
  /* 쇼핑 추가 실사용 */
  await page2.goto(`${BASE}/#/shopping`, { waitUntil: 'networkidle' });
  const shopIn = page2.locator('#shop-in, input[placeholder*="추가"], input[placeholder*="살"]').first();
  if (await shopIn.count()) {
    await shopIn.fill('수세미');
    await page2.locator('[data-action="shop-add"]').click();
    check('쇼핑 추가 저장', await page2.evaluate(() => (JSON.parse(localStorage.getItem('mateon.shopping') || '[]')).some(x => x.name === '수세미')));
  }

  console.log('== 투어·테마 ==');
  await page2.goto(`${BASE}/#/settings`, { waitUntil: 'networkidle' });
  const tour = page2.locator('[data-action="app-tour"]');
  if (await tour.count()) {
    await tour.click();
    await page2.waitForTimeout(400);
    check('driver.js 투어 팝오버', await page2.locator('.driver-popover, [class*="driver"]').first().isVisible().catch(() => false));
  }

  console.log('== 콘솔/페이지 에러 ==');
  const fatal = errors.filter(e => !/favicon|manifest|service.?worker|sw\.js|pretendard|cdn\.jsdelivr|net::|Failed to load resource/i.test(e));
  check('페이지 에러 없음', fatal.length === 0);
  if (fatal.length) console.log('   ' + fatal.slice(0, 5).join('\n   '));
} catch (e) {
  fail++; console.log('  FAIL 예외: ' + e.message);
}
await browser.close(); srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
