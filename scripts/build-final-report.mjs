/* 16:9 제출 PDF. 배포 앱의 증거 화면과 제공된 Figma 시나리오 이미지를 사용한다. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const root = path.resolve('artifacts/final-report');
const assets = path.join(root, 'assets');
const data = JSON.parse(await fs.readFile(path.join(root, 'app-data.json'), 'utf8'));
const version = JSON.parse(await fs.readFile('release.config.json', 'utf8')).assetVersion;
const app = 'https://gyeongbin-38.github.io/mateon/?v=' + version + '#/home';
const figma = 'https://www.figma.com/design/6pEODkDou0HL5bDynZvv1P?node-id=333-7244';
await fs.mkdir(path.join(root, 'css'), { recursive: true });
await fs.cp('fonts', path.join(root, 'fonts'), { recursive: true });
await fs.copyFile('css/pretendard.css', path.join(root, 'css/pretendard.css'));
for (const file of ['logo-symbol.svg', 'logo-lockup.svg', 'app-icon.svg']) await fs.copyFile('assets/' + file, path.join(assets, file));
for (let i = 1; i <= 6; i++) {
  await sharp(path.join(assets, 'scene-' + i + '.png'))
    .resize(1400, 788, { fit: 'cover' })
    .jpeg({ quality: 86 })
    .toFile(path.join(assets, 'scene-' + i + '.jpg'));
}
for (const c of data.CHARACTERS) {
  const e = Number(c.code[1]) - 1;
  const r = Number(c.code[3]) - 1;
  await sharp('assets/character-sheet-cutout-v2.png')
    .extract({ left: [0, 340, 680, 1021][e], top: [890, 610, 330, 0][r], width: 340, height: [266, 280, 280, 330][r] })
    .resize(300, 240, { fit: 'contain', background: '#00000000' })
    .png()
    .toFile(path.join(assets, 'character-' + c.id + '.png'));
}
const slides = [];
const image = (id, cls = '', alt = '') => `<img class="${cls}" src="assets/${id}" alt="${alt}">`;
const p = (t) => `<p>${t}</p>`;
const note = (t) => `<p class="note">${t}</p>`;
const bullets = (items) => `<ul>${items.map((t) => `<li>${t}</li>`).join('')}</ul>`;
const steps = (items) => `<ol class="journey">${items.map(([a, b]) => `<li><strong>${a}</strong><span>${b}</span></li>`).join('')}</ol>`;
function add(section, title, lead, body, extra = '') {
  slides.push({ section, title, lead, body, extra });
}
function screen(id, title, desc = '') {
  return `<figure class="screen">${image(id + '.png', 'phone', title)}<figcaption><strong>${title}</strong>${desc ? `<span>${desc}</span>` : ''}</figcaption></figure>`;
}
function flowScreens(list, text = '') {
  return `<div class="flow-layout"><div class="screens count-${list.length}">${list.map((s) => screen(...s)).join('')}</div>${text ? `<aside>${text}</aside>` : ''}</div>`;
}
function scenario(n, title, situation, action, value, list) {
  add(
    '서비스 시나리오 · 0' + n,
    title,
    situation,
    `<div class="scenario"><div>${image('scene-' + n + '.jpg', 'scene', 'Figma 시나리오 장면 ' + n)}<h3>사용자 행동</h3>${p(action)}<h3 class="accent">경험 가치</h3>${p(value)}</div><div class="scenario-screens">${list.map((s) => screen(...s)).join('')}</div></div>`,
    '제공된 Figma의 상황 이미지 · 앱 화면과 이름·응답은 시연 예시'
  );
}

add(
  'AI와 UXD · 성격유형 기반 앱 서비스',
  '같이 살기 전에,<br>우리의 생활부터 알아봐요',
  'MATE:ON 메이트온 · 최종 보고서',
  `<div class="cover-brand">${image('logo-lockup.svg', 'cover-logo', 'MATE:ON 로고')}<p>동거 성향 진단과 생활 합의로<br>두 사람의 편안한 일상을 준비하는 앱</p><div class="cover-meta">서비스 브랜딩 / 페르소나 / 앱 서비스 플로우 / 서비스 시나리오</div></div><div class="cover-art">${image('character-12.png', '', '열정적 해결가')}${image('character-13.png', '', '고감도 보호가')}</div>`,
  '2026.10.25 · 모바일 앱 MVP'
);

add(
  '서비스 소개',
  '서로 다른 생활을, 함께 이야기할 기준으로',
  '좋아하는 마음만으로 알기 어려운 생활 습관을 구체적인 질문과 약속으로 연결합니다.',
  `<div class="columns three"><div><div class="big-num">01</div><h3>나를 이해하기</h3>${p('20개 생활 상황에 답하고, 16가지 캐릭터로 나의 교류 방식과 민감도를 이해합니다.')}</div><div><div class="big-num">02</div><h3>차이를 발견하기</h3>${p('메이트의 결과를 연결해 5개 영역의 차이와 갈등 상황을 살펴봅니다.')}</div><div><div class="big-num">03</div><h3>우리 기준 만들기</h3>${p('생활 기준을 비교하고, 각자의 규칙을 조율해 합의서와 입주 준비로 이어갑니다.')}</div></div><blockquote>“우리, 같이 살아도 잘 맞을까?”<br><span>동거를 고민하는 연인이 대화를 시작하는 순간에 초점을 맞춥니다.</span></blockquote>${note('이 진단은 자기 보고에 기반한 생활 대화 도구입니다. 심리검사나 동거 적합성의 확정 판정으로 제시하지 않습니다.')}`
);

add(
  'Part 1-1 · 서비스 브랜딩',
  '네이밍과 로고',
  'MATE + ON : 함께할 사람을 이해하고, 함께 사는 생활을 시작하다',
  `<div class="logo-layout"><div class="logo-main">${image('logo-lockup.svg', '', '조합형 로고')}${p('메이트와 연결되는 순간, 우리의 생활이 ON 됩니다.')}</div><div><div class="logo-spec">${image('logo-symbol.svg', '', '심볼')}<div><h3>두 사람과 하나의 집</h3>${p('코랄과 블루의 두 사람이 마주한 모습에 M과 지붕, 작은 창을 담았습니다.')}</div></div><div class="logo-spec">${image('app-icon.svg', '', '앱 아이콘')}<div><h3>앱 아이콘</h3>${p('작은 화면에서도 두 사람의 관계와 집의 형태를 알아볼 수 있도록 심볼을 사용합니다.')}</div></div></div></div><div class="closing-line">서비스 슬로건 · 함께 살 준비, 서로를 아는 것부터.</div>`
);

add(
  'Part 1-1 · 비주얼 아이덴티티',
  '따뜻한 관계와 차분한 정보 전달',
  '브랜드 표현색과 실제 앱의 본문·버튼 색을 구분해 적용합니다.',
  `<div class="swatches">${[
    ['#FF6B7A', 'MATE Coral', '브랜드·캐릭터 포인트'],
    ['#6B9EFF', 'MATE Blue', '메이트·비교 정보'],
    ['#C23A52', 'Action Coral', '앱 주요 버튼·선택 상태'],
    ['#FAF9F7', 'Warm Paper', '앱 기본 배경'],
    ['#303943', 'Ink', '제목·본문'],
  ]
    .map(([hex, name, use]) => `<div><div class="swatch" style="background:${hex}"></div><h3>${name}</h3><p>${hex}<br>${use}</p></div>`)
    .join(
      ''
    )}</div><div class="type-spec"><div><h3>Pretendard Variable</h3><div class="type-large">우리의 일상, 조금 더 가까이.</div>${p('한글을 중심으로 제목·입력·생활 정보를 읽기 편하게 구성합니다.')}</div><div>${p('<b>앱바</b> 17px / 700 · 모든 화면 공통<br><b>본문</b> 14–16px · 명확한 문장과 단계 안내<br><b>터치 영역</b> 최소 48px · 주요 조작 일관성<br><b>보조색</b> #EFF5EE · 안내 영역, #5A6270 · 보조 본문')}</div></div>`
);

add(
  'Part 1-1 · 유형별 캐릭터 디자인',
  '16가지 동거 캐릭터',
  '교류 활성도 E × 자극 민감도 R의 4단계 조합을 캐릭터의 모습과 행동 언어로 표현합니다.',
  `<div class="character-layout"><div class="character-grid">${data.CHARACTERS.map((c) => `<figure>${image('character-' + c.id + '.png', '', c.name)}<figcaption><b>${c.code}</b> ${c.name}</figcaption></figure>`).join('')}</div><aside><h3>E · 교류 활성도</h3>${p('E1 → E4<br>개인 리듬을 중시하는 방식부터<br>교류와 조율을 먼저 이끄는 방식까지')}<h3>R · 자극 민감도</h3>${p('R1 → R4<br>작은 변화를 넘기는 방식부터<br>자극과 관계 신호에 민감한 방식까지')}${note('유형 사이에 우열을 두지 않습니다. 결과는 상대를 규정하기보다 생활 대화를 돕는 언어로 사용합니다.')}</aside></div>`
);

add(
  'Part 1-2 · 메인 페르소나',
  '다원 · 첫 동거를 앞둔 대학생',
  '“좋아하는 사이지만, 같이 살 때의 기준은 아직 이야기해본 적이 없어요.”',
  `<div class="persona"><div class="persona-id">${image('character-12.png', '', '메인 페르소나의 유형 예시')}<h3>김다원 · 24세</h3><p>대학생 / 서울 거주<br>연인과 첫 동거 준비<br>집 탐색 → 계약 단계</p><p class="accent">기획 가설 페르소나</p></div><div class="persona-body"><h3>라이프스타일</h3>${p('수업과 아르바이트를 병행하며, 약속과 할 일을 모바일 메모로 정리합니다. 함께 식사하고 일상을 나누는 시간을 중요하게 생각합니다.')}<div class="columns two"><div><h3>결핍 요인 · Pain points</h3>${bullets(['연인과 자신의 휴식 방식이 얼마나 다른지 모릅니다.', '청소나 비용 이야기를 먼저 꺼내면 관계가 불편해질까 걱정합니다.', '입주 준비가 많아 무엇부터 정해야 할지 막막합니다.'])}</div><div><h3>필요 요인 · Needs</h3>${bullets(['부담 없이 생활 이야기를 시작할 질문', '차이를 이해할 수 있는 구체적인 결과', '함께 고르고 확인한 규칙과 준비 목록'])}</div></div><div class="closing-line">설계 연결 · 성향 진단 → 메이트 연결 → 생활 규칙 제안 → 입주 체크리스트</div></div></div>`,
  '인터뷰·통계로 검증된 인물이 아닌 기획 가설입니다. 유형은 시연 예시입니다.'
);

add(
  'Part 1-2 · 서브 페르소나',
  '하늘 · 개인 리듬을 지키고 싶은 직장인',
  '“같이 살아도, 혼자 충전하는 시간은 존중받고 싶어요.”',
  `<div class="persona"><div class="persona-id">${image('character-13.png', '', '서브 페르소나의 유형 예시')}<h3>이하늘 · 27세</h3><p>회사원 / 수도권 거주<br>연인과 동거를 고민 중<br>교대 없는 주간 근무</p><p class="accent">기획 가설 페르소나</p></div><div class="persona-body"><h3>라이프스타일</h3>${p('퇴근 후 조용히 쉬며 에너지를 회복합니다. 방문객과 일정 변화는 미리 알고 싶어 하고, 길게 대화하기 전 혼자 생각할 시간이 필요합니다.')}<div class="columns two"><div><h3>결핍 요인 · Pain points</h3>${bullets(['혼자 쉬려는 행동이 무관심으로 받아들여집니다.', '갈등이 생기면 즉시 답해야 한다는 압박을 느낍니다.', '기억에만 의존한 약속은 나중에 해석이 달라집니다.'])}</div><div><h3>필요 요인 · Needs</h3>${bullets(['개인 시간을 존중하는 생활 기준', '대화 시점을 정할 수 있는 구체적인 제안', '두 사람이 확인하고 다시 볼 수 있는 합의 기록'])}</div></div><div class="closing-line">설계 연결 · 메이트 결과 이해 → 갈등 대화 방식 → 조항 조율 → 주간 체크인</div></div></div>`,
  '연령·직업·생활 방식은 기획 가정입니다. 실제 이용자 조사를 통해 검증할 예정입니다.'
);

add(
  'Part 2 · 앱 서비스 구조',
  '진단과 합의를 중심으로 이어지는 네 개의 탭',
  '홈의 핵심 여정과 우리 공간의 지속 이용 기능을 구분합니다.',
  `<div class="nav-map"><div><h3>홈</h3>${p('성향 진단<br>내 결과 · 메이트 연결<br>궁합 리포트 · 생활 기준')}</div><div><h3>우리 공간</h3>${p('생활 규칙 · 합의서<br>입주 체크리스트<br>주간 체크인 · 생활 도구')}</div><div><h3>유형 찾기</h3>${p('16가지 캐릭터 도감<br>유형 상세<br>다른 생활 방식 이해')}</div><div><h3>마이</h3>${p('내 진단·이력<br>데이터 관리<br>알림·테마·앱 설정')}</div></div><div class="columns two bottom-space"><div><h3>메인 기능</h3>${p('생활 상황 진단으로 나의 유형을 알고, 두 사람의 결과를 연결해 차이를 발견합니다.')}</div><div><h3>부가 기능</h3>${p('규칙을 각자 제안하고 조율·확인하며, 필요한 입주 준비를 고르고 이어서 체크합니다.')}</div></div>${note('모바일 앱 구조를 기준으로 설계했습니다. 정보 입력·진단 중에는 하단 탭을 숨겨 현재 작업에 집중하도록 합니다.')}`
);

add(
  'Part 2-1 · 메인 기능 정의와 흐름',
  '나를 알고, 메이트의 생활을 이해하기',
  '개인 진단 결과를 바탕으로 두 사람의 차이를 대화 가능한 정보로 바꿉니다.',
  steps([
    ['01 정보 입력', '닉네임 · 관계 · 준비 단계'],
    ['02 성향 진단', '5개 영역 · 20개 생활 상황'],
    ['03 내 진단 결과', '캐릭터 · E/R · 생활 팁'],
    ['04 메이트 연결', '초대 링크 · 같은 기기 진단'],
    ['05 우리 둘 리포트', '차이 영역 · 갈등 대화 · 추천 질문'],
    ['06 생활 기준 비교', '청결 · 비용 · 집안일 등 6항목'],
  ]) +
    `<div class="closing-line">진단받은 유형은 내 결과에서 확인하고, 다른 유형은 별도의 도감에서 탐색합니다.</div>${note('두 사람의 진단이 모이면 리포트를 확인합니다. 생활 기준 6문항은 E/R 유형 채점과 별도로 저장합니다.')}`
);

add(
  'Part 2-1 · 화면별 기능 01',
  '정보 입력과 생활 상황 진단',
  '실제 행동에 가까운 응답을 고르고, 중간에 나가도 이어서 진행합니다.',
  flowScreens(
    [
      ['profile', '01 시작 전 정보 입력', '닉네임·관계·준비 단계 입력'],
      ['survey-1', '02 성향 진단 시작', '문항별 4개 선택지에서 평소 모습 선택'],
      ['survey-5', '03 생활 상황으로 판단', '설거지·개인 공간·갈등 등 구체적인 맥락'],
    ],
    '<h3>진단 화면의 원칙</h3>' + bullets(['공통 앱바와 이전 문항 이동', '20문항 중 현재 위치 표시', '답변과 진행 상태 자동 저장', '하단 내비게이션 제거'])
  )
);

add(
  'Part 2-1 · 화면별 기능 02',
  '내 진단 결과와 유형 탐색의 역할 분리',
  '내 결과는 진단받은 캐릭터 한 가지를 중심으로 보여줍니다.',
  flowScreens(
    [
      ['result', '04 내 진단 결과', '유형·강점·주의점과 다음 행동 확인'],
      ['result-detail', '05 상세 정보 펼치기', 'E/R 수치·응답 일치도·생활 팁 확인'],
      ['types', '06 유형 도감', '결과 하단의 16개 유형 탐색으로 이동'],
    ],
    '<h3>결과 카드 안에서</h3>' +
      bullets(['상세 정보보기', '다시 진단하기', '상대 초대와 결과 공유']) +
      note('상단의 유형 선택 캐러셀을 제거했습니다. 타 유형 탐색이 내 진단으로 오인되지 않도록 분리했습니다.')
  )
);

add(
  'Part 2-1 · 화면별 기능 03',
  '메이트 연결과 두 사람의 리포트',
  '내 결과와 상대의 결과를 구분하고, 함께 살며 맞춰볼 부분을 확인합니다.',
  flowScreens(
    [
      ['connect', '07 메이트 연결 · 초대', '결과 링크 또는 같은 기기 진단으로 연결'],
      ['partner-result', '08 메이트 진단 결과', '상대의 유형과 생활 방식 이해'],
      ['report', '09 우리 둘 궁합 리포트', '두 유형의 위치와 차이 영역 확인'],
    ],
    '<h3>연결 시 알리는 정보</h3>' +
      bullets(['닉네임 포함 여부 선택', '링크에 포함되는 결과 안내', '연결할 상대를 먼저 확인']) +
      note('공유 링크를 가진 사람은 포함된 결과를 볼 수 있습니다. 리포트는 동거의 성공·실패를 판정하지 않습니다.')
  )
);

add(
  'Part 2-1 · 화면별 기능 04',
  '차이를 읽고 대화로 연결하기',
  '정리된 수치와 설명을 통해 지금 함께 정해야 할 생활 기준을 찾습니다.',
  flowScreens(
    [
      ['report-domains', '10 생활 영역별 차이', '개인 경계·함께하는 시간·대화 방식'],
      ['life-compare', '11 생활 기준 비교', '같은 응답과 다른 응답을 문항별 표시'],
    ],
    '<h3>다원과 하늘의 예시</h3>' +
      p('다원은 먼저 대화하고, 하늘은 잠시 회복한 뒤 이야기하고 싶어 합니다.') +
      p('<b>“30분 쉬고, 9시에 이야기할까?”</b>처럼 다시 만날 시간을 정하는 대화로 이어집니다.') +
      note('앱의 비교 수치는 응답 기반의 참고 지표이며 실제 관계 성과를 예측한 수치가 아닙니다.')
  )
);

add(
  'Part 2-1 · 생활 기준 체크',
  '유형만으로 알 수 없는 여섯 가지 생활 기준',
  '청결 · 비용 · 집안일 · 수면·소음 · 손님 초대 · 연락·보고',
  flowScreens(
    [
      ['life-1', '12 청결 기준', '집이 어느 정도 정돈되어야 편한지'],
      ['life-3', '13 집안일 방식', '그때그때·역할 분담·스케줄제 중 선택'],
      ['life-4', '14 수면·소음', '밤에 원하는 집의 분위기 확인'],
    ],
    '<h3>별도 질문이 필요한 이유</h3>' +
      p('교류가 적극적이어도 청소 방식은 다를 수 있습니다. 성향과 실제 생활 기준을 분리합니다.') +
      note('선택지의 순서는 점수의 높고 낮음을 뜻하지 않습니다. 서로 다른 답은 “기준 다름”으로 표시합니다.')
  )
);

add(
  'Part 2-2 · 부가 기능 정의와 흐름',
  '대화한 내용을 우리집의 약속과 준비로',
  '결과 화면에서 바로 완료 상태로 건너뛰지 않고, 선택·입력·조율 과정을 제공합니다.',
  `<h3>우리집 생활 규칙</h3>${steps([
    ['각자의 제안', '추천 선택 · 직접 입력'],
    ['조항 조율', '제안자 확인 · 문장 수정'],
    ['두 사람 확인', '모든 조항 각각 동의'],
    ['서명·저장', '두 사람 서명 후 합의 완료'],
  ])}<h3 class="top-gap">입주 체크리스트</h3>${steps([
    ['필요한 항목 선택', '기본 목록에서 고르기'],
    ['우리집 항목 추가', '직접 필요한 준비 입력'],
    ['파트별 체크', '한 파트씩 확인·임시저장'],
    ['계획 저장', '남은 준비 확인·이어하기'],
  ])}${note('규칙 확인과 서명은 현재 MVP에서 같은 기기를 번갈아 사용하는 방식입니다. 인증된 원격 동의 기능은 후속 개발 범위입니다.')}`
);

add(
  'Part 2-2 · 생활 규칙 01',
  '각자가 원하는 규칙을 선택하고 입력하기',
  '한 사람이 정해진 조항을 모두 받아들이는 구조 대신, 제안의 출처가 남도록 설계합니다.',
  flowScreens(
    [
      ['rules-proposals', '15 각자의 규칙 제안', '상단에서 다원·하늘 전환 후 항목 선택'],
      ['rules-input', '16 규칙 직접 입력', '우리집에 필요한 문장을 직접 제안'],
    ],
    '<h3>예시 제안</h3>' +
      p('다원 · 밤 11시 이후 이어폰 사용<br>하늘 · 공동비용 정산일 정하기<br>직접 추가 · 토요일 함께 공용 공간 청소') +
      note('추천 항목은 시작점입니다. 사용자 상황에 맞는 규칙을 추가하고, 다음 단계에서 최종 문장을 함께 조율합니다.')
  )
);

add(
  'Part 2-2 · 생활 규칙 02',
  '조항을 조율하고, 두 사람의 확인을 거쳐 저장',
  '문장을 수정하면 두 사람의 확인을 다시 받아, 바뀐 내용에 동의하도록 합니다.',
  flowScreens(
    [
      ['rules-review', '17 조항별 조율', '제안자와 최종 문장·두 사람 확인 표시'],
      ['agreement-sign', '18 합의서 서명', '모든 조항 확인 후 두 사람 각각 서명'],
      ['agreement-done', '19 합의 완료', '최종 조항과 서명·다음 행동 확인'],
    ],
    '<h3>완료 조건</h3>' +
      bullets(['모든 조항에 두 사람 확인', '두 사람 모두 서명', '조건을 충족한 후 저장']) +
      note('예시는 3개 조항입니다. 실제 조항 수는 선택한 규칙에 따라 달라집니다.')
  )
);

add(
  'Part 2-2 · 입주 체크리스트 01',
  '우리집에 필요한 준비만 고르기',
  '정해진 목록 외에도 사용자가 준비 항목을 직접 추가합니다.',
  flowScreens(
    [
      ['checklist-select', '20 필요한 준비 선택', '카테고리별 기본 목록에서 선택·해제'],
      ['checklist-add', '21 우리집 항목 추가', '예: 반려동물 안전문 준비'],
    ],
    '<h3>선택과 완료를 구분</h3>' +
      p('처음의 체크 표시는 <b>우리집 목록에 포함</b>한다는 뜻입니다. 실제 준비 여부는 다음 단계에서 체크합니다.') +
      note('각 단계 하단에는 임시저장과 다음 행동을 제공합니다. 선택한 항목으로만 준비 계획을 구성합니다.')
  )
);

add(
  'Part 2-2 · 입주 체크리스트 02',
  '파트별로 확인하고, 저장한 지점부터 이어가기',
  '한 화면에 모든 항목을 몰아넣지 않고 준비 주제별로 나누어 진행합니다.',
  flowScreens(
    [
      ['checklist-step', '22 한 파트씩 체크', '진행 상태와 이전·다음 단계 제공'],
      ['checklist-resume', '23 임시저장 후 복구', '진행하던 파트와 체크 상태를 유지'],
      ['checklist-done', '24 준비 계획 저장', '완료·남은 준비를 구분해 요약'],
    ],
    '<h3>완료의 의미</h3>' +
      p('“완료”는 <b>준비 계획을 저장</b>했다는 뜻입니다. 아직 체크하지 않은 준비를 자동으로 완료 처리하지 않습니다.') +
      note('하단 홈으로 버튼을 제거하고, 상단 뒤로가기와 하단 탭의 역할을 구분했습니다.')
  )
);

add(
  'Part 2-2 · 우리 공간과 재방문',
  '함께 살면서 돌아보는 시간까지',
  '합의서를 만든 뒤에도 규칙과 생활을 주기적으로 확인하도록 연결합니다.',
  flowScreens(
    [
      ['space', '25 우리 공간', '생활 규칙·입주 준비·생활 도구 진입'],
      ['checkin', '26 주간 체크인', '이번 주 기분·지킨 규칙·감사와 대화 기록'],
    ],
    '<h3>다시 대화할 계기</h3>' +
      p('“이번 주에 잘 지켜진 약속은?”<br>“다음 주에 바꾸고 싶은 것은?”') +
      p('실행이 어려웠던 규칙을 함께 돌아보고, 지금의 생활에 맞게 다시 조율합니다.') +
      note('전체 부가 도구 중 본 보고서는 핵심 합의·준비·체크인 흐름을 상세히 다룹니다.')
  )
);

scenario(
  1,
  '동거를 고민하는 순간',
  '집을 알아보던 두 사람은 예산과 구조를 보다가, 함께 사는 생활도 이야기하기 시작합니다.',
  '다원은 “퇴근하면 어떻게 쉬고 싶어?”라고 묻습니다. 하늘은 혼자 충전할 시간도 필요하다고 답하고, 두 사람은 메이트온에서 성향 진단을 시작합니다.',
  '막연한 불안을 서로에게 물어볼 수 있는 질문으로 바꿉니다.',
  [['home-guest', '진단 전 홈', '나의 동거 성향 알아보기']]
);
scenario(
  2,
  '평소의 행동에 답하며 나를 알아가기',
  '이상적인 답보다 실제 생활에서 자주 하는 행동을 고릅니다.',
  '“집에 왔는데 동거인이 거실에 있다면?” 같은 20개 질문에 답합니다. 다원은 E4R3 열정적 해결가라는 예시 결과와 대화·회복 팁을 확인합니다.',
  '유형 이름과 함께 강점·주의점·생활 팁을 읽으며 나의 생활 방식을 이해합니다.',
  [
    ['survey-1', '구체적인 상황 질문', '평소 모습에 가까운 응답'],
    ['result', '내 진단 결과', '진단받은 캐릭터 한 가지'],
  ]
);
scenario(
  3,
  '한 공간에서 서로의 결과를 함께 보기',
  '거실에 나란히 앉아 결과를 연결하고, 개인 시간과 대화 타이밍의 차이를 읽습니다.',
  '다원 E4R3과 하늘 E1R4의 위치를 비교합니다. 바로 이야기하려는 다원과 회복 시간이 필요한 하늘은 “잠깐 쉬고 9시에 이야기하기”를 제안합니다.',
  '잘 맞는지 판단하는 데 그치지 않고, 입주 전에 맞춰야 할 지점을 발견합니다.',
  [
    ['report', '우리 둘의 위치', '교류·민감도 차이'],
    ['report-domains', '영역별 차이', '먼저 이야기할 내용'],
  ]
);
scenario(
  4,
  '같은 저녁, 서로 다른 생활 습관',
  '하늘은 식후 잠시 쉬고, 다원은 바로 설거지합니다. 같은 행동에도 다른 기준이 있습니다.',
  '청결·비용·집안일·소음 등 여섯 질문에 각각 답합니다. 역할을 정해두고 싶은 다원과 그때그때 하고 싶은 하늘은 담당과 완료 시점을 이야기합니다.',
  '태도의 문제로 단정하기 전에 생활 기준의 차이를 확인하고 구체적인 기준을 정합니다.',
  [
    ['life-3', '집안일 기준 질문', '선호하는 방식 선택'],
    ['life-compare', '응답 비교', '같음·기준 다름 확인'],
  ]
);
scenario(
  5,
  '말로 나눈 기준을 우리집의 약속으로',
  '입주할 집에서 필요한 준비를 확인하고, 둘이 정한 문장에 함께 동의합니다.',
  '각자 규칙을 고르고 직접 추가한 뒤 조항을 조율합니다. 모든 조항 확인과 두 사람 서명을 거쳐 저장하고, 입주 준비는 필요한 항목만 골라 체크합니다.',
  '누가 무엇에 동의했는지 남기고, 해야 할 준비를 실행 가능한 목록으로 만듭니다.',
  [
    ['agreement-sign', '합의서 서명', '각각 서명·저장'],
    ['checklist-step', '입주 준비', '한 파트씩 확인·저장'],
  ]
);
scenario(
  6,
  '함께 살며 우리의 변화를 돌아보기',
  '한 주를 마친 두 사람은 어떤 약속이 잘 지켜졌고 무엇이 어려웠는지 이야기합니다.',
  '우리 공간의 주간 체크인에서 이번 주 기분, 잘 지켜진 규칙, 고마웠던 일과 다음에 나눌 이야기를 기록합니다. 불편했던 약속은 다시 조율합니다.',
  '처음 만든 약속을 일방적인 기준으로 굳히지 않고, 현재의 생활에 맞게 함께 바꿉니다.',
  [['checkin', '주간 체크인', '약속·기분·다음 대화 기록']]
);

const table = (headers, rows) =>
  `<table><thead><tr>${headers.map((t) => `<th>${t}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((t) => `<td>${t}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
add(
  '휴리스틱 평가 · 01',
  '화면 일관성과 작업 흐름 점검',
  '자동 검증과 설계자 점검 결과입니다. 실제 사용자 테스트 결과와는 구분합니다.',
  table(
    ['평가 기준', '관찰한 문제', '반영한 설계', '상태'],
    [
      ['일관성·표준', '화면마다 앱바의 화살표·제목·아이콘 표현이 다름', '동일한 뒤로가기, 17px 제목, 보조 아이콘 색 적용', '반영'],
      ['상태 가시성', '진단·준비·합의의 현재 단계가 불분명', '문항 수, 준비 진행률, 조항 확인·서명 상태 표시', '반영'],
      ['사용자 통제', '한 화면에 몰린 체크리스트와 완료 진입', '파트별 이동·임시저장·진행 지점 복구', '반영'],
      ['현실과의 일치', '다른 생활 기준을 “비슷”으로 표시', '문항 ID로 응답을 연결하고 다른 선택은 “기준 다름”', '수정'],
      ['오류 예방', '문장을 바꾼 뒤 기존 동의가 그대로 남을 가능성', '조항 수정 시 두 사람 재확인, 서명 완료 전 저장 제한', '반영'],
    ]
  ) + note('평가 틀: Jakob Nielsen, 10 Usability Heuristics for User Interface Design · nngroup.com/articles/ten-usability-heuristics/ · 2026.10.25 확인')
);
add(
  '휴리스틱 평가 · 02',
  '결과 이해와 실제 사용 조건 점검',
  '잔여 과제는 검증 계획과 함께 명시합니다.',
  table(
    ['평가 기준', '점검 내용', '현재 상태·다음 확인', '상태'],
    [
      ['기억 부담 줄이기', '상대의 결과와 규칙 제안자를 기억해야 하는 부담', '내 결과·메이트 결과의 제목 분리, 조항별 제안자 표시', '반영'],
      ['효율·유연성', '모든 집에 같은 규칙·준비 목록을 요구하는 문제', '필요한 항목 선택, 직접 규칙·준비 추가', '반영'],
      ['간결한 화면', '결과 상단 탐색과 중복 홈 버튼이 현재 목적을 흐림', '내 유형 중심으로 정리, 도감은 별도 진입', '반영'],
      ['오류 인지·복구', '초대 링크를 잘못 연결하거나 입력을 바꾸는 상황', '상대 확인·연결 취소 제공, 실제 커플의 초대 수행 확인 필요', '검증 예정'],
      ['도움말·이해', 'E/R·응답 일치도·같은 기기 서명의 이해 여부', '안내 제공, 첫 이용자에게 의미를 설명하게 하는 이해도 평가 예정', '검증 예정'],
    ]
  ) +
    note(
      '평가 틀: Jakob Nielsen, NN/g. 사용자 테스트 계획: 가설 페르소나에 맞는 커플을 모집해 진단·초대·규칙 수정·준비 이어하기를 관찰합니다. 아직 수행하지 않았습니다.'
    )
);

add(
  'MVP 범위와 검증',
  '실행 가능한 앱과 후속 개발 범위',
  '보고서의 화면은 실제 배포된 앱을 390 × 844px에서 캡처한 시연 데이터입니다.',
  `<div class="columns two"><div><h3>현재 구현한 범위</h3>${bullets(['20문항 진단·16유형 결과·초대 연결·비교 리포트', '별도 생활 기준 6문항과 문항별 응답 비교', '규칙 선택·직접 입력·조율·동의·서명·저장', '준비 항목 선택·추가·단계 진행·임시저장·복구', '앱 내 로컬 저장, PWA·Capacitor 앱 실행 구조'])}<h3>확인한 내용</h3>${p('배포 앱의 30개 상태와 규칙·준비 흐름을 실행했습니다. JS 오류 없이 저장·전환을 확인했고, 생활 기준의 응답 순서·누락·다른 선택을 회귀 검증했습니다.')}</div><div><h3>후속 개발·검증 범위</h3>${bullets(['실제 이용자 인터뷰로 페르소나·질문 이해도 검증', '인증된 두 계정의 원격 동의와 동의 이력', '설정된 동기화 서버의 운영·보안·장애 검증', 'Android/iOS 실기기 키보드·알림·공유 확인', '성향 해석의 타당성 검토와 장기 이용 관찰'])}${note('현재 같은 기기에서 두 사람이 번갈아 규칙을 확인·서명합니다. 스토어 심사 완료나 서버 운영 완료를 의미하지 않습니다.')}</div></div>`
);

add(
  '제출 자료 안내',
  '함께 살 준비, 서로를 아는 것부터',
  '브랜딩부터 실제 앱 화면과 생활 합의 과정까지 연결한 모바일 앱 서비스',
  `<div class="final-layout"><div>${image('logo-lockup.svg', 'final-logo', 'MATE:ON 로고')}<p class="final-message">유형을 발견하는 경험에서<br>생활을 함께 정하는 경험으로</p><p><a href="${app}">배포 앱 열기 ↗</a><br><a href="${figma}">참고 Figma 시나리오 열기 ↗</a></p></div><div><h3>요구사항별 수록 위치</h3>${table(
    ['안내문 항목', '페이지'],
    [
      ['서비스 네이밍·로고·슬로건·소개', '02–03'],
      ['유형별 캐릭터·컬러·폰트', '04–05'],
      ['메인·서브 페르소나와 Pain points·Needs', '06–07'],
      ['메인 기능 정의·플로우·화면 설명', '08–14'],
      ['부가 기능 정의·전체 플로우·화면 설명', '15–20'],
      ['서비스 시나리오 이미지·핵심 화면', '21–26'],
      ['휴리스틱 점검·MVP 범위', '27–29'],
    ]
  )}</div></div>`,
  '기준 자료: 제공된 7주차 중간고사 안내 PDF · Figma 시나리오 페이지 · MATE:ON 소스 및 배포 앱'
);

const css = `
@page{size:1600px 900px;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:'Pretendard Variable',sans-serif;color:#303943;background:#dfdedb;-webkit-print-color-adjust:exact;print-color-adjust:exact}a{color:#a22d44;text-underline-offset:6px}.slide{width:1600px;height:900px;position:relative;background:#faf9f7;padding:52px 64px 66px;break-after:page;overflow:hidden;page-break-inside:avoid}.slide:last-child{break-after:auto}.section{font-size:19px;font-weight:700;letter-spacing:.3px;color:#a22d44;margin:0 0 20px}h1{font-size:44px;line-height:1.18;font-weight:750;letter-spacing:-1.3px;margin:0 0 16px}h2{font-size:31px;margin:0 0 18px}h3{font-size:26px;line-height:1.35;font-weight:720;margin:0 0 16px}p{font-size:25px;line-height:1.62;margin:0 0 20px;word-break:keep-all}b,strong{font-weight:720}.lead{font-size:24px;color:#5a6270;line-height:1.5;margin:0 0 32px;max-width:1460px}.body{height:600px;position:relative}.footer{position:absolute;bottom:24px;left:64px;right:64px;display:flex;align-items:center;justify-content:space-between;font-size:15px;color:#5a6270;border-top:1px solid #ddd9d5;padding-top:12px}.footer span:first-child{max-width:1330px}.columns{display:grid;gap:52px}.two{grid-template-columns:1fr 1fr}.three{grid-template-columns:repeat(3,1fr)}.columns>div{min-width:0}.accent{color:#a22d44}.big-num{font-size:64px;font-weight:700;color:#c23a52;margin:16px 0 28px}blockquote{font-size:36px;line-height:1.5;margin:44px 0 20px;padding:24px 0;border-top:2px solid #d9d4ce}blockquote span{font-size:24px;color:#5a6270}.note{font-size:18px!important;line-height:1.6;color:#5a6270;margin:20px 0 0}.closing-line{border-top:2px solid #ddd7d1;margin-top:32px;padding-top:22px;font-size:25px;line-height:1.6;color:#8f3346}.cover h1{font-size:66px;width:970px;line-height:1.23}.cover .lead{font-size:28px;margin-top:24px}.cover .body{height:480px}.cover-brand{position:absolute;left:0;top:40px}.cover-logo{width:490px;height:auto}.cover-brand p{margin:44px 0 24px;font-size:29px}.cover-meta{font-size:19px;color:#5a6270}.cover-art{display:flex;position:absolute;right:-10px;top:32px;align-items:end;gap:0}.cover-art img{width:335px;height:370px;object-fit:contain}.logo-layout{display:grid;grid-template-columns:1.05fr 1fr;gap:100px;align-items:center;padding-top:24px}.logo-main>img{width:590px;max-height:180px;object-fit:contain;margin-bottom:60px}.logo-main>p{font-size:25px}.logo-spec{display:grid;grid-template-columns:180px 1fr;gap:36px;margin-bottom:42px;align-items:center}.logo-spec img{width:170px;height:160px;object-fit:contain}.logo-spec p{font-size:23px}.swatches{display:grid;grid-template-columns:repeat(5,1fr);gap:24px;padding-top:10px}.swatch{height:122px;margin-bottom:20px;border:1px solid #dedbd6}.swatches h3{font-size:24px;margin-bottom:10px}.swatches p{font-size:21px}.type-spec{display:grid;grid-template-columns:1.35fr 1fr;gap:60px;border-top:2px solid #ddd7d1;margin-top:28px;padding-top:32px}.type-spec p{font-size:23px}.type-large{font-size:43px;font-weight:700;margin:20px 0}.character-layout{display:grid;grid-template-columns:1080px 1fr;gap:60px}.character-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px 12px}.character-grid figure{margin:0;text-align:center;height:140px}.character-grid img{height:104px;width:160px;object-fit:contain}.character-grid figcaption{font-size:19px;line-height:1.4}.character-grid b{color:#a22d44;font-size:17px}.character-layout aside{padding-top:30px}.character-layout aside p{font-size:23px}.character-layout aside h3{margin-top:26px}.persona{display:grid;grid-template-columns:340px 1fr;gap:72px}.persona-id{padding-right:36px;border-right:2px solid #ddd7d1}.persona-id img{width:300px;height:245px;object-fit:contain}.persona-id h3{font-size:33px;margin-top:12px}.persona-id p{font-size:23px}.persona-body>.columns{gap:45px;margin-top:28px}.persona-body p,.persona-body li{font-size:23px}.persona-body .closing-line{font-size:21px}ul{padding-left:25px;margin:0}li{font-size:24px;line-height:1.6;margin-bottom:16px;word-break:keep-all}.nav-map{display:grid;grid-template-columns:repeat(4,1fr);gap:34px;padding-top:25px}.nav-map>div{border-top:4px solid #c23a52;padding-top:24px}.nav-map p{font-size:24px}.bottom-space{margin-top:38px;padding-top:28px;border-top:1px solid #ddd7d1}.journey{list-style:none;margin:0;display:flex;gap:36px;padding:18px 0 0;flex-wrap:wrap}.journey li{position:relative;flex:1;min-width:205px;border-top:3px solid #c23a52;padding-top:22px;margin:0 0 18px}.journey li:not(:last-child):after{content:'→';position:absolute;right:-29px;top:14px;font-size:25px;color:#a22d44}.journey strong{display:block;font-size:25px;margin-bottom:12px}.journey span{display:block;font-size:21px;color:#5a6270;line-height:1.6}.journey:has(li:nth-child(6)) li{flex-basis:28%;min-width:360px}.journey:has(li:nth-child(6)) li:nth-child(3):after{content:''}.top-gap{margin-top:26px}.flow-layout{display:grid;grid-template-columns:1fr 348px;gap:44px;height:600px}.screens{display:flex;justify-content:space-around;gap:28px}.screen{margin:0;min-width:0;flex:1;text-align:center;max-width:270px}.phone{display:block;width:auto;height:466px;max-width:100%;object-fit:contain;margin:0 auto 18px;box-shadow:0 3px 18px #30394318;border:1px solid #d8d5d0}.screen figcaption{text-align:left;font-size:21px;line-height:1.45}.screen figcaption strong{display:block;font-size:23px;margin-bottom:8px}.screen figcaption span{display:block;color:#5a6270}.flow-layout aside{border-left:2px solid #ddd7d1;padding-left:30px;padding-top:12px}.flow-layout aside p,.flow-layout aside li{font-size:23px}.flow-layout:has(.count-2){grid-template-columns:850px 1fr}.count-2 .screen{max-width:315px}.count-2 .phone{height:486px}.count-2 figcaption{padding:0 24px}.scenario{display:grid;grid-template-columns:880px 1fr;gap:44px}.scene{display:block;width:880px;height:365px;object-fit:cover;margin-bottom:22px}.scenario h3{font-size:23px;margin-bottom:6px}.scenario p{font-size:21px;line-height:1.5;margin-bottom:16px}.scenario-screens{display:flex;align-items:start;justify-content:space-around;gap:22px;padding-top:0}.scenario .screen{max-width:245px}.scenario .phone{height:485px}.scenario .screen figcaption strong{font-size:23px}.scenario .screen figcaption span{font-size:21px}.scenario-screens:has(.screen:only-child) .phone{height:550px}.scenario-screens:has(.screen:only-child) .screen{max-width:280px}.scenario-screens:has(.screen:only-child) .screen figcaption{padding:0 6px}table{width:100%;border-collapse:collapse;font-size:23px;line-height:1.5}th{text-align:left;background:#eee9e3;font-size:22px;font-weight:720}td,th{padding:22px 20px;border-bottom:1px solid #dcd6ce;vertical-align:top}td:first-child{font-weight:680;min-width:180px}td:last-child{white-space:nowrap}th:last-child{white-space:nowrap}.final-layout{display:grid;grid-template-columns:1fr 1.12fr;gap:80px}.final-logo{width:520px;margin:30px 0}.final-message{font-size:36px;line-height:1.5;margin:38px 0}.final-layout table{font-size:21px}.final-layout td,.final-layout th{padding:16px}.final-layout th{font-size:21px}.final-layout td:first-child{font-weight:500}.slide:nth-child(29) li{font-size:22px;margin-bottom:11px}.slide:nth-child(29) p{font-size:23px}.slide:nth-child(27) td,.slide:nth-child(28) td{font-size:22px;padding-block:21px}.slide:nth-child(30) .lead{margin-bottom:20px}@media screen{.slide{margin:28px auto;box-shadow:0 4px 28px #0002}}@media print{.slide{margin:0;box-shadow:none}}
 .count-2 .phone{height:450px}.count-2 figcaption{padding:0 10px}.scenario-screens:has(.screen:only-child) .phone{height:490px}.screen{align-self:start}.screen figcaption{word-break:keep-all}
`;
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>MATE:ON 최종 보고서</title><link rel="stylesheet" href="css/pretendard.css"><style>${css}</style></head><body>${slides.map((s, i) => `<section class="slide ${i === 0 ? 'cover' : ''}" data-page="${i + 1}"><p class="section">${s.section}</p><h1>${s.title}</h1><p class="lead">${s.lead}</p><div class="body">${s.body}</div><footer class="footer"><span>${s.extra || 'MATE:ON · AI와 UXD · 예시 데이터와 실제 앱 화면 · 2026.10.25'}</span><span>${String(i + 1).padStart(2, '0')} / ${slides.length}</span></footer></section>`).join('')}</body></html>`;
await fs.writeFile(path.join(root, 'index.html'), html);
await fs.writeFile(
  path.join(root, 'report-outline.json'),
  JSON.stringify(
    slides.map((s, i) => ({ page: i + 1, section: s.section, title: s.title.replaceAll('<br>', ' ') })),
    null,
    2
  )
);
process.env.PLAYWRIGHT_BROWSERS_PATH = 'C:\\tools\\ms-playwright';
const { chromium } = await import('playwright');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => i.decode()));
  });
  const fontLoaded = await page.evaluate(() => [...document.fonts].some((font) => font.family.includes('Pretendard') && font.status === 'loaded'));
  if (!fontLoaded) throw new Error('보고서의 Pretendard 폰트가 로드되지 않았습니다.');
  const issues = await page.evaluate(() =>
    [...document.querySelectorAll('.slide')].flatMap((slide) => {
      const bounds = slide.getBoundingClientRect();
      return [...slide.querySelectorAll('.body p,.body li,.body table,.body figure,.body figcaption,.body img,h1,.lead')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.bottom > bounds.bottom - 58 || r.right > bounds.right - 40 || r.left < bounds.left + 40;
        })
        .map((el) => ({ page: slide.dataset.page, tag: el.tagName, text: el.textContent.slice(0, 80) }));
    })
  );
  await fs.writeFile(path.join(root, 'layout-check.json'), JSON.stringify(issues, null, 2));
  if (issues.length) throw new Error('보고서의 페이지 경계를 벗어나는 요소가 있습니다: ' + JSON.stringify(issues));
  await fs.mkdir('reports', { recursive: true });
  await page.pdf({ path: 'reports/mateon-final-report.pdf', preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });
  console.log(JSON.stringify({ pages: slides.length, version, layoutIssues: issues, pdf: path.resolve('reports/mateon-final-report.pdf') }, null, 2));
} finally {
  await browser.close();
}
