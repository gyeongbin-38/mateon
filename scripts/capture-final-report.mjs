/* 최종 보고서 증거 화면: 배포 사이트를 별도 브라우저 프로필에서 시연한다. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

if (fs.existsSync('C:\\tools\\ms-playwright')) process.env.PLAYWRIGHT_BROWSERS_PATH = 'C:\\tools\\ms-playwright';
const { chromium } = await import('playwright');
const out = path.resolve('artifacts/final-report/assets');
fs.mkdirSync(out, { recursive: true });
const version = JSON.parse(fs.readFileSync('release.config.json', 'utf8')).assetVersion;
const base = 'https://gyeongbin-38.github.io/mateon/?v=' + version;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ko-KR', reducedMotion: 'reduce' });
const errors = [];
const manifest = [];
page.on('pageerror', (e) => errors.push(e.message));
async function go(route) {
  await page.goto(base + '#/' + route);
  await page.locator('.app-shell[data-route="' + route + '"]').waitFor();
  await page.locator('#splash').waitFor({ state: 'detached' });
  const tutorial = page.locator('[data-action="tutorial-close"]');
  if (await tutorial.count()) await tutorial.click();
  await page.evaluate(() => document.fonts.ready);
}
async function act(action) {
  await page
    .locator('[data-action="' + action + '"]')
    .first()
    .click();
}
async function shot(id, label) {
  await page.waitForFunction(() => !document.getElementById('toast')?.classList.contains('show'));
  await page.screenshot({ path: path.join(out, id + '.png') });
  manifest.push({ id, label, route: new URL(page.url()).hash, viewport: '390 × 844', source: base });
}
try {
  await go('home');
  await shot('home-guest', '진단 전 홈');
  await go('onboarding');
  await page.locator('#pf-name').fill('다원');
  await shot('profile', '프로필 입력');
  await page.locator('[data-action="rel"]').first().click();
  await page.locator('[data-action="stage"]').first().click();
  await act('survey');
  await shot('survey-1', '성향 진단 1 / 20');
  for (let i = 0; i < 4; i++) {
    await page.locator('[data-action="answer"]').nth(2).click();
    await page.waitForTimeout(300);
  }
  await shot('survey-5', '성향 진단 · 집안일');
  await page.evaluate(() => {
    localStorage.setItem('mateon.me', JSON.stringify({ ...SAMPLE_RESULTS.me, ts: Date.now() }));
    localStorage.setItem('mateon.partner', JSON.stringify({ ...SAMPLE_RESULTS.partner, ts: Date.now() }));
    localStorage.setItem('mateon.seen', 'true');
    localStorage.removeItem('mateon.draft.me');
    localStorage.removeItem('mateon.activeDraft');
  });
  await page.reload();
  await go('home');
  await shot('home-pair', '연결 후 홈');
  await go('result');
  await shot('result', '내 진단 결과');
  await act('result-detail');
  await shot('result-detail', '내 결과 상세');
  await go('invite');
  await shot('connect', '메이트 연결');
  await act('partner-result');
  await shot('partner-result', '메이트 진단 결과');
  await go('report');
  await shot('report', '우리 둘 궁합 리포트');
  const text = await page.locator('main').innerText();
  fs.writeFileSync(path.join(out, '../report-screen-text.txt'), text);
  const domain = page.getByRole('heading', { name: '미리 맞춰볼 부분', exact: true });
  if (await domain.count()) await domain.scrollIntoViewIfNeeded();
  else await page.evaluate(() => scrollTo(0, 700));
  await shot('report-domains', '생활 영역별 차이');
  await go('result');
  await act('lifecheck');
  await shot('life-1', '생활 기준 · 청결');
  await page.locator('[data-action="life-answer"]').nth(2).click();
  await page.waitForTimeout(300);
  await page.locator('[data-action="life-answer"]').nth(1).click();
  await page.waitForTimeout(300);
  await shot('life-3', '생활 기준 · 집안일');
  await page.locator('[data-action="life-answer"]').nth(1).click();
  await page.waitForTimeout(300);
  await shot('life-4', '생활 기준 · 수면·소음');
  await page.evaluate(() => {
    for (const [who, indices] of [
      ['me', [2, 1, 1, 2, 1, 1]],
      ['partner', [0, 1, 0, 2, 0, 1]],
    ]) {
      const r = JSON.parse(localStorage.getItem('mateon.' + who));
      r.life = LIFE_QUESTIONS.map((q, i) => ({ qid: q.id, area: q.area, level: q.options[indices[i]].level, label: q.options[indices[i]].label }));
      localStorage.setItem('mateon.' + who, JSON.stringify(r));
    }
  });
  await page.reload();
  await go('report');
  const lifeHeading = page.getByRole('heading', { name: '생활 기준 비교', exact: true });
  await lifeHeading.waitFor();
  assert.equal(await page.locator('.life-summary .badge-warning').count(), 3);
  assert.equal(await page.locator('.life-summary .badge-success').count(), 3);
  assert.equal(await page.locator('.life-summary .badge-success').first().textContent(), '같음');
  if (await lifeHeading.count()) await lifeHeading.scrollIntoViewIfNeeded();
  else await page.getByText('청결 기준', { exact: true }).first().scrollIntoViewIfNeeded();
  await shot('life-compare', '생활 기준 비교');
  await go('rules');
  await page.locator('[data-action="proposal-toggle"]').nth(0).click();
  await page.locator('[data-action="proposal-person"][data-v="partner"]').click();
  await page.locator('[data-action="proposal-toggle"]').nth(1).click();
  await shot('rules-proposals', '각자의 규칙 제안');
  await page.locator('#proposal-text').fill('토요일 오전에 함께 공용 공간 청소하기');
  await page.locator('#proposal-text').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shot('rules-input', '규칙 직접 입력');
  await act('proposal-add');
  await act('rules-review');
  await shot('rules-review', '제안자 확인과 조율');
  await page.locator('#rule-final-0').fill('밤 11시 이후에는 이어폰을 사용해요');
  await act('proposal-edit');
  for (const button of await page.locator('[data-action="proposal-approve"]').all()) await button.click();
  await page.evaluate(() => scrollTo(0, 0));
  await shot('rules-approved', '조항별 두 사람 확인');
  await act('agreement');
  await page.locator('[data-action="sign"][data-who="me"]').click();
  await shot('agreement-sign', '두 사람의 서명');
  await page.locator('[data-action="sign"][data-who="partner"]').click();
  await act('save-agree');
  await page.waitForURL((url) => url.hash === '#/agreement-complete');
  await shot('agreement-done', '합의 완료');
  await go('checklist');
  await shot('checklist-select', '필요한 준비 항목 선택');
  await page.locator('#cl-custom-in').fill('반려동물 안전문 준비');
  await page.locator('#cl-custom-in').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shot('checklist-add', '준비 항목 직접 추가');
  await act('cl-add');
  await act('prep-start');
  await act('check');
  await shot('checklist-step', '파트별 체크·임시저장');
  await act('prep-next');
  await act('prep-draft');
  await go('checklist');
  await shot('checklist-resume', '임시저장 후 이어하기');
  for (let i = 0; i < 8 && (await page.locator('[data-action="prep-next"]').count()); i++) await act('prep-next');
  await shot('checklist-last', '마지막 파트·완료');
  await act('prep-finish');
  await shot('checklist-done', '준비 계획 저장·남은 항목');
  await go('space');
  await shot('space', '우리 공간');
  await go('checkin');
  await shot('checkin', '함께 돌아보는 체크인');
  await go('types');
  await shot('types', '16개 유형 도감');
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(out, '../screen-manifest.json'),
    JSON.stringify({ capturedAt: new Date().toISOString(), exampleData: true, screenshots: manifest }, null, 2)
  );
  const sandbox = {};
  vm.createContext(sandbox);
  const data = vm.runInContext(fs.readFileSync('js/data.js', 'utf8') + '\n({CHARACTERS,DOMAINS,LIFE_QUESTIONS,SAMPLE_RESULTS})', sandbox);
  fs.writeFileSync(path.join(out, '../app-data.json'), JSON.stringify(data, null, 2));
  console.log('PASS: production capture', manifest.length, 'screens; no page errors');
} finally {
  await browser.close();
}
