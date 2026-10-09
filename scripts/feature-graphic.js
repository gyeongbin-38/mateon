/* Play Store 피처 그래픽(1024×500) + 프롬로 배너 생성.
   HTML을 Playwright로 렌더·캡처 → release/graphic/. */
const path = require('path');
const fs = require('fs');
const LOCAL_BROWSERS = 'C:\\tools\\ms-playwright';
if (fs.existsSync(LOCAL_BROWSERS)) process.env.PLAYWRIGHT_BROWSERS_PATH = LOCAL_BROWSERS;
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'release', 'graphic');
const LOGO = fs.readFileSync(path.join(ROOT, 'assets', 'logo-symbol.svg'), 'utf8')
  .replace(/"/g, "'").replace(/\n/g, '');

const PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Pretendard','Malgun Gothic',sans-serif; }
  .fg { width:1024px; height:500px; display:flex; align-items:center; justify-content:center;
        background:linear-gradient(135deg,#fff5f0 0%,#ffe8e0 55%,#ffd9cf 100%); position:relative; overflow:hidden; }
  .fg::before { content:''; position:absolute; right:-120px; top:-120px; width:420px; height:420px;
        border-radius:50%; background:rgba(255,122,92,.16); }
  .fg::after { content:''; position:absolute; left:-80px; bottom:-140px; width:340px; height:340px;
        border-radius:50%; background:rgba(255,122,92,.10); }
  .inner { display:flex; align-items:center; gap:56px; z-index:1; }
  .logo { width:170px; height:170px; background:#fff; border-radius:44px; display:flex; align-items:center;
        justify-content:center; box-shadow:0 18px 50px rgba(255,122,92,.30); }
  .logo svg { width:120px; height:105px; }
  h1 { font-size:84px; font-weight:800; color:#2a2320; letter-spacing:-2px; }
  h1 em { font-style:normal; color:#ff7a5c; }
  p { font-size:30px; color:#7a6d66; font-weight:600; margin-top:14px; }
  .chips { margin-top:22px; display:flex; gap:10px; }
  .chips span { font-size:19px; font-weight:700; color:#c2503a; background:#fff; padding:8px 16px; border-radius:999px;
        box-shadow:0 2px 10px rgba(255,122,92,.18); }
</style></head><body>
<div class="fg"><div class="inner">
  <div class="logo">${LOGO}</div>
  <div><h1>MATE<em>:ON</em></h1>
    <p>함께 살 준비, 서로를 아는 것부터</p>
    <div class="chips"><span>동거 성향 진단</span><span>생활비 정산</span><span>역할 분담</span><span>주간 체크인</span></div>
  </div>
</div></div>
</body></html>`;

async function main() {
  const { chromium } = require('playwright');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 2 });
  await page.setContent(PAGE, { waitUntil: 'load' });
  await page.screenshot({ path: path.join(OUT, 'feature-1024x500.png'), omitBackground: false });
  console.log('done →', OUT);
  await browser.close();
}
main().catch(function (e) { console.error(e); process.exit(1); });
