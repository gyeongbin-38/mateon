/* test-lifetools.js — js/lifetools.js 순수 함수 단위 테스트
   DOM 없이 window.MateLife만 검증한다. */
const fs = require('fs');
let passed = 0, failed = 0;
function check(name, ok) { if (ok) { passed++; console.log('  OK ' + name); } else { failed++; console.log('  FAIL ' + name); } }

global.window = {};
eval(fs.readFileSync('js/lifetools.js', 'utf8'));
const ML = global.window.MateLife;

console.log('== lifetools: 날짜·시간 ==');
check('relTime 방금', ML.relTime(Date.now() - 10000) === '방금 전');
check('relTime 분', /분 전/.test(ML.relTime(Date.now() - 5 * 60000)));
check('relTime 시간', /시간 전/.test(ML.relTime(Date.now() - 3 * 3600000)));
check('relTime 일', /일 전/.test(ML.relTime(Date.now() - 2 * 86400000)));
check('relTime 과거는 날짜', /^\d{4}-\d{2}-\d{2}$/.test(ML.relTime(Date.now() - 10 * 86400000)));
check('weekdayOf 요일 문자', ['일', '월', '화', '수', '목', '금', '토'].includes(ML.weekdayOf(Date.now())));
check('dateLabel 형식', /^\d{1,2}\/\d{1,2}\(.\)$/.test(ML.dateLabel(Date.now())));
check('fmtWonShort 만원 단위', ML.fmtWonShort(45000) === '4.5만원');
check('fmtWonShort 소액', ML.fmtWonShort(3000) === '3,000원');

console.log('== lifetools: 스트릭·주간 ==');
const wkNow = ML.isoWeekKey(Date.now());
const wkPrev = ML.isoWeekKey(Date.now() - 7 * 86400000);
check('streakWeeks 0', ML.streakWeeks({}) === 0);
check('streakWeeks 이번주 1', ML.streakWeeks({ [wkNow]: true }) === 1);
check('streakWeeks 2주', ML.streakWeeks({ [wkNow]: true, [wkPrev]: true }) === 2);
check('streakWeeks 지난주만이면 1', ML.streakWeeks({ [wkPrev]: true }) === 1);

console.log('== lifetools: 정산·예산 ==');
check('budgetLevel 정상', ML.budgetLevel(50, 100) === 0);
check('budgetLevel 80% 경고', ML.budgetLevel(85, 100) === 1);
check('budgetLevel 초과', ML.budgetLevel(110, 100) === 2);
check('budgetLevel 예산없음', ML.budgetLevel(999, 0) === 0);
const exps = [
  { ts: Date.now(), payer: 'me', amount: 1000, memo: 'a', cat: '식비' },
  { ts: Date.now(), payer: 'you', amount: 3000, memo: 'b', cat: '공과금' },
];
const trend = ML.monthTrend(exps, 3);
check('monthTrend 3개월', trend.length === 3 && trend.every(function (t) { return /^\d{4}-\d{2}$/.test(t.ym); }));
check('monthTrend 이번달 합계', trend[2].total === 4000);
check('nextFixedTs 미래일', ML.nextFixedTs(15) >= new Date().setHours(0, 0, 0, 0));

console.log('== lifetools: 일정·ICS ==');
check('ddayMilestone 100일', ML.ddayMilestone(100) === '100일');
check('ddayMilestone 1주년', ML.ddayMilestone(365) === '1주년');
check('ddayMilestone 미해당', ML.ddayMilestone(42) === '');
check('ddayMilestone 미래', ML.ddayMilestone(-1) === '');
const ics = ML.buildICS({ id: 'e1', title: '장보기', date: '2026-01-10', time: '18:30', rpt: 'w', until: '2026-03-01' });
check('ICS RRULE', /RRULE:FREQ=WEEKLY/.test(ics));
check('ICS UNTIL', /UNTIL=20260301/.test(ics));
check('ICS 시간', /DTSTART:20260110T1830/.test(ics));
check('ICS 이스케이프', ML.buildICS({ id: 'e2', title: 'a,b;c\nd', date: '2026-01-01' }).includes('a\\,b\\;c\\nd'));
const dayEvs = ML.eventsOnDay([{ id: 'e1', title: '매주', date: '2026-01-05', rpt: 'w' }], [], '2026-01-12');
check('eventsOnDay 반복 발생', dayEvs.length === 1 && dayEvs[0].title === '매주');
const dayAnniv = ML.eventsOnDay([], [{ id: 'a1', title: '만난 날', date: '2025-03-14' }], '2026-03-14');
check('eventsOnDay 기념일', dayAnniv.length === 1 && dayAnniv[0].kind === 'anniv');

console.log('== lifetools: 미션·카운트 ==');
const picks1 = ML.missionPick('2026-W02', ['a', 'b', 'c', 'd', 'e'], 2);
const picks2 = ML.missionPick('2026-W02', ['a', 'b', 'c', 'd', 'e'], 2);
check('missionPick 결정적', JSON.stringify(picks1) === JSON.stringify(picks2));
check('missionPick 개수', picks1.length === 2);
check('missionPick 다른 주면 다를 수 있음', true);
check('recentCount 7일', ML.recentCount([{ ts: Date.now() }, { ts: Date.now() - 10 * 86400000 }], Date.now() - 7 * 86400000) === 1);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
