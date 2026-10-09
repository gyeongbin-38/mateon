/* MateHouse — 생활 도구 카드 렌더러 (mateon.js에서 분리)
   window.MateHouse.bind({S, esc, fmtWon, payerName, armBtn, dateStr, isoWeekMonday})로
   앱 상태와 헬퍼를 주입한 뒤 각 함수를 호출한다.
   의존 전역: MateLife(ML), data.js 상수(COUPON_PRESETS, CARE_KINDS, CARE_PRESETS,
   RECIPE_MAP, PANTRY_LOCS, LOVE_LANGS, LOVE_LANG_Q, LOVE_LANG_COUPON, BADGE_DEFS, CAT_EMOJI) */
window.MateHouse = (function () {
  var X;
  function bind(deps) { X = deps; }
  function esc(s) { return X.esc(s); }
  function fmtWon(n) { return X.fmtWon(n); }
  var ML = window.MateLife;

  /* ---- 이번 달 리포트 ---- */
  function monthReportHTML() {
    var S = X.S;
    var mk = X.dateStr(Date.now()).slice(0, 7);
    var pmk = X.dateStr(Date.now() - 32 * 86400000).slice(0, 7);
    var mTotal = ML.monthStats(S.expenses, mk).total;
    var pTotal = ML.monthStats(S.expenses, pmk).total;
    var mFrom = new Date(mk + '-01').getTime(), pFrom = new Date(pmk + '-01').getTime();
    var mCi = S.checkins.filter(function (c) { return c.ts >= mFrom; }).length;
    var pCi = S.checkins.filter(function (c) { return c.ts >= pFrom && c.ts < mFrom; }).length;
    var mChore = 0;
    Object.keys(S.choreLog).forEach(function (k) {
      var wm = X.isoWeekMonday(k);
      if (wm && wm.getTime() + 7 * 86400000 > mFrom) mChore += Object.keys(S.choreLog[k]).length;
    });
    var diff = mTotal - pTotal;
    return '<div class="mobile-section-head"><h2>이번 달 리포트</h2><span>' + esc(mk) + '</span></div>' +
      '<div class="card"><div class="report-line">' +
      '<div class="rl">💸 지출 ' + esc(ML.fmtWon(mTotal)) + (pTotal ? ' <small>(전월 대비 ' + (diff > 0 ? '+' : '') + esc(ML.fmtWon(diff)) + ')</small>' : '') + '</div>' +
      '<div class="rl">💌 체크인 ' + mCi + '회' + (pCi ? ' <small>(전월 ' + pCi + '회)</small>' : '') + '</div>' +
      '<div class="rl">🧹 집안일 완료 ' + mChore + '건</div>' +
      '</div></div>';
  }

  /* ---- 러브 쿠폰 ---- */
  function couponHTML() {
    var S = X.S;
    var open = S.coupons.filter(function (c) { return !c.usedTs; });
    var used = S.coupons.filter(function (c) { return c.usedTs; }).slice(-5).reverse();
    return '<div class="mobile-section-head"><h2>러브 쿠폰</h2><span>서로에게 주는 작은 약속</span></div>' +
      '<div class="card coupon-card"><div class="chip-row">' +
      COUPON_PRESETS.map(function (p) { return '<button class="chip chip-sm" data-action="coupon-issue" data-v="' + esc(p) + '" type="button">🎟 ' + esc(p) + '</button>'; }).join('') +
      '<button class="chip chip-sm" data-action="coupon-custom" type="button">+ 직접 만들기</button></div>' +
      (S.couponCustom ? '<div class="custom-rule" style="margin-top:10px"><input id="coupon-custom-in" class="input" maxlength="20" placeholder="예: 발 마사지 15분권" autocomplete="off">' +
        '<button class="btn btn-secondary btn-md" data-action="coupon-custom-add" type="button">발급</button></div>' : '') +
      (open.length ? '<div class="coupon-list">' + open.map(function (c) {
        return '<div class="coupon-ticket"><span class="coupon-face">🎟</span><span class="coupon-info"><strong>' + esc(c.title) + '</strong><small>' + esc(X.payerName(c.by)) + '이 발급 · ' + ML.dateLabel(c.ts) + '</small></span>' +
          '<button class="btn btn-secondary btn-sm" data-action="coupon-use" data-v="' + c.id + '" type="button">사용</button>' + X.armBtn('coupon-del', c.id, '', '확인') + '</div>';
      }).join('') + '</div>' : '<p class="field-hint" style="margin-top:10px">아직 발급된 쿠폰이 없어요. 위에서 하나 골라 선물해 보세요.</p>') +
      (used.length ? '<details style="margin-top:8px"><summary class="field-hint">사용한 쿠폰 ' + used.length + '</summary>' + used.map(function (c) {
        return '<p class="field-hint coupon-used">🎟 ' + esc(c.title) + ' · ' + ML.dateLabel(c.usedTs) + ' 사용</p>';
      }).join('') + '</details>' : '') + '</div>';
  }

  /* ---- 결정 룰렛 ---- */
  function rouletteHTML() {
    var S = X.S;
    var opts = S.roulette.opts || [];
    return '<div class="mobile-section-head"><h2>결정 룰렛</h2><span>못 정하면 돌려요</span></div>' +
      '<div class="card"><div class="chip-row">' +
      opts.map(function (o, i) { return '<button class="chip chip-sm" data-action="roulette-del-opt" data-v="' + i + '" type="button" aria-label="' + esc(o) + ' 빼기">' + esc(o) + ' ✕</button>'; }).join('') +
      '</div><div class="custom-rule" style="margin-top:10px"><input id="roulette-in" class="input" maxlength="20" placeholder="후보 추가 (예: 짜장면)" autocomplete="off">' +
      '<button class="btn btn-secondary btn-md" data-action="roulette-add" type="button">추가</button></div>' +
      '<div class="cta-row" style="margin-top:10px"><button class="mobile-primary" data-action="roulette-spin" type="button"' + (opts.length < 2 ? ' disabled' : '') + '>돌리기</button>' +
      '<button class="btn btn-secondary btn-md" data-action="roulette-coin" type="button">동전 던지기</button></div>' +
      (S.roulette.last ? '<p class="roulette-result" role="status">🎯 <strong>' + esc(S.roulette.last) + '</strong>' + (S.roulette.lastKind === 'coin' ? ' 나왔어요' : '(으)로 결정!') + '</p>' : '') +
      '<p class="field-hint" style="margin-top:8px">설거지 담당, 저녁 메뉴처럼 사소한 쟁점은 게임처럼 정해요.</p></div>';
  }

  /* ---- 펫·식물 돌봄 ---- */
  function careHTML() {
    var S = X.S;
    var rows = S.care.map(function (c) {
      var next = c.last + c.days * 86400000;
      var left = Math.ceil((next - Date.now()) / 86400000);
      var due = left <= 0;
      return '<div class="settle-row' + (due ? ' care-due' : '') + '"><span class="settle-cat">' + (c.kind === 'plant' ? '🌱' : '🐾') + '</span>' +
        '<span class="settle-info"><strong>' + esc(c.name) + '</strong><small>' + esc(CARE_KINDS[c.kind] || '돌봄') + ' · ' + c.days + '일마다 · ' + (due ? '오늘 할 일!' : left + '일 후') + '</small></span>' +
        '<button class="item-del" data-action="care-done" data-v="' + c.id + '" type="button">했어요</button>' + X.armBtn('care-del', c.id, '삭제', '확인') + '</div>';
    }).join('');
    var presets = (CARE_PRESETS[S.careKind || 'pet'] || []);
    return '<div class="mobile-section-head"><h2>펫·식물 돌봄</h2><span>주기마다 알아서 체크</span></div>' +
      '<div class="card"><div class="chip-row" role="group" aria-label="돌봄 종류">' +
      Object.keys(CARE_KINDS).map(function (k) { return '<button class="chip chip-sm' + ((S.careKind || 'pet') === k ? ' selected' : '') + '" data-action="care-kind" data-v="' + k + '" type="button">' + esc(CARE_KINDS[k]) + '</button>'; }).join('') + '</div>' +
      (presets.length ? '<div class="chip-row" style="margin-top:8px">' + presets.map(function (p) { return '<button class="chip chip-sm" data-action="care-preset" data-v="' + esc(p.name) + '" type="button">+ ' + esc(p.name) + ' (' + p.days + '일)</button>'; }).join('') + '</div>' : '') +
      '<div class="custom-rule" style="margin-top:10px"><input id="care-name" class="input" maxlength="20" placeholder="이름 (예: 몬스테라)" autocomplete="off">' +
      '<input id="care-days" class="input debt-amt" type="number" inputmode="numeric" min="1" max="365" placeholder="주기(일)" aria-label="주기 일수">' +
      '<button class="btn btn-secondary btn-md" data-action="care-add" type="button">추가</button></div>' +
      (rows || '<p class="field-hint" style="margin-top:10px">등록된 돌봄이 없어요. 프리셋을 눌러 시작해 보세요.</p>') + '</div>';
  }

  /* ---- 우리집 정보 메모 ---- */
  function memosHTML() {
    var S = X.S;
    return '<div class="mobile-section-head"><h2>우리집 정보</h2><span>둘 다 알아야 하는 것들</span></div>' +
      '<div class="card">' +
      (S.memos.length ? S.memos.map(function (m) {
        return '<div class="memo-row"><span class="memo-info"><strong>' + esc(m.title) + '</strong><small>' + esc(m.text) + '</small></span>' +
          '<button class="item-del" data-action="memo-copy" data-v="' + m.id + '" type="button">복사</button>' + X.armBtn('memo-del', m.id, '삭제', '확인') + '</div>';
      }).join('') : '<p class="field-hint">와이파이 비밀번호, 관리사무소 번호, 분리수거 요일 같은 걸 적어두세요.</p>') +
      '<div class="custom-rule" style="margin-top:10px"><input id="memo-title" class="input" maxlength="20" placeholder="제목 (예: 와이파이)" autocomplete="off">' +
      '<input id="memo-text" class="input" maxlength="200" placeholder="내용" autocomplete="off">' +
      '<button class="btn btn-secondary btn-md" data-action="memo-add" type="button">추가</button></div></div>';
  }

  /* ---- 공동 목표 저축 ---- */
  function goalHTML() {
    var S = X.S;
    var g = S.goal;
    if (!g) {
      return '<div class="card" style="margin-top:14px"><h4 class="card-title">공동 목표 저축</h4>' +
        '<p class="field-hint">여행·가전 같은 목표를 정하고 함께 모아봐요.</p>' +
        '<div class="custom-rule"><input id="goal-name" class="input" maxlength="20" placeholder="예: 제주 여행" autocomplete="off">' +
        '<input id="goal-target" class="input" type="number" inputmode="numeric" min="1" max="1000000000" placeholder="목표 금액" aria-label="목표 금액">' +
        '<button class="btn btn-secondary btn-md" data-action="goal-set" type="button">시작</button></div></div>';
    }
    var sum = g.saves.reduce(function (a, s) { return a + s.amt; }, 0);
    var pct = Math.min(100, Math.round(sum / g.target * 100));
    var done = sum >= g.target;
    return '<div class="card" style="margin-top:14px"><h4 class="card-title">🎯 ' + esc(g.name) + '</h4>' +
      '<div class="goal-ring-wrap"><div class="goal-ring" role="img" aria-label="목표 달성률 ' + pct + '%" style="background:conic-gradient(var(--app-coral) ' + pct * 3.6 + 'deg, var(--app-line) 0)"><span>' + pct + '%</span></div>' +
      '<div class="goal-meta"><strong>' + fmtWon(sum) + '</strong><small> / ' + fmtWon(g.target) + '</small>' +
      (done ? '<p class="goal-done">목표 달성! 🎉</p>' : '<small class="field-hint">남은 금액 ' + fmtWon(g.target - sum) + '</small>') + '</div></div>' +
      '<div class="custom-rule"><input id="goal-amt" class="input" type="number" inputmode="numeric" min="1" max="100000000" placeholder="저축 금액" aria-label="저축 금액">' +
      '<button class="btn btn-secondary btn-md" data-action="goal-add" type="button">저축</button>' +
      X.armBtn('goal-del', 'x', '목표 삭제', '확인') + '</div>' +
      (g.saves.length ? '<div class="goal-log">' + g.saves.slice(-5).reverse().map(function (s) {
        return '<div class="settle-row"><span class="settle-info"><small>' + ML.dateLabel(s.ts) + '</small></span><span class="settle-amt">+' + fmtWon(s.amt) + '</span></div>';
      }).join('') + '</div>' : '') + '</div>';
  }

  /* ---- 빌려준 돈 ---- */
  function debtsHTML() {
    var S = X.S;
    var open = S.debts.filter(function (d) { return !d.repaidTs; });
    var lent = open.filter(function (d) { return d.dir === 'lent'; }).reduce(function (a, d) { return a + d.amount; }, 0);
    var borrowed = open.filter(function (d) { return d.dir === 'borrowed'; }).reduce(function (a, d) { return a + d.amount; }, 0);
    var rows = open.map(function (d) {
      return '<div class="settle-row"><span class="settle-cat">' + (d.dir === 'lent' ? '💸' : '🤲') + '</span>' +
        '<span class="settle-info"><strong>' + esc(d.memo || (d.dir === 'lent' ? '빌려준 돈' : '빌린 돈')) + '</strong><small>' + (d.dir === 'lent' ? esc(X.payerName('me')) + ' → ' + esc(X.payerName('you')) : esc(X.payerName('you')) + ' → ' + esc(X.payerName('me'))) + ' · ' + ML.dateLabel(d.ts) + '</small></span>' +
        '<span class="settle-amt">' + fmtWon(d.amount) + '</span>' +
        '<button class="item-del" data-action="debt-done" data-v="' + d.id + '" type="button">갚음</button>' + X.armBtn('debt-del', d.id, '삭제', '확인') + '</div>';
    }).join('');
    return '<details class="card" style="margin-top:16px"' + (open.length ? ' open' : '') + '><summary>빌려준 돈' +
      (open.length ? ' (받을 돈 ' + ML.fmtWonShort(lent) + ' · 갚을 돈 ' + ML.fmtWonShort(borrowed) + ')' : '') + '</summary>' +
      (rows || '<p class="field-hint" style="margin-top:8px">정산과 별개로 주고받은 돈을 적어둬요. 예: 택시비를 대신 내줬을 때.</p>') +
      '<div class="chip-row" style="margin-top:10px">' +
      '<button class="chip' + (S.debtDir !== 'borrowed' ? ' selected' : '') + '" data-action="debt-dir" data-v="lent" type="button">내가 빌려줌</button>' +
      '<button class="chip' + (S.debtDir === 'borrowed' ? ' selected' : '') + '" data-action="debt-dir" data-v="borrowed" type="button">내가 빌림</button></div>' +
      '<div class="custom-rule" style="margin-top:8px"><input id="debt-memo" class="input" maxlength="30" placeholder="예: 택시비" autocomplete="off">' +
      '<input id="debt-amt" class="input debt-amt" type="number" inputmode="numeric" min="1" max="100000000" placeholder="금액" aria-label="금액">' +
      '<button class="btn btn-secondary btn-md" data-action="debt-add" type="button">추가</button></div></details>';
  }

  /* ---- 유통기한 관리 + 임박 재료 레시피 제안 ---- */
  function pantryHTML() {
    var S = X.S;
    var today = X.dateStr(Date.now());
    var items = S.pantry.slice().sort(function (a, b) { return a.exp < b.exp ? -1 : 1; });
    var rows = items.map(function (x) {
      var left = Math.floor((new Date(x.exp + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86400000);
      var cls = left < 0 ? 'expired' : left <= 3 ? 'soon' : left <= 7 ? 'week' : 'ok';
      var lbl = left < 0 ? '지남 ' + Math.abs(left) + '일' : left === 0 ? '오늘까지' : 'D-' + left;
      return '<div class="pantry-row"><span class="pantry-loc ' + esc(x.loc) + '">' + esc(x.loc) + '</span>' +
        '<span class="pantry-info"><strong>' + esc(x.name) + '</strong><small>' + esc(x.exp.slice(5)) + '까지</small></span>' +
        '<span class="pantry-d ' + cls + '">' + lbl + '</span>' +
        '<button class="item-del" data-action="pantry-eat" data-v="' + x.id + '" type="button" aria-label="' + esc(x.name) + ' 다 먹었어요">다 먹음</button>' +
        X.armBtn('pantry-del', x.id, '삭제', '확인') + '</div>';
    }).join('');
    var soon = items.filter(function (x) {
      var left = Math.floor((new Date(x.exp + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86400000);
      return left <= 3;
    });
    var recipeHTML = '';
    if (soon.length) {
      var found = [];
      soon.forEach(function (x) {
        Object.keys(RECIPE_MAP).forEach(function (k) {
          if (x.name.indexOf(k) !== -1 || k.indexOf(x.name) !== -1) {
            RECIPE_MAP[k].forEach(function (r) { if (found.length < 6 && found.indexOf(r) === -1) found.push(r); });
          }
        });
      });
      if (found.length) recipeHTML = '<div class="recipe-box"><span class="field-hint">⏰ 임박 재료로 해먹기 좋은 것:</span><div class="chip-row" style="margin-top:6px">' +
        found.map(function (r) { return '<span class="chip chip-sm">' + esc(r) + '</span>'; }).join('') + '</div></div>';
    }
    return '<div class="card" style="margin-top:16px"><h4 class="card-title">유통기한 관리</h4>' +
      '<p class="field-hint" style="margin-bottom:10px">냉장고·팬트리에 둔 것의 기한을 적어두면 임박 순으로 보여줘요.</p>' +
      (rows || '<p class="field-hint">등록된 식품이 없어요.</p>') + recipeHTML +
      '<div class="custom-rule" style="margin-top:10px"><input id="pantry-name" class="input" maxlength="30" placeholder="예: 두부, 요거트" autocomplete="off">' +
      '<input id="pantry-exp" class="input" type="date" value="' + today + '" aria-label="유통기한"></div>' +
      '<div class="chip-row" style="margin-top:8px" role="group" aria-label="보관 위치">' +
      PANTRY_LOCS.map(function (l) { return '<button class="chip' + ((S.pantryLoc || '냉장') === l ? ' selected' : '') + '" data-action="pantry-loc" data-v="' + l + '" type="button" aria-pressed="' + ((S.pantryLoc || '냉장') === l) + '">' + l + '</button>'; }).join('') +
      '<button class="btn btn-secondary btn-md" data-action="pantry-add" type="button" style="margin-left:auto">추가</button></div></div>';
  }

  /* ---- 업적 배지 ---- */
  function earnedBadges() {
    var S = X.S;
    var ids = [];
    if (S.checkins.length >= 1) ids.push('first-checkin');
    var wkSet = {}; S.checkins.forEach(function (c) { wkSet[c.week] = true; });
    if (ML.streakWeeks(wkSet) >= 4) ids.push('streak-4');
    if (S.expenses.length >= 10 || S.settled.length >= 1) ids.push('exp-10');
    var choreN = 0;
    Object.keys(S.choreLog).forEach(function (k) { choreN += Object.keys(S.choreLog[k]).length; });
    if (choreN >= 10) ids.push('chore-10');
    if (S.missions.list.length && S.missions.list.every(function (m) { return m.done; })) ids.push('mission-all');
    if (S.coupons.some(function (c) { return c.usedTs; })) ids.push('coupon-first');
    var daysSince = 0;
    S.anniv.forEach(function (a) { var d = Math.floor((Date.now() - new Date(a.date + 'T12:00:00').getTime()) / 86400000); if (d > daysSince) daysSince = d; });
    if (daysSince >= 100) ids.push('anniv-100');
    if (daysSince >= 365) ids.push('anniv-365');
    if (S.agreement && S.agreement.ts) ids.push('agree-first');
    if (S.settled.length >= 5) ids.push('settle-5');
    return ids;
  }
  function badgesHTML() {
    var S = X.S;
    var got = S.badges;
    var cards = BADGE_DEFS.map(function (d) {
      var has = got.indexOf(d.id) !== -1;
      return '<div class="badge-cell' + (has ? ' on' : '') + '" title="' + esc(d.desc) + '"><span>' + d.icon + '</span><small>' + esc(d.name) + '</small></div>';
    }).join('');
    return '<div class="mobile-section-head"><h2>배지</h2><span>' + got.length + ' / ' + BADGE_DEFS.length + '</span></div>' +
      '<div class="badge-grid">' + cards + '</div>';
  }

  /* ---- 연간 회고 ---- */
  function yearReviewHTML() {
    var S = X.S;
    var y = new Date().getFullYear();
    var yFrom = new Date(y, 0, 1).getTime();
    var yExp = S.expenses.filter(function (x) { return x.ts >= yFrom && !x.income; });
    var yTotal = yExp.reduce(function (a, x) { return a + x.amount; }, 0);
    var yCi = S.checkins.filter(function (c) { return c.ts >= yFrom; }).length;
    var yChore = 0;
    Object.keys(S.choreLog).forEach(function (k) {
      Object.keys(S.choreLog[k]).forEach(function (id) { var v = S.choreLog[k][id]; if (v && v.ts >= yFrom) yChore++; });
    });
    var catSum = {};
    yExp.forEach(function (x) { var c = x.cat || '기타'; catSum[c] = (catSum[c] || 0) + x.amount; });
    var topCat = Object.keys(catSum).sort(function (a, b) { return catSum[b] - catSum[a]; })[0];
    if (!yExp.length && !yCi && !yChore) return '';
    return '<div class="mobile-section-head"><h2>' + y + '년 회고</h2><span>올해의 우리</span></div>' +
      '<div class="card year-card"><div class="report-line">' +
      '<div class="rl">💸 함께 쓴 돈 ' + esc(ML.fmtWon(yTotal)) + '</div>' +
      '<div class="rl">💌 체크인 ' + yCi + '회</div>' +
      '<div class="rl">🧹 집안일 ' + yChore + '회 완료</div>' +
      (topCat ? '<div class="rl">' + esc(CAT_EMOJI[topCat] || '📦') + ' 가장 많이 쓴 곳: ' + esc(topCat) + '</div>' : '') +
      (S.badges.length ? '<div class="rl">🏅 배지 ' + S.badges.length + '개 획득</div>' : '') +
      '</div><button class="btn btn-secondary btn-md" data-action="year-copy" type="button" style="margin-top:10px">회고 복사하기</button></div>';
  }

  /* ---- 사진 앨범 목록 ---- */
  function albumHTML() {
    var S = X.S;
    var ids = [];
    S.expenses.forEach(function (x) { if (x.rcpt) ids.push({ id: x.id, label: x.memo || '영수증', ts: x.ts }); });
    Object.keys(S.choreLog).forEach(function (wk) {
      var log = S.choreLog[wk] || {};
      Object.keys(log).forEach(function (cid) {
        if (log[cid] && log[cid].img) ids.push({ id: 'proof:' + wk + ':' + cid, label: '인증샷 ' + wk, ts: log[cid].ts });
      });
    });
    if (!ids.length) return '';
    ids.sort(function (a, b) { return b.ts - a.ts; });
    return '<div class="mobile-section-head"><h2>사진 모아보기</h2><span>영수증·인증샷 ' + ids.length + '장</span></div>' +
      '<div class="card"><button class="btn btn-secondary btn-md" data-action="album-open" type="button">앨범 열기 (' + ids.length + ')</button></div>';
  }

  /* ---- 애정 언어 미니퀴즈 ---- */
  function lovelangHTML() {
    var S = X.S;
    var card = '<div class="mobile-section-head"><h2>애정 언어</h2><span>어떻게 사랑을 느끼는지</span></div>';
    if (S.loveLang && !S.llQuiz) {
      var rec = (LOVE_LANG_COUPON[S.loveLang.type] || []);
      return card + '<div class="card"><div class="ll-result"><span class="ll-emoji">💝</span><div><strong>' + esc(LOVE_LANGS[S.loveLang.type]) + '</strong><p class="field-hint">메이트의 애정 언어를 알아두면 표현이 쉬워져요</p></div></div>' +
        (rec.length ? '<div class="chip-row" style="margin-top:10px">' + rec.map(function (r) { return '<button class="chip chip-sm" data-action="coupon-issue" data-v="' + esc(r) + '" type="button">🎟 ' + esc(r) + '</button>'; }).join('') + '</div>' : '') +
        '<button class="btn btn-tertiary btn-sm" data-action="ll-retake" type="button" style="margin-top:10px">다시 진단하기</button></div>';
    }
    var step = S.llStep || 0;
    if (step >= LOVE_LANG_Q.length) return '';
    var q = LOVE_LANG_Q[step];
    return card + '<div class="card"><p class="field-hint">Q' + (step + 1) + ' / ' + LOVE_LANG_Q.length + '</p>' +
      '<h4 class="card-title" style="margin:6px 0 12px">' + esc(q.q) + '</h4>' +
      '<div class="ll-choice"><button class="ll-opt" data-action="ll-ans" data-v="a" type="button">' + esc(q.a[0]) + '</button>' +
      '<button class="ll-opt" data-action="ll-ans" data-v="b" type="button">' + esc(q.b[0]) + '</button></div></div>';
  }

  /* ---- 휴지통 ---- */
  function trashCardHTML() {
    var S = X.S;
    if (!S.trash.length) return '';
    return '<div class="sec-head" style="margin-top:20px"><h3>휴지통</h3><span class="sec-sub">삭제 후 7일간 보관돼요</span></div>' +
      '<div class="card">' + S.trash.slice().reverse().slice(0, 10).map(function (t) {
        return '<div class="trash-row"><span class="trash-label">' + esc(t.label) + '</span><span class="trash-time">' + ML.dateLabel(t.ts) + '</span>' +
          '<button class="chip chip-sm" data-action="trash-restore" data-v="' + t.id + '" type="button">복원</button>' + X.armBtn('trash-del', t.id, '삭제', '확인') + '</div>';
      }).join('') +
      '<div class="cta-row" style="margin-top:10px"><button class="btn-tertiary btn-sm btn" data-action="trash-empty" type="button">' + (S.delArm2 === 'trash-empty' ? '한 번 더 누르면 전부 영구 삭제' : '휴지통 비우기') + '</button></div></div>';
  }

  /* ---- 자동 스냅샷 ---- */
  function snapCardHTML() {
    var S = X.S;
    if (!S.snapshots.length) return '';
    return '<div class="sec-head" style="margin-top:20px"><h3>자동 스냅샷</h3><span class="sec-sub">주 1회 자동 저장, 최근 4개</span></div>' +
      '<div class="card">' + S.snapshots.map(function (s2) {
        var n = Object.keys(s2.data || {}).length;
        return '<div class="trash-row"><span class="trash-label">' + ML.dateLabel(s2.ts) + ' 스냅샷</span><span class="trash-time">' + n + '개 항목</span>' + X.armBtn('snap-restore', String(s2.ts), '복원', '확인') + '</div>';
      }).join('') +
      '<p class="caption text-muted" style="margin-top:8px">복원하면 현재 데이터가 그 시점으로 되돌아가요.</p></div>';
  }

  return {
    bind: bind,
    monthReportHTML: monthReportHTML, couponHTML: couponHTML, rouletteHTML: rouletteHTML,
    careHTML: careHTML, memosHTML: memosHTML, goalHTML: goalHTML, debtsHTML: debtsHTML,
    pantryHTML: pantryHTML, earnedBadges: earnedBadges, badgesHTML: badgesHTML,
    yearReviewHTML: yearReviewHTML, albumHTML: albumHTML, lovelangHTML: lovelangHTML,
    trashCardHTML: trashCardHTML, snapCardHTML: snapCardHTML
  };
})();
