/* ============================================================
   MATE:ON lifetools — 상태와 무관한 순수 유틸/파서 모음.
   js/mateon.js 보다 먼저 로드되며 window.MateLife로 노출한다.
   ============================================================ */
(function () {
  'use strict';

  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function dateStr(ts) { var d = new Date(ts); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function fmtWon(n) { return Math.round(n).toLocaleString('ko-KR') + '원'; }
  function mondayOf(ts) { var d = new Date(ts); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
  function isoWeekKey(ts) {
    var d = new Date(ts === undefined ? Date.now() : ts);
    d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    var w1 = new Date(d.getFullYear(), 0, 4);
    return d.getFullYear() + '-W' + p2(1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7));
  }
  function weekRangeLabel(ts) {
    var m = new Date(mondayOf(ts));
    var s = new Date(mondayOf(ts) + 6 * 86400000);
    return (m.getMonth() + 1) + '/' + m.getDate() + ' ~ ' + (s.getMonth() + 1) + '/' + s.getDate();
  }

  /* share: 이 지출에서 '나'가 부담하는 비율 (기본 0.5 = 반반) */
  function expenseShare(x) { return (typeof x.share === 'number' && x.share >= 0 && x.share <= 1) ? x.share : 0.5; }
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
      if (x.payer === 'me') st.me += x.amount; else st.you += x.amount;
      var c = x.cat || '기타';
      cats[c] = (cats[c] || 0) + x.amount;
    });
    st.byCat = Object.keys(cats).map(function (c) { return { cat: c, sum: cats[c] }; })
      .sort(function (a, b) { return b.sum - a.sum; });
    return st;
  }
  /* 고정비 자동생성용 결정적 id — 두 기기가 각각 만들어도 같은 id로 머지됨 */
  function fixedExpId(fxId, ym) { return 'fx:' + fxId + ':' + ym; }

  /* ================= 영수증 텍스트 파서 (규칙 기반) =================
     OCR 결과 텍스트에서 총액·가게이름 후보를 뽑는다. */
  var TOTAL_HINT = /(합\s?계|총\s?액|총\s?금액|결제\s?금액|받을\s?금액|받은\s?금액|판매\s?금액|승인\s?금액|이용\s?금액|청구\s?금액|신용\s?카드|카드\s?매출|total|amount\s?due|grand\s?total)/i;
  var EXCLUDE_HINT = /(부가세|세금|vat\b|공급가|면세|할인|거스름|잔돈|change|포인트|적립|쿠폰)/i;
  var NOISE_LINE = /(영수증|전화|tel|사업자|대표|주소|카드번호|승인번호|일시|날짜|date|fax|http|www\.)/i;
  var DATE_OR_PHONE = /(\d{2,4}[-/.:]\d{1,2}[-/.:]\d{1,2}|\d{2,3}-\d{3,4}-\d{4})/g;

  function lineNumbers(l) {
    var stripped = l.replace(DATE_OR_PHONE, ' ');
    return (stripped.match(/[\d,]{1,12}(?:\.\d{1,2})?/g) || [])
      .map(function (n) { return +n.replace(/,/g, ''); })
      .filter(function (n) { return Number.isFinite(n) && n >= 1 && n <= 100000000; });
  }
  function parseReceiptText(text) {
    var out = { amount: 0, store: '' };
    if (!text) return out;
    var lines = text.split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
    var hinted = 0, fallback = 0;
    lines.forEach(function (l) {
      var nums = lineNumbers(l);
      if (!nums.length) return;
      var isHint = TOTAL_HINT.test(l), isExcl = EXCLUDE_HINT.test(l);
      nums.forEach(function (n) {
        if (isHint && !isExcl) { if (n >= hinted) hinted = n; }
        else if (!isExcl && n > fallback) fallback = n;
      });
    });
    var best = hinted || fallback;
    if (!best) {
      (text.match(/[\d,]{4,}/g) || []).forEach(function (n) {
        var v = +n.replace(/,/g, ''); if (v > best && v <= 100000000) best = v;
      });
    }
    out.amount = best;
    /* 가게명: 글자가 있고 노이즈가 아닌 첫 줄 */
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (!/[가-힣a-zA-Z]{2,}/.test(l) || NOISE_LINE.test(l)) continue;
      out.store = l.replace(/[^\w가-힣\s·&()-]/g, '').trim().slice(0, 24);
      if (out.store) break;
    }
    return out;
  }

  /* ================= 영수증 이미지 전처리 =================
     흐릿한 영수증의 인식률을 위해 그레이스케일+대비+확대를 적용한다.
     Canvas가 없는 환경(테스트)에서는 원본을 그대로 돌려준다. */
  function preprocessReceiptImage(file) {
    return new Promise(function (resolve) {
      if (typeof document === 'undefined' || !document.createElement) { resolve(file); return; }
      var img = new Image();
      var done = function (blob) { URL.revokeObjectURL(img.src); resolve(blob || file); };
      img.onload = function () {
        try {
          var scale = Math.max(1, Math.min(3, 1600 / Math.max(img.width, img.height)));
          var cv = document.createElement('canvas');
          cv.width = Math.round(img.width * scale);
          cv.height = Math.round(img.height * scale);
          var ctx = cv.getContext('2d');
          if (!ctx) { done(null); return; }
          ctx.drawImage(img, 0, 0, cv.width, cv.height);
          var id = ctx.getImageData(0, 0, cv.width, cv.height), d = id.data;
          /* 그레이스케일 + 대비 강화 (factor 1.4) */
          for (var i = 0; i < d.length; i += 4) {
            var g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
            g = Math.max(0, Math.min(255, (g - 128) * 1.4 + 128));
            d[i] = d[i + 1] = d[i + 2] = g;
          }
          ctx.putImageData(id, 0, 0);
          cv.toBlob(done, 'image/png');
        } catch (e) { done(null); }
      };
      img.onerror = function () { URL.revokeObjectURL(img.src); resolve(file); };
      img.src = URL.createObjectURL(file);
    });
  }

  window.MateLife = {
    p2: p2, dateStr: dateStr, fmtWon: fmtWon,
    mondayOf: mondayOf, isoWeekKey: isoWeekKey, weekRangeLabel: weekRangeLabel,
    expenseShare: expenseShare, settleNetOf: settleNetOf, monthStats: monthStats, fixedExpId: fixedExpId,
    parseReceiptText: parseReceiptText,
    preprocessReceiptImage: preprocessReceiptImage,
  };
})();
