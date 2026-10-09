/* 스토어용 스크린샷 자동화 — dist/를 로컬 서빙하고 주요 화면을 캡처한다.
   사용: node scripts/screenshots.js          (dist 기준, release/screenshots/에 저장)
        node scripts/screenshots.js --dev    (server.js 개발 서버 포트 8787 사용)
        node scripts/screenshots.js --lang=en (영문 로케일 — release/screenshots-en/ 에 저장)
   Playwright 필요: npm i -D playwright / 브라우저 캐시 C:\tools\ms-playwright */
const path = require('path');
const fs = require('fs');
const http = require('http');
const LOCAL_BROWSERS = 'C:\\tools\\ms-playwright';
if (fs.existsSync(LOCAL_BROWSERS)) process.env.PLAYWRIGHT_BROWSERS_PATH = LOCAL_BROWSERS;
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const LANG = (
  process.argv.find(function (a) {
    return a.startsWith('--lang=');
  }) || '--lang=ko'
).split('=')[1];
const OUT = path.join(ROOT, 'release', LANG === 'en' ? 'screenshots-en' : 'screenshots');
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain',
};

function serve(root, port) {
  return new Promise(function (res, rej) {
    const srv = http.createServer(function (rq, rs) {
      let p = decodeURIComponent(rq.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const f = path.join(root, p);
      fs.readFile(f, function (err, data) {
        if (err) {
          rs.writeHead(404);
          rs.end('nf');
          return;
        }
        rs.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
        rs.end(data);
      });
    });
    srv.listen(port, '127.0.0.1', function () {
      res(srv);
    });
    srv.on('error', rej);
  });
}

/* 앱이 의미 있게 렌더되도록 시드 데이터를 넣는다 (데모 데이터와 동일 톤) */
const SEED = `
(function(){
  var now = Date.now(), day = 86400000;
  function ds(t){var d=new Date(t);return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
  var dom=function(e,r){var o={};['A','B','C','D','E'].forEach(function(k,i){o[k]={e:e[i%e.length],r:r[i%r.length]};});return o;};
  var st={
    'mateon.me':{name:'다원',ts:now,charId:7,char2Id:8,eAvg:2.8,rAvg:2.4,domains:dom([3,2.5,3,2.5],[2,2.5,2.5,2.5]),conf:'보통',margin:4,life:[]},
    'mateon.partner':{name:'하늘',ts:now,charId:12,char2Id:8,eAvg:3.2,rAvg:3.1,domains:dom([3.5,3,3,3],[3,3.5,3,3]),conf:'보통',margin:3.5,life:[]},
    'mateon.homeName':'우리 집',
    'mateon.seen':true,
    'mateon.expenses':[
      {id:'s1',amount:12800,memo:'장보기',payer:'me',cat:'식비',share:0.5,ts:now-2*day,date:ds(now-2*day)},
      {id:'s2',amount:45000,memo:'전기요금',payer:'you',cat:'공과금',share:0.5,ts:now-5*day,date:ds(now-5*day)},
      {id:'s3',amount:8600,memo:'세제·휴지',payer:'me',cat:'생활비',share:0.5,ts:now-9*day,date:ds(now-9*day)}
    ],
    'mateon.chores':{anchor:now-3*day,rot:[],items:[
      {id:'c1',name:'설거지',who:'me',freq:'daily'},
      {id:'c2',name:'빨래',who:'you',freq:'weekly'},
      {id:'c3',name:'바닥 청소',who:'me',freq:'weekly'}
    ]},
    'mateon.events':[
      {id:'v1',date:ds(now+3*day),title:'관리비 납부일',who:'both',ts:now-10*day},
      {id:'v2',date:ds(now+7*day),title:'주말 대청소',who:'both',ts:now-10*day}
    ],
    'mateon.shopping':[{id:'g1',name:'휴지',cat:'생활용품',done:false,ts:now-day},{id:'g2',name:'계란',cat:'식료품',done:false,ts:now-day}],
    'mateon.missions':{week:'2026-W41',list:[{id:'m1',text:'20분 산책하기',done:true},{id:'m2',text:'함께 요리하기',done:false}]},
    'mateon.checkins':[{week:'2026-W41',mood:'good',text:'이번 주 평온했어요',ts:now-day}],
    'mateon.anniv':[{id:'a1',date:ds(now-200*day),title:'처음 만난 날',ts:now-30*day}],
    'mateon.goal':{name:'제주 여행',target:1000000,saves:[{amt:350000,by:'me',ts:now-5*day}]}
  };
  Object.keys(st).forEach(function(k){localStorage.setItem(k,JSON.stringify(st[k]));});
})();
`;
const SHOTS = [
  { hash: '#/home', name: '01-home.png', wait: 1400 },
  { hash: '#/settle', name: '02-settle.png' },
  { hash: '#/chores', name: '03-chores.png' },
  { hash: '#/calendar', name: '04-calendar.png' },
  { hash: '#/space', name: '05-space.png' },
  { hash: '#/settings', name: '06-settings.png' },
];

async function main() {
  const useDev = process.argv.includes('--dev');
  let srv = null,
    base;
  if (useDev) {
    base = 'http://127.0.0.1:8787';
  } else {
    if (!fs.existsSync(path.join(DIST, 'index.html'))) {
      console.error('dist/가 없습니다 — npm run build 먼저');
      process.exit(1);
    }
    srv = await serve(DIST, 8899);
    base = 'http://127.0.0.1:8899';
  }
  fs.mkdirSync(OUT, { recursive: true });
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: LANG === 'en' ? 'en-US' : 'ko-KR',
  });
  await page.addInitScript(SEED);
  for (const s of SHOTS) {
    await page.goto(base + '/' + s.hash, { waitUntil: 'networkidle' });
    /* 스플래시(~1.2s)가 DOM에서 제거될 때까지 대기 */
    await page.waitForSelector('#splash', { state: 'detached', timeout: 4000 }).catch(function () {
      return page.evaluate(function () {
        var sp = document.getElementById('splash');
        if (sp) sp.remove();
      });
    });
    /* 첫 렌더가 끝나 부트 스켈레톤이 사라질 때까지 대기 */
    await page.waitForSelector('#app .skel-boot', { state: 'detached', timeout: 5000 }).catch(function () {});
    await page.waitForTimeout(s.wait || 500);
    await page.evaluate(function () {
      var t = document.querySelector('.toast');
      if (t) t.style.display = 'none';
      var sp = document.getElementById('splash');
      if (sp) sp.remove();
    });
    await page.screenshot({ path: path.join(OUT, s.name) });
    console.log('captured', s.name);
  }
  await browser.close();
  if (srv) srv.close();
  console.log('done →', OUT);
}
main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
