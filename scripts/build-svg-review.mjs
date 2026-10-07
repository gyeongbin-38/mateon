import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const dir=path.join(process.cwd(),'artifacts');
const report=JSON.parse(await fs.readFile(path.join(dir,'svg-fidelity/report.json'),'utf8'));
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const data=JSON.stringify(report.screens).replace(/</g,'\\u003c');
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MATE:ON 실제 앱 · SVG 비교</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#202936;font:15px/1.65 system-ui,sans-serif}
header,main{max-width:1100px;margin:auto;padding:24px}header{position:sticky;top:0;background:#ffffffed;z-index:2;border-bottom:1px solid #ddd}
h1{font-size:24px;margin:0 0 8px}p{margin:6px 0}select,button,a.download{font:inherit;padding:8px 12px;border:1px solid #cbd2db;border-radius:8px;background:white;color:#243751}select{max-width:100%}
.controls{display:flex;gap:12px;flex-wrap:wrap;margin-top:14px}.pair{display:flex;gap:28px;align-items:flex-start;justify-content:center}.pair figure{margin:0;width:393px;max-width:48%}figcaption{font-weight:700;padding:12px 0}img{width:100%;height:auto;display:block;box-shadow:0 0 0 1px #dde1e7}small{color:#617082}.note{font-size:13px}.overlay{position:relative;width:393px;max-width:100%;margin:auto}.overlay img+img{position:absolute;top:0;left:0}a{color:#1658a5}
</style><header><h1>실제 앱과 SVG를 나란히 비교하세요</h1><p>${report.screens.length}개 화면 · 393px · 휴대폰 외곽 프레임 없음</p>
<p class="note">배포된 앱을 직접 렌더링했습니다. SVG의 글자는 원래 폰트 모양을 보존하는 벡터 윤곽선입니다. 문구는 원문 JSON을 참고해 수정할 수 있으며, 일부 그림자 효과는 부분 이미지입니다.</p>
<div class="controls"><select id="page" aria-label="화면 선택">${report.screens.map((s,i)=>`<option value="${i}">${escape(s.label)}</option>`).join('')}</select><button id="mode">겹쳐 보기</button><a class="download" id="download" download>SVG 다운로드</a></div><div id="metric"></div></header>
<main><div class="pair" id="pair"><figure><figcaption>실제 앱 캡처</figcaption><img id="reference" alt="실제 앱 화면"></figure><figure><figcaption>새 SVG</figcaption><img id="svg" alt="다시 생성한 SVG 화면"></figure></div><div id="overlay" hidden><p style="text-align:center">원본 ← <input id="alpha" aria-label="SVG 투명도" type="range" min="0" max="100" value="50"> → SVG</p><div class="overlay"><img id="back" alt="실제 앱"><img id="front" alt="SVG 겹침" style="opacity:.5"></div></div></main>
<script>const screens=${data};let overlay=false;const el=id=>document.getElementById(id);function show(){const s=screens[+el('page').value],stem=s.file.replace('.svg','');el('reference').src=el('back').src='svg-fidelity/'+stem+'.reference.png';el('svg').src=el('front').src='svg-pages/'+s.file;el('download').href='svg-pages/'+s.file;el('metric').innerHTML='<small>'+s.width+' × '+s.height+' · RGB 평균 절대 오차 '+s.meanAbsoluteChannelError+' / 255 · 24단계 초과 차이 픽셀 '+s.pixelsOver24Percent+'% (글자 가장자리 안티앨리어싱 포함)</small>'}el('page').onchange=show;el('mode').onclick=()=>{overlay=!overlay;el('pair').hidden=overlay;el('pair').style.display=overlay?'none':'flex';el('overlay').hidden=!overlay;el('mode').textContent=overlay?'나란히 보기':'겹쳐 보기'};el('alpha').oninput=()=>el('front').style.opacity=el('alpha').value/100;show();</script></html>`;
await fs.writeFile(path.join(dir,'mateon-svg-comparison.html'),html,'utf8');
await fs.writeFile(path.join(dir,'SVG-EXPORT-NOTES.md'),`# 실제 앱 기준 SVG 내보내기

기준: ${report.sourceUrl}
생성: ${report.generatedAt}

기존 수동 DOM 직렬화의 아이콘 누락(aria-hidden), 글자별 tspan, 추정 baseline, 불완전한 CSS 재현을 대체했습니다.
실제 Chromium screen 렌더 → PDF paint → PyMuPDF SVG 경로로 내보냅니다. 폰트 로딩을 기다리며 각 상태를 독립적으로 초기화합니다. 현재 스크롤 위치, sticky 헤더, fixed 내비게이션, dialog를 고정해서 인쇄 재배치를 방지합니다.

- svg-pages/: ${report.screens.length}개 페이지 및 오류/예외/전체 스크롤 화면. 텍스트 윤곽선과 도형을 벡터로 편집할 수 있습니다. 글자를 타이핑하는 네이티브 텍스트 레이어는 아닙니다.
- svg-fidelity/*.text.json: 실제 원문 및 글꼴·색상·위치 정보. PDF 중간 파일에도 텍스트를 보관합니다.
- mateon-svg-comparison.html: 모든 페이지의 앱 캡처와 SVG 비교 화면.
- svg-fidelity/report.json: 화면별 측정 오차, 경로 수, 부분 이미지 수, 배포 CSS/JS SHA-256.
- 그림자 등 Chromium이 래스터화한 국소 효과는 이미지로 포함됩니다. 전체 스크린샷을 SVG에 넣은 방식이 아닙니다.
- 브라우저 화면과 PDF/SVG의 폰트 안티앨리어싱에 차이가 있어 픽셀 100% 일치를 의미하지 않습니다. Figma 내부의 import 렌더러까지 자동 검증한 결과는 아닙니다.
- 이전 파일은 svg-before-faithful-export/에 보관했습니다.

## 재생성

Node dependencies: npm ci. Chrome 설치 필요. Python dependency: python -m pip install -r scripts/requirements-svg.txt.
실행: npm run export:svg. 환경변수 MATEON_SOURCE_URL로 다른 배포/로컬 앱을 지정할 수 있습니다.

## 참고한 외부 저장소와 문서

- https://github.com/BuilderIO/figma-html — DOM/CSS에서 편집 가능한 Figma 레이어로 변환하는 접근법 검토.
- https://github.com/bubkoo/html-to-image — 웹폰트와 스타일을 보존하는 DOM 캡처 접근법 검토. foreignObject를 사용하는 결과를 Figma용 메인 SVG로 채택하지 않았습니다.
- https://github.com/pymupdf/PyMuPDF — 사용한 PDF → SVG 렌더 엔진. AGPL-3.0 또는 상용 라이선스. 앱 런타임에 포함하지 않는 외부 빌드 도구입니다.
- https://playwright.dev/docs/api/class-page#page-pdf — screen media와 printBackground를 사용하는 Chromium 렌더.
`,'utf8');
execFileSync('python',['-c',`from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root=Path('artifacts')
with ZipFile(root/'mateon-svg-pages.zip','w',ZIP_DEFLATED) as z:
 for p in (root/'svg-pages').glob('*'):
  if p.is_file(): z.write(p,'svg-pages/'+p.name)
 for p in (root/'svg-fidelity').glob('*.text.json'): z.write(p,'text-layers/'+p.name)
 for name in ['mateon-full-scroll.svg','mateon-all-pages-overview.svg','SVG-EXPORT-NOTES.md']:
  z.write(root/name,name)
`],{cwd:process.cwd()});
console.log('Created comparison HTML, export notes, and mateon-svg-pages.zip');
