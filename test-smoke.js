/* MATE:ON 브라우저 플로우 스모크 테스트 (DOM 스텁) */
const fs = require('fs');

/* ---- DOM / 브라우저 스텁 ---- */
const store = {};
let lastHTML = '';
const listeners = {};
const appEl = { addEventListener: (t, fn) => { listeners['app:' + t] = fn; } };
Object.defineProperty(appEl, 'innerHTML', {
  get() { return lastHTML; },
  set(v) { lastHTML = v; },
});
const toastEl = { textContent: '', classList: { add() {}, remove() {} } };

global.document = {
  getElementById: (id) => id === 'app' ? appEl : (id === 'toast' ? toastEl : null),
  documentElement: { dataset: {} },
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, setAttribute() {}, select() {}, remove() {}, value: '' }),
  body: { appendChild() {} },
  execCommand: () => true,
};
const hashListeners = [];
global.window = {
  matchMedia: () => ({ matches: false }),
  scrollTo: () => {},
  addEventListener: (t, fn) => { if (t === 'hashchange') hashListeners.push(fn); },
  isSecureContext: false,
};
global.localStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: (k) => { delete store[k]; },
};
let _hash = '';
global.location = { search: '', href: 'file:///C:/test/index.html', pathname: '/C:/test/index.html' };
Object.defineProperty(global.location, 'hash', {
  get: () => _hash,
  set: (v) => { _hash = v; hashListeners.forEach(fn => fn()); },
});
global.history = { replaceState: (a, b, c) => { if (c) location.hash = c; } };
global.navigator = {};

/* ---- 스크립트 로드 ---- */
eval(fs.readFileSync('js/data.js', 'utf8') + '\n' +
  fs.readFileSync('js/mateon.js', 'utf8') +
  '\n;globalThis.__d={QUESTIONS,CHARACTERS,DOMAINS,SAMPLE_RESULTS};');

const { QUESTIONS, CHARACTERS } = globalThis.__d;

function nav(hash) {
  location.hash = hash;
}
function click(action, dataset) {
  const el = {
    dataset: Object.assign({ action }, dataset || {}),
    disabled: false,
    classList: { add() {}, remove() {} },
  };
  listeners['app:click']({ target: { closest: (sel) => sel === '[data-action]' ? el : null } });
}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  OK', name); }
  else { fail++; console.log('  FAIL', name); }
}

console.log('== 1. 홈 렌더 ==');
check('슬로건 표시', lastHTML.includes('함께 살 준비'));
check('진단 시작 버튼', lastHTML.includes('진단 시작하기'));

console.log('== 2. 온보딩 → 설문 ==');
click('start');
check('온보딩 화면', lastHTML.includes('이름 또는 닉네임'));
// 이름 입력 시뮬레이션
listeners['app:input']({ target: { id: 'pf-name', value: '다원' } });
click('survey');
check('설문 화면', lastHTML.includes('1 / 20'));

console.log('== 3. 20문항 응답 ==');
// 비동기 진행(220ms) — 수동으로 S.q 전진 없이, answer 액션을 연속 호출하려면
// setTimeout이 필요하므로 실제 타이머를 기다림
async function answerAll() {
  for (let i = 0; i < QUESTIONS.length; i++) {
    click('answer', { idx: i % 4 });
    await new Promise(r => setTimeout(r, 260));
  }
}
(async () => {
  await answerAll();
  check('결과 화면 이동', lastHTML.includes('동거 캐릭터'));
  check('E/R 게이지 표시', lastHTML.includes('교류 활성도') && lastHTML.includes('자극 민감도'));
  check('매트릭스 표시', lastHTML.includes('matrix-cell'));
  check('저장됨', !!store['mateon.me']);
  const me = JSON.parse(store['mateon.me']);
  check('캐릭터 ID 유효', me.charId >= 1 && me.charId <= 16);

  console.log('== 4. 초대 링크 인코딩 ==');
  click('invite');
  check('초대 화면', lastHTML.includes('초대 링크'));
  check('링크에 invite= 포함', lastHTML.includes('?invite='));
  const inviteMatch = lastHTML.match(/invite=([A-Za-z0-9_-]+)/);

  console.log('== 5. 같은 기기 상대 진단 ==');
  click('partner-survey');
  check('상대 온보딩', lastHTML.includes('이번에는 우리 둘'));
  listeners['app:input']({ target: { id: 'pf-name', value: '하늘' } });
  click('survey');
  await answerAll();
  check('상대 결과 화면', lastHTML.includes('동거 캐릭터'));
  check('partner 저장됨', !!store['mateon.partner']);

  console.log('== 6. 궁합 리포트 ==');
  click('report');
  check('리포트 렌더', lastHTML.includes('우리 둘 궁합 리포트'));
  check('갈등 예측 표시', lastHTML.includes('생활 갈등 예측'));
  check('규칙 추천 표시', lastHTML.includes('생활규칙'));
  check('매트릭스 양측 표시', lastHTML.includes('matrix'));

  console.log('== 7. 합의서 ==');
  click('agreement');
  check('합의서 렌더', lastHTML.includes('우리집 생활 합의서'));
  check('서명 전 저장 불가', lastHTML.includes('두 분 모두 동의하면'));
  click('sign', { who: 'me' });
  click('sign', { who: 'partner' });
  check('서명 후 저장 가능', lastHTML.includes('합의서 저장하기'));
  click('save-agree');
  check('합의서 저장됨', !!store['mateon.agreement']);

  console.log('== 8. 초대 링크 디코딩 (v2 압축 포맷) ==');
  const m = inviteMatch;
  if (m) {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const obj = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    check('v2 배열 포맷', Array.isArray(obj));
    check('디코딩된 이름', typeof obj[0] === 'string');
    check('디코딩된 캐릭터', obj[5] >= 1 && obj[5] <= 16);
    check('도메인 데이터', Array.isArray(obj[8]) && obj[8].length === 5);
  } else {
    check('초대 링크 존재', false);
  }

  console.log('== 9. 16유형 도감 ==');
  click('types');
  check('도감 렌더', lastHTML.includes('16개 동거 캐릭터'));
  check('16개 유형 카드', (lastHTML.match(/type-card/g) || []).length >= 16);
  click('type', { id: '7' });
  check('유형 상세 렌더', lastHTML.includes('유연한 조율가'));
  check('갈등 시퀀스 표시', lastHTML.includes('갈등 시퀀스'));

  console.log('== 10. 입주 체크리스트 ==');
  click('checklist');
  check('체크리스트 렌더', lastHTML.includes('입주 체크리스트'));
  click('check', { v: '계약·서류:0' });
  check('항목 체크 저장', lastHTML.includes('checked') && store['mateon.checklist']);

  console.log('== 11. 실무 성향 체크 ==');
  S_me_check: {
    click('result');
    click('lifecheck');
    check('실무 체크 렌더', lastHTML.includes('실무 성향'));
    for (let i = 0; i < 6; i++) {
      click('life-answer', { idx: i % 3 });
      await new Promise(r => setTimeout(r, 260));
    }
    const meData = JSON.parse(store['mateon.me']);
    check('실무 성향 저장', !!(meData.life && meData.life.length === 6));
    check('실무 메모 표시', lastHTML.includes('실무 성향 메모') || lastHTML.includes('동거 캐릭터'));
  }

  console.log('== 12. 진단 이력 ==');
  const hist = JSON.parse(store['mateon.history'] || '[]');
  check('이력 저장됨', hist.length >= 2);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
