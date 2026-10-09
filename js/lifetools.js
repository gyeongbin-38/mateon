/* ============================================================
   MATE:ON lifetools — 상태와 무관한 순수 유틸/파서 모음.
   js/mateon.js 보다 먼저 로드되며 window.MateLife로 노출한다.
   ============================================================ */
(function () {
  'use strict';

  function p2(n) {
    return (n < 10 ? '0' : '') + n;
  }
  function dateStr(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }
  function fmtWon(n) {
    return Math.round(n).toLocaleString('ko-KR') + '원';
  }
  function mondayOf(ts) {
    var d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  }
  function isoWeekKey(ts) {
    var d = new Date(ts === undefined ? Date.now() : ts);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    var w1 = new Date(d.getFullYear(), 0, 4);
    return d.getFullYear() + '-W' + p2(1 + Math.round(((d.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7));
  }
  function weekRangeLabel(ts) {
    var m = new Date(mondayOf(ts));
    var s = new Date(mondayOf(ts) + 6 * 86400000);
    return m.getMonth() + 1 + '/' + m.getDate() + ' ~ ' + (s.getMonth() + 1) + '/' + s.getDate();
  }

  /* share: 이 지출에서 '나'가 부담하는 비율 (기본 0.5 = 반반) */
  function expenseShare(x) {
    return typeof x.share === 'number' && x.share >= 0 && x.share <= 1 ? x.share : 0.5;
  }
  /* 정산 순액: 양수 = 상대가 나에게 줄 돈 */
  function settleNetOf(expenses) {
    var net = 0;
    (expenses || []).forEach(function (x) {
      var sh = expenseShare(x);
      net += x.payer === 'me' ? x.amount * (1 - sh) : -x.amount * sh;
    });
    return Math.round(net);
  }

  /* 월별 요약: ym = 'YYYY-MM'. {total, me, you, byCat:[{cat,sum}] desc} */
  function monthStats(expenses, ym) {
    var st = { total: 0, me: 0, you: 0, byCat: [] };
    var cats = {};
    (expenses || []).forEach(function (x) {
      if (ym && dateStr(x.ts).slice(0, 7) !== ym) return;
      st.total += x.amount;
      if (x.payer === 'me') st.me += x.amount;
      else st.you += x.amount;
      var c = x.cat || '기타';
      cats[c] = (cats[c] || 0) + x.amount;
    });
    st.byCat = Object.keys(cats)
      .map(function (c) {
        return { cat: c, sum: cats[c] };
      })
      .sort(function (a, b) {
        return b.sum - a.sum;
      });
    return st;
  }
  /* 고정비 자동생성용 결정적 id — 두 기기가 각각 만들어도 같은 id로 머지됨 */
  function fixedExpId(fxId, ym) {
    return 'fx:' + fxId + ':' + ym;
  }

  /* ---- 기념일 D-day: MM-DD가 매년 반복 → 다음 발생 시각과 남은 일수 ---- */
  function nextAnnivTs(iso, fromTs) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null;
    var from = fromTs === undefined ? Date.now() : fromTs;
    var f = new Date(from);
    f.setHours(0, 0, 0, 0);
    var mm = +iso.slice(5, 7),
      dd = +iso.slice(8, 10);
    var y = f.getFullYear();
    for (var i = 0; i < 3; i++) {
      var d = new Date(y + i, mm - 1, dd, 12);
      if (d.getMonth() === mm - 1 && d.getDate() === dd && d.getTime() >= f.getTime()) return d.getTime();
    }
    return null;
  }
  function ddayLabel(targetTs, fromTs) {
    var from = fromTs === undefined ? Date.now() : fromTs;
    var f = new Date(from);
    f.setHours(0, 0, 0, 0);
    var t = new Date(targetTs);
    t.setHours(0, 0, 0, 0);
    var diff = Math.round((t.getTime() - f.getTime()) / 86400000);
    if (diff === 0) return 'D-day';
    return diff > 0 ? 'D-' + diff : 'D+' + -diff;
  }

  /* ---- 지출 CSV (엑셀 호환 BOM + 이스케이프) ---- */
  function csvCell(v) {
    var s = String(v === undefined || v === null ? '' : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function expensesToCSV(list, nameOf) {
    var rows = [['날짜', '내용', '분류', '낸 사람', '금액', '나의 부담', '고정비']];
    (list || [])
      .slice()
      .sort(function (a, b) {
        return a.ts - b.ts;
      })
      .forEach(function (x) {
        var sh = expenseShare(x);
        var mine = Math.round(x.payer === 'me' ? x.amount * sh : x.amount * (1 - sh));
        rows.push([dateStr(x.ts), x.memo || '', x.cat || '기타', nameOf(x.payer), x.amount, mine, x.fx ? 'Y' : '']);
      });
    return (
      '﻿' +
      rows
        .map(function (r) {
          return r.map(csvCell).join(',');
        })
        .join('\r\n')
    );
  }

  /* ---- 주간 미션: ISO 주 문자열을 시드로 미션 N개를 결정적으로 고른다 ---- */
  function missionPick(weekKey, presets, count) {
    var h = 0;
    for (var i = 0; i < weekKey.length; i++) h = (Math.imul(h, 31) + weekKey.charCodeAt(i)) >>> 0;
    var idxs = [];
    var n = Math.min(count || 2, presets.length);
    while (idxs.length < n) {
      var k = h % presets.length;
      if (idxs.indexOf(k) < 0) idxs.push(k);
      h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    }
    return idxs.map(function (i) {
      return presets[i];
    });
  }

  /* ================= 영수증 텍스트 파서 (규칙 기반) =================
     OCR 결과 텍스트에서 총액·가게이름 후보를 뽑는다. */
  var TOTAL_HINT =
    /(합\s?계|총\s?액|총\s?금액|결제\s?금액|받을\s?금액|받은\s?금액|판매\s?금액|승인\s?금액|이용\s?금액|청구\s?금액|신용\s?카드|카드\s?매출|total|amount\s?due|grand\s?total)/i;
  var EXCLUDE_HINT = /(부가세|세금|vat\b|공급가|면세|할인|거스름|잔돈|change|포인트|적립|쿠폰)/i;
  var NOISE_LINE = /(영수증|전화|tel|사업자|대표|주소|카드번호|승인번호|일시|날짜|date|fax|http|www\.)/i;
  var DATE_OR_PHONE = /(\d{2,4}[-/.:]\d{1,2}[-/.:]\d{1,2}|\d{2,3}-\d{3,4}-\d{4})/g;

  function lineNumbers(l) {
    var stripped = l.replace(DATE_OR_PHONE, ' ');
    return (stripped.match(/[\d,]{1,12}(?:\.\d{1,2})?/g) || [])
      .map(function (n) {
        return +n.replace(/,/g, '');
      })
      .filter(function (n) {
        return Number.isFinite(n) && n >= 1 && n <= 100000000;
      });
  }
  function parseReceiptText(text) {
    var out = { amount: 0, store: '' };
    if (!text) return out;
    var lines = text
      .split(/\n+/)
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
    var hinted = 0,
      fallback = 0;
    lines.forEach(function (l) {
      var nums = lineNumbers(l);
      if (!nums.length) return;
      var isHint = TOTAL_HINT.test(l),
        isExcl = EXCLUDE_HINT.test(l);
      nums.forEach(function (n) {
        if (isHint && !isExcl) {
          if (n >= hinted) hinted = n;
        } else if (!isExcl && n > fallback) fallback = n;
      });
    });
    var best = hinted || fallback;
    if (!best) {
      (text.match(/[\d,]{4,}/g) || []).forEach(function (n) {
        var v = +n.replace(/,/g, '');
        if (v > best && v <= 100000000) best = v;
      });
    }
    out.amount = best;
    /* 가게명: 글자가 있고 노이즈가 아닌 첫 줄 */
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (!/[가-힣a-zA-Z]{2,}/.test(l) || NOISE_LINE.test(l)) continue;
      out.store = l
        .replace(/[^\w가-힣\s·&()-]/g, '')
        .trim()
        .slice(0, 24);
      if (out.store) break;
    }
    return out;
  }

  /* ================= 영수증 이미지 전처리 =================
     흐릿한 영수증의 인식률을 위해 그레이스케일+대비+확대를 적용한다.
     Canvas가 없는 환경(테스트)에서는 원본을 그대로 돌려준다. */
  function preprocessReceiptImage(file) {
    return new Promise(function (resolve) {
      if (typeof document === 'undefined' || !document.createElement) {
        resolve(file);
        return;
      }
      var img = new Image();
      var done = function (blob) {
        URL.revokeObjectURL(img.src);
        resolve(blob || file);
      };
      img.onload = function () {
        try {
          var scale = Math.max(1, Math.min(3, 1600 / Math.max(img.width, img.height)));
          var cv = document.createElement('canvas');
          cv.width = Math.round(img.width * scale);
          cv.height = Math.round(img.height * scale);
          var ctx = cv.getContext('2d');
          if (!ctx) {
            done(null);
            return;
          }
          ctx.drawImage(img, 0, 0, cv.width, cv.height);
          var id = ctx.getImageData(0, 0, cv.width, cv.height),
            d = id.data;
          /* 그레이스케일 + 대비 강화 (factor 1.4) */
          for (var i = 0; i < d.length; i += 4) {
            var g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
            g = Math.max(0, Math.min(255, (g - 128) * 1.4 + 128));
            d[i] = d[i + 1] = d[i + 2] = g;
          }
          ctx.putImageData(id, 0, 0);
          cv.toBlob(done, 'image/png');
        } catch (e) {
          done(null);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(img.src);
        resolve(file);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  /* ================= 추가 유틸 (202610xx 라운드) ================= */

  /* 상대 시간: '방금 전', '3분 전', '2시간 전', '4일 전', 그 이상은 날짜 */
  function relTime(ts, nowTs) {
    var now = nowTs === undefined ? Date.now() : nowTs;
    var d = Math.floor((now - ts) / 1000);
    if (d < 0) return '방금 전';
    if (d < 60) return '방금 전';
    if (d < 3600) return Math.floor(d / 60) + '분 전';
    if (d < 86400) return Math.floor(d / 3600) + '시간 전';
    if (d < 86400 * 7) return Math.floor(d / 86400) + '일 전';
    return dateStr(ts);
  }

  /* 큰 금액 약식: 12000 -> '1.2만원', 3000 -> '3,000원' */
  function fmtWonShort(n) {
    var v = Math.abs(Math.round(n));
    if (v >= 100000000) return (v / 100000000).toFixed(1).replace(/\.0$/, '') + '억원';
    if (v >= 10000) return (v / 10000).toFixed(1).replace(/\.0$/, '') + '만원';
    return v.toLocaleString('ko-KR') + '원';
  }

  var WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  function weekdayOf(ts) {
    return WEEKDAYS[new Date(ts).getDay()];
  }
  /* 'M/D(월)' 형태 날짜 라벨 */
  function dateLabel(ts) {
    var d = new Date(ts);
    return d.getMonth() + 1 + '/' + d.getDate() + '(' + weekdayOf(ts) + ')';
  }

  /* 연속 주차 스트릭: weekKey 문자열(YYYY-WNN) 집합에서 이번 주 또는 지난 주부터 거슬러 센다 */
  function streakWeeks(hasSet, nowTs) {
    var now = nowTs === undefined ? Date.now() : nowTs;
    var cur = mondayOf(now);
    if (!hasSet[isoWeekKey(cur)]) cur -= 7 * 86400000; /* 이번 주 없으면 지난 주부터 */
    var n = 0;
    while (hasSet[isoWeekKey(cur)]) {
      n++;
      cur -= 7 * 86400000;
    }
    return n;
  }

  /* 고정비 다음 자동 기록일: day(1~31) 기준으로 오늘 이후 가장 가까운 날 */
  function nextFixedTs(day, fromTs) {
    var from = fromTs === undefined ? Date.now() : fromTs;
    var f = new Date(from);
    f.setHours(0, 0, 0, 0);
    for (var i = 0; i < 14; i++) {
      var d = new Date(f.getFullYear(), f.getMonth() + i, 1);
      var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      var t = new Date(d.getFullYear(), d.getMonth(), Math.min(day, last), 12);
      if (t.getTime() >= f.getTime()) return t.getTime();
    }
    return null;
  }

  /* 최근 n개월 지출 추이: [{ym,total}] 오래된 순 */
  function monthTrend(expenses, n) {
    var out = [];
    var d = new Date();
    d.setDate(1);
    for (var i = n - 1; i >= 0; i--) {
      var m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      var ym = m.getFullYear() + '-' + p2(m.getMonth() + 1);
      out.push({ ym: ym, total: monthStats(expenses, ym).total });
    }
    return out;
  }

  /* 예산 수준: 0 정상 / 1 주의(80%↑) / 2 초과 */
  function budgetLevel(used, limit) {
    if (!limit || limit <= 0) return 0;
    if (used > limit) return 2;
    return used >= limit * 0.8 ? 1 : 0;
  }

  /* 기념일 마일스톤 라벨: 경과 일수 → '100일', '1주년' 등 (해당 없으면 '') */
  function ddayMilestone(daysSince) {
    if (daysSince < 0) return '';
    if (daysSince === 0) return '오늘 시작';
    if (daysSince % 365 === 0) return daysSince / 365 + '주년';
    if (daysSince % 100 === 0) return daysSince + '일';
    if (daysSince === 30 || daysSince === 200) return daysSince + '일';
    return '';
  }

  /* 특정 날짜의 일정 목록 (반복·기념일 포함): [ {kind:'event'|'anniv', title, who} ] */
  function eventsOnDay(events, annivs, iso) {
    var out = [];
    (events || []).forEach(function (e) {
      if (e.rpt === 'w') {
        var cur = new Date(e.date + 'T12:00:00');
        var guard = 0;
        while (dateStr(cur.getTime()) < iso && guard++ < 600) cur.setDate(cur.getDate() + 7);
        if (dateStr(cur.getTime()) === iso) out.push({ kind: 'event', id: e.id, title: e.title, who: e.who, memo: e.memo, time: e.time });
      } else if (e.date === iso) out.push({ kind: 'event', id: e.id, title: e.title, who: e.who, memo: e.memo, time: e.time });
    });
    (annivs || []).forEach(function (a) {
      if (a.date.slice(5) === iso.slice(5)) out.push({ kind: 'anniv', id: a.id, title: a.title || a.name, who: 'both' });
    });
    return out;
  }

  /* ICS 이스케이프 + 단일 이벤트 텍스트 (RRULE 지원) */
  function icsEsc(s) {
    return String(s || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  }
  function buildICS(ev, opts) {
    var o = opts || {};
    var dt = String(ev.date || '').replace(/-/g, '');
    var hasTime = ev.time && /^\d{2}:\d{2}$/.test(ev.time);
    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//MATE:ON//KO',
      'BEGIN:VEVENT',
      'UID:' + (ev.id || 'mateon-' + dt) + '@mateon',
      'DTSTAMP:' + dt + 'T000000Z',
      hasTime ? 'DTSTART:' + dt + 'T' + ev.time.replace(':', '') + '00' : 'DTSTART;VALUE=DATE:' + dt,
      'SUMMARY:' + icsEsc(ev.title || 'MATE:ON 일정'),
    ];
    if (ev.memo) lines.push('DESCRIPTION:' + icsEsc(ev.memo));
    if (ev.rpt === 'w') lines.push('RRULE:FREQ=WEEKLY' + (ev.until ? ';UNTIL=' + String(ev.until).replace(/-/g, '') + 'T235959Z' : ''));
    if (o.yearly) lines.push('RRULE:FREQ=YEARLY');
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.join('\r\n');
  }

  /* 활동 로그 타임스탬프 수집 — 주간 리포트/스트릭 공용 */
  function recentCount(list, sinceTs) {
    var n = 0;
    (list || []).forEach(function (x) {
      if (x && x.ts >= sinceTs) n++;
    });
    return n;
  }

  /** @type {any} */ (window).MateLife = {
    p2: p2,
    dateStr: dateStr,
    fmtWon: fmtWon,
    mondayOf: mondayOf,
    isoWeekKey: isoWeekKey,
    weekRangeLabel: weekRangeLabel,
    expenseShare: expenseShare,
    settleNetOf: settleNetOf,
    monthStats: monthStats,
    fixedExpId: fixedExpId,
    nextAnnivTs: nextAnnivTs,
    ddayLabel: ddayLabel,
    expensesToCSV: expensesToCSV,
    missionPick: missionPick,
    parseReceiptText: parseReceiptText,
    preprocessReceiptImage: preprocessReceiptImage,
    relTime: relTime,
    fmtWonShort: fmtWonShort,
    weekdayOf: weekdayOf,
    dateLabel: dateLabel,
    streakWeeks: streakWeeks,
    nextFixedTs: nextFixedTs,
    monthTrend: monthTrend,
    budgetLevel: budgetLevel,
    ddayMilestone: ddayMilestone,
    eventsOnDay: eventsOnDay,
    icsEsc: icsEsc,
    buildICS: buildICS,
    recentCount: recentCount,
  };
})();
