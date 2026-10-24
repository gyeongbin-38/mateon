/* 사용자 피드백 회귀 검증 + 최종 보고서용 플로우 화면 수집. */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';

if (fs.existsSync('C:\\tools\\ms-playwright')) process.env.PLAYWRIGHT_BROWSERS_PATH = 'C:\\tools\\ms-playwright';
const { chromium, webkit } = await import('playwright');
const engine = process.argv.includes('webkit') ? webkit : chromium;
const out = path.resolve('artifacts/feedback-review');
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  const file = path.resolve(decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html');
  if (!file.startsWith(process.cwd() + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end();
      return;
    }
    const types = {
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.html': 'text/html',
      '.woff2': 'font/woff2',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((resolve) => server.listen(3221, '127.0.0.1', resolve));
const browser = await engine.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ko-KR', reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const shots = [];
async function scan() {
  await page.addScriptTag({ url: 'http://127.0.0.1:3221/node_modules/axe-core/axe.min.js' });
  const violations = await page.evaluate(async () =>
    (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations
      .filter((v) => ['critical', 'serious'].includes(v.impact))
      .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))
  );
  assert.deepEqual(violations, [], '새 흐름 접근성: ' + page.url());
}
async function shot(id, title) {
  await page.waitForFunction(() => !document.getElementById('toast').classList.contains('show'));
  await page.screenshot({ path: path.join(out, id + '.png') });
  shots.push({ id, title });
}
async function go(route) {
  await page.goto('http://127.0.0.1:3221/#/' + route);
  await page.locator('.app-shell[data-route="' + route + '"]').waitFor();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.app-header')).position === 'sticky');
}
async function act(action) {
  await page
    .locator('[data-action="' + action + '"]')
    .first()
    .click();
  await page.waitForTimeout(100);
}
try {
  await go('home');
  await page.evaluate(() => {
    localStorage.setItem('mateon.me', JSON.stringify({ ...SAMPLE_RESULTS.me, name: '다원' }));
    localStorage.setItem('mateon.partner', JSON.stringify({ ...SAMPLE_RESULTS.partner, name: '하늘' }));
    localStorage.setItem('mateon.seen', 'true');
  });
  await page.reload();
  await page.locator('#splash').waitFor({ state: 'detached' });
  let appbarColor;
  for (const route of ['result', 'invite', 'space', 'settle', 'shopping', 'chores', 'calendar', 'checkin', 'conflict', 'types', 'checklist']) {
    await go(route);
    const ui = await page.locator('.app-header').evaluate((h) => ({
      titleSize: getComputedStyle(h.querySelector('.app-screen-title')).fontSize,
      colors: [...h.querySelectorAll('button:not(.logo)')].map((b) => getComputedStyle(b).color),
      back: h.querySelector('.app-back svg')?.innerHTML,
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    assert.equal(ui.titleSize, '17px', route + ' title size');
    appbarColor ||= ui.colors[0];
    assert(
      ui.colors.every((c) => c === appbarColor),
      route + ' icon colors'
    );
    if (ui.back) assert(ui.back.includes('m15 5-7 7 7 7'), route + ' back shape');
    if (ui.overflow)
      console.log(
        route,
        await page.evaluate(() =>
          [...document.querySelectorAll('main *')]
            .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
            .slice(0, 6)
            .map((e) => ({ html: e.outerHTML.slice(0, 180), right: e.getBoundingClientRect().right }))
        )
      );
    assert(!ui.overflow, route + ' overflow');
  }
  await go('types');
  assert.equal(await page.getByRole('button', { name: '홈으로', exact: true }).count(), 0);
  assert.equal(await page.locator('.app-back').count(), 0);
  await shot('01-types', '유형 도감 · 하단 탭으로 이동');
  await go('result');
  assert.equal(await page.locator('.carousel-label, .character-track, .similar-type[data-action="type"]').count(), 0);
  assert.equal(await page.locator('.result-hero [data-action="retry"]').count(), 1);
  await shot('02-my-result', '내 진단 결과 · 진단받은 유형');
  await scan();
  await act('result-detail');
  assert.equal(await page.locator('#result-details').getAttribute('open'), '');
  await go('invite');
  await shot('03-connect', '메이트 연결 · 정보 카드');
  assert.equal(await page.locator('.app-screen-title').textContent(), '메이트 연결 · 초대');
  await act('partner-result');
  assert.equal(await page.locator('.app-screen-title').textContent(), '메이트 진단 결과');
  await page.reload();
  await page.locator('#splash').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.app-screen-title').textContent(), '메이트 진단 결과');
  assert.equal(await page.locator('.result-hero [data-action="retry"]').count(), 0);
  await shot('04-partner-result', '메이트 진단 결과 · 대상 구분');
  await go('onboarding');
  assert.equal(await page.locator('.bottom-nav').count(), 0);
  await shot('05-profile', '진단 전 정보 입력 · 하단 탭 없음');
  await scan();
  await page.locator('#pf-name').fill('다원');
  await page.locator('[data-action="rel"]').first().click();
  await page.locator('[data-action="stage"]').first().click();
  await act('survey');
  assert.equal(await page.locator('.bottom-nav').count(), 0);
  assert.equal(await page.locator('.app-back').count(), 1);
  await shot('06-survey', '동거 성향 진단 · 공통 앱바');

  await go('rules');
  await page.locator('[data-action="proposal-toggle"]').nth(0).click();
  await page.locator('[data-action="proposal-person"][data-v="partner"]').click();
  await page.locator('[data-action="proposal-toggle"]').nth(1).click();
  await shot('07-proposals', '생활 규칙 · 각자의 제안 선택');
  await page.locator('#proposal-text').fill('토요일 오전에 같이 공용 공간 청소하기');
  await act('proposal-add');
  await shot('08-custom-rule', '생활 규칙 · 직접 입력한 제안');
  await act('rules-review');
  assert(await page.locator('[data-action="agreement"]').isDisabled());
  await shot('09-review', '생활 규칙 · 제안자 확인 및 조율');
  await scan();
  await page.locator('[data-action="proposal-approve"][data-who="me"]').first().click();
  await page.locator('[data-action="proposal-approve"][data-who="partner"]').first().click();
  await page.locator('#rule-final-0').fill('밤 11시 이후에는 이어폰을 사용해요');
  await act('proposal-edit');
  assert.equal(await page.locator('[data-action="proposal-approve"]').first().getAttribute('aria-pressed'), 'false');
  await shot('10-revision', '생활 규칙 · 수정 시 두 사람 재확인');
  for (let i = 0; i < (await page.locator('[data-action="proposal-approve"]').count()); i++)
    await page.locator('[data-action="proposal-approve"]').nth(i).click();
  await page.reload();
  await page.locator('#splash').waitFor({ state: 'detached' });
  assert(await page.locator('[data-action="agreement"]').isEnabled());
  await shot('11-approved', '생활 규칙 · 조항별 두 사람 확인 완료');
  await act('agreement');
  await page.locator('[data-action="sign"][data-who="me"]').click();
  assert.equal(await page.locator('[data-action="save-agree"]').count(), 0);
  await shot('12-signing', '합의서 · 첫 번째 서명');
  await page.locator('[data-action="sign"][data-who="partner"]').click();
  await act('save-agree');
  await page.waitForURL('**/#/agreement-complete');
  await shot('13-agreement-complete', '생활 규칙 · 합의 완료');
  assert(await page.getByText('3개 조항 합의 완료', { exact: true }).isVisible());

  await go('checklist');
  await page.locator('[data-action="prep-toggle"]').nth(0).click();
  await page.locator('#cl-custom-in').fill('반려동물 안전문 준비');
  await act('cl-add');
  assert.equal(await page.locator('[data-action="prep-toggle"]').last().getAttribute('aria-pressed'), 'true');
  await shot('14-checklist-select', '입주 준비 · 필요한 항목 고르기·직접 추가');
  await act('prep-start');
  await act('check');
  await shot('15-checklist-step', '입주 준비 · 파트별 체크');
  await scan();
  const checkedBefore = await page.evaluate(() => localStorage.getItem('mateon.checklist'));
  await act('prep-next');
  await shot('16-checklist-next', '입주 준비 · 다음 파트');
  await act('prep-draft');
  await go('checklist');
  assert(await page.getByRole('heading', { name: '집·공간', exact: true }).isVisible());
  await shot('17-checklist-resume', '입주 준비 · 임시저장 후 이어하기');
  for (let i = 0; i < 6 && (await page.locator('[data-action="prep-next"]').count()); i++) await act('prep-next');
  await shot('18-checklist-last', '입주 준비 · 마지막 파트와 완료');
  await act('prep-finish');
  assert.equal(await page.evaluate(() => localStorage.getItem('mateon.checklist')), checkedBefore, '완료가 체크 상태를 바꾸면 안 됨');
  await shot('19-checklist-complete', '입주 준비 · 계획 저장 완료와 남은 준비');
  await go('space');
  await shot('20-space', '우리 공간 · 공통 앱바와 부가 기능 진입');

  await page.setViewportSize({ width: 320, height: 700 });
  await go('invite');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.evaluate(() => {
    localStorage.setItem('ds-theme', 'dark');
  });
  await page.reload();
  const colors = await page.locator('.app-header button').evaluateAll((buttons) => buttons.map((b) => getComputedStyle(b).color));
  assert(colors.every((c) => c === colors[0]));
  await scan();
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(out, 'index.html'),
    '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>메이트온 UI 피드백 반영 · 플로우 검토</title><style>body{margin:0;padding:32px;background:#f6f4f1;color:#303943;font-family:system-ui,sans-serif}h1{font-size:26px}p{line-height:1.8;max-width:900px}.screens{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,390px));gap:24px}figure{margin:0}figcaption{font-weight:650;margin-bottom:12px;line-height:1.6}img{width:100%;border-radius:16px;border:1px solid #ddd}</style><h1>메이트온 · UI 피드백 반영</h1><p>앱바의 뒤로가기·제목·아이콘을 통일했습니다. 내 결과와 메이트 결과는 대상에 따라 분리합니다. 생활 규칙은 각자 제안 → 직접 입력 → 조항 조율 → 두 사람 확인 → 서명 → 합의 완료로 이어집니다. 입주 준비는 필요한 항목 선택 → 파트별 체크 → 임시저장·복구 → 계획 저장 완료로 이어집니다.</p><p>규칙 동의는 같은 기기를 번갈아 사용해 본인이 확인하는 방식입니다. 두 사람 확인이 완료되기 전에는 서명할 수 없고, 문장을 바꾸면 다시 확인해야 합니다. 체크리스트의 완료는 준비 계획 저장을 뜻하며 미완료 항목은 남습니다.</p><div class="screens">' +
      shots
        .map(
          (s, i) =>
            '<figure><figcaption>' + (i + 1) + '. ' + s.title + '</figcaption><img loading="lazy" src="' + s.id + '.png" alt="' + s.title + '"></figure>'
        )
        .join('') +
      '</div></html>'
  );
  console.log('PASS: 공통 앱바·결과 대상·진단 몰입·규칙 제안/수정/확인/서명·체크리스트 선택/단계/임시저장/복구/완료·320px·다크 테마');
  console.log('Review:', path.join(out, 'index.html'));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
