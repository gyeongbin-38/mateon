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
  /* 로케일 고정 — CI(en-US)에서도 한국어 UI 문자열 검증이 결정적이게 */
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
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
  /* 첫 방문 소개 오버레이는 실제 플로우의 일부 — 닫고 진행 (여러 단계일 수 있어 반복) */
  await dismissTutorial(page);

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

  console.log('== 정산 분할·고정비·월 이동 ==');
  await page2.goto(`${BASE}/#/settle`, { waitUntil: 'networkidle' });
  check('월 이동 네비', (await page2.locator('.settle-monthnav').count()) > 0);
  check('월별 요약 카드', (await page2.locator('.month-stats').count()) > 0);
  await page2.locator('#exp-memo').fill('장보기');
  await page2.locator('#exp-amt').fill('10000');
  await page2.locator('[data-action="exp-split"][data-v="percent"]').click();
  await page2.locator('#exp-share').fill('70');
  await page2.locator('[data-action="exp-add"]').click();
  check('비율 분할 저장', await page2.evaluate(() =>
    (JSON.parse(localStorage.getItem('mateon.expenses') || '[]')).some(x => x.memo === '장보기' && Math.abs(x.share - 0.7) < 0.001)));
  /* 고정비: 매월 반복 체크 → 등록 + 이번 달 자동 기록 */
  await page2.locator('#exp-memo').fill('넷플릭스');
  await page2.locator('#exp-amt').fill('5500');
  await page2.locator('#exp-recur').check();
  await page2.locator('[data-action="exp-add"]').click();
  check('고정비 등록', await page2.evaluate(() =>
    (JSON.parse(localStorage.getItem('mateon.fixedExpenses') || '[]')).some(f => f.memo === '넷플릭스')));
  check('고정비 fx 지출', await page2.evaluate(() =>
    (JSON.parse(localStorage.getItem('mateon.expenses') || '[]')).some(x => x.fx && x.memo === '넷플릭스')));
  const ymNow = await page2.evaluate(() => window.__mateon.state.settleMonth);
  await page2.locator('[data-action="exp-month"][data-v="-1"]').click();
  check('이전 달 이동', (await page2.evaluate(() => window.__mateon.state.settleMonth)) !== ymNow);
  await page2.locator('[data-action="exp-month"][data-v="1"]').click();

  console.log('== 활동 피드 ==');
  await page2.goto(`${BASE}/#/space`, { waitUntil: 'networkidle' });
  check('최근 활동 피드', await page2.locator('.activity-feed .feed-row').count() > 0);

  console.log('== 지출 수정·검색·예산 ==');
  await page2.goto(`${BASE}/#/settle`, { waitUntil: 'networkidle' });
  const editBtn = page2.locator('.settle-row:has-text("장보기") [data-action="exp-edit"]').first();
  if (await editBtn.count()) {
    await editBtn.click();
    await page2.locator('#exp-amt').fill('12000');
    await page2.locator('[data-action="exp-add"]').click();
    check('지출 수정 저장', await page2.evaluate(() =>
      (JSON.parse(localStorage.getItem('mateon.expenses') || '[]')).some(x => x.memo === '장보기' && x.amount === 12000)));
  }
  await page2.locator('#exp-q').fill('넷플릭스');
  await page2.waitForTimeout(200);
  check('지출 검색 필터', await page2.evaluate(() => {
    const rows = document.querySelectorAll('.settle-row:has([data-action="exp-edit"])');
    return rows.length === 1 && rows[0].textContent.includes('넷플릭스');
  }));
  await page2.locator('#exp-q').fill('');
  /* 예산 입력은 details 안 — summary를 먼저 연다 */
  const budSummary = page2.locator('summary:has-text("월 예산")');
  if (await budSummary.count()) {
    await budSummary.click();
    const budIn = page2.locator('.budget-in').first();
    await budIn.fill('500000');
    await page2.locator('[data-action="budget-set"]').click();
    check('예산 저장', await page2.evaluate(() => Object.values(JSON.parse(localStorage.getItem('mateon.budgets') || '{}')).some(v => v === 500000)));
  }

  console.log('== 기념일·월 뷰·주간 반복 ==');
  await page2.goto(`${BASE}/#/calendar`, { waitUntil: 'networkidle' });
  check('달력 그리드', await page2.locator('.cal-grid').isVisible());
  await page2.locator('#anniv-title').fill('만난 날');
  await page2.locator('#anniv-date').fill('2025-12-25');
  await page2.locator('[data-action="anniv-add"]').click();
  check('기념일 저장', await page2.evaluate(() =>
    (JSON.parse(localStorage.getItem('mateon.anniv') || '[]')).some(a => a.title === '만난 날')));
  await page2.locator('#ev-title').fill('청소의 날');
  await page2.locator('#ev-rpt').check();
  await page2.locator('[data-action="ev-add"]').click();
  check('주간 반복 저장', await page2.evaluate(() =>
    (JSON.parse(localStorage.getItem('mateon.events') || '[]')).some(e => e.rpt === 'w' && e.title === '청소의 날')));
  const cmBefore = await page2.evaluate(() => window.__mateon.state.calMonth);
  await page2.locator('[data-action="cal-month"][data-v="-1"]').click();
  check('달력 이전 달', (await page2.evaluate(() => window.__mateon.state.calMonth)) !== cmBefore);
  await page2.goto(`${BASE}/#/home`, { waitUntil: 'networkidle' });
  check('홈 D-day 배너', await page2.locator('.dday-banner').isVisible());

  console.log('== 주간 미션·체크인 차트·알림 ==');
  await page2.goto(`${BASE}/#/checkin`, { waitUntil: 'networkidle' });
  const msnBtn = page2.locator('[data-action="mission-done"]').first();
  check('주간 미션 표시', await msnBtn.count() >= 1);
  if (await msnBtn.count()) {
    await msnBtn.click();
    check('미션 완료 저장', await page2.evaluate(() =>
      (JSON.parse(localStorage.getItem('mateon.missions') || '{}').list || []).some(m => m.done)));
  }
  await page2.goto(`${BASE}/#/settings`, { waitUntil: 'networkidle' });
  const remChore = page2.locator('[data-action="rem-chore"]');
  check('집안일 알림 토글', await remChore.count() === 1);
  if (await remChore.count()) {
    await remChore.click();
    check('집안일 알림 꺼짐', await page2.evaluate(() => JSON.parse(localStorage.getItem('mateon.reminders')).chore === false));
    await remChore.click();
  }

  console.log('== 만료 초대 링크 ==');
  const meResult = await page.evaluate(() => window.__mateon.state.me);
  const expiredToken = await page.evaluate(r => window.__mateon.encodeInvite(r, -1), meResult);
  const page3 = await newPage();
  await page3.goto(`${BASE}/?invite=${encodeURIComponent(expiredToken)}`, { waitUntil: 'networkidle' });
  const p3text = await page3.locator('body').innerText();
  check('만료 안내 표시', /만료|유효/.test(p3text));
  await page3.close();

  console.log('== 백업보내기·불러오기 ==');
  await page2.goto(`${BASE}/#/settings`, { waitUntil: 'networkidle' });
  const expBtn = page2.locator('[data-action="backup-export"]');
  if (await expBtn.count()) {
    const [dl] = await Promise.all([
      page2.waitForEvent('download', { timeout: 10000 }),
      expBtn.click(),
    ]);
    const dlPath = await dl.path();
    check('백업 파일 다운로드', !!dlPath);
    /* 데이터를 지우고 가져오면 복원돼야 한다 */
    const before = await page2.evaluate(() => (JSON.parse(localStorage.getItem('mateon.expenses') || '[]')).length);
    await page2.evaluate(() => { localStorage.setItem('mateon.expenses', '[]'); });
    await page2.locator('#backup-file').setInputFiles(dlPath);
    await page2.waitForTimeout(800);
    /* 백업 미리보기가 뜨면 항목 선택 복원을 검증한다 */
    const preview = page2.locator('dialog[open] [data-bk-apply]');
    if (await preview.count()) {
      check('백업 미리보기 표시', (await page2.locator('[data-bk-key]').count()) > 0);
      /* 지출만 골라 부분 복원 */
      await page2.evaluate(() => { document.querySelectorAll('[data-bk-key]').forEach(c => { c.checked = c.getAttribute('data-bk-key') === 'mateon.expenses'; }); });
      await preview.click();
      await page2.waitForTimeout(400);
    }
    const after = await page2.evaluate(() => (JSON.parse(localStorage.getItem('mateon.expenses') || '[]')).length);
    if (after !== before) console.log(`   [dbg] backup restore: before=${before} after=${after} toast=${await page2.locator('#toast').innerText()}`);
    check('백업 복원', after === before);
  }

  console.log('== 투어·테마 ==');
  await page2.goto(`${BASE}/#/settings`, { waitUntil: 'networkidle' });
  const tour = page2.locator('[data-action="app-tour"]');
  if (await tour.count()) {
    await tour.click();
    await page2.waitForTimeout(400);
    check('driver.js 투어 팝오버', await page2.locator('.driver-popover, [class*="driver"]').first().isVisible().catch(() => false));
    /* 투어 오버레이가 이후 클릭을 가로막으므로 종료한다 */
    const drvDone = page2.locator('.driver-popover-next-btn, .driver-popover-close-btn').first();
    if (await drvDone.count()) { await drvDone.click().catch(() => { }); }
    await page2.waitForTimeout(300);
  }
  /* 다크모드 토글 */
  const themeBtn = page2.locator('[data-action="theme"]').first();
  if (await themeBtn.count()) {
    await themeBtn.click();
    await page2.waitForTimeout(200);
    check('다크 테마 적용', await page2.evaluate(() => document.documentElement.dataset.theme === 'dark' || localStorage.getItem('ds-theme') === '"dark"' || localStorage.getItem('ds-theme') === 'dark'));
  }

  console.log('== 오프라인 동작 ==');
  await page2.context().setOffline(true);
  await page2.goto(`${BASE}/#/space`, { waitUntil: 'domcontentloaded' }).catch(() => { });
  await page2.waitForTimeout(600);
  const offText = await page2.locator('body').innerText().catch(() => '');
  check('오프라인 배너/콘텐츠', /오프라인|우리 공간|생활 도구/.test(offText));
  await page2.context().setOffline(false);

  console.log('== 목표 저축·수입·태그·부분정산 ==');
  await page2.goto(`${BASE}/#/settle`, { waitUntil: 'networkidle' });
  const goalName = page2.locator('#goal-name');
  if (await goalName.count()) {
    await goalName.fill('제주 여행');
    await page2.locator('#goal-target').fill('100000');
    await page2.locator('[data-action="goal-set"]').click();
    check('목표 생성', await page2.evaluate(() => window.__mateon.state.goal && window.__mateon.state.goal.target === 100000));
    await page2.locator('#goal-amt').fill('30000');
    await page2.locator('[data-action="goal-add"]').click();
    check('저축 진행률 표시', (await page2.locator('body').innerText()).includes('30%'));
  }
  const kindBtn = page2.locator('[data-action="exp-kind"][data-v="1"]');
  if (await kindBtn.count()) {
    await kindBtn.click();
    await page2.locator('#exp-memo').fill('용돈');
    await page2.locator('#exp-amt').fill('50000');
    await page2.locator('[data-action="exp-add"]').click();
    check('수입 기록', await page2.evaluate(() =>
      (JSON.parse(localStorage.getItem('mateon.expenses') || '[]')).some(x => x.income === 1 && x.memo === '용돈')));
    await page2.locator('[data-action="exp-kind"][data-v="0"]').click();
    await page2.locator('#exp-memo').fill('꽃다발');
    await page2.locator('#exp-amt').fill('20000');
    const tagIn = page2.locator('#exp-tags');
    if (await tagIn.count()) await tagIn.fill('기념일');
    const recur = page2.locator('#exp-recur');
    if (await recur.count() && await recur.isChecked()) await recur.uncheck();
    await page2.locator('[data-action="exp-add"]').click();
    check('태그 저장', await page2.evaluate(() =>
      (JSON.parse(localStorage.getItem('mateon.expenses') || '[]')).some(x => (x.tags || []).includes('기념일'))));
  }
  const partAmt = page2.locator('#part-amt');
  if (await partAmt.count()) {
    await partAmt.fill('5000');
    await page2.locator('[data-action="settle-part"][data-v="y2m"]').click();
    check('부분 정산 기록', await page2.evaluate(() =>
      (JSON.parse(localStorage.getItem('mateon.settlePaid') || '[]')).some(p => p.dir === 'y2m' && p.amt === 5000)));
  }

  console.log('== 요일 집안일·주간 뷰·일정 알림·팬트리 ==');
  await page2.goto(`${BASE}/#/chores`, { waitUntil: 'networkidle' });
  const dayPick = page2.locator('[data-action="chore-day-pick"][data-v="2"]');
  if (await dayPick.count()) {
    await dayPick.click();
    await page2.locator('[data-action="chore-day-pick"][data-v="6"]').click();
    await page2.locator('#chore-in').fill('화토청소');
    await page2.locator('[data-action="chore-add"]').click();
    check('요일 지정 집안일', await page2.evaluate(() =>
      (window.__mateon.state.chores.items || []).some(i => i.name === '화토청소' && i.days && i.days.join(',') === '2,6')));
  }
  await page2.goto(`${BASE}/#/calendar`, { waitUntil: 'networkidle' });
  const remSel = page2.locator('#ev-rem');
  if (await remSel.count()) {
    await remSel.selectOption('60');
    await page2.locator('#ev-title').fill('관리비 납부');
    await page2.locator('[data-action="ev-add"]').click();
    check('일정 알림 저장', await page2.evaluate(() =>
      (JSON.parse(localStorage.getItem('mateon.events') || '[]')).some(e => e.rem === 60 && e.title === '관리비 납부')));
  }
  const wkBtn = page2.locator('[data-action="cal-view"][data-v="w"]');
  if (await wkBtn.count()) {
    await wkBtn.click();
    check('주간 뷰 렌더', await page2.locator('.cal-week').isVisible());
    await page2.locator('[data-action="cal-view"][data-v="m"]').click();
  }
  await page2.goto(`${BASE}/#/shopping`, { waitUntil: 'networkidle' });
  const pName = page2.locator('#pantry-name');
  if (await pName.count()) {
    await pName.fill('두부');
    await page2.locator('#pantry-exp').fill('2099-01-02');
    await page2.locator('[data-action="pantry-add"]').click();
    check('팬트리 저장', await page2.evaluate(() =>
      (JSON.parse(localStorage.getItem('mateon.pantry') || '[]')).some(x => x.name === '두부')));
  }

  console.log('== 메모·돌봄·애정언어·휴지통 ==');
  await page2.goto(`${BASE}/#/space`, { waitUntil: 'networkidle' });
  const memoT = page2.locator('#memo-title');
  if (await memoT.count()) {
    await memoT.fill('와이파이');
    await page2.locator('#memo-text').fill('pw1234');
    await page2.locator('[data-action="memo-add"]').click();
    check('공유 메모 저장', await page2.evaluate(() =>
      (JSON.parse(localStorage.getItem('mateon.memos') || '[]')).some(m => m.title === '와이파이')));
  }
  const careName = page2.locator('#care-name');
  if (await careName.count()) {
    await careName.fill('몬스테라');
    await page2.locator('#care-days').fill('7');
    await page2.locator('[data-action="care-add"]').click();
    check('돌봄 등록', await page2.evaluate(() =>
      (JSON.parse(localStorage.getItem('mateon.care') || '[]')).some(c => c.name === '몬스테라' && c.days === 7)));
  }
  const llBtn = page2.locator('[data-action="ll-ans"]').first();
  if (await llBtn.count()) {
    for (let i = 0; i < 7; i++) {
      const done = await page2.evaluate(() => !!window.__mateon.state.loveLang);
      if (done) break;
      await page2.locator('[data-action="ll-ans"]').first().click();
      await page2.waitForTimeout(100);
    }
    check('애정 언어 결과', await page2.evaluate(() => !!window.__mateon.state.loveLang));
  }
  check('배지 그리드', (await page2.locator('.badge-grid').count()) > 0);
  /* 휴지통 — 지출 삭제 후 복원 */
  await page2.goto(`${BASE}/#/settle`, { waitUntil: 'networkidle' });
  const expDel = page2.locator('.settle-row:has-text("꽃다발") [data-action="exp-del"]').first();
  if (await expDel.count()) {
    await expDel.click(); await page2.waitForTimeout(150);
    const confirmBtn = page2.locator('.settle-row:has-text("꽃다발") [data-action="exp-del"]').first();
    if (await confirmBtn.count()) await confirmBtn.click();
    check('삭제 → 휴지통', await page2.evaluate(() =>
      (JSON.parse(localStorage.getItem('mateon.trash') || '[]')).some(t => t.item && t.item.memo === '꽃다발')));
    await page2.goto(`${BASE}/#/settings`, { waitUntil: 'networkidle' });
    const restore = page2.locator('[data-action="trash-restore"]').first();
    if (await restore.count()) {
      await restore.click();
      check('휴지통 복원', await page2.evaluate(() =>
        (JSON.parse(localStorage.getItem('mateon.expenses') || '[]')).some(x => x.memo === '꽃다발')));
    }
  }

  console.log('== 태블릿 레이아웃 ==');
  await page2.setViewportSize({ width: 900, height: 800 });
  await page2.goto(`${BASE}/#/types`, { waitUntil: 'networkidle' });
  check('태블릿 3단 유형 그리드', await page2.evaluate(() => {
    const g = document.querySelector('.type-grid');
    return g && getComputedStyle(g).gridTemplateColumns.split(' ').length >= 3;
  }));
  check('태블릿 넓은 본문', await page2.evaluate(() => document.body.clientWidth > 480));
  await page2.setViewportSize({ width: 390, height: 844 });

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
