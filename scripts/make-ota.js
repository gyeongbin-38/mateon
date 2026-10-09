/* OTA 번들 생성: dist/ 를 zip으로 묶어 ota/<version>.zip + ota/latest.json 생성.
   webBaseUrl 아래에 그대로 업로드하면 네이티브 앱이 설정 > 앱 업데이트 확인에서 가져간다. */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

function assetVersion() {
  const cfg = fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8');
  const m = cfg.match(/assetVersion:\s*'([^']+)'/);
  if (!m) throw new Error('js/config.js에 assetVersion이 없습니다');
  return m[1];
}

async function main() {
  const ver = assetVersion();
  const dist = path.join(root, 'dist');
  if (!fs.existsSync(dist)) throw new Error('dist/ 가 없습니다. 먼저 npm run build');
  const outDir = path.join(root, 'ota');
  fs.mkdirSync(outDir, { recursive: true });
  const zip = path.join(outDir, `mateon-${ver}.zip`);
  if (fs.existsSync(zip)) fs.unlinkSync(zip);
  // Windows Compress-Archive로 dist/* 전체를 번들 루트에 배치
  execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${dist}\\*' -DestinationPath '${zip}' -CompressionLevel Optimal`]);
  fs.writeFileSync(
    path.join(outDir, 'latest.json'),
    JSON.stringify(
      {
        version: ver,
        url: `ota/mateon-${ver}.zip`,
      },
      null,
      2
    ) + '\n'
  );
  console.log(`OTA bundle: ota/mateon-${ver}.zip (${(fs.statSync(zip).size / 1024 / 1024).toFixed(2)} MB)`);
  console.log('ota/ 폴더를 webBaseUrl 루트에 업로드하면 앱에서 가져갑니다.');
}
main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
