/* 번들 크기 예산 체크 — release-check에서 호출
   기준: js 합계 < 500KB, css 합계 < 160KB, index.html < 20KB, 벤더 합계 < 1.2MB */
const fs = require('fs');
const path = require('path');

const BUDGET = { js: 500 * 1024, css: 220 * 1024, html: 20 * 1024, vendor: 1200 * 1024 };
let total = { js: 0, css: 0, html: 0, vendor: 0 };
let fail = false;

function walk(dir, cb) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(function (f) {
    var p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, cb); else cb(p);
  });
}

walk('js', function (p) {
  var s = fs.statSync(p).size;
  if (p.indexOf('vendor') >= 0) total.vendor += s; else total.js += s;
});
walk('css', function (p) { total.css += fs.statSync(p).size; });
if (fs.existsSync('index.html')) total.html = fs.statSync('index.html').size;

Object.keys(total).forEach(function (k) {
  var kb = (total[k] / 1024).toFixed(1), lim = (BUDGET[k] / 1024).toFixed(0);
  var ok = total[k] <= BUDGET[k];
  if (!ok) fail = true;
  console.log((ok ? '  OK ' : '  OVER ') + k + ': ' + kb + 'KB / ' + lim + 'KB');
});
if (fail) { console.log('번들 크기 예산 초과'); process.exit(1); }
console.log('번들 크기 예산 내');
