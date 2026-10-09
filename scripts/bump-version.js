/* assetVersion 일괄 범프: node scripts/bump-version.js <newVersion>
   assetVersion(YYYYMMDD-NN)을 4개 파일에 맞추고, androidVersionCode/iosBuildNumber를
   +1 자동 증가시켜 build.gradle까지 동기화한다. */
const fs = require('fs');
const V = process.argv[2];
if (!V || !/^\d{8}-\d{2}$/.test(V)) {
  console.error('usage: node scripts/bump-version.js YYYYMMDD-NN');
  process.exit(1);
}
const files = ['sw.js', 'index.html', 'js/config.js', 'release.config.json'];
let ok = true;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const m = s.match(/\d{8}-\d{2}/);
  if (!m) {
    console.error('no version in', f);
    ok = false;
    continue;
  }
  fs.writeFileSync(f, s.split(m[0]).join(V));
  console.log(f, m[0], '→', V);
}

/* 네이티브 버전코드 자동 증가 — Play는 단조 증가 정수를 요구하므로 +1 */
try {
  const rc = JSON.parse(fs.readFileSync('release.config.json', 'utf8'));
  rc.androidVersionCode = (rc.androidVersionCode || 0) + 1;
  rc.iosBuildNumber = String((+rc.iosBuildNumber || 0) + 1);
  fs.writeFileSync('release.config.json', JSON.stringify(rc, null, 2) + '\n');
  console.log('release.config.json androidVersionCode →', rc.androidVersionCode, '/ iosBuildNumber →', rc.iosBuildNumber);

  /* build.gradle 동기화 — versionCode/versionName을 release.config.json 값으로 */
  const gradle = 'android/app/build.gradle';
  let g = fs.readFileSync(gradle, 'utf8');
  const gv = g.match(/versionCode\s+\d+/);
  const gn = g.match(/versionName\s+"[^"]+"/);
  g = g.replace(/versionCode\s+\d+/, 'versionCode ' + rc.androidVersionCode);
  g = g.replace(/versionName\s+"[^"]+"/, 'versionName "' + rc.version + '"');
  fs.writeFileSync(gradle, g);
  console.log('android/app/build.gradle', gv && gv[0], '→', 'versionCode ' + rc.androidVersionCode, '/', gn && gn[0], '→', 'versionName "' + rc.version + '"');

  /* iOS pbxproj 동기화 — CURRENT_PROJECT_VERSION을 iosBuildNumber로 */
  const pbx = 'ios/App/App.xcodeproj/project.pbxproj';
  let p = fs.readFileSync(pbx, 'utf8');
  p = p.replace(/CURRENT_PROJECT_VERSION = \d+;/g, 'CURRENT_PROJECT_VERSION = ' + rc.iosBuildNumber + ';');
  fs.writeFileSync(pbx, p);
  console.log('ios project CURRENT_PROJECT_VERSION →', rc.iosBuildNumber);
} catch (e) {
  console.error('version-code sync failed:', e.message);
  ok = false;
}
process.exit(ok ? 0 : 1);
