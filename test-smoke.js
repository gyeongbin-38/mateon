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

const fakeInputs = {};
global.document = {
  getElementById: (id) =>
    id === 'app' ? appEl :
    id === 'toast' ? toastEl :
    fakeInputs[id] || null,
  documentElement: { dataset: {} },
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, setAttribute() {}, select() {}, remove() {}, value: '', click() {} }),
  body: { appendChild() {} },
  execCommand: () => true,
  addEventListener: () => {},
  title: '',
};
function fakeInput(id, value) {
  fakeInputs[id] = { id, value: value || '', classList: { add() {}, remove() {} }, focus() {} };
  return fakeInputs[id];
}
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
eval(fs.readFileSync('js/config.js', 'utf8') + '\n' +
  fs.readFileSync('js/data.js', 'utf8') + '\n' +
  fs.readFileSync('js/lifetools.js', 'utf8') + '\n' +
  fs.readFileSync('js/secure.js', 'utf8') + '\n' +
  fs.readFileSync('js/i18n.js', 'utf8') + '\n' +
  fs.readFileSync('js/mateon.js', 'utf8') +
  '\n;globalThis.__d={QUESTIONS,CHARACTERS,DOMAINS,SAMPLE_RESULTS,TALK_STARTERS,LIFE_QUESTIONS,LOVE_MAP_QUESTIONS};');

const { QUESTIONS, CHARACTERS, SAMPLE_RESULTS, TALK_STARTERS, LOVE_MAP_QUESTIONS } = globalThis.__d;
const { encodeResult, decodeResult, resultFromCode, encodeInvite, decodeInvite, resultFromLink, qrSVG, isoWeekKey, state: appState } = window.__mateon;

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
function reloadApp(search, hash) {
  hashListeners.length = 0;
  location.search = search; _hash = hash;
  eval(fs.readFileSync('js/config.js', 'utf8') + '\n' + fs.readFileSync('js/data.js', 'utf8') + '\n' + fs.readFileSync('js/lifetools.js', 'utf8') + '\n' + fs.readFileSync('js/mateon.js', 'utf8'));
}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  OK', name); }
  else { fail++; console.log('  FAIL', name); }
}

console.log('== 1. 홈 렌더 ==');
check('슬로건 표시', lastHTML.includes('함께 살 준비'));
check('진단 시작 버튼', lastHTML.includes('data-action="start"') && lastHTML.includes('나의 동거 성향 알아보기'));
check('동거 테스트 카드', lastHTML.includes('동거 성향 테스트'));
check('홈 준비 단계 표시', lastHTML.includes('mission-steps') && lastHTML.includes('메이트 연결') && lastHTML.includes('aria-current="step"'));
check('캐러셀 위치 점과 상태', lastHTML.includes('carousel-dots') && lastHTML.includes('carousel-dot on') && lastHTML.includes('aria-current="true"'));
check('오늘의 대화 주제 수', lastHTML.includes('주제 ') && lastHTML.includes('/ 20'));
check('하단 네비게이션', lastHTML.includes('bottom-nav') && lastHTML.includes('nav-item'));
check('네비 홈 활성', /nav-item on[^>]*data-action="home"|data-action="home"[^>]*nav-item on/.test(lastHTML));
const indexSrc = fs.readFileSync('index.html', 'utf8');
check('스플래시 마크업', indexSrc.includes('id="splash"') && indexSrc.includes('splash-logo'));
const mateonSrc = fs.readFileSync('js/mateon.js', 'utf8');
check('스플래시 1초 타이밍', mateonSrc.includes('dismissSplash') && mateonSrc.includes('680'));
const configSrc = fs.readFileSync('js/config.js', 'utf8');
check('배포 웹 링크 설정', indexSrc.includes('js/config.js') && configSrc.includes('https://gyeongbin-38.github.io/mateon/'));

