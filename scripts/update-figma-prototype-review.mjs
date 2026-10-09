import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(workspace, 'artifacts');
const screenDir = path.join(artifacts, 'figma-app-screens');
const audit = JSON.parse(await fs.readFile(path.join(screenDir, 'figma-layout-audit.json'), 'utf8'));
const prototypeUrl =
  'https://www.figma.com/proto/6pEODkDou0HL5bDynZvv1P?page-id=30%3A2&node-id=38-1712&scaling=scale-down&content-scaling=fixed&starting-point-node-id=38%3A1712';
const groups = [
  { name: '01–06 · 나를 알아가기', title: '나를 알아가기', start: 0, end: 6 },
  { name: '07–14 · 함께 살 준비하기', title: '함께 살 준비하기', start: 6, end: 14 },
  { name: '15–20 · 함께 생활하기', title: '함께 생활하기', start: 14, end: 20 },
];
const escape = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const imageName = (i) => 'screen-' + String(i + 1).padStart(2, '0') + '-review.png';
const characters = JSON.parse(await fs.readFile(path.join(screenDir, 'character-data.json'), 'utf8'));
const characterFrames = audit.characterChecks || [];
for (let start = 0; start < 16; start += 4) {
  const cards = characters.slice(start, start + 4);
  const labels =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1832" height="1012"><g fill="#eeeeee" font-family="Arial,Malgun Gothic,sans-serif">' +
    cards.map((c, i) => '<text x="' + (34 + i * 457) + '" y="62" font-size="20">' + escape(c.code + ' · ' + c.name) + '</text>').join('') +
    '</g></svg>';
  await sharp({ create: { width: 1832, height: 1012, channels: 4, background: '#1e1f21' } })
    .composite([
      { input: Buffer.from(labels), left: 0, top: 0 },
      ...cards.map((c, i) => ({ input: path.join(screenDir, 'character-' + String(c.id).padStart(2, '0') + '-review.png'), left: 34 + i * 457, top: 112 })),
    ])
    .png()
    .toFile(path.join(screenDir, 'characters-0' + (start / 4 + 1) + '-review.png'));
}
for (const [index, group] of groups.entries()) {
  const screens = audit.screens.slice(group.start, group.end);
  const width = screens.length * 457 + 96;
  const height = 1132;
  const labels =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    width +
    '" height="' +
    height +
    '"><g fill="#eeeeee" font-family="Arial,Malgun Gothic,sans-serif"><text x="80" y="80" font-size="24">' +
    escape(group.title) +
    ' / 393 × 852</text>' +
    screens.map((screen, i) => '<text x="' + (80 + i * 457) + '" y="164" font-size="18">' + escape(screen.name.replace('_', ' · ')) + '</text>').join('') +
    '</g></svg>';
  await sharp({ create: { width, height, channels: 4, background: '#1e1f21' } })
    .composite([
      { input: Buffer.from(labels), left: 0, top: 0 },
      ...screens.map((screen, i) => ({ input: path.join(screenDir, imageName(group.start + i)), left: 80 + i * 457, top: 216 })),
    ])
    .png()
    .toFile(path.join(screenDir, 'flow-0' + (index + 1) + '-review.png'));
}
const stateFile = path.join(screenDir, 'figma-state.json');
const state = JSON.parse((await fs.readFile(stateFile, 'utf8')).replace(/^\uFEFF/, ''));
state.prototypeUrl = prototypeUrl;
state.interactivePrototype = true;
state.prototypeAudit = audit;
state.characterFrames = characterFrames;
state.carousel = audit.carousel;
state.audit = (state.audit || []).map((group, i) => ({
  ...group,
  flowStartingPoints: [],
  note: 'Visual flow group; executable screens are direct children of the single Figma page.',
  screens: audit.screens.slice(groups[i].start, groups[i].end),
}));
await fs.writeFile(stateFile, JSON.stringify(state, null, 2) + '\n', 'utf8');
const prototypeFile = path.join(screenDir, 'figma-prototype.json');
const prototype = JSON.parse((await fs.readFile(prototypeFile, 'utf8')).replace(/^\uFEFF/, ''));
prototype.audit = audit;
prototype.characters = characterFrames;
prototype.carousel = audit.carousel;
prototype.runtimeChecks = audit.runtimeChecks;
prototype.exampleData = true;
prototype.dataNote = 'Input fields, scoring results and save summaries use example data; native navigation, selection and scroll interactions run in Figma.';
await fs.writeFile(prototypeFile, JSON.stringify(prototype, null, 2) + '\n', 'utf8');
const html = `<!doctype html>
<html lang="ko">
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>메이트온 · 실행 가능한 프로토타입</title>
<style>body{margin:0;padding:32px;background:#1e1f21;color:#eee;font-family:Arial,"Malgun Gothic",sans-serif}h1{font-size:24px}p{color:#bbb;line-height:1.7;max-width:1000px}a{color:#ff637a}nav{display:flex;gap:24px;flex-wrap:wrap}figure{margin:32px 0}img{display:block;width:100%;height:auto}figcaption{margin:0 0 14px;font-size:18px}</style>
<h1>메이트온 · 실행 가능한 프로토타입</h1>
<p>피그마 한 페이지에 앱 화면 20개를 번호와 제목으로 구분했습니다. 화면은 393 × 852px이며 디바이스 외곽 프레임은 없습니다. 긴 본문은 각 화면 안에서 끝까지 스크롤됩니다. 상단 바와 하단 메뉴는 고정됩니다.</p>
<nav><a href="${prototypeUrl}">프로토타입 실행하기</a><a href="https://www.figma.com/design/6pEODkDou0HL5bDynZvv1P?node-id=38-1712">편집 가능한 피그마 화면 열기</a></nav>
<p>아래 이미지는 각 화면의 시작 부분입니다. 전체 본문과 버튼 이동은 프로토타입에서 확인할 수 있습니다. 진단 20문항과 생활 기준 6문항을 순서대로 연결했으며, 입력 필드·진단 결과·저장 상태는 예시 데이터입니다. 글꼴은 Noto Sans KR입니다.</p>
<p>16개 캐릭터의 개별 상세 화면을 모두 연결했습니다. 홈 캐러셀의 이전·다음 버튼과 가로 스크롤, 유형 도감의 카드와 성향 지도에서 원하는 유형으로 이동할 수 있습니다. 홈 바로가기 3개는 한 줄로 정렬했습니다.</p>
${groups.map((group, i) => '<figure><figcaption>' + group.name + '</figcaption><img src="figma-app-screens/flow-0' + (i + 1) + '-review.png" alt="' + group.name + ' 앱 화면 미리보기"></figure>').join('\n')}
${[1, 2, 3, 4].map((i) => '<figure><figcaption>19 · 캐릭터 상세 ' + ((i - 1) * 4 + 1) + '–' + i * 4 + ' / 16</figcaption><img src="figma-app-screens/characters-0' + i + '-review.png" alt="유형별 캐릭터 상세 화면"></figure>').join('\n')}
</html>
`;
await fs.writeFile(path.join(artifacts, 'mateon-interface-review.html'), html, 'utf8');
process.stdout.write(
  JSON.stringify({
    screens: 20,
    nativePrototypeFrames: audit.screenCount,
    pageCount: audit.pageCount,
    width: 393,
    height: 852,
    deviceFrame: false,
    renderedFlowPreviews: 3,
  }) + '\n'
);
