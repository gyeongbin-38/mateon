import fs from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve('artifacts/figma-app-screens');
const source=JSON.parse(await fs.readFile(path.join(out,'manifest.json'),'utf8'));
const flows=[
 {name:'01_나를 알아가기',steps:[[1,'홈 · 시작'],[8,'프로필 입력'],[13,'성향 진단 · 첫 문항'],[112,'성향 진단 · 마지막 문항'],[129,'내 진단 결과'],[138,'메이트 초대']]},
 {name:'02_함께 살 준비하기',steps:[[141,'메이트 연결 확인'],[418,'우리 둘 궁합 리포트'],[454,'생활 기준 체크'],[423,'생활 기준 비교'],[426,'생활 규칙 정하기'],[428,'동거 합의서 확인'],[432,'합의서 동의 · 저장'],[476,'입주 준비 체크리스트']]},
 {name:'03_함께 생활하기',steps:[[479,'우리 공간'],[481,'대화 기록 작성'],[485,'기록을 반영한 홈'],[434,'유형 도감'],[441,'유형 상세'],[487,'마이 · 설정']]}
];
let number=0;
for(let i=0;i<flows.length;i++){
 const flow=flows[i];
 flow.screens=[];
 for(const [caseNumber,title] of flow.steps){
  const c=source.cases.find(c=>c.number===caseNumber);
  flow.screens.push({number:++number,title,sourceId:c.id,route:c.route,contentHeight:c.height,fixture:c.fixture});
 }
 flow.filename='flow-'+String(i+1).padStart(2,'0')+'.html';
 const font='<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">';
 const columns=await Promise.all(flow.screens.map(async s=>'<section class="screen-column"><h2>'+String(s.number).padStart(2,'0')+'_'+s.title+'</h2>'+await fs.readFile(path.join(out,s.sourceId+'.html'),'utf8')+'</section>'));
 await fs.writeFile(path.join(out,flow.filename),'<!doctype html><html lang="ko"><head><meta charset="utf-8">'+font+'<style>*{box-sizing:border-box}body{margin:0;background:#1e1f21;font-family:"Pretendard Variable",sans-serif}.board{display:flex;gap:64px;padding:80px;align-items:flex-start}.screen-column{display:flex;flex-direction:column;gap:24px;width:393px;flex:none}h2{color:#e8e6e6;font-size:20px;line-height:28px;font-weight:600;margin:0;min-height:56px}.screen-content{border-radius:0}.character-track{overflow:hidden!important}button,input,textarea{font:inherit}dialog[open]{display:block!important}svg{display:inline-block}</style></head><body><main class="board">'+columns.join('')+'</main><script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async></script></body></html>');
}
await fs.writeFile(path.join(out,'flow-manifest.json'),JSON.stringify({source:source.source,device:'iPhone 14 Pro',viewport:{width:393,height:852},deviceFrame:false,interactivePrototype:false,flows},null,2));
console.log(JSON.stringify({screens:number,flows:flows.map(f=>({name:f.name,filename:f.filename,count:f.screens.length}))}));