console.log('== 2. 온보딩 → 설문 ==');
click('start');
check('온보딩 화면', lastHTML.includes('이름 또는 닉네임'));
// 이름 입력 시뮬레이션
listeners['app:input']({ target: { id: 'pf-name', value: '다원' } });
click('survey');
check('설문 화면', lastHTML.includes('1 / 20'));
check('문항 슬라이드 클래스', lastHTML.includes('q-slide q-next'));

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
  // 첫 문항 응답 후 draft 저장 확인
  click('answer', { idx: 0 });
  await new Promise(r => setTimeout(r, 260));
  check('설문 진행 draft 저장', !!store['mateon.draft.me']);
  check('다음 문항 슬라이드', lastHTML.includes('q-slide q-next'));
  click('prev');
  check('이전 문항 슬라이드', lastHTML.includes('q-slide q-prev'));
  // 중도 이탈 → 홈 이어하기
  click('home');
  check('이어하기 카드', lastHTML.includes('data-action="resume-survey"') && lastHTML.includes('1 / 20'));
  click('resume-survey');
  check('설문 복귀', lastHTML.includes('1 / 20') && lastHTML.includes('selected'));
  click('answer', { idx: 0 });
  await new Promise(r => setTimeout(r, 260));
  for (let i = 1; i < QUESTIONS.length; i++) {
    click('answer', { idx: i % 4 });
    await new Promise(r => setTimeout(r, 260));
  }
  check('결과 화면 이동', lastHTML.includes('동거 캐릭터'));
  check('E/R 게이지 표시', lastHTML.includes('교류 활성도') && lastHTML.includes('자극 민감도'));
  check('매트릭스 표시', lastHTML.includes('matrix-cell'));
  check('수치 의미 안내', lastHTML.includes('참고 도구'));
  check('매트릭스 접근성', lastHTML.includes('role="img"') && lastHTML.includes('성향 지도'));
  check('저장됨', !!store['mateon.me']);
  check('완료 후 draft 정리', !store['mateon.draft.me']);
  const me = JSON.parse(store['mateon.me']);
  check('캐릭터 ID 유효', me.charId >= 1 && me.charId <= 16);
  check('결과에 원본 캐릭터 이미지 연결', lastHTML.includes('assets/character-sheet.png') && lastHTML.includes('character-art'));
  check('주요 행동을 상세 수치보다 먼저 배치', lastHTML.indexOf('data-action="saveimg"') < lastHTML.indexOf('result-details'));
  check('수치 상세는 펼치기 제공', lastHTML.includes('<details class="card result-details"') && lastHTML.includes('<summary>'));
  check('응답 일치도 의미 안내', lastHTML.includes('진단 정확도를 뜻하지 않아요'));

  console.log('== 4. 초대 링크 인코딩 ==');
  click('invite');
  check('초대 화면', lastHTML.includes('초대 링크'));
  check('공유 정보 안내', lastHTML.includes('링크에 포함되는 정보'));
  check('닉네임 토글 표시', lastHTML.includes('닉네임 포함'));
  click('share-name');
  check('닉네임 제외 표시', lastHTML.includes('제외됨'));
  const inviteOff = lastHTML.match(/invite=([A-Za-z0-9_-]+)/);
  check('익명 링크 디코딩', inviteOff && decodeInvite(inviteOff[1]).result.name === '동거인');
  click('share-name');
  check('링크에 invite= 포함', lastHTML.includes('?invite='));
  const inviteMatch = lastHTML.match(/invite=([A-Za-z0-9_-]+)/);
  const inviteDec = decodeInvite(inviteMatch[1]);
  check('초대 링크 v3 디코딩', inviteDec && inviteDec.result && inviteDec.result.name === '다원');
  check('초대 링크 만료 시각 존재', inviteDec && inviteDec.exp > Date.now() && inviteDec.expired === false);
  check('QR 카드 표시', lastHTML.includes('QR로 바로 연결'));
  check('유효기간 칩 표시', lastHTML.includes('링크 유효기간'));
  // v3 encode/decode 라운드트립 + 만료 처리
  const enc1 = encodeInvite(me, 7);
  const dec1 = decodeInvite(enc1);
  check('v3 인코딩/디코딩', enc1[0] === 'z' && dec1 && dec1.result.charId === me.charId);
  check('v3 만료 플래그', (function () {
    const now = Date.now; Date.now = () => now() + 8 * 86400000;
    const d = decodeInvite(enc1); Date.now = now;
    return d && d.expired === true;
  })());
  check('레거시 링크 호환', decodeInvite(encodeResult(me)) && decodeInvite(encodeResult(me)).result.name === me.name);
  check('만료 링크 파싱', (function () {
    const now = Date.now; Date.now = () => now() + 8 * 86400000;
    const r = resultFromLink('https://x.example/?invite=' + enc1); Date.now = now;
    return r && r.expired === true;
  })());
  check('정상 링크 파싱', (function () {
    const r = resultFromLink('https://x.example/?invite=' + enc1);
    return r && r.r && r.r.charId === me.charId;
  })());

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
  check('리포트 링크 버튼', lastHTML.includes('리포트 링크 복사'));
  check('선택 개수 배지', lastHTML.includes('선택 '));
  check('규칙 토글 상태', lastHTML.includes('aria-pressed'));
  check('비판정 안내', lastHTML.includes('참고 자료'));

  console.log('== 6-1. 커스텀 규칙 추가 ==');
  fakeInput('custom-rule-in', '화요일 저녁은 각자 자유시간');
  click('add-rule');
  check('커스텀 규칙 렌더', lastHTML.includes('화요일 저녁은 각자 자유시간'));
  check('직접 추가 배지', lastHTML.includes('직접 추가'));
  check('커스텀 규칙 저장', (JSON.parse(store['mateon.customRules'] || '[]')).length === 1);

  console.log('== 6-2. 대화 스타터 (샘플 상대로 차이 보장) ==');
  click('invite');
  click('sample');
  check('대화 스타터 표시', lastHTML.includes('함께 나눠볼 질문'));
  check('질문 카드 렌더', lastHTML.includes('talk-q'));

  console.log('== 7. 합의서 ==');
  click('agreement');
  check('합의서 렌더', lastHTML.includes('우리집 생활 합의서'));
  check('서명 전 저장 불가', lastHTML.includes('두 분 모두 동의하면'));
  click('sign', { who: 'me' });
  click('sign', { who: 'partner' });
  check('서명 후 저장 가능', lastHTML.includes('합의서 저장하기'));
  click('save-agree');
  check('합의서 저장됨', !!store['mateon.agreement']);
  const savedAgreement = JSON.parse(store['mateon.agreement']);
  check('합의서 페어 식별자 저장', savedAgreement.meCharId === JSON.parse(store['mateon.me']).charId && savedAgreement.partnerCharId === JSON.parse(store['mateon.partner']).charId);
  check('비법적 문서 안내', lastHTML.includes('법적 효력은 없어요'));
  reloadApp('', '#/agreement');
  check('새로고침 후 저장 규칙 복원', lastHTML.includes('화요일 저녁은 각자 자유시간') && lastHTML.includes('저장된 규칙을 불러왔어요'));
  check('저장 합의서 서명 복원', (lastHTML.match(/sign-box signed/g) || []).length === 2);
  check('합의서 초기 버전 표시', lastHTML.includes('v1'));
  click('report');
  click('rule', { v: savedAgreement.rules[0] });
  click('agreement');
  check('합의서 변경 비교 표시', lastHTML.includes('저장된 합의서와 다른 선택이에요') && lastHTML.includes('제외됨 1'));
  check('변경 후 재서명 필요', lastHTML.includes('두 분 모두 동의하면'));
  click('restore-agree');
  check('저장본 되돌리기', !lastHTML.includes('agree-diff') && lastHTML.includes('저장된 규칙을 불러왔어요'));
  click('report');
  click('rule', { v: savedAgreement.rules[0] });
  click('agreement');
  click('sign', { who: 'me' });
  click('sign', { who: 'partner' });
  click('save-agree');
  const updatedAgreement = JSON.parse(store['mateon.agreement']);
  check('변경 합의서 버전 증가', updatedAgreement.rev === 2 && updatedAgreement.updated && !updatedAgreement.rules.includes(savedAgreement.rules[0]));
  click('space');
  check('우리 공간에서 저장 합의서 연결', lastHTML.includes('저장된 합의서 보기'));

  console.log('== 8. 초대 링크 난독화 (v3) ==');
  const m = inviteMatch;
  if (m) {
    check('v3 토큰 접두사', m[1][0] === 'z');
    const b64 = m[1].slice(1).replace(/-/g, '+').replace(/_/g, '/');
    const raw = Buffer.from(b64, 'base64').toString('utf8');
    check('평문 JSON 아님(난독화)', (function () { try { JSON.parse(raw); return false; } catch (e) { return true; } })());
    const dec8 = decodeInvite(m[1]);
    check('난독화 해제 후 결과 복원', dec8 && dec8.result && dec8.result.charId >= 1 && dec8.result.charId <= 16);
    check('도메인 수치 복원', dec8 && dec8.result.domains && typeof dec8.result.domains.A.e === 'number');
  } else {
    check('초대 링크 존재', false);
  }

  console.log('== 9. 16유형 도감 ==');
  click('types');
  check('도감 렌더', lastHTML.includes('16개 동거 캐릭터'));
  check('16개 유형 카드', (lastHTML.match(/type-card/g) || []).length >= 16);
  check('거리 배지 표시', lastHTML.includes('tc-dist'));
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

  console.log('== 13. 리포트 공유 링크 (pair) 디코딩 ==');
  const pairStr = encodeResult(SAMPLE_RESULTS.me) + '.' + encodeResult(SAMPLE_RESULTS.partner);
  const [pa, pb] = pairStr.split('.').map(decodeResult);
  check('pair 첫 결과 디코딩', pa && pa.charId === SAMPLE_RESULTS.me.charId);
  check('pair 둘째 결과 디코딩', pb && pb.charId === SAMPLE_RESULTS.partner.charId);

  console.log('== 14. 유형 코드로 연결 ==');
  click('invite');
  check('코드 입력 UI', lastHTML.includes('code-connect-in'));
  fakeInput('code-connect-in', 'e3r2');
  click('code-connect');
  const e3r2 = CHARACTERS.find(c => c.code === 'E3R2');
  check('코드로 연결된 파트너', JSON.parse(store['mateon.partner']).charId === e3r2.id);
  check('리포트 렌더', lastHTML.includes('우리 둘 궁합 리포트'));
  const byCode = resultFromCode('E4R1', '테스트');
  check('resultFromCode 생성', byCode && byCode.charId === CHARACTERS.find(c => c.code === 'E4R1').id);

  console.log('== 14-1. 받은 초대 링크 연결 ==');
  click('invite');
  const ownBeforeLink = store['mateon.me'];
  const partnerBeforeLink = store['mateon.partner'];
  fakeInput('partner-link', 'javascript:alert(1)');
  click('preview-partner');
  check('잘못된 링크는 저장 결과를 보존', store['mateon.partner'] === partnerBeforeLink && !lastHTML.includes('data-action="confirm-partner"'));
  fakeInput('partner-link', 'https://gyeongbin-38.github.io/mateon/?invite=' + encodeResult(byCode));
  click('preview-partner');
  check('연결 전 상대 확인', lastHTML.includes('data-action="confirm-partner"') && store['mateon.partner'] === partnerBeforeLink);
  click('cancel-partner');
  check('연결 취소는 데이터 보존', store['mateon.partner'] === partnerBeforeLink);
  fakeInput('partner-link', 'mateon://invite?data=' + encodeResult(byCode));
  click('preview-partner');
  click('confirm-partner');
  check('앱 초대 링크 실제 결과 연결', JSON.parse(store['mateon.partner']).name === '테스트');
  check('연결 후 내 진단 보존', store['mateon.me'] === ownBeforeLink);

  console.log('== 15. 대화 스타터 데이터 ==');
  check('TALK_STARTERS 5개 영역', Object.keys(TALK_STARTERS).length === 5);
  const beforeDemo = JSON.stringify(store);
  click('demo');
  check('데모는 실제 저장 데이터를 보존', JSON.stringify(store) === beforeDemo);
  check('데모 리포트 표시', lastHTML.includes('우리 둘 궁합 리포트'));
  click('home');
  const beforeTalk = lastHTML;
  click('next-talk');
  check('홈 대화 주제 전환', lastHTML !== beforeTalk);
  const bad = JSON.parse(Buffer.from(encodeResult(SAMPLE_RESULTS.me).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  bad[5] = 999;
  check('알 수 없는 캐릭터 초대 거부', decodeResult(Buffer.from(JSON.stringify(bad)).toString('base64')) === null);
  bad[5] = SAMPLE_RESULTS.me.charId; bad[3] = 99;
  check('범위 밖 성향 초대 거부', decodeResult(Buffer.from(JSON.stringify(bad)).toString('base64')) === null);

  console.log('== 16. 상대 연결 해제 ==');
  click('invite');
  check('연결 해제 버튼', lastHTML.includes('연결 해제'));
  click('unlink');
  check('파트너 해제됨', !store['mateon.partner']);
  check('초대 화면 유지', lastHTML.includes('초대 링크'));

  console.log('== 17. 설정 / 개인정보 / 약관 / 데이터 관리 ==');
  click('settings');
  check('설정 화면 렌더', lastHTML.includes('데이터 관리') && lastHTML.includes('약관 및 정보'));
  check('네비 설정 활성', /nav-item on" data-action="settings"/.test(lastHTML));
  check('저장 항목 나열', lastHTML.includes('내 진단 결과') && lastHTML.includes('저장됨'));
  check('닉네임 토글 (설정)', lastHTML.includes('닉네임 포함'));
  check('백업 섹션과 파일 선택 UI', lastHTML.includes('백업 파일 내보내기') && lastHTML.includes('id="backup-file"'));
  const backupPayload = window.__mateon.buildBackup();
  const backupText = JSON.stringify(backupPayload);
  const backupData = window.__mateon.parseBackup(backupText);
  check('백업 생성과 파싱', !!(backupPayload && backupPayload.data && backupPayload.data['mateon.me'] && backupData));
  const backupMe = JSON.stringify(backupPayload.data['mateon.me']);
  store['mateon.me'] = 'null';
  check('백업 데이터 복원', window.__mateon.applyBackupData(backupData) && store['mateon.me'] === backupMe);
  check('백업 파일 텍스트 가져오기', window.__mateon.importBackupText(backupText) && location.hash === '#/home');
  click('settings');
  check('잘못된 백업 거부', !window.__mateon.parseBackup('{"app":"Other","schema":1,"data":{}}'));
  const foreignBackup = JSON.parse(backupText);
  foreignBackup.data['localStorage.pollution'] = true;
  check('알 수 없는 저장 키 백업 거부', !window.__mateon.parseBackup(JSON.stringify(foreignBackup)));
  const badResultBackup = JSON.parse(backupText);
  badResultBackup.data['mateon.me'].charId = 99;
  check('손상된 결과 백업 거부', !window.__mateon.parseBackup(JSON.stringify(badResultBackup)));
  click('settings');
  click('privacy');
  check('개인정보 화면', lastHTML.includes('개인정보처리방침') && lastHTML.includes('localStorage'));
  check('개인정보 MVP 표기', lastHTML.includes('MVP'));
  click('settings');
  click('terms');
  check('약관 화면', lastHTML.includes('서비스 이용약관') && lastHTML.includes('법적 효력이 없습니다'));
  click('settings');
  click('del-data', { v: 'mateon.checklist' });
  check('항목 삭제 확인 단계', lastHTML.includes('삭제 확인') && store['mateon.checklist']);
  click('del-data', { v: 'mateon.checklist' });
  check('체크리스트 삭제', !store['mateon.checklist']);
  click('reset-all');
  check('삭제 확인 단계', lastHTML.includes('한 번 더 누르면'));
  click('reset-all');
  check('전체 삭제 후 홈', lastHTML.includes('동거 성향 테스트'));
  check('내 결과 삭제됨', !store['mateon.me']);
  check('이력 삭제됨', !store['mateon.history']);

  console.log('== 18. Web Interface Guidelines 준수 ==');
  const cssSrc = fs.readFileSync('css/mateon.css', 'utf8');
  check('transition: all 제거', !cssSrc.includes('transition: all'));
  check('skip link 존재', indexSrc.includes('skip-link') && lastHTML.includes('id="main"'));
  check('외부 CDN 의존 없음 (폰트 자체호스팅)', !indexSrc.includes('jsdelivr') && indexSrc.includes('css/pretendard.css'));
  check('장식 SVG aria-hidden', lastHTML.includes('svg aria-hidden="true"'));
  check('무한 루프 애니메이션 없음', !/animation:\s*[a-z-]+\s+[\d.]+s[^;]*infinite/.test(cssSrc));
  check('theme-color 배경 일치', indexSrc.includes('content="#FFFFFF"'));
  check('tabular-nums 적용', cssSrc.includes('tabular-nums'));
  check('입력 autocomplete', lastHTML.includes('autocomplete') || mateonSrc.includes('autocomplete="nickname"'));

  click('space');
  check('우리 공간 탭', lastHTML.includes('우리 공간') && lastHTML.includes('나의 대화 기록'));
  check('대화 기록 빈 상태', lastHTML.includes('아직 남긴 이야기가 없어요'));
  store['mateon.talks'] = JSON.stringify({0:{text:'<script>alert(1)</script>',ts:Date.now()}});
  click('space');
  check('저장한 대화 렌더링과 이스케이프', lastHTML.includes('&lt;script&gt;') && !lastHTML.includes('<script>alert'));
  click('checklist');
  window.__mateon.handleBack();
  check('상세 뒤로가기는 우리 공간', location.hash === '#/space');
  const storedBeforeInvite = JSON.stringify(store);
  check('앱 초대 딥링크 처리', window.__mateon.acceptNativeLink('mateon://invite?data=' + encodeResult(SAMPLE_RESULTS.me)));
  check('앱 초대 온보딩', location.hash === '#/onboarding' && lastHTML.includes('초대했어요'));
  check('앱 초대가 기존 저장 기록 보존', JSON.stringify(store) === storedBeforeInvite);
  check('잘못된 앱 링크 거부', !window.__mateon.acceptNativeLink('mateon://invite?data=bad'));
  check('다른 프로토콜 거부', !window.__mateon.acceptNativeLink('https://example.com'));
  check('HTTPS 초대 앱링크 처리', window.__mateon.acceptNativeLink('https://gyeongbin-38.github.io/mateon/?invite=' + encodeResult(SAMPLE_RESULTS.me)));
  check('비슷한 웹 경로 거부', !window.__mateon.acceptNativeLink('https://gyeongbin-38.github.io/mateonbad/?invite=' + encodeResult(SAMPLE_RESULTS.me)));
  check('HTTPS 리포트 링크 처리', window.__mateon.acceptNativeLink('https://gyeongbin-38.github.io/mateon/?pair=' + pairStr + '#/report'));
  check('앱 리포트 링크 처리', window.__mateon.acceptNativeLink('mateon://pair?data=' + pairStr));
  check('앱 리포트 표시', lastHTML.includes('우리 둘 궁합 리포트'));
  click('home');
  check('홈 뒤로가기는 앱에 위임', !window.__mateon.handleBack());

  console.log('== 19. 새로고침 후 상대 진단 복구 ==');
  const savedMe = JSON.stringify(SAMPLE_RESULTS.me);
  store['mateon.me'] = savedMe;
  const resumedDraft = {q:19, answers:QUESTIONS.slice(0,19).map(q=>({qid:q.id,code:q.options[0].code})), profile:{name:'복구한 상대',relation:'친구',stage:''},invite:null};
  store['mateon.draft.partner'] = JSON.stringify(resumedDraft);
  store['mateon.activeDraft'] = JSON.stringify('partner');
  reloadApp('', '#/home');
  check('홈에 상대 진단 이어하기 표시', lastHTML.includes('복구한 상대님의 진단 이어하기'));
  click('resume-survey');
  check('상대 진단 문항 복구', lastHTML.includes('20 / 20'));
  click('answer', {idx:0});
  await new Promise(r=>setTimeout(r,260));
  check('복구한 진단이 상대 결과로 저장', JSON.parse(store['mateon.partner']).name === '복구한 상대' && store['mateon.me'] === savedMe);
  check('완료한 상대 초안 정리', !store['mateon.draft.partner'] && !store['mateon.activeDraft']);
  resumedDraft.invite = encodeResult(SAMPLE_RESULTS.partner);
  store['mateon.draft.partner'] = JSON.stringify(resumedDraft);
  store['mateon.activeDraft'] = JSON.stringify('partner');
  reloadApp('?invite=' + resumedDraft.invite, '#/home');
  check('같은 초대 링크로 재방문하면 진단 복구', location.hash === '#/survey' && lastHTML.includes('20 / 20'));
  click('answer', {idx:0});
  await new Promise(r=>setTimeout(r,260));
  check('초대 수신자의 이름 보존', JSON.parse(store['mateon.me']).name === '복구한 상대');
  check('초대한 메이트 연결 및 초안 정리', JSON.parse(store['mateon.partner']).name === SAMPLE_RESULTS.partner.name && !store['mateon.draft.partner']);

  console.log('== 20. 생활비 정산 ==');
  store['mateon.me'] = JSON.stringify(SAMPLE_RESULTS.me);
  store['mateon.partner'] = JSON.stringify(SAMPLE_RESULTS.partner);
  reloadApp('', '#/settle');
  check('정산 화면 렌더', lastHTML.includes('생활비 정산') && lastHTML.includes('지출 추가'));
  check('정산 빈 상태', lastHTML.includes('아직 지출 기록이 없어요'));
  click('exp-payer', { v: 'you' });
  click('exp-cat', { v: '식비' });
  fakeInput('exp-memo', '마트 장보기');
  fakeInput('exp-amt', '30000');
  click('exp-add');
  check('지출 저장됨', (JSON.parse(store['mateon.expenses'] || '[]')).length === 1);
  check('지출 내역 표시', lastHTML.includes('마트 장보기') && lastHTML.includes('30,000원'));
  click('exp-payer', { v: 'me' });
  fakeInput('exp-memo', '전기세');
  fakeInput('exp-amt', '10000');
  click('exp-add');
  check('반반 정산 계산', lastHTML.includes('10,000원') && lastHTML.includes('정산'));
  const expId = JSON.parse(store['mateon.expenses'])[0].id;
  click('exp-del', { v: expId });
  check('지출 삭제 확인 단계', lastHTML.includes('확인'));
  click('exp-del', { v: expId });
  check('지출 삭제됨', (JSON.parse(store['mateon.expenses'])).length === 1);
  click('exp-settle');
  check('정산 마감', (JSON.parse(store['mateon.expenses'])).length === 0 && (JSON.parse(store['mateon.settled'])).length === 1);
  check('지난 정산 기록 표시', lastHTML.includes('지난 정산 기록'));

  console.log('== 21. 역할 분담 ==');
  nav('#/chores');
  check('분담 화면 렌더', lastHTML.includes('역할 분담') && lastHTML.includes('집안일 추가'));
  click('chore-preset', { v: '설거지' });
  check('프리셋 추가', lastHTML.includes('설거지'));
  click('chore-preset', { v: '화장실 청소' });
  const choresNow = JSON.parse(store['mateon.chores']);
  check('분담 목록 저장', choresNow.items.length === 2 && choresNow.rot.length === 2);
  check('담당 교차 배정', choresNow.items.map(function(it,i){return window.__mateon.choreOwner(i, Date.now());}).join(',') !== choresNow.items.map(function(it,i){return window.__mateon.choreOwner(i, Date.now() + 7*86400000);}).join(','));
  const cid0 = choresNow.items[0].id;
  click('chore-done', { v: cid0 });
  check('완료 체크', !!(JSON.parse(store['mateon.choreLog'])[isoWeekKey()] || {})[cid0]);
  check('완료 카운트 표시', lastHTML.includes('1 / 2 완료'));
  click('chore-done', { v: cid0 });
  check('완료 취소', !((JSON.parse(store['mateon.choreLog'])[isoWeekKey()] || {})[cid0]));
  fakeInput('chore-in', '분리수거');
  click('chore-add');
  check('직접 집안일 추가', lastHTML.includes('분리수거'));
  click('chore-del', { v: cid0 });
  click('chore-del', { v: cid0 });
  check('집안일 삭제', (JSON.parse(store['mateon.chores'])).items.length === 2);
  check('다음 주 미리보기', lastHTML.includes('다음 주 미리보기'));

  console.log('== 22. 우리 일정 ==');
  nav('#/calendar');
  check('일정 화면 렌더', lastHTML.includes('우리 일정'));
  const todayStr = new Date().toISOString().slice(0, 10);
  fakeInput('ev-date', '2099-12-31');
  fakeInput('ev-title', '전세 만기일');
  fakeInput('ev-memo', '오후 2시 집주인 연락');
  click('ev-who', { v: 'both' });
  click('ev-add');
  check('일정 저장됨', (JSON.parse(store['mateon.events'] || '[]')).length === 1);
  check('일정 표시', lastHTML.includes('전세 만기일') && lastHTML.includes('집주인'));
  const evId = JSON.parse(store['mateon.events'])[0].id;
  check('ICS 버튼 표시', lastHTML.includes('data-action="ev-ics"'));
  click('ev-del', { v: evId });
  click('ev-del', { v: evId });
  check('일정 삭제됨', (JSON.parse(store['mateon.events'])).length === 0);
  check('일정 빈 상태', lastHTML.includes('예정된 일정이 없어요'));

  console.log('== 23. 주간 체크인 ==');
  nav('#/checkin');
  check('체크인 화면 렌더', lastHTML.includes('이번 주 체크인') && lastHTML.includes('mood-btn'));
  click('ci-mood', { v: '4' });
  check('기분 선택 저장', (JSON.parse(store['mateon.checkins'] || '[]'))[0].mood === 4);
  fakeInput('ci-fix', '주말엔 같이 청소하기');
  click('ci-save');
  check('체크인 저장됨', (JSON.parse(store['mateon.checkins']))[0].fix === '주말엔 같이 청소하기');
  check('체크인 상태 표시', lastHTML.includes('체크인 수정하기'));
  nav('#/home');
  check('체크인 배너 숨김', !lastHTML.includes('checkin-banner'));

  console.log('== 24. 갈등 가이드 ==');
  nav('#/conflict');
  check('갈등 화면 렌더', lastHTML.includes('갈등이 생겼을 때') && lastHTML.includes('어떤 일이 있었나요'));
  click('cg-domain', { v: 'B' });
  click('cg-next');
  check('멈추기 단계', lastHTML.includes('각자 정리 시간') || lastHTML.includes('정리 시간'));
  click('cg-next');
  check('대화 단계', lastHTML.includes('이렇게 시작해 보세요'));
  click('cg-next');
  check('합의 단계', lastHTML.includes('작은 약속 하나 정하기'));
  fakeInput('cg-note', '설거지는 자기 전까지');
  click('cg-save');
  check('합의 기록됨', (JSON.parse(store['mateon.conflictLog'] || '[]'))[0].note === '설거지는 자기 전까지');
  check('합의 후 우리 공간으로', location.hash === '#/space');
  nav('#/conflict');
  click('cg-domain', { v: 'D' });
  click('cg-next'); click('cg-next'); click('cg-next');
  fakeInput('cg-note', '밤 11시 이후 이어폰');
  click('cg-save-rule');
  check('합의→규칙 연동', (JSON.parse(store['mateon.customRules'] || '[]')).includes('밤 11시 이후 이어폰'));

  console.log('== 25. 커스텀 체크리스트 ==');
  nav('#/checklist');
  check('직접 추가 섹션', lastHTML.includes('직접 추가한 항목'));
  fakeInput('cl-custom-in', '벌레 퇴치제 사기');
  click('cl-add');
  check('커스텀 항목 추가', lastHTML.includes('벌레 퇴치제 사기'));
  const ownId = JSON.parse(store['mateon.customChecklist'])[0].id;
  click('check', { v: 'own:' + ownId });
  check('커스텀 항목 체크', JSON.parse(store['mateon.checklist'])['own:' + ownId] === true);
  click('cl-del', { v: ownId });
  click('cl-del', { v: ownId });
  check('커스텀 항목 삭제', (JSON.parse(store['mateon.customChecklist'])).length === 0);
  check('체크 키도 정리', !JSON.parse(store['mateon.checklist'])['own:' + ownId]);

  console.log('== 26. 설정 확장 ==');
  nav('#/settings');
  check('알림 섹션', lastHTML.includes('주간 체크인 알림'));
  check('글자 크기 섹션', lastHTML.includes('글자 크기'));
  check('동기화 섹션', lastHTML.includes('메이트 동기화'));
  check('튜토리얼 링크', lastHTML.includes('앱 소개 다시 보기'));
  check('버전 표기', /v0\.3/.test(lastHTML));
  click('rem-checkin');
  check('알림 토글 저장', JSON.parse(store['mateon.reminders']).checkin === false);
  click('rem-checkin');
  click('font-size', { v: 'large' });
  check('글자 크기 저장', JSON.parse(store['mateon.fontSize']) === 'large');
  click('font-size', { v: 'normal' });
  fakeInput('sync-end', 'https://sync.example.workers.dev');
  fakeInput('sync-room', 'test-room-1');
  click('sync-save');
  check('동기화 설정 저장', JSON.parse(store['mateon.sync'] || '{}').room === 'test-room-1');
  check('동기화 상태 표시', lastHTML.includes('지금 주고받기'));
  click('sync-off');
  check('동기화 끄기', !store['mateon.sync']);
  click('tutorial');
  check('튜토리얼 다시보기', lastHTML.includes('tutorial-overlay') || lastHTML.includes('시작하기'));
  click('tutorial-close');
  check('튜토리얼 닫기 저장', JSON.parse(store['mateon.seen']) === true);

  console.log('== 27. 백업 신규 키 포함 ==');
  const backup = window.__mateon.buildBackup();
  check('백업 스키마 유지', backup.app === 'MATE:ON' && backup.schema === 1);
  check('백업에 지출 포함', Array.isArray(backup.data['mateon.expenses']));
  check('백업에 체크인 포함', Array.isArray(backup.data['mateon.checkins']));
  check('백업에 합의기록 포함', Array.isArray(backup.data['mateon.conflictLog']));
  check('백업에 알림설정 포함', backup.data['mateon.reminders'] && typeof backup.data['mateon.reminders'].checkin === 'boolean');
  check('손상 지출 백업 거부', !window.__mateon.applyBackupData({ 'mateon.expenses': [{ id: 'x', ts: 1, payer: 'me', amount: -5, memo: 'a', cat: 'b' }] }));

  console.log('== 28. 오프라인 배너 · 생활도구 진입 ==');
  Object.defineProperty(global.navigator, 'onLine', { value: false, configurable: true });
  reloadApp('', '#/home');
  check('오프라인 배너', lastHTML.includes('오프라인이에요'));
  Object.defineProperty(global.navigator, 'onLine', { value: true, configurable: true });
  reloadApp('', '#/home');
  check('생활도구 단축키(연결 후)', lastHTML.includes('생활비') && lastHTML.includes('역할 분담') && lastHTML.includes('주간 점검'));
  check('개인화 대화 카드', lastHTML.includes('personal-talk') || !lastHTML.includes('우리에게 맞춘 주제'));

  console.log('== 29. 분할 정산 · OCR 파서 · 쇼핑 · 러브맵 · CRDT 동기화 ==');
  /* --- 분할 정산 --- */
  store['mateon.expenses'] = '[]'; store['mateon.settled'] = '[]';
  reloadApp('', '#/settle');
  check('분할 모드 칩 표시', lastHTML.includes('나누는 방법') && lastHTML.includes('비율 %'));
  check('영수증 스캔 버튼', lastHTML.includes('영수증 스캔') && lastHTML.includes('exp-receipt'));
  click('exp-payer', { v: 'me' });
  click('exp-split', { v: 'percent' });
  check('비율 입력 표시', lastHTML.includes('exp-share'));
  fakeInput('exp-memo', '공동 구매');
  fakeInput('exp-amt', '10000');
  fakeInput('exp-share', '30');
  click('exp-add');
  const expRec = JSON.parse(store['mateon.expenses'])[0];
  check('비율 저장', expRec && Math.abs(expRec.share - 0.3) < 0.001);
  check('비율 정산 계산 (상대가 7,000원 부담)', window.__mateon.settleNet() === 7000);
  click('exp-split', { v: 'exact' });
  fakeInput('exp-memo', '상대 전용 물건');
  fakeInput('exp-amt', '8000');
  fakeInput('exp-share', '0');
  click('exp-add');
  check('정확금액 정산 (0원 부담 → 상대가 8,000원)', window.__mateon.settleNet() === 15000);
  check('비율 배지 표시', lastHTML.includes('30:70') || lastHTML.includes('0:100'));
  /* --- 영수증 파서 --- */
  const pr = window.__mateon.parseReceiptText('이마트 성수점\n감자 2,000\n우유 3,400\n합계 12,340원\n결제 완료');
  check('영수증 합계 인식', pr.amount === 12340);
  check('영수증 가게명', pr.store === '이마트 성수점');
  const pr2 = window.__mateon.parseReceiptText('TOTAL $15.00\nCASH $20');
  check('영수증 영문 합계', pr2.amount >= 15);
  check('빈 영수증 안전', window.__mateon.parseReceiptText('').amount === 0);
  /* 부가세·할인·날짜·전화번호는 총액으로 오인하면 안 됨 */
  const pr3 = window.__mateon.parseReceiptText('[영수증] 2026-10-05 14:22\nGS25 강남점\n전화 02-1234-5678\n삼각김밥 1,200\n커피 4,500\n공급가 5,182\n부가세 518\n결제금액 5,700');
  check('영수증 결제금액 우선', pr3.amount === 5700);
  check('영수증 가게명 노이즈 스킵', pr3.store === 'GS25 강남점');
  const pr4 = window.__mateon.parseReceiptText('CU 역삼점\n라면 1,500\n할인 -500\n총액 1,000');
  check('영수증 할인 무시', pr4.amount === 1000);
  const pr5 = window.__mateon.parseReceiptText('2026.10.05\n롯데마트\n과자 2,800\n음료 3,200\n승인금액 6,000\n승인번호 12345678');
  check('영수증 승인금액 + 가게명', pr5.amount === 6000 && pr5.store === '롯데마트');
  check('영수증 날짜행 가게명 제외', pr5.store !== '2026.10.05');
  /* --- 같이 살 것 --- */
  nav('#/shopping');
  check('쇼핑 화면 렌더', lastHTML.includes('같이 살 것') && lastHTML.includes('필요한 것 추가'));
  fakeInput('shop-in', '휴지');
  click('shop-add');
  check('쇼핑 항목 저장', (JSON.parse(store['mateon.shopping'] || '[]')).some(x => x.name === '휴지'));
  click('shop-preset', { v: '세탁세제' });
  check('프리셋 추가', (JSON.parse(store['mateon.shopping'])).length === 2);
  const shopId = JSON.parse(store['mateon.shopping'])[0].id;
  click('shop-done', { v: shopId });
  check('쇼핑 완료 체크', JSON.parse(store['mateon.shopping'])[0].done === true);
  check('산 것 섹션', lastHTML.includes('산 것'));
  click('shop-del', { v: shopId });
  click('shop-del', { v: shopId });
  check('쇼핑 항목 삭제', !JSON.parse(store['mateon.shopping']).some(x => x.id === shopId));
  /* --- 러브맵 퀴즈 --- */
  nav('#/lovemap');
  check('러브맵 렌더', lastHTML.includes('러브맵 퀴즈') && lastHTML.includes('맞혔어요'));
  click('lm-know');
  let lm = JSON.parse(store['mateon.lovemap']);
  check('러브맵 진행', lm.asked === 1 && lm.known === 1);
  click('lm-dont');
  lm = JSON.parse(store['mateon.lovemap']);
  check('러브맵 몰랐어요', lm.asked === 2 && lm.known === 1);
  check('진행 바 표시', lastHTML.includes('lovemap-bar'));
  window.__mateon.state.lovemap.asked = LOVE_MAP_QUESTIONS.length;
  nav('#/lovemap');
  check('러브맵 완료 상태', lastHTML.includes('모두 나눴어요'));
  click('lm-reset');
  check('러브맵 리셋', JSON.parse(store['mateon.lovemap']).asked === 0);
  /* --- TinyBase CRDT 동기화 --- */
  eval(fs.readFileSync('js/vendor/tinybase.js', 'utf8'));
  global.window.TinyBase = TinyBase;
  globalThis.TinyBase = TinyBase;
  window.__mateon.state.syncCfg = { endpoint: 'https://x.example', room: 'r1', slot: 'a', token: '' };
  window.__mateon.tbIngest();
  const tbDump = JSON.parse(store['mateon.tb']);
  check('TB 스냅샷 저장', Array.isArray(tbDump));
  const copy = TinyBase.createMergeableStore();
  copy.setMergeableContent(tbDump);
  check('TB 항목 행 반영', copy.getRowIds('kv').some(r => r.indexOf('e:') === 0));
  check('TB 본인 me 셀', typeof copy.getCell('kv', 'me:a', 'd') === 'string');
  /* 원격 기기가 자기 지출을 추가 → 머지하면 로컬에도 반영 */
  const remote = TinyBase.createMergeableStore();
  remote.setRow('kv', 'e:remote1', { d: JSON.stringify({ id: 'remote1', ts: 2, memo: '원격 지출', amount: 5000, payer: 'you', cat: '식비' }) });
  remote.setRow('kv', 'g:rg1', { d: JSON.stringify({ id: 'rg1', name: '원격 쇼핑', cat: '식료품', done: false, ts: 3 }) });
  remote.setCell('kv', 'me:b', 'd', JSON.stringify(SAMPLE_RESULTS.partner));
  remote.setCell('kv', 'w:mateon.checklist', 'd', JSON.stringify({ '계약·서류:0': true }));
  const merged = window.__mateon.mergeRemoteContent(remote.getMergeableContent());
  check('CRDT 머지 수신', merged === true);
  check('원격 지출 반영', JSON.parse(store['mateon.expenses']).some(x => x.id === 'remote1'));
  check('원격 쇼핑 반영', JSON.parse(store['mateon.shopping']).some(x => x.id === 'rg1'));
  check('원격 체크리스트 반영', JSON.parse(store['mateon.checklist'])['계약·서류:0'] === true);
  check('상대 결과 머지', (JSON.parse(store['mateon.partner'] || '{}').name === SAMPLE_RESULTS.partner.name));
  /* 삭제 툼스톤: 로컬에서 지운 항목이 원격 잔존 데이터를 되살리지 않는지 */
  store['mateon.expenses'] = JSON.stringify(JSON.parse(store['mateon.expenses']).filter(x => x.id !== 'remote1'));
  window.__mateon.state.expenses = JSON.parse(store['mateon.expenses']);
  window.__mateon.tbIngest();
  const remote2 = TinyBase.createMergeableStore();
  remote2.setMergeableContent(JSON.parse(store['mateon.tb']));
  check('삭제 툼스톤 유지', remote2.getCell('kv', 'e:remote1', 'd') == null);
  /* 상대가 삭제 전 상태를 들고 다시 푸시해도 삭제가 유지되는지 */
  const remoteOld = TinyBase.createMergeableStore();
  remoteOld.setMergeableContent(remote.getMergeableContent());
  window.__mateon.mergeRemoteContent(remoteOld.getMergeableContent());
  check('삭제 항목 부활 방지', !JSON.parse(store['mateon.expenses']).some(x => x.id === 'remote1'));

  /* --- 30. 월별 요약 · 고정비 · 활동 피드 --- */
  /* reloadApp 이후엔 window.__mateon.state가 새 S를 가리키므로 매번 새로 읽는다 */
  console.log('== 30. 월별 요약 · 고정비 · 활동 피드 ==');
  const liveS = () => window.__mateon.state;
  liveS().settleMonth = null;
  nav('#/settle');
  check('월 네비게이션 표시', lastHTML.includes('settle-monthnav') && lastHTML.includes('data-action="exp-month"'));
  check('월별 요약 카드', lastHTML.includes('지출 요약') && lastHTML.includes('month-stats'));
  check('카테고리 바', lastHTML.includes('cat-bars') && lastHTML.includes('cat-bar'));
  /* 이전 달 이동 → 표시 월이 바뀌고 내역이 필터링된다 */
  const curYm = liveS().settleMonth;
  click('exp-month', { v: '-1' });
  const prevYm = liveS().settleMonth;
  check('이전 달 이동', prevYm !== curYm && /^\d{4}-\d{2}$/.test(prevYm));
  /* 고정비 등록: 매월 반복 체크 후 지출 추가 */
  click('exp-month', { v: '1' });
  fakeInput('exp-memo', '월세'); fakeInput('exp-amt', '500000');
  fakeInput('exp-recur'); fakeInputs['exp-recur'].checked = true;
  click('exp-add');
  check('고정비 목록 등록', JSON.parse(store['mateon.fixedExpenses']).some(f => f.memo === '월세' && f.amount === 500000));
  check('고정비 카드 표시', lastHTML.includes('고정비 (1)'));
  check('fx 태그 지출 생성', liveS().expenses.some(x => x.fx && x.fx.startsWith(JSON.parse(store['mateon.fixedExpenses'])[0].id)));
  /* 재렌더해도 같은 달 고정비가 중복 생성되지 않는다 */
  const fxCount = liveS().expenses.filter(x => x.fx).length;
  nav('#/home'); nav('#/settle');
  check('고정비 중복 방지', liveS().expenses.filter(x => x.fx).length === fxCount);
  check('월별 합계에 고정비 반영', window.MateLife.monthStats(liveS().expenses, curYm).total >= 500000);
  /* 고정비 삭제 */
  const fxId = JSON.parse(store['mateon.fixedExpenses'])[0].id;
  click('fx-del', { v: fxId }); click('fx-del', { v: fxId });
  check('고정비 삭제', !JSON.parse(store['mateon.fixedExpenses']).length);
  /* 활동 피드: 지출·쇼핑 기록이 우리 공간에 표시된다 */
  nav('#/space');
  check('최근 활동 섹션', lastHTML.includes('최근 활동') && lastHTML.includes('activity-feed'));
  check('피드에 지출 포함', lastHTML.includes('feed-row') && lastHTML.includes('월세'));
  /* monthStats 순수 함수 */
  const mst2 = window.MateLife.monthStats(liveS().expenses, null);
  check('monthStats 합계', mst2.total === liveS().expenses.reduce((a, x) => a + x.amount, 0));

  /* --- 31. 기념일 D-day · 캘린더 월 뷰 · 주간 반복 · 미션 · 알림 확장 --- */
  console.log('== 31. 기념일 · 월 뷰 · 반복 · 미션 · 알림 ==');
  nav('#/calendar');
  check('캘린더 월 그리드', lastHTML.includes('cal-grid') && lastHTML.includes('cal-dow'));
  check('기념일 카드 표시', lastHTML.includes('우리 기념일') && lastHTML.includes('data-action="anniv-add"'));
  /* 기념일 등록 → 홈 D-day 배너 */
  fakeInput('anniv-title', '만난 날'); fakeInput('anniv-date', '2025-01-01');
  click('anniv-add');
  check('기념일 저장됨', JSON.parse(store['mateon.anniv']).some(a => a.title === '만난 날' && a.date === '2025-01-01'));
  check('기념일 D-day 표시', lastHTML.includes('D-') || lastHTML.includes('D+'));
  nav('#/home');
  check('홈 D-day 배너', lastHTML.includes('dday-banner') && lastHTML.includes('만난 날'));
  /* 기념일 삭제 (2단계 확인) */
  nav('#/calendar');
  const aid = JSON.parse(store['mateon.anniv'])[0].id;
  click('anniv-del', { v: aid }); click('anniv-del', { v: aid });
  check('기념일 삭제됨', !JSON.parse(store['mateon.anniv']).length);
  /* 월 이동 */
  const cm0 = liveS().calMonth;
  click('cal-month', { v: '-1' });
  check('이전 달 이동', liveS().calMonth !== cm0 && /^\d{4}-\d{2}$/.test(liveS().calMonth));
  click('cal-month', { v: '1' });
  /* 주간 반복 일정 */
  fakeInput('ev-date', '2026-01-05'); fakeInput('ev-title', '청소의 날'); fakeInput('ev-memo', '');
  fakeInputs['ev-rpt'] = { checked: true };
  click('ev-add');
  check('반복 일정 저장', JSON.parse(store['mateon.events']).some(e => e.rpt === 'w' && e.title === '청소의 날'));
  check('반복 표시', lastHTML.includes('매주'));
  /* 반복 일정이 달력에 점으로 표시 (2026-01 월에 월요일들) */
  liveS().calMonth = '2026-01';
  nav('#/home'); nav('#/calendar');
  check('월 뷰에 반복 점 표시', (lastHTML.match(/cal-cell has/g) || []).length >= 4);
  /* 주간 미션 — 같은 주에는 같은 목록, 완료 토글 저장 */
  nav('#/checkin');
  check('주간 미션 카드', lastHTML.includes('이번 주 우리 미션') && lastHTML.includes('data-action="mission-done"'));
  const msn = JSON.parse(store['mateon.missions']);
  check('미션 2개 생성', msn.list.length === 2 && msn.week === isoWeekKey());
  click('mission-done', { v: msn.list[0].id });
  check('미션 완료 저장', JSON.parse(store['mateon.missions']).list[0].done === true);
  click('mission-done', { v: msn.list[0].id });
  check('미션 완료 취소', JSON.parse(store['mateon.missions']).list[0].done === false);
  /* 기분 추이 차트 — 체크인 2주 이상이면 표시 */
  liveS().checkins.push({ week: '2099-W01', mood: 4, kept: [], ts: Date.now() });
  liveS().checkins.push({ week: '2099-W02', mood: 2, kept: [], ts: Date.now() });
  nav('#/home'); nav('#/checkin');
  check('기분 추이 차트', lastHTML.includes('mood-chart') && lastHTML.includes('기분 추이'));
  /* 집안일 알림 토글 */
  nav('#/settings');
  check('집안일 알림 토글 표시', lastHTML.includes('data-action="rem-chore"'));
  click('rem-chore');
  check('집안일 알림 꺼짐 저장', JSON.parse(store['mateon.reminders']).chore === false);
  click('rem-chore');
  check('집안일 알림 복구', JSON.parse(store['mateon.reminders']).chore === true);
  /* 백업 신규 키 왕복 — 값이 저장된 키만 백업에 들어간다 */
  nav('#/settle');
  click('budget-set');
  check('예산 저장됨', !!store['mateon.budgets']);
  nav('#/settings');
  click('backup-export');
  check('백업 시각 기록', liveS().lastBackup > 0 && !!store['mateon.lastBackup']);
  const bk = window.__mateon.buildBackup();
  check('백업에 기념일·미션·예산 포함', 'mateon.anniv' in bk.data && 'mateon.missions' in bk.data && 'mateon.budgets' in bk.data);
  check('백업에 백업시각 포함', typeof bk.data['mateon.lastBackup'] === 'number');
  const bkOk = window.__mateon.parseBackup(JSON.stringify(bk));
  if (!bkOk) Object.keys(bk.data).forEach(k => { const d2 = JSON.parse(JSON.stringify(bk)); delete d2.data[k]; if (window.__mateon.parseBackup(JSON.stringify(d2))) console.log('  [dbg] bad key:', k, JSON.stringify(bk.data[k]).slice(0, 150)); });
  check('반복 일정 백업 통과', !!bkOk);
  /* CSV 생성 순수 함수 — 쉼표·따옴표 이스케이프 */
  const csv = window.MateLife.expensesToCSV([{ ts: Date.now(), memo: '카페, "좋은곳"', amount: 1000, payer: 'me', cat: '카페', share: 0.5 }], () => '나');
  check('CSV 이스케이프', csv.includes('"카페, ""좋은곳"""'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
