import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { chromium } from 'playwright';

const root=process.cwd(), out=path.join(root,'artifacts','figma-app-screens');
await fs.mkdir(out,{recursive:true});
const host='http://127.0.0.1:3008';
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
 try {
  const relative=decodeURIComponent(new URL(req.url,host).pathname).slice(1)||'index.html';
  if(!/^(index\.html|(?:assets|css|js)\/[\w./-]+|artifacts\/figma-app-screens\/[\w.-]+)$/.test(relative)||relative.includes('..')){res.writeHead(403);res.end();return;}
  let data=await fs.readFile(path.join(root,relative));
  if(relative==='js/mateon.js')data=Buffer.from(data.toString().replace(/\}\)\(\);\s*$/, 'window.__figmaApp={S,render,go,openTalk,showToast,encodeResult,resultFromCode,inviteURL,resetRulesForNewPartner};})();'));
  res.writeHead(200,{'Content-Type':mime[path.extname(relative)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(3008,'127.0.0.1',r));
console.log('Figma source and screen boards '+host);
if(process.argv.includes('--serve')){await new Promise(()=>{});}

const ctx={};vm.createContext(ctx);
vm.runInContext((await fs.readFile(path.join(root,'js/data.js'),'utf8'))+';this.data={CHARACTERS,QUESTIONS,LIFE_QUESTIONS,DOMAINS,CHECKLIST,SAMPLE_RESULTS};',ctx);
const data=JSON.parse(JSON.stringify(ctx.data));
let n=0;const cases=[];
function add(group,title,route='home',fixture={}){cases.push({number:++n,id:String(n).padStart(3,'0'),group,title,route,fixture});}
const sample='pair';
['첫 방문','진단 이어하기','내 진단 완료 · 메이트 미연결','메이트 연결 완료','합의서 저장 완료','입주 준비 완료'].forEach((t,i)=>add('01_홈과 시작',t,'home',{mode:['empty','draft','solo',sample,'saved','complete'][i]}));
add('01_홈과 시작','온보딩 · 내 진단','onboarding',{mode:'empty'});
add('01_홈과 시작','온보딩 · 입력과 선택 완료','onboarding',{mode:'empty',profile:{name:'다원',relation:'연인',stage:'계약 완료'}});
add('01_홈과 시작','온보딩 · 이름 누락 오류','onboarding',{mode:'empty',action:'name-error'});
add('01_홈과 시작','온보딩 · 이 기기에서 상대 진단','onboarding',{mode:'solo',flow:'partner'});
add('01_홈과 시작','온보딩 · 초대받아 진단','onboarding',{mode:'empty',flow:'partner',invite:true});
add('01_홈과 시작','재진단 · 기존 프로필','onboarding',{mode:'solo',profile:{name:'다원',relation:'연인',stage:'계약 완료'}});
for(let q=0;q<20;q++)for(let answer=-1;answer<4;answer++)add('02_설문_'+data.QUESTIONS[q].domain,`성향 진단 Q${String(q+1).padStart(2,'0')} · ${answer<0?'선택 전':String.fromCharCode(65+answer)+' 선택'}`,'survey',{mode:'empty',q,answer});
for(const c of data.CHARACTERS)add('03_개인 진단 16유형',`${c.code} · ${c.name}`,'result',{mode:'solo',char:c.code,expanded:true});
add('04_결과 상태','결과 · 성향 좌표 접힘','result',{mode:'solo'});
add('04_결과 상태','결과 · 메이트 연결 완료','result',{mode:'pair',expanded:true});
add('04_결과 상태','결과 · 상대 진단 완료','result',{mode:'pair',flow:'partner',expanded:true});
add('04_결과 상태','결과 · 생활 기준 체크 완료','result',{mode:'solo',life:'me',expanded:true});
add('04_결과 상태','결과 · 이전과 동일한 유형','result',{mode:'solo',history:'same',expanded:true});
add('04_결과 상태','결과 · 이전과 달라진 유형','result',{mode:'solo',history:'different',expanded:true});
add('04_결과 상태','결과 · 닉네임 공유 제외','result',{mode:'solo',shareName:false,expanded:true});
['높음','낮음'].forEach(conf=>add('04_결과 상태','결과 · 응답 일치도 '+conf,'result',{mode:'solo',conf,expanded:true}));
['미연결','연결됨','닉네임 제외','링크 확인','기존 상대 변경 확인','잘못된 링크','잘못된 유형 코드','연결 해제 완료'].forEach((t,i)=>add('05_메이트 연결','메이트 연결 · '+t,'invite',{mode:[1,4,7].includes(i)?'pair':'solo',shareName:i===2?false:true,action:['','','','preview','preview','invalid-link','invalid-code','unlink'][i]}));
for(const c of data.CHARACTERS)add('05_메이트 연결 코드',`유형 코드 연결 · ${c.code} ${c.name}`,'invite',{mode:'solo',code:c.code});
for(const c of data.CHARACTERS)for(const p of data.CHARACTERS)add('06_궁합_'+c.code,`궁합 · 나 ${c.code} × 메이트 ${p.code}`,'report',{mode:'pair',char:c.code,partnerChar:p.code});
add('07_리포트 분기','실제 진단 수치 · 영역별 일치와 차이','report',{mode:'pair'});
add('07_리포트 분기','공유받은 궁합 리포트','report',{mode:'empty',shared:true});
add('07_리포트 분기','샘플 리포트 미리보기','report',{mode:'empty',shared:true,sample:true});
add('07_리포트 분기','나만 생활 기준 체크 완료','report',{mode:'pair',life:'me'});
add('07_리포트 분기','상대만 생활 기준 체크 완료','report',{mode:'pair',life:'partner'});
add('07_리포트 분기','둘 다 생활 기준 체크 · 비슷함','report',{mode:'pair',life:'aligned'});
add('07_리포트 분기','둘 다 생활 기준 체크 · 다름','report',{mode:'pair',life:'gapped'});
add('07_리포트 분기','추천 규칙 · 일부 선택 해제','report',{mode:'pair',rules:'partial'});
add('07_리포트 분기','직접 추가한 생활 규칙','report',{mode:'pair',custom:true});
add('07_리포트 분기','규칙 추가 · 빈 입력 오류','report',{mode:'pair',action:'empty-rule'});
for(const signs of ['none','me','partner','both','saved'])add('08_합의서','합의서 · '+{none:'서명 전',me:'나만 동의',partner:'상대만 동의',both:'둘 다 동의 · 저장 가능',saved:'저장 완료'}[signs],'agreement',{mode:signs==='saved'?'saved':'pair',signs});
add('09_유형 도감','16유형 도감 · 진단 전','types',{mode:'empty'});
add('09_유형 도감','16유형 도감 · 내 유형 표시','types',{mode:'solo'});
for(const c of data.CHARACTERS)add('09_유형 도감',`유형 상세 · ${c.code} ${c.name}`,'type-detail',{mode:'solo',typeId:c.id});
for(let q=0;q<6;q++)for(let answer=-1;answer<3;answer++)add('10_생활 기준 체크',`생활 기준 L${q+1} · ${data.LIFE_QUESTIONS[q].area} · ${answer<0?'선택 전':data.LIFE_QUESTIONS[q].options[answer].label}`,'lifecheck',{mode:'solo',lifeQ:q,lifeAnswer:answer});
for(const mode of ['empty','partial','complete'])add('11_입주 준비',`입주 체크리스트 · ${{empty:'시작 전',partial:'일부 완료',complete:'전체 완료'}[mode]}`,'checklist',{mode:mode==='empty'?'pair':mode});
['empty','saved','complete'].forEach(mode=>add('12_우리 공간','우리 공간 · '+{empty:'대화 기록 없음',saved:'대화와 합의서 있음',complete:'입주 준비 완료'}[mode],'space',{mode}));
['new','edit','empty','delete','saved'].forEach(t=>add('12_우리 공간','대화 기록 · '+{new:'새 생각 작성',edit:'기존 기록 수정',empty:'빈 내용 오류',delete:'삭제 확인',saved:'저장 완료'}[t],'home',{mode:t==='edit'||t==='delete'?'saved':'pair',action:'talk-'+t}));
['empty','saved','share-off','delete-confirm','reset-confirm','reset-done'].forEach(t=>add('13_설정과 약관','설정 · '+{empty:'저장 데이터 없음',saved:'저장 데이터 있음','share-off':'닉네임 공유 끔','delete-confirm':'개별 데이터 삭제 확인','reset-confirm':'전체 삭제 확인','reset-done':'전체 삭제 완료'}[t],t==='reset-done'?'home':'settings',{mode:t==='empty'?'empty':'saved',shareName:t==='share-off'?false:true,action:t}));
add('13_설정과 약관','개인정보처리방침','privacy',{mode:'empty'});
add('13_설정과 약관','서비스 이용약관','terms',{mode:'empty'});
for(const route of ['home','onboarding','survey','result','invite','report','agreement','types','type-detail','lifecheck','checklist','space','settings'])add('14_다크 테마','다크 테마 · '+route,route,{mode:'pair',dark:true,typeId:12,expanded:true});
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({source:'https://gyeongbin-38.github.io/mateon/?v=20261004-17#/home',width:393,cases},null,2));
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:393,height:852},locale:'ko-KR',timezoneId:'Asia/Seoul',serviceWorkers:'block'});
const page=await context.newPage();
await page.goto(host+'/',{waitUntil:'networkidle'});
const cssProps=['display','position','box-sizing','width','height','min-width','max-width','min-height','max-height','margin-top','margin-right','margin-bottom','margin-left','padding-top','padding-right','padding-bottom','padding-left','gap','row-gap','column-gap','flex-direction','flex-wrap','flex-grow','flex-shrink','flex-basis','align-items','align-self','justify-content','grid-template-columns','grid-template-rows','grid-column','grid-row','font-family','font-size','font-weight','font-style','line-height','letter-spacing','color','text-align','text-transform','text-decoration','white-space','word-break','overflow-wrap','background-color','background-image','background-size','background-position','border-top','border-right','border-bottom','border-left','border-radius','box-shadow','opacity','overflow','overflow-x','overflow-y','transform','top','right','bottom','left','z-index','object-fit','object-position','vertical-align','list-style','content','appearance','aspect-ratio'];
const boards=new Map();
for(const c of cases){
 await page.setViewportSize({width:393,height:852});
 await page.evaluate(()=>{localStorage.clear();localStorage.setItem('ds-theme','light');});
 await page.goto(host+'/?fixture='+c.id+'#/'+c.route,{waitUntil:'domcontentloaded'});
 await page.evaluate(({c,data})=>{
  const {S,render}=window.__figmaApp,f=c.fixture;
  const clone=v=>JSON.parse(JSON.stringify(v));
  const byCode=code=>{const r=window.__figmaApp.resultFromCode(code);r.name='다원';r.ts=1791111600000;return r;};
  const life=level=>LIFE_QUESTIONS.map(q=>({qid:q.id,area:q.area,...q.options[level-1]}));
  const pair=f.mode&&f.mode!=='empty'&&f.mode!=='draft';
  S.me=pair?clone(data.SAMPLE_RESULTS.me):null;
  S.partner=['pair','saved','complete','partial'].includes(f.mode)?clone(data.SAMPLE_RESULTS.partner):null;
  if(f.char)S.me=byCode(f.char);
  if(f.partnerChar){S.partner=byCode(f.partnerChar);S.partner.name='하늘';}
  if(S.me)S.me.ts=1791111600000;
  if(S.partner)S.partner.ts=1791111600000;
  S.flow=f.flow||'me';S.profile=f.profile||{name:'',relation:'',stage:''};
  if(S.flow==='partner'){S.profile={name:'',relation:'연인',stage:'계약 완료'};if(f.invite)S.invite=clone(data.SAMPLE_RESULTS.me);}
  S.q=f.q||0;S.answers=[];S.lifeQ=f.lifeQ||0;S.lifeAnswers=[];S.typeId=f.typeId||12;
  S.shareName=f.shareName!==false;S.history=[];S.customRules=[];S.checkedRules=[];S.signs={me:false,partner:false};S.agreement=null;S.checklist={};
  if(f.mode==='draft'){S.q=3;S.answers=QUESTIONS.slice(0,3).map(q=>({qid:q.id,code:q.options[0].code}));S.profile={name:'다원',relation:'연인',stage:'계약 완료'};}
  if(f.answer>=0)S.answers=[{qid:QUESTIONS[S.q].id,code:QUESTIONS[S.q].options[f.answer].code}];
  if(f.lifeAnswer>=0){const q=LIFE_QUESTIONS[S.lifeQ];S.lifeAnswers=[{qid:q.id,optIdx:f.lifeAnswer,level:q.options[f.lifeAnswer].level}];}
  if(f.life==='me'||f.life==='aligned'||f.life==='gapped')S.me.life=life(f.life==='gapped'?1:2);
  if(f.life==='partner'||f.life==='aligned'||f.life==='gapped')S.partner.life=life(f.life==='gapped'?3:2);
  if(f.history)S.history=[{...S.me,charId:f.history==='same'?S.me.charId:1,ts:1790506800000},clone(S.me)];
  if(f.conf)S.me.conf=f.conf;
  if(['saved','complete'].includes(f.mode)){S.agreement={me:'다원',partner:'하늘',date:'2026년 10월 4일',rules:['공용 공간은 사용 후 정리하기','손님 초대는 하루 전에 알려주기']};localStorage.setItem('mateon.talks',JSON.stringify({0:{text:'혼자 쉬는 시간도 존중하고, 저녁에는 함께 하루를 이야기하고 싶어요.',ts:1791111600000}}));}
  if(['partial','complete'].includes(f.mode))CHECKLIST.forEach((g,gi)=>g.items.forEach((t,i)=>{if(f.mode==='complete'||gi<2)S.checklist[g.cat+':'+i]=true;}));
  if(f.custom)S.customRules=['매주 화요일 저녁은 각자 자유시간으로 보내기'];
  if(f.shared)S.viewPair=clone(data.SAMPLE_RESULTS);
  if(f.signs){S.signs.me=['me','both','saved'].includes(f.signs);S.signs.partner=['partner','both','saved'].includes(f.signs);}
  if(f.dark)document.documentElement.dataset.theme='dark';
  for(const key of ['me','partner','agreement','history','checklist','customRules'])if(S[key])localStorage.setItem('mateon.'+key,JSON.stringify(S[key]));
  history.replaceState(null,'','#/'+c.route);render();
  if(f.rules==='partial'){S.checkedRules=S.checkedRules.slice(0,2);render();}
  if(f.expanded)document.querySelectorAll('details').forEach(x=>x.open=true);
  if(f.code)document.querySelector('#code-connect-in').value=f.code;
  const click=a=>document.querySelector('[data-action="'+a+'"]')?.click();
  if(f.action==='name-error')click('survey');
  if(f.action==='invalid-link'){document.querySelector('#partner-link').value='https://example.com/invalid';click('preview-partner');}
  if(f.action==='invalid-code'){document.querySelector('#code-connect-in').value='E9R9';click('code-connect');}
  if(f.action==='preview'){document.querySelector('#partner-link').value=window.__figmaApp.inviteURL({...data.SAMPLE_RESULTS.partner,name:'민수'});click('preview-partner');}
  if(f.action==='unlink')click('unlink');
  if(f.action==='empty-rule')click('add-rule');
  if(f.action==='delete-confirm')document.querySelector('[data-action="del-data"][data-v="mateon.me"]').click();
  if(f.action==='reset-confirm')click('reset-all');
  if(f.action==='reset-done'){click('reset-all');click('reset-all');}
  if(f.action?.startsWith('talk-')){window.__figmaApp.openTalk(0);if(f.action==='talk-empty')document.querySelector('[data-sheet-save]').click();if(f.action==='talk-delete')document.querySelector('[data-sheet-delete]').click();if(f.action==='talk-saved'){document.querySelector('#talk-note').value='서로에게 먼저 말하고, 편안하게 조율하고 싶어요.';document.querySelector('[data-sheet-save]').click();}}
 },{c,data});
 await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}#splash,.skip-link{display:none!important}html{scroll-behavior:auto!important}'});
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});
 const height=c.fixture.action?.startsWith('talk-')&&c.fixture.action!=='talk-saved'?852:await page.evaluate(()=>Math.max(852,document.documentElement.scrollHeight));
 await page.setViewportSize({width:393,height});
 await page.evaluate(()=>window.scrollTo(0,0));
 const snap=await page.evaluate(({height,cssProps})=>{
  const app=document.querySelector('#app');
  const root=document.createElement('div');root.className='screen-content';root.style.cssText=`width:393px;height:${height}px;position:relative;overflow:hidden;background:${getComputedStyle(document.body).backgroundColor};font-family:${getComputedStyle(document.body).fontFamily};color:${getComputedStyle(document.body).color};`;
  const copy=el=>{
   if(el.nodeType===Node.TEXT_NODE)return el.cloneNode(true);
   if(el.nodeType!==Node.ELEMENT_NODE||['SCRIPT','STYLE'].includes(el.tagName))return null;
   const st=getComputedStyle(el),r=el.getBoundingClientRect();
   if(st.display==='none'||st.visibility==='hidden'||!r.width||!r.height)return null;
   if(el.classList.contains('character-slide')&&(r.right<=0||r.left>=393))return null;
   if(el instanceof SVGElement){const n=el.cloneNode(true);n.setAttribute('style','width:'+r.width+'px;height:'+r.height+'px;color:'+st.color+';flex-shrink:'+st.flexShrink);n.querySelectorAll('*').forEach(x=>{for(const attr of ['fill','stroke'])if(x.getAttribute(attr)==='currentColor')x.setAttribute(attr,st.color);});return n;}
   const n=el.cloneNode(false);let style=cssProps.map(p=>p+':'+st.getPropertyValue(p)).join(';');
   if(st.position==='fixed')style+=`;position:absolute;left:${r.left}px;top:${r.top}px;right:auto;bottom:auto;width:${r.width}px;height:${r.height}px;transform:none;`;
   if(st.position==='sticky')style+=';position:relative;left:auto;top:auto;right:auto;bottom:auto;';
   n.setAttribute('style',style);
   if(el.tagName==='IMG')n.src=el.currentSrc||el.src;
   if(el.tagName==='INPUT'){n.setAttribute('value',el.value);}
   if(el.tagName==='TEXTAREA')n.textContent=el.value;
   else for(const ch of el.childNodes){const x=copy(ch);if(x)n.appendChild(x);}
   n.removeAttribute('autofocus');return n;
  };
  root.appendChild(copy(app));
  const dialog=document.querySelector('dialog[open]');
  if(dialog){const shade=document.createElement('div');shade.style.cssText='position:absolute;inset:0;background:rgba(0,0,0,.35);z-index:900;';root.appendChild(shade);root.appendChild(copy(dialog));}
  const toast=document.querySelector('#toast.show');if(toast)root.appendChild(copy(toast));
  return {html:root.outerHTML,height,font:getComputedStyle(document.body).fontFamily,text:root.textContent};
 },{height,cssProps});
 if(!snap.text.trim())throw new Error('Blank screen '+c.id);
 c.height=height;c.font=snap.font;
 const group=boards.get(c.group)||[];group.push({...c,html:snap.html});boards.set(c.group,group);
 await fs.writeFile(path.join(out,c.id+'.html'),snap.html);
 if(c.id==='001'||c.id==='129'||c.id==='400')await page.screenshot({path:path.join(out,c.id+'.reference.png')});
 if(c.number%20===0)console.log('ready '+c.id+' '+c.group);
}
let b=0;const manifest=[];
for(const [group,screens]of boards){
 for(const s of screens){s.html=s.html.replace(/style="([^"]*)"/g,(full,style)=>style.includes('position:sticky')? 'style="'+style.replace(/;position:absolute;left:[^;]+;top:[^;]+;right:auto;bottom:auto;width:[^;]+;height:[^;]+;transform:none;/,';position:relative;left:auto;top:auto;right:auto;bottom:auto;')+'"':full);await fs.writeFile(path.join(out,s.id+'.html'),s.html);}
 const filename=String(++b).padStart(2,'0')+'-board.html';
 const font='<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">';
 const html='<!doctype html><html lang="ko"><head><meta charset="utf-8">'+font+'<style>*{box-sizing:border-box}body{margin:0;background:#1e1f21;font-family:"Pretendard Variable",sans-serif}.board{display:flex;gap:56px;padding:96px 80px;align-items:flex-start}.screen-column{display:flex;flex-direction:column;gap:20px;width:393px;flex:none}.screen-title{color:#e8e6e6;font-size:20px;line-height:1.4;font-weight:600;min-height:56px;max-width:393px}.screen-content{border-radius:20px}.character-track{overflow:hidden!important}button,input,textarea{font:inherit}dialog[open]{display:block!important}svg{display:inline-block}</style></head><body><main class="board" data-figma-name="'+group+'">'+screens.map(s=>'<section class="screen-column" data-figma-name="'+s.id+'_'+s.title+'"><h2 class="screen-title">'+s.id+'_'+s.title+'</h2>'+s.html+'</section>').join('')+'</main><script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async></script></body></html>';
 await fs.writeFile(path.join(out,filename),html);manifest.push({group,filename,count:screens.length,numbers:screens.map(s=>s.id),width:80*2+screens.length*393+(screens.length-1)*56,height:Math.max(...screens.map(s=>s.height))+230});
}
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({source:'https://gyeongbin-38.github.io/mateon/?v=20261004-17#/home',width:393,cases,boards:manifest},null,2));
console.log(JSON.stringify({count:cases.length,boards:manifest.length}));
await browser.close();server.close();
