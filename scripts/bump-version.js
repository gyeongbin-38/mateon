/* assetVersion 일괄 범프: node scripts/bump-version.js <newVersion> */
const fs = require('fs');
const V = process.argv[2];
if (!V || !/^\d{8}-\d{2}$/.test(V)) { console.error('usage: node scripts/bump-version.js YYYYMMDD-NN'); process.exit(1); }
const files = ['sw.js', 'index.html', 'js/config.js', 'release.config.json'];
let ok = true;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const m = s.match(/\d{8}-\d{2}/);
  if (!m) { console.error('no version in', f); ok = false; continue; }
  fs.writeFileSync(f, s.split(m[0]).join(V));
  console.log(f, m[0], '→', V);
}
process.exit(ok ? 0 : 1);
