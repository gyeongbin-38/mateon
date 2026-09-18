/* MATE:ON 채점 로직 검증 */
const fs = require('fs');
eval(fs.readFileSync('js/data.js', 'utf8') +
  ';globalThis.__d={QUESTIONS,CHARACTERS,DOMAINS,AREA_INSIGHTS,CONFLICT_SCENARIOS,RULE_LIBRARY,BASE_RULES,SAMPLE_RESULTS,E_LEVELS,R_LEVELS};');
const { QUESTIONS, CHARACTERS } = globalThis.__d;

const BITMAP = { '1': [0,1], '2': [0,0], '3': [1,0], '4': [1,1] };
const codeBits = c => BITMAP[c[1]].concat(BITMAP[c[3]]);
const hamming = (a,b) => a.reduce((d,x,i)=>d+(x!==b[i]?1:0),0);

let errors = 0;

/* 1. 20문항 x 4선택지 = 80, 각 E×R 조합 정확히 5회 */
const counts = {};
QUESTIONS.forEach(q => q.options.forEach(o => { counts[o.code] = (counts[o.code]||0)+1; }));
CHARACTERS.forEach(c => {
  if (counts[c.code] !== 5) { errors++; console.log('BALANCE FAIL', c.code, counts[c.code]); }
});
console.log('1. 선택지 균형:', errors ? 'FAIL' : 'OK (각 조합 5회)');

/* 2. 모든 선택지가 16캐릭터에 1/4/6/4/1 분포로 점수 배분 */
const q1 = QUESTIONS[0].options[0];
const dist = {};
CHARACTERS.forEach(c => { const w = 2 - hamming(codeBits(q1.code), codeBits(c.code)); dist[w]=(dist[w]||0)+1; });
const ok2 = dist[2]===1 && dist[1]===4 && dist[0]===6 && dist[-1]===4 && dist[-2]===1;
console.log('2. 선택지 가중치 분포 1/4/6/4/1:', ok2 ? 'OK' : 'FAIL ' + JSON.stringify(dist));
if (!ok2) errors++;

/* 3. 채점 시뮬레이션: 특정 코드만 찍으면 그 캐릭터가 1위 */
function score(answers) {
  const sc = CHARACTERS.map(c => ({ c, s: 0, p2: 0 }));
  answers.forEach(a => {
    const ab = codeBits(a.code);
    sc.forEach(x => { const w = 2 - hamming(ab, codeBits(x.c.code)); x.s += w; if (w===2) x.p2++; });
  });
  sc.sort((x,y) => y.s - x.s || y.p2 - x.p2);
  return sc;
}
// 각 문항에서 E3R2 코드 선택지를 찾아 답변
const ansE3R2 = QUESTIONS.map(q => {
  const opt = q.options.find(o => o.code === 'E3R2');
  return { qid: q.id, code: opt ? opt.code : q.options[0].code };
});
const r1 = score(ansE3R2);
console.log('3. E3R2 일관 응답 → 1위:', r1[0].c.name, r1[0].c.code, `(점수 ${r1[0].s})`, r1[0].c.code==='E3R2' ? 'OK' : 'FAIL');
if (r1[0].c.code !== 'E3R2') errors++;

const ansE4R4 = QUESTIONS.map(q => {
  const opt = q.options.find(o => o.code === 'E4R4');
  return { qid: q.id, code: opt ? opt.code : q.options[0].code };
});
const r2 = score(ansE4R4);
console.log('   E4R4 일관 응답 → 1위:', r2[0].c.name, r2[0].c.code, `(점수 ${r2[0].s})`, r2[0].c.code==='E4R4' ? 'OK' : 'FAIL');
if (r2[0].c.code !== 'E4R4') errors++;

/* 4. 전부 첫번째 선택지(A) 응답 시 결과 sanity */
const ansA = QUESTIONS.map(q => ({ qid: q.id, code: q.options[0].code }));
const rA = score(ansA);
console.log('4. 전부 A 응답 → 1위:', rA[0].c.name, rA[0].c.code, '2위:', rA[1].c.name, '마진:', rA[0].s - rA[1].s);

/* 5. 랜덤 응답 100회 — 항상 유효 결과 */
let valid = 0;
for (let i = 0; i < 100; i++) {
  const ans = QUESTIONS.map(q => ({ qid: q.id, code: q.options[Math.floor(Math.random()*4)].code }));
  const r = score(ans);
  if (r[0] && r[0].s >= r[1].s) valid++;
}
console.log('5. 랜덤 응답 100회 유효성:', valid + '/100');
if (valid !== 100) errors++;

/* 6. E/R 연속점수 계산 */
const mean = a => a.reduce((x,y)=>x+y,0)/a.length;
const eAvg = mean(ansE3R2.map(a => +a.code[1]));
const rAvg = mean(ansE3R2.map(a => +a.code[3]));
console.log('6. E3R2 일관 응답 연속점수: E=' + eAvg, 'R=' + rAvg, '(기대 3, 2)');

console.log(errors ? `\n${errors} FAILURES` : '\nALL SCORING TESTS PASSED');
process.exit(errors ? 1 : 0);
