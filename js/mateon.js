/* ============================================================
   MATE:ON — 동거 성향 진단 서비스
   설문 → 16캐릭터 채점 → 개인 결과 → 상대 초대 → 궁합 리포트
   → 갈등 예측 → 맞춤 규칙 → 우리집 합의서
   ============================================================ */
(function () {
  'use strict';

  var app = document.getElementById('app');
  var toastEl = document.getElementById('toast');
  var toastTimer = null;

  /* js/lifetools.js 의 순수 유틸 — 본 파일에 남은 호출부는 그대로 둔다 */
  var ML = window.MateLife || {};
  var p2 = ML.p2, dateStr = ML.dateStr, fmtWon = ML.fmtWon,
    mondayOf = ML.mondayOf, isoWeekKey = ML.isoWeekKey, weekRangeLabel = ML.weekRangeLabel,
    expenseShare = ML.expenseShare, parseReceiptText = ML.parseReceiptText;

  /* ================= Utils ================= */
  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function copyText(text, msg) {
    if (window.MateNative) {
      window.MateNative.copy(text).then(function () { showToast(msg); }).catch(function () { showToast('복사하지 못했어요. 다시 시도해 주세요'); });
      return;
    }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); showToast(msg); }
      catch (e) { showToast(text); }
      ta.remove();
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { showToast(msg); }).catch(fallback);
    } else fallback();
  }

  function load(key) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
    catch (e) { return null; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
  }
  function remove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  function mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
  }

  var _dateFmt = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' });
  function fmtDate(ts) {
    return _dateFmt.format(new Date(ts));
  }

  function charById(id) {
    return CHARACTERS.find(function (c) { return c.id === id; });
  }
  function charByCode(code) {
    return CHARACTERS.find(function (c) { return c.code === code; });
  }

  /* ================= Theme ================= */
  var root = document.documentElement;
  function setTheme(t) {
    root.dataset.theme = t;
    try { localStorage.setItem('ds-theme', t); } catch (e) { /* ignore */ }
  }
  (function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem('ds-theme'); } catch (e) { /* ignore */ }
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(saved || (prefersDark ? 'dark' : 'light'));
  })();

  function applyFontSize() {
    root.dataset.font = (S && S.fontSize === 'large') ? 'large' : '';
  }
  applyFontSize();

  function syncNativeReminders() {
    if (window.MateNative && window.MateNative.syncReminders) {
      window.MateNative.syncReminders(S.reminders).catch(function () { });
    }
  }

  /* ================= Scoring =================
     4-bit 직교 대비 코드: E1=(0,1) E2=(0,0) E3=(1,0) E4=(1,1), R도 동일.
     선택지 코드와 캐릭터 코드의 해밍 거리 d → 가중치 = 2 - d  */
  var BITMAP = {
    '1': [0, 1], '2': [0, 0], '3': [1, 0], '4': [1, 1]
  };

  function codeBits(code) {           // 'E3R2' → [1,0,0,0]
    return BITMAP[code[1]].concat(BITMAP[code[3]]);
  }

  function hamming(a, b) {
    var d = 0;
    for (var i = 0; i < 4; i++) if (a[i] !== b[i]) d++;
    return d;
  }

  function scoreAnswers(answers) {    // answers: [{qid, code}]
    var scored = CHARACTERS.map(function (c) {
      return { c: c, s: 0, plus2: 0 };
    });

    answers.forEach(function (a) {
      var ab = codeBits(a.code);
      scored.forEach(function (sc) {
        var w = 2 - hamming(ab, codeBits(sc.c.code));
        sc.s += w;
        if (w === 2) sc.plus2++;
      });
    });

    scored.sort(function (x, y) {
      if (y.s !== x.s) return y.s - x.s;
      return y.plus2 - x.plus2;       // 동점 시 +2 직접 대응이 많은 쪽 우선
    });

    var eAvg = mean(answers.map(function (a) { return +a.code[1]; }));
    var rAvg = mean(answers.map(function (a) { return +a.code[3]; }));

    var domains = {};
    DOMAINS.forEach(function (d) {
      var list = answers.filter(function (a) {
        var q = QUESTIONS.find(function (qq) { return qq.id === a.qid; });
        return q && q.domain === d.id;
      });
      domains[d.id] = {
        e: mean(list.map(function (a) { return +a.code[1]; })),
        r: mean(list.map(function (a) { return +a.code[3]; }))
      };
    });

    var margin = scored[0].s - scored[1].s;
    var conf = margin >= 6 ? '높은 편' : (margin >= 3 ? '보통' : '경계형');

    return {
      scores: scored, charId: scored[0].c.id, char2Id: scored[1].c.id,
      eAvg: eAvg, rAvg: rAvg, domains: domains, conf: conf, margin: margin
    };
  }

  /* ================= State ================= */
  var S = {
    me: load('mateon.me'),
    partner: load('mateon.partner'),
    agreement: load('mateon.agreement'),
    history: load('mateon.history') || [],
    checklist: load('mateon.checklist') || {},
    invite: null,
    pendingPartner: null,
    connectionInput: '',
    flow: 'me',
    q: 0,
    answers: [],
    profile: { name: '', relation: '', stage: '' },
    checkedRules: [],
    rulesReady: false,
    customRules: load('mateon.customRules') || [],
    signs: { me: false, partner: false },
    lifeQ: 0,
    lifeAnswers: [],
    typeId: null,
    viewPair: null,
    qDir: 'next',
    shareName: load('mateon.shareName') !== false,
    resetArm: false,
    delArm: null,
    /* 생활 도구 데이터 */
    expenses: load('mateon.expenses') || [],
    settled: load('mateon.settled') || [],
    chores: load('mateon.chores'),
    choreLog: load('mateon.choreLog') || {},
    events: load('mateon.events') || [],
    checkins: load('mateon.checkins') || [],
    customChecklist: load('mateon.customChecklist') || [],
    conflictLog: load('mateon.conflictLog') || [],
    shopping: load('mateon.shopping') || [],
    lovemap: load('mateon.lovemap') || { idx: 0, known: 0, asked: 0 },
    reminders: (function (r) { return { checkin: !r || r.checkin !== false, agreement: !r || r.agreement !== false }; })(load('mateon.reminders')),
    inviteDays: load('mateon.inviteDays') || 7,
    fontSize: load('mateon.fontSize') === 'large' ? 'large' : 'normal',
    seen: load('mateon.seen') === true,
    syncCfg: load('mateon.sync'),
    inviteExpired: false,
    pendingUpdate: null,
    cgStep: 0, cgDomain: 'D',
    delArm2: null,
    expCat: '생활비', expPayer: 'me', evWho: 'both',
    splitMode: 'equal', splitShare: '5:5', shopCat: '식료품',
    lastRoute: '',
  };

  /* ---- 설문 진행 자동 저장 (새로고침 복구) ---- */
  function saveDraft() {
    save('mateon.draft.' + S.flow, { q: S.q, answers: S.answers, profile: S.profile, invite: S.invite ? encodeResult(S.invite) : null });
    save('mateon.activeDraft', S.flow);
  }
  function clearDraft() {
    remove('mateon.draft.' + S.flow);
    if (load('mateon.activeDraft') === S.flow) remove('mateon.activeDraft');
  }
  function isValidDraft(d) {
    return !!(d && Array.isArray(d.answers) && d.answers.length > 0 && d.answers.length <= QUESTIONS.length &&
      Number.isInteger(d.q) && d.q >= 0 && d.q < QUESTIONS.length &&
      d.profile && typeof d.profile.name === 'string' &&
      d.answers.every(function(a) { var q = a && QUESTIONS.find(function(q) { return q.id === a.qid; }); return q && q.options.some(function(o) { return o.code === a.code; }); }));
  }

  function restoreDraft(flowKey) {
    if (flowKey !== 'me' && flowKey !== 'partner') return false;
    var d = load('mateon.draft.' + flowKey);
    if (!isValidDraft(d)) return false;
    if (S.invite && d.invite !== encodeResult(S.invite)) return false;
    var invite = d.invite ? decodeResult(d.invite) : null;
    if (d.invite && !invite) return false;
    if (flowKey === 'partner' && !invite && !S.me) return false;
    S.flow = flowKey;
    S.q = d.q;
    S.answers = d.answers;
    S.profile = { name: d.profile.name.slice(0,12), relation: typeof d.profile.relation === 'string' ? d.profile.relation : '', stage: typeof d.profile.stage === 'string' ? d.profile.stage : '' };
    S.invite = invite;
    return true;
  }

  /* ---- 초대 링크 인코딩/디코딩 (v3 만료·난독화, v2 압축 배열, v1 객체 하위호환) ---- */
  function resultToArr(r) {
    return [
      r.name, r.relation || '', r.stage || '',
      +r.eAvg.toFixed(2), +r.rAvg.toFixed(2),
      r.charId, r.char2Id, r.conf || '',
      DOMAINS.map(function (d) {
        var dd = r.domains[d.id];
        return [+dd.e.toFixed(2), +dd.r.toFixed(2)];
      }),
      r.life ? r.life.map(function (x) { return x.level; }) : null,
    ];
  }
  function b64urlEncode(s) {
    return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(s) {
    return decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
  }
  function encodeResult(r) {
    return b64urlEncode(JSON.stringify(resultToArr(r)));
  }

  /* v3: XOR 스트림 난독화 + 만료 시각. URL 안에 결과가 그대로 읽히지 않게 하고,
     일정 시간이 지나면 링크가 더 이상 열리지 않게 한다. (난독화이지 암호화는 아님) */
  function xorStream(seed) {
    return function () { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 16) & 0xff; };
  }
  var INVITE_XOR_SEED = 0x9E3779B9;
  function encodeInvite(r, days) {
    var payload = JSON.stringify({ v: 3, d: resultToArr(r), e: Date.now() + (days || 7) * 86400000, n: Math.floor(Math.random() * 1e9).toString(36) });
    var bytes = new TextEncoder().encode(payload);
    var next = xorStream(INVITE_XOR_SEED);
    for (var i = 0; i < bytes.length; i++) bytes[i] ^= next();
    var s = '';
    for (i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return 'z' + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  /* 반환: {result, expired, exp, legacy} | null */
  function decodeInvite(token) {
    if (typeof token !== 'string' || !token.length) return null;
    if (token[0] === 'z') {
      try {
        var bin = atob(token.slice(1).replace(/-/g, '+').replace(/_/g, '/'));
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        var next = xorStream(INVITE_XOR_SEED);
        for (i = 0; i < bytes.length; i++) bytes[i] ^= next();
        var obj = JSON.parse(new TextDecoder().decode(bytes));
        if (!obj || obj.v !== 3 || !Array.isArray(obj.d)) return null;
        var res = decodeResult(b64urlEncode(JSON.stringify(obj.d)));
        if (!res) return null;
        return { result: res, expired: !!(obj.e && Date.now() > obj.e), exp: obj.e || 0 };
      } catch (e) { return null; }
    }
    var legacy = decodeResult(token);
    return legacy ? { result: legacy, expired: false, legacy: true } : null;
  }

  function decodeResult(str) {
    try {
      var b64 = str.replace(/-/g, '+').replace(/_/g, '/');
      var obj = JSON.parse(decodeURIComponent(escape(atob(b64))));
      var out = { domains: {}, ts: Date.now() };
      if (Array.isArray(obj)) {
        // v2: [n, rel, st, e, r, c1, c2, cf, [[e,r]x5], life?]
        out.name = obj[0] || '상대'; out.relation = obj[1] || ''; out.stage = obj[2] || '';
        out.eAvg = obj[3]; out.rAvg = obj[4];
        out.charId = obj[5]; out.char2Id = obj[6]; out.conf = obj[7] || '';
        (obj[8] || []).forEach(function (v, i) {
          out.domains[DOMAINS[i].id] = { e: v[0], r: v[1] };
        });
        if (obj[9]) {
          out.life = obj[9].map(function (lv, i) {
            return { qid: LIFE_QUESTIONS[i].id, area: LIFE_QUESTIONS[i].area, level: lv, label: LIFE_QUESTIONS[i].options[lv - 1].label };
          });
        }
      } else {
        // v1 객체 포맷
        out.name = obj.n || '상대'; out.relation = obj.rel || ''; out.stage = obj.st || '';
        out.eAvg = obj.e; out.rAvg = obj.r;
        out.charId = obj.c1; out.char2Id = obj.c2; out.conf = obj.cf || '';
        DOMAINS.forEach(function (d) {
          var v = obj.d && obj.d[d.id] ? obj.d[d.id] : [2.5, 2.5];
          out.domains[d.id] = { e: v[0], r: v[1] };
        });
      }
      DOMAINS.forEach(function (d) {
        if (!out.domains[d.id]) out.domains[d.id] = { e: 2.5, r: 2.5 };
      });
      if (!charById(out.charId) || !charById(out.char2Id)) return null;
      if (typeof out.name !== 'string' || out.name.length > 100) return null;
      var values = [out.eAvg, out.rAvg];
      DOMAINS.forEach(function(d) { values.push(out.domains[d.id].e, out.domains[d.id].r); });
      return values.every(function(v) { return typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 4; }) ? out : null;
    } catch (e) { return null; }
  }

  (function parseInvite() {
    var m = location.search.match(/[?&]invite=([A-Za-z0-9_-]+)/);
    if (m) {
      var dec = decodeInvite(m[1]);
      if (dec && dec.result && !dec.expired) S.invite = dec.result;
      else if (dec && dec.expired) S.inviteExpired = true;
    }
    var p = location.search.match(/[?&]pair=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)/);
    if (p) {
      var a = decodeResult(p[1]), b = decodeResult(p[2]);
      if (a && b) S.viewPair = { me: a, partner: b };
    }
  })();

  restoreDraft(S.invite ? 'partner' : (load('mateon.activeDraft') || 'me'));

  /* ---- 공개 배포 링크 ----
     네이티브에서도 HTTPS 링크를 공유한다. 앱 링크가 연결되면 앱이 열리고,
     미설치 사용자는 웹 초대/리포트 화면으로 자연스럽게 이어진다. */
  var DEFAULT_CONFIG = {
    appId: 'io.github.gyeongbin38.mateon',
    version: '0.3.0',
    webBaseUrl: 'https://gyeongbin-38.github.io/mateon/',
    customScheme: 'mateon',
    privacyPolicyUrl: 'https://gyeongbin-38.github.io/mateon/#/privacy'
  };

  function appConfig() {
    var cfg = window.MATEON_CONFIG || {};
    return {
      appId: cfg.appId || DEFAULT_CONFIG.appId,
      version: cfg.version || DEFAULT_CONFIG.version,
      webBaseUrl: cfg.webBaseUrl || DEFAULT_CONFIG.webBaseUrl,
      customScheme: cfg.customScheme || DEFAULT_CONFIG.customScheme,
      privacyPolicyUrl: cfg.privacyPolicyUrl || DEFAULT_CONFIG.privacyPolicyUrl
    };
  }

  function webBaseURL() {
    var base = appConfig().webBaseUrl;
    return base.slice(-1) === '/' ? base : base + '/';
  }

  function localBaseURL() {
    return location.href.split('?')[0].split('#')[0];
  }

  function publicBaseURL() {
    return window.MateNative ? webBaseURL() : localBaseURL();
  }

  function pairURL() {
    return publicBaseURL() + '?pair=' + encodeResult(S.me) + '.' + encodeResult(S.partner) + '#/report';
  }

  /* ================= Logo SVG ================= */
  function logoSVG(size) {
    return '<img class="logo-mark" width="' + (size || 40) + '" height="' + (size || 40) + '" src="assets/logo-symbol.svg" alt="">';
  }

  function headerHTML() {
    var r = currentRoute();
    var detail = ['home', 'space', 'types', 'settings'].indexOf(r) < 0;
    return '' +
      '<header class="app-header"><div class="app-header-inner">' +
      (detail ? '<button class="icon-button app-back" data-action="back" type="button" aria-label="이전 화면">' + mobileIcon('back') + '</button><span class="app-screen-title">' + esc((ROUTE_TITLES[r] || 'MATE:ON').split(' — ')[0]) + '</span>' : '<button class="logo" data-action="home" type="button" aria-label="MATE:ON 홈">' +
      logoSVG(40) +
      '<span class="wordmark" translate="no">MATE<span class="wm-on">:ON</span></span>' +
      '</button>') +
      '<button class="btn btn-tertiary btn-sm" data-action="theme" type="button" aria-label="테마 전환">' +
      '<svg aria-hidden="true" class="icon-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>' +
      '<svg aria-hidden="true" class="icon-moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' +
      '</button>' +
      '</div></header>';
  }

  function footerHTML() {
    return '<footer class="app-footer"><p class="caption">서로의 다름이, 더 좋은 일상이 되는 곳. MATE:ON</p></footer>';
  }

  /* ---- 하단 네비게이션 ---- */
  var NAV_ICONS = {
    home: '<svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/></svg>',
    types: '<svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    checklist: '<svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    settings: '<svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  };

  function navActive(nav) {
    var r = currentRoute();
    if (nav === 'home') return ['home', 'onboarding', 'survey', 'result', 'invite', 'report', 'lifecheck'].indexOf(r) >= 0;
    if (nav === 'types') return r === 'types' || r === 'type-detail';
    if (nav === 'space') return ['space','checklist','agreement','settle','shopping','lovemap','chores','calendar','checkin','conflict'].indexOf(r) >= 0;
    if (nav === 'settings') return r === 'settings' || r === 'privacy' || r === 'terms';
    return false;
  }

  function bottomNavHTML() {
    var items = [
      ['home', '홈'],
      ['space', '우리 공간'],
      ['types', '유형 찾기'],
      ['settings', '마이'],
    ];
    return '<nav class="bottom-nav" aria-label="하단 메뉴">' +
      items.map(function (it) {
        var on = navActive(it[0]);
        return '<button class="nav-item' + (on ? ' on' : '') + '" data-action="' + it[0] + '" type="button"' + (on ? ' aria-current="page"' : '') + '>' +
          (it[0] === 'space' ? mobileIcon('heart') : it[0] === 'settings' ? mobileIcon('user') : NAV_ICONS[it[0]]) + '<span>' + it[1] + '</span></button>';
      }).join('') + '</nav>';
  }

  function shell(content) {
    if (homeCarouselObserver) { homeCarouselObserver.disconnect(); homeCarouselObserver = null; }
    var offline = (typeof navigator !== 'undefined' && navigator.onLine === false);
    app.innerHTML = '<div class="app-shell' + (currentRoute() === 'home' ? ' is-home' : '') + '">' + headerHTML() +
      (offline ? '<div class="offline-bar" role="status">오프라인이에요. 기록은 이 기기에 안전하게 저장돼요.</div>' : '') +
      '<main class="app-main" id="main">' + content + '</main>' + bottomNavHTML() +
      tutorialHTML() + '</div>';
    window.scrollTo(0, 0);
  }

  /* ================= 공용 UI 조각 ================= */
  function dots(level) {              // level 1~4 → ●●●○
    var s = '';
    for (var i = 1; i <= 4; i++) s += i <= Math.round(level) ? '●' : '○';
    return s;
  }

  function pct(avg) {                 // 1~4 → 0~100%
    return Math.round(((avg - 1) / 3) * 100);
  }

  function eLevel(avg) { return 'E' + Math.max(1, Math.min(4, Math.round(avg))); }
  function rLevel(avg) { return 'R' + Math.max(1, Math.min(4, Math.round(avg))); }

  function gaugeHTML(label, avg, blue) {
    var lv = blue ? rLevel(avg) : eLevel(avg);
    var meta = blue ? R_LEVELS[lv] : E_LEVELS[lv];
    return '' +
      '<div class="gauge-row">' +
      '<div class="gauge-head"><span class="gauge-label">' + label + '</span>' +
      '<span class="gauge-val">' + lv + ' ' + meta.label + ' · ' + pct(avg) + '%</span></div>' +
      '<div class="gauge-track"><div class="gauge-fill' + (blue ? ' gauge-blue' : '') + '" style="width:' + pct(avg) + '%"></div></div>' +
      '<div class="gauge-caption"><span>' + (blue ? '낮음' : '독립적') + '</span><span>' + meta.desc + '</span><span>' + (blue ? '높음' : '주도적') + '</span></div>' +
      '</div>';
  }

  function matrixHTML(mineId, partnerId, nameA, nameB) {
    var cells = '';
    CHARACTERS.forEach(function (c) {
      var cls = 'matrix-cell';
      var label = c.code;
      if (c.id === mineId && c.id === partnerId) { cls += ' same'; label = c.name; }
      else if (c.id === mineId) { cls += ' mine'; label = c.name; }
      else if (c.id === partnerId) { cls += ' partner'; label = c.name; }
      cells += '<span class="' + cls + '" title="' + esc(c.code + ' ' + c.name) + '">' + esc(label) + '</span>';
    });
    var aria = '4×4 성향 지도. 가로축 교류 활성도 E1에서 E4, 세로축 자극 민감도 R1에서 R4.';
    if (mineId) {
      var a = charById(mineId);
      aria += ' ' + (nameA || '나') + '의 위치: ' + a.name + ' ' + a.code + '.';
    }
    if (partnerId) {
      var b = charById(partnerId);
      aria += ' ' + (nameB || '상대') + '의 위치: ' + b.name + ' ' + b.code + '.';
    }
    return '<div class="matrix" role="img" aria-label="' + esc(aria) + '">' + cells + '</div>' +
      '<div class="matrix-axis"><span>← 교류 적음 (E1)</span><span>민감도 낮음 R1 ↑ · ↓ R4 민감도 높음</span><span>교류 많음 (E4) →</span></div>';
  }

  /* ================= View: 홈 ================= */
  var HOME_TALKS = [
    ['생활 리듬', '혼자만의 시간이 필요할 때, 어떻게 알려주면 좋을까요?', '혼자 있는 시간이 길어질 때 서로가 서운해하지 않으려면 어떤 게 필요할까요?'],
    ['공간과 청결', '우리 집의 깨끗함은 어느 정도면 충분할까요?', '서로의 "치웠다" 기준이 다르다면 어디에 맞추는 게 좋을까요?'],
    ['생활비', '함께 쓰는 물건의 비용은 어떻게 나누면 편할까요?', '수입 차이가 있을 때 비용 분담은 어떤 기준이 공평할까요?'],
    ['개인 경계', '서로 물건을 빌릴 때 미리 물어볼 범위는 어디까지일까요?', '반대로, 물어보지 않아도 되는 물건의 기준은 뭘까요?'],
    ['갈등 대화', '서운한 일이 생겼을 때 바로 말하는 편이 좋을까요, 조금 정리하고 말하는 편이 좋을까요?', '상대가 나랑 다른 방식을 선택했을 때, 어떻게 맞춰갈 수 있을까요?'],
    ['손님과 일정', '집에 손님을 부를 때 얼마나 미리 알려주면 편할까요?', '손님이 오는 날 공용 공간 정리는 누가 어디까지 할까요?'],
    ['수면과 소음', '밤에 꼭 지켜지면 좋은 조용한 시간은 언제부터일까요?', '수면 시간이 다른 두 사람이 서로 배려하는 방법은 뭐가 있을까요?'],
    ['회복 시간', '의견이 부딪힌 뒤에는 바로 대화할까요, 잠시 정리할까요?', '정리 시간이 끝난 뒤 먼저 말을 건네는 게 어색할 때 어떻게 시작할까요?'],
    ['일상 공유', '하루 중 있었던 일을 서로 얼마나 나누는 게 좋을까요?', '바빠서 대화가 뜸했던 주에는 어떻게 다시 연결될까요?'],
    ['식사 습관', '같이 먹는 식사는 어느 정도면 서로 부담이 없을까요?', '식사 시간이 안 맞을 때 음식 준비·설거지는 어떻게 나눌까요?'],
    ['집의 의미', '집이 서로에게 어떤 장소이길 바라나요?', '그 "장소"를 만들기 위해 이번 달에 하나씩 바꿔본다면 뭘까요?'],
    ['애정 표현', '평소에 고마움을 어떻게 표현하는 게 서로 편할까요?', '표현 방식이 다를 때, 서로가 주고받은 게 같다고 느끼려면 뭐가 필요할까요?'],
    ['휴일 계획', '주말·휴일은 각자 쓰는 게 좋을까요, 같이 계획하는 게 좋을까요?', '함께 쓰는 날과 각자 쓰는 날, 대략 어떤 비율이 편할까요?'],
    ['스트레스 신호', '내가 힘들 때 나오는 신호를 메이트가 알아채려면 뭘 알려줘야 할까요?', '그 신호를 알아챘을 때 상대가 해주면 좋은 행동은 뭘까요?'],
    ['비상 상황', '몸이 아프거나 급한 일이 생겼을 때 서로 어떻게 돌봐주면 좋을까요?', '연락이 안 될 때의 대비 방법(비상연락처·위치 공유)은 어디까지 정해둘까요?'],
    ['집안일 공정', '집안일을 나눌 때 "공평"은 같은 양일까요, 같은 체감일까요?', '한쪽이 바쁜 시기가 되면 그동안 분담을 어떻게 조정할까요?'],
    ['미래 이야기', '1년 뒤 우리의 생활이 어떤 모습이면 좋겠어요?', '그 모습에 가까워지려면 지금 시작할 작은 습관 하나는 뭘까요?'],
    ['감사 찾기', '최근에 메이트가 해준 것 중 고마웠던 일 하나는?', '그 고마움을 말로 전한다면 지금 어떻게 말할 수 있을까요?'],
    ['혼자 있는 규칙', '메이트가 집을 비우는 날, 혼자 있는 시간을 어떻게 쓰면 좋을까요?', '혼자 있는 날에도 서로에게 알려주면 좋은 것과 안 알려도 되는 것의 기준은?'],
    ['집 소개', '집에 처음 온 사람에게 우리 집을 어떻게 소개하고 싶어요?', '그 소개가 사실이 되려면 우리가 지금 채우면 좋은 것 하나는 뭘까요?']
  ];
  var talkIndex = (function () {
    var now = new Date();
    var yearStart = new Date(now.getFullYear(), 0, 0);
    var day = Math.floor((now - yearStart) / 86400000);
    return day % HOME_TALKS.length;
  })();
  function mobileIcon(name) {
    var paths = {
      heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
      chat: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/><path d="M8 11h8M8 15h5"/>',
      user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
      arrow: '<path d="m9 5 7 7-7 7"/>',
      close: '<path d="m6 6 12 12M6 18 18 6"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/>',
      back: '<path d="m15 5-7 7 7 7"/>'
    };
    return '<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(paths[name] || paths.heart)+'</svg>';
  }
  function checklistStats() {
    var total=0, done=0;
    CHECKLIST.forEach(function(g) { g.items.forEach(function(t,i) {total++; if(S.checklist[g.cat+':'+i]) done++;}); });
    S.customChecklist.forEach(function(x) { total++; if(S.checklist['own:'+x.id]) done++; });
    return {total:total,done:done};
  }
  function savedAgreementForPair() {
    var ag = S.agreement;
    if (!ag || !S.me || !S.partner) return null;
    if (ag.me !== (S.me.name || '나') || ag.partner !== (S.partner.name || '상대')) return null;
    if (ag.meCharId && ag.meCharId !== S.me.charId) return null;
    if (ag.partnerCharId && ag.partnerCharId !== S.partner.charId) return null;
    return Array.isArray(ag.rules) && ag.rules.length ? ag : null;
  }
  function agreementRules() {
    var ag = savedAgreementForPair();
    if (S.rulesReady) return S.checkedRules;
    if (ag && Array.isArray(ag.rules) && ag.rules.length) return ag.rules;
    return BASE_RULES.map(function (r) { return r.text; });
  }
  function sameTextList(a, b) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every(function (v, i) { return v === b[i]; });
  }
  function draftBannerHTML() {
    var flow = load('mateon.activeDraft') || 'me';
    var draft = load('mateon.draft.' + flow);
    if (!draft || !Array.isArray(draft.answers) || !draft.answers.length || !draft.profile) return '';
    return '<button class="draft-banner" type="button" data-action="resume-survey"><span><strong>' + esc(draft.profile.name || (flow === 'partner' ? '메이트' : '나')) + '님의 진단 이어하기</strong><small>' + draft.answers.length + ' / 20 문항 완료 · 자동 저장됨</small></span>' + mobileIcon('arrow') + '</button>';
  }
  var homeCarouselObserver = null;
  function bindHomeCarousel(startId) {
    var track = document.getElementById('home-carousel');
    if (!track) return;
    var slides = Array.from(track.children);
    var width = track.clientWidth;
    var index = 0;
    var previous = document.getElementById('character-previous');
    var next = document.getElementById('character-next');
    var status = document.getElementById('character-position');
    var dots = track.parentElement ? Array.from(track.parentElement.querySelectorAll('.carousel-dot')) : [];
    function update() {
      if(track.clientWidth !== width) return;
      index = Math.max(0,Math.min(slides.length-1,Math.round(track.scrollLeft / track.clientWidth)));
      status.textContent = (index+1) + ' / ' + slides.length;
      previous.disabled = index === 0; next.disabled = index === slides.length-1;
      slides.forEach(function(slide,i) {
        var active = i === index;
        slide.setAttribute('aria-hidden',String(!active));
        if (active) slide.setAttribute('aria-current','true'); else slide.removeAttribute('aria-current');
        var button = slide.querySelector('button');
        if (button) button.tabIndex = active ? 0 : -1;
      });
      dots.forEach(function(dot,i) { dot.classList.toggle('on', i === index); });
    }
    function move(step) {
      var target = Math.max(0,Math.min(slides.length-1,index+step));
      track.scrollTo({left:target*track.clientWidth,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    }
    previous.addEventListener('click',function(){move(-1);});
    next.addEventListener('click',function(){move(1);});
    track.addEventListener('scroll',update,{passive:true});
    track.addEventListener('keydown',function(e){
      if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();move(e.key==='ArrowLeft'?-1:1);}
    });
    track.scrollLeft=index*track.clientWidth; update();
    if(window.ResizeObserver) {
      homeCarouselObserver = new ResizeObserver(function(){if(width===track.clientWidth)return;width=track.clientWidth;track.scrollLeft=index*width;update();});
      homeCarouselObserver.observe(track);
    }
  }
  function personalTalkHTML() {
    if (!S.me || !S.partner) return '';
    var rows = DOMAINS.map(function (d) {
      return { d: d, gap: domainGap(S.me.domains[d.id], S.partner.domains[d.id]) };
    }).filter(function (r) { return r.gap >= 1.5; }).sort(function (x, y) { return y.gap - x.gap; });
    if (!rows.length) return '';
    var dom = rows[0].d;
    var scenario = (CONFLICT_SCENARIOS[dom.id] || {}).prevention || '';
    return '<div class="personal-talk"><span class="pt-tag">우리에게 맞춘 주제</span><p>“' + esc('요즘 ' + dom.area + ' 얘기, 우리 한번 나눠볼까요?') + '”' +
      (scenario ? '<small>' + esc(scenario) + '</small>' : '') + '</div>';
  }
  function vHome() {
    var draft = S.answers.length > 0 && S.answers.length < QUESTIONS.length;
    var action = !S.me ? (draft ? 'resume-survey' : 'start') : (!S.partner ? 'invite' : 'report');
    var title = !S.me ? (draft ? '나를 알아가는 중이에요' : '나는 어떤 메이트일까?') : (!S.partner ? '이제, 서로를 알아볼 차례' : '우리의 다름을 알아봐요');
    var cta = !S.me ? (draft ? '이어서 진단하기' : '나의 동거 성향 알아보기') : (!S.partner ? '메이트 초대하기' : '우리 둘 리포트 보기');
    var savedAg = savedAgreementForPair();
    var count = (S.me?1:0)+(S.me&&S.partner?1:0)+(savedAg?1:0);
    var saved = load('mateon.talks') || {};
    var stats=checklistStats();
    var startId = S.me ? S.me.charId : 12;
    var carouselCharacters = [charById(startId)].concat(CHARACTERS.filter(function(c){return c.id!==startId;}));
    var steps = [['나 진단',!!S.me],['메이트 연결',!!(S.me&&S.partner)],['합의서 저장',!!savedAg]];
    var nextStep = 0;
    while (nextStep < steps.length && steps[nextStep][1]) nextStep++;
    var missionSteps = '<div class="mission-steps" aria-label="함께 준비하는 단계">' + steps.map(function(step,i) {
      var done = step[1], current = i === nextStep;
      return '<span class="mission-step' + (done?' done':current?' current':'') + '"' + (current?' aria-current="step"':'') + '><i aria-hidden="true">' + (done?'✓':(i+1)) + '</i>' + step[0] + '</span>';
    }).join('') + '</div>';
    var portraits = '<div class="character-carousel"><div class="character-track" id="home-carousel" role="region" aria-roledescription="캐러셀" aria-label="16가지 동거 캐릭터 · 좌우 방향키로 이동" tabindex="0">' + carouselCharacters.map(function(c,i) {
      var mine = S.me && c.id === S.me.charId;
      var partner = S.partner && c.id === S.partner.charId;
      return '<article class="character-slide" role="group" aria-roledescription="슬라이드" aria-label="' + (i+1) + ' / 16 · ' + esc(c.name) + '" aria-hidden="' + (i!==0) + '"' + (i===0?' aria-current="true"':'') + '><span class="carousel-label">' + c.code + ' · ' + (mine?'나의 캐릭터':partner?'메이트의 캐릭터':'캐릭터 미리보기') + '</span>' + characterArt(c,c.id!==startId,true) + '<h3>' + esc(c.name) + '</h3><p>' + esc(c.quote) + '</p><button class="carousel-detail" data-action="type" data-id="' + c.id + '" type="button" tabindex="' + (i===0?'0':'-1') + '">이 캐릭터 알아보기 ' + mobileIcon('arrow') + '</button></article>';
    }).join('') + '</div><div class="carousel-dots" aria-hidden="true">' + carouselCharacters.map(function(c,i) { return '<span class="carousel-dot' + (i===0?' on':'') + '"></span>'; }).join('') + '</div><div class="carousel-controls"><button id="character-previous" class="icon-button" type="button" aria-label="이전 캐릭터">' + mobileIcon('arrow') + '</button><span id="character-position" role="status" aria-live="polite"></span><button id="character-next" class="icon-button" type="button" aria-label="다음 캐릭터">' + mobileIcon('arrow') + '</button></div><p class="carousel-hint">옆으로 넘겨 다른 메이트도 만나보세요</p></div>';
    var connection = '<section class="connection-strip" aria-label="메이트 연결 상태"><div class="paired-avatars"><span>'+esc(S.me?S.me.name.slice(0,1):'나')+'</span><span>'+ (S.partner ? esc(S.partner.name.slice(0,1)) : mobileIcon('plus')) +'</span></div><div><strong>'+ (S.partner?esc(S.partner.name)+'님과 함께':S.me?'메이트를 초대해 보세요':'서로를 알아가는 첫걸음') +'</strong><p>'+ (S.partner?'두 사람의 생활방식을 함께 맞춰봐요':S.me?'결과 링크로 우리의 성향을 비교해요':'내 성향을 알아본 뒤, 메이트와 연결해요') +'</p></div><button class="icon-button" data-action="'+(S.me?'invite':'start')+'" aria-label="메이트 연결하기" type="button">'+mobileIcon('arrow')+'</button></section>';
    shell('<div class="mobile-home">'+
      '<section class="app-greeting"><p>'+ (S.me ? esc(S.me.name)+'님, 반가워요' : '함께 살 준비, 서로를 아는 것부터.') +'</p><h1>우리의 일상,<br> 조금 더 가까이<span class="coral-dot">.</span></h1></section>'+
      draftBannerHTML() +
      '<section class="today-mission"><div class="mission-top"><span class="mission-label">'+(!S.me?'나를 알아가는 시간':S.partner?'함께 맞춰가는 생활':'우리의 다음 단계')+'</span><span class="mission-count">'+(count<3?'0'+(count+1):'03')+' <span>/ 03</span></span></div><h2>'+title+'</h2><p>'+(!S.me?'16가지 캐릭터 속, 나의 생활방식을 발견해요.':(!S.partner?'나와 메이트의 생활방식을 맞춰봐요.':'잘 맞는 부분도, 대화가 필요한 부분도.'))+'</p>'+missionSteps+portraits+'<div class="mission-footer"><span>'+ (draft ? S.answers.length+' / 20 문항 완료 · 자동 저장됨' : S.me?'나를 알고, 서로를 이해하는 시간':'동거 성향 테스트 · 20문항 · 약 3분')+'</span><button class="mobile-primary home-primary" data-action="'+action+'" type="button">'+cta+mobileIcon('arrow')+'</button></div></section>'+
      '<div class="home-support">' + connection +
      '<div class="app-shortcuts"><button type="button" data-action="'+(S.me?'result':'start')+'"><span class="shortcut-icon pink">'+mobileIcon('user')+'</span>나의 성향</button><button type="button" data-action="'+(S.me&&S.partner?'report':'demo')+'"><span class="shortcut-icon blue">'+mobileIcon('heart')+'</span>궁합 리포트</button><button type="button" data-action="checklist"><span class="shortcut-icon mint">'+NAV_ICONS.checklist+'</span>입주 준비</button></div>'+
      (S.me && S.partner ? '<div class="app-shortcuts life"><button type="button" data-action="settle"><span class="shortcut-icon pink">'+mobileIcon('plus')+'</span>생활비</button><button type="button" data-action="chores"><span class="shortcut-icon blue">'+NAV_ICONS.checklist+'</span>역할 분담</button><button type="button" data-action="calendar"><span class="shortcut-icon mint">'+mobileIcon('plus')+'</span>우리 일정</button><button type="button" data-action="checkin"><span class="shortcut-icon pink">'+mobileIcon('heart')+'</span>주간 점검</button></div>' : '') +
      (S.inviteExpired ? '<div class="note-box warn" style="margin:14px 0"><span>받은 초대 링크가 만료됐어요. 메이트에게 새 링크를 요청해 주세요.</span></div>' : '') +
      (S.me && S.partner && !thisCheckin() ? '<button class="checkin-banner" type="button" data-action="checkin"><span>'+mobileIcon('heart')+'</span><span><strong>이번 주 우리 생활 어땠어요?</strong><small>일주일 한 번, 가볍게 점검해요</small></span>'+mobileIcon('arrow')+'</button>' : '') +
      '<section class="conversation-section"><div class="mobile-section-head"><h2>오늘의 대화</h2><span>주제 '+(talkIndex+1)+' / '+HOME_TALKS.length+'</span></div><div class="conversation-card"><div class="conversation-top"><span>'+HOME_TALKS[talkIndex][0]+'</span><button class="icon-button" data-action="next-talk" type="button" aria-label="다른 대화 주제">'+mobileIcon('refresh')+'</button></div><h3>'+HOME_TALKS[talkIndex][1]+'</h3><button type="button" class="conversation-open" data-action="talk-open">'+(saved[talkIndex]?'내 답변 다시 보기':'내 생각 남기기')+mobileIcon('arrow')+'</button></div>'+personalTalkHTML()+'</section>'+
      '<button class="preparation-row" type="button" data-action="space"><span class="preparation-icon">'+NAV_ICONS.home+'</span><span><strong>우리의 입주 준비</strong><small>'+stats.total+'개 중 '+stats.done+'개 완료했어요</small></span><span class="tiny-ring" style="--done:'+Math.round(stats.done/stats.total*100)+'%">'+Math.round(stats.done/stats.total*100)+'%</span>'+mobileIcon('arrow')+'</button>'+
      '</div></div>');
    bindHomeCarousel(startId);
  }
  function vSpace() {
    var stats=checklistStats(); var notes=load('mateon.talks') || {};
    var savedAg=savedAgreementForPair();
    var rulesAction=S.me&&S.partner?(savedAg?'agreement':'report'):'demo';
    var rulesLabel=savedAg?'저장된 합의서 보기':(S.me&&S.partner?'서로 편안한 기준을 정해요':'샘플로 먼저 살펴보기');
    var checkinDone = thisCheckin();
    var lifeTools = '<div class="mobile-section-head"><h2>생활 도구</h2><span>함께 쓰는 일상</span></div><div class="app-list">' +
      '<button type="button" data-action="settle">'+mobileIcon('plus')+'<span><strong>생활비 정산</strong><small>함께 쓴 돈 기록하고 나누기 · 영수증 스캔</small></span>'+mobileIcon('arrow')+'</button>' +
      '<button type="button" data-action="shopping">'+NAV_ICONS.checklist+'<span><strong>같이 살 것</strong><small>'+(S.shopping.filter(function(x){return !x.done;}).length?S.shopping.filter(function(x){return !x.done;}).length+'개 사야 해요':'장볼 때 함께 보는 목록')+'</small></span>'+mobileIcon('arrow')+'</button>' +
      '<button type="button" data-action="chores">'+NAV_ICONS.checklist+'<span><strong>역할 분담</strong><small>집안일 담당, 매주 자동 교체</small></span>'+mobileIcon('arrow')+'</button>' +
      '<button type="button" data-action="calendar">'+mobileIcon('plus')+'<span><strong>우리 일정</strong><small>이사일·정산일·점검일</small></span>'+mobileIcon('arrow')+'</button>' +
      '<button type="button" data-action="checkin">'+mobileIcon('heart')+'<span><strong>주간 체크인</strong><small>'+(checkinDone?'이번 주 점검 완료':'일주일 한 번, 우리 생활 돌아보기')+'</small></span>'+mobileIcon('arrow')+'</button>' +
      '<button type="button" data-action="lovemap">'+mobileIcon('heart')+'<span><strong>러브맵 퀴즈</strong><small>서로의 세계를 얼마나 아는지</small></span>'+mobileIcon('arrow')+'</button>' +
      '<button type="button" data-action="conflict">'+mobileIcon('chat')+'<span><strong>갈등 가이드</strong><small>서운한 일이 생겼을 때 차근차근</small></span>'+mobileIcon('arrow')+'</button></div>';
    shell('<section class="space-page"><p class="app-overline">OUR SPACE</p><h1 class="mobile-title">우리 공간</h1><p class="mobile-subtitle">함께 정하고, 하나씩 쌓아가는 일상</p><div class="space-summary"><span>'+NAV_ICONS.home+'</span><h2>우리의 시작을 준비해요</h2><p>입주 준비 '+stats.done+' / '+stats.total+' 완료</p><div class="space-progress"><i style="width:'+(stats.done/stats.total*100)+'%"></i></div></div><div class="app-list"><button type="button" data-action="checklist">'+NAV_ICONS.checklist+'<span><strong>입주 체크리스트</strong><small>계약부터 생활용품까지</small></span>'+mobileIcon('arrow')+'</button><button type="button" data-action="'+rulesAction+'">'+mobileIcon('heart')+'<span><strong>우리집 생활규칙</strong><small>'+rulesLabel+'</small></span>'+mobileIcon('arrow')+'</button><button type="button" data-action="'+(S.me?'invite':'start')+'">'+mobileIcon('user')+'<span><strong>메이트 연결</strong><small>'+(S.partner?esc(S.partner.name)+'님과 연결됨':'함께할 메이트 초대하기')+'</small></span>'+mobileIcon('arrow')+'</button></div>'+lifeTools+'<div class="mobile-section-head"><h2>나의 대화 기록</h2><span>'+Object.keys(notes).filter(function(k){return HOME_TALKS[k];}).length+'개</span></div>'+ (Object.keys(notes).filter(function(k){return HOME_TALKS[k];}).length ? Object.keys(notes).filter(function(k){return HOME_TALKS[k];}).map(function(k){return '<button class="saved-talk" data-action="talk-open" data-talk="'+k+'" type="button"><span>'+HOME_TALKS[k][0]+'</span><strong>'+esc(HOME_TALKS[k][1])+'</strong><p>'+esc(notes[k].text)+'</p></button>';}).join('') : '<div class="empty-notes">'+mobileIcon('chat')+'<p>아직 남긴 이야기가 없어요.</p><button type="button" data-action="talk-open">첫 생각 남기기</button></div>')+'<p class="device-note">대화 기록은 이 기기에만 저장돼요.</p></section>');
  }
  var talkDialog = null;
  var talkOpener = null;
  function openTalk(index) {
    if (Number.isInteger(index) && HOME_TALKS[index]) talkIndex=index;
    var notes=load('mateon.talks') || {};
    talkOpener=document.activeElement;
    talkDialog=document.createElement('dialog');
    talkDialog.className='talk-sheet';
    talkDialog.setAttribute('aria-labelledby','talk-title');
    var follow = HOME_TALKS[talkIndex][2];
    talkDialog.innerHTML='<div class="sheet-handle" aria-hidden="true"></div><div class="sheet-heading"><span>오늘의 대화 · '+HOME_TALKS[talkIndex][0]+'</span><button class="icon-button" type="button" aria-label="닫기" data-sheet-close>'+mobileIcon('close')+'</button></div><h2 id="talk-title">'+HOME_TALKS[talkIndex][1]+'</h2>'+(follow?'<p class="talk-follow"><span>이어서 물어보기</span>'+esc(follow)+'</p>':'')+'<label for="talk-note">나의 생각</label><textarea id="talk-note" maxlength="500" rows="4" placeholder="정답은 없어요. 편하게 적어보세요.">'+esc(notes[talkIndex]?notes[talkIndex].text:'')+'</textarea><p class="sheet-hint">이 기기에만 저장되며, 메이트에게 자동 전송되지 않아요.</p><button class="mobile-primary" type="button" data-sheet-save>내 생각 저장하기</button>';
    if(notes[talkIndex]) talkDialog.innerHTML += '<button class="connection-cancel" type="button" data-sheet-delete>이 기록 삭제하기</button>';
    var deleteArmed=false;
    document.body.appendChild(talkDialog);
    talkDialog.addEventListener('close',function(){talkDialog.remove();talkDialog=null;document.body.classList.remove('sheet-open');if(talkOpener&&talkOpener.isConnected)talkOpener.focus();});
    talkDialog.addEventListener('click',function(e){
      if(e.target.closest('[data-sheet-close]')) talkDialog.close();
      else if(e.target.closest('[data-sheet-delete]')) {
        if(!deleteArmed){deleteArmed=true;e.target.closest('[data-sheet-delete]').textContent='한 번 더 눌러 삭제';return;}
        delete notes[talkIndex];
        try{localStorage.setItem('mateon.talks',JSON.stringify(notes));}catch(err){showToast('저장 공간을 확인해 주세요');return;}
        talkDialog.close();render();
        var deleteFocus=document.querySelectorAll('[data-action="talk-open"]')[0];
        if(deleteFocus) deleteFocus.focus({preventScroll:true});
        showToast('대화 기록을 삭제했어요');
      }
      else if(e.target.closest('[data-sheet-save]')) {
        var value=document.getElementById('talk-note').value.trim();
        if(!value){document.getElementById('talk-note').focus();showToast('생각을 한 줄 남겨주세요');return;}
        notes[talkIndex]={text:value,ts:Date.now()};
        try{localStorage.setItem('mateon.talks',JSON.stringify(notes));}catch(err){showToast('저장 공간을 확인해 주세요');return;}
        var savedY=window.scrollY || 0;
        talkDialog.close();render();window.scrollTo(0,savedY);
        var savedFocus=document.querySelectorAll('[data-action="talk-open"]')[0];
        if(savedFocus) savedFocus.focus({preventScroll:true});
        showToast('나의 생각을 저장했어요');
      }
    });
    document.body.classList.add('sheet-open');talkDialog.showModal();
  }

  /* ================= View: 온보딩 ================= */
  var RELATIONS = ['연인', '배우자 예정', '친구', '지인', '처음 만난 룸메이트'];
  var STAGES = ['고려 중', '집 탐색 중', '계약 완료', '입주 직전', '이미 동거 중'];

  function vOnboarding() {
    var inviteBanner = '';
    if (S.flow === 'partner' && S.invite) {
      inviteBanner = '<div class="invite-banner"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span><strong>' + esc(S.invite.name) + '님</strong>이 당신을 초대했어요. 진단하면 둘의 생활을 맞춰볼 수 있어요.</span></div>';
    } else if (S.flow === 'partner' && S.me) {
      inviteBanner = '<div class="invite-banner"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span><strong>' + esc(S.me.name) + '님의 상대</strong>로 진단해요. 이 기기에서 바로 이어서 할 수 있어요.</span></div>';
    }

    shell('' +
      '<p class="eyebrow caption">' + (S.flow === 'partner' ? 'Partner' : 'Step 1') + '</p>' +
      '<h2 class="view-title">' + (S.flow === 'partner' ? '이번에는 우리 둘의 생활을 맞춰볼까요?' : '같이 살면 나는 어떤 사람일까요?') + '</h2>' +
      '<p class="view-desc body-md">결과를 부를 이름과 두 분의 관계만 알려주세요.</p>' +
      '<div class="view-stack">' +
      inviteBanner +
      '<div class="card">' +
      '<div class="field-group">' +
      '<label class="field-label" for="pf-name">이름 또는 닉네임</label>' +
      '<input id="pf-name" class="input" type="text" name="nickname" maxlength="12" placeholder="예: 다원" autocomplete="nickname" spellcheck="false" value="' + esc(S.profile.name) + '">' +
      '</div>' +
      '<div class="field-group">' +
      '<span class="field-label">상대와의 관계</span>' +
      '<div class="chip-row" id="rel-chips">' +
      RELATIONS.map(function (r) {
        return '<button class="chip' + (S.profile.relation === r ? ' selected' : '') + '" data-action="rel" data-v="' + esc(r) + '" type="button">' + esc(r) + '</button>';
      }).join('') +
      '</div></div>' +
      '<div class="field-group" style="margin-bottom:0">' +
      '<span class="field-label">동거 준비 단계</span>' +
      '<div class="chip-row" id="stage-chips">' +
      STAGES.map(function (s) {
        return '<button class="chip' + (S.profile.stage === s ? ' selected' : '') + '" data-action="stage" data-v="' + esc(s) + '" type="button">' + esc(s) + '</button>';
      }).join('') +
      '</div></div>' +
      '</div>' +
      '<div class="cta-col">' +
      '<button class="btn btn-primary btn-lg" data-action="survey" type="button">진단 시작하기</button>' +
      '<button class="btn btn-tertiary btn-md" data-action="home" type="button">처음으로</button>' +
      '</div>' +
      '</div>');
  }

  /* ================= View: 설문 ================= */
  function vSurvey() {
    var i = S.q;
    var q = QUESTIONS[i];
    var dom = DOMAINS.find(function (d) { return d.id === q.domain; });
    var keys = ['A', 'B', 'C', 'D'];
    var prev = S.answers.find(function (a) { return a.qid === q.id; });

    shell('' +
      '<div class="survey-top">' +
      '<button class="back-btn" data-action="prev" type="button" ' + (i === 0 ? 'disabled' : '') + ' aria-label="이전 문항">' +
      '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>' +
      '</button>' +
      '<div class="progress"><div class="progress-fill" style="width:' + Math.round(((i + 1) / QUESTIONS.length) * 100) + '%"></div></div>' +
      '<span class="progress-num">' + (i + 1) + ' / ' + QUESTIONS.length + '</span>' +
      '</div>' +
      '<div class="q-slide ' + (S.qDir === 'prev' ? 'q-prev' : 'q-next') + '">' +
      '<span class="badge badge-brand domain-tag">' + esc(dom.label) + '</span>' +
      '<h2 class="question-text">' + esc(q.text) + '</h2>' +
      '<div class="opt-list">' +
      q.options.map(function (o, idx) {
        var sel = prev && prev.code === o.code ? ' selected' : '';
        return '<button class="opt-card' + sel + '" data-action="answer" data-idx="' + idx + '" type="button">' +
          '<span class="opt-key">' + keys[idx] + '</span><span>' + esc(o.text) + '</span></button>';
      }).join('') +
      '</div>' +
      '<p class="survey-notice caption">가장 이상적인 행동이 아니라, 실제 내 모습과 가장 가까운 답을 골라주세요.</p></div>');
  }

  /* ================= View: 개인 결과 ================= */
  // Character sheets: E increases left-to-right; R4 is the top row.
  function characterArt(c, lazy, cutout) {
    if (cutout) {
      var cutoutX = [0,340,680,1021][+c.code[1]-1];
      var cutoutY = [890,610,330,0][+c.code[3]-1];
      var cutoutHeight = [266,280,280,330][+c.code[3]-1];
      return '<span class="character-art character-art-cutout" style="aspect-ratio:340.25/' + cutoutHeight + '"><picture><source srcset="assets/character-sheet-cutout-v2.webp" type="image/webp"><img src="assets/character-sheet-cutout-v2.png" alt="' + esc(c.name) + ' 캐릭터" width="1361" height="1156" ' + (lazy ? 'loading="lazy"' : 'fetchpriority="high"') + ' style="left:' + (-cutoutX/340.25*100) + '%;top:' + (-cutoutY/cutoutHeight*100) + '%"></picture></span>';
    }
    var x = [126,430,734,1031][+c.code[1]-1];
    var y = [843,604,365,123][+c.code[3]-1];
    var height = +c.code[3] === 1 ? 202 : 229;
    return '<span class="character-art" style="aspect-ratio:294/' + height + '"><picture><source srcset="assets/character-sheet.webp" type="image/webp"><img src="assets/character-sheet.png" alt="' + esc(c.name) + ' 캐릭터" width="1361" height="1156" ' + (lazy ? 'loading="lazy"' : 'fetchpriority="high"') + ' style="left:' + (-x/294*100) + '%;top:' + (-y/height*100) + '%"></picture></span>';
  }

  function resultShareText(r, c) {
    return 'MATE:ON 동거 성향 진단 결과\n' +
      '나의 동거 캐릭터: ' + c.name + ' (' + c.code + ')\n' +
      '교류 활성도 ' + pct(r.eAvg) + '% · 자극 민감도 ' + pct(r.rAvg) + '%\n' +
      c.quote + '\n' +
      '너는 어떤 유형일까? ' + inviteURL(r);
  }

  function inviteURL(r) {
    var rr = r;
    if (S.shareName === false) rr = Object.assign({}, r, { name: '동거인' });
    return publicBaseURL() + '?invite=' + encodeInvite(rr, S.inviteDays);
  }

  function vResult() {
    var r = S.flow === 'partner' ? S.partner : S.me;
    if (!r) { go('home'); return; }
    var c = charById(r.charId);
    var c2 = charById(r.char2Id);
    var isMine = S.flow === 'me';
    var noteIcon = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>';

    var seq = c.conflictSeq.map(function (s, i) {
      return '<div class="seq-step"><span class="seq-dot">' + (i + 1) + '</span><span class="body-sm">' + esc(s) + '</span></div>' +
        (i < c.conflictSeq.length - 1 ? '<div class="seq-line"></div>' : '');
    }).join('');

    var ctas;
    if (isMine && S.partner) {
      ctas = '<div class="cta-col">' +
        '<button class="btn btn-primary btn-lg" data-action="report" type="button">우리 둘 궁합 리포트 보기</button>' +
        '<button class="btn btn-secondary btn-md" data-action="saveimg" type="button">결과 카드 이미지 저장</button>' +
        '<button class="btn btn-secondary btn-md" data-action="share" type="button">결과 공유하기</button>' +
        '<button class="btn btn-tertiary btn-md" data-action="retry" type="button">다시 진단하기</button></div>';
    } else if (isMine) {
      ctas = '<div class="cta-col">' +
        '<button class="btn btn-primary btn-lg" data-action="invite" type="button">상대 초대하고 궁합 보기</button>' +
        '<button class="btn btn-secondary btn-md" data-action="saveimg" type="button">결과 카드 이미지 저장</button>' +
        '<button class="btn btn-secondary btn-md" data-action="share" type="button">결과 공유하기</button>' +
        '<button class="btn btn-tertiary btn-md" data-action="retry" type="button">다시 진단하기</button></div>';
    } else {
      ctas = '<div class="cta-col">' +
        '<button class="btn btn-primary btn-lg" data-action="report" type="button">우리 둘 궁합 리포트 보기</button>' +
        '<button class="btn btn-secondary btn-md" data-action="saveimg" type="button">결과 카드 이미지 저장</button></div>';
    }

    // 실무 성향 (E/R과 별도 영역)
    var lifeHTML;
    if (r.life && r.life.length) {
      lifeHTML = '<div class="card" style="margin-top:16px"><h4 class="card-title">실무 성향 메모</h4>' +
        '<div class="life-summary">' +
        r.life.map(function (x) {
          return '<div class="life-row"><span class="lr-area">' + esc(x.area) + '</span><span class="lr-val">' + esc(x.label) + '</span></div>';
        }).join('') +
        '</div></div>';
    } else if (isMine) {
      lifeHTML = '<div class="card" style="margin-top:16px"><h4 class="card-title">실무 성향 체크 (6문항)</h4>' +
        '<p class="body-sm text-muted" style="margin-bottom:12px">청결·비용·집안일처럼 E/R로는 알 수 없는 생활 기준을 추가로 확인해요.</p>' +
        '<button class="btn btn-secondary btn-md" data-action="lifecheck" type="button" style="width:100%">실무 성향 체크하기</button></div>';
    } else {
      lifeHTML = '';
    }

    // 이전 진단과 비교
    var histHTML = '';
    if (isMine && S.history.length > 1) {
      var prev = S.history[S.history.length - 2];
      var prevC = charById(prev.charId);
      histHTML = '<div class="card" style="margin-top:16px"><h4 class="card-title">이전 진단과 비교</h4>' +
        '<div class="hist-row"><span class="h-date">' + fmtDate(prev.ts) + '</span><span class="h-char">' + esc(prevC.name) + '</span><span class="h-date">' + prevC.code + '</span></div>' +
        '<div class="hist-arrow">↓</div>' +
        '<div class="hist-row current"><span class="h-date">지금</span><span class="h-char">' + esc(c.name) + '</span><span class="h-date">' + c.code + '</span></div>' +
        (prev.charId === r.charId
          ? '<p class="gap-desc" style="margin-top:12px">같은 유형이에요. 생활 성향이 안정적인 편이에요.</p>'
          : '<p class="gap-desc" style="margin-top:12px">유형이 바뀌었어요. 상황이나 생활 패턴이 달라졌을 수 있어요.</p>') +
        '</div>';
    }

    var typesLink = '<div class="cta-col" style="margin-top:16px"><button class="btn btn-tertiary btn-md" data-action="types" type="button">16유형 도감 보기</button></div>';

    shell('<div class="result-page">' +
      '<p class="eyebrow caption" style="text-align:center;display:block">' + (isMine ? '나의 동거 캐릭터' : esc(r.name) + '님의 동거 캐릭터') + '</p>' +
      '<div class="card char-hero result-hero tone-r' + c.code[3] + '">' +
      '<span class="char-code">' + c.code + '</span>' +
      '<h2 class="char-name">' + esc(c.name) + '</h2>' +
      characterArt(c, false) +
      '<p class="char-quote">' + esc(c.quote) + '</p>' +
      '<div class="char-meta">' +
      '<span class="badge badge-neutral">응답 일치도 ' + esc(r.conf) + '</span>' +
      (c2 && c2.id !== c.id ? '<button class="similar-type" data-action="type" data-id="' + c2.id + '" type="button">비슷한 유형 · ' + esc(c2.name) + ' →</button>' : '') +
      '</div>' +
      '</div>' +
      '<p class="result-context">20문항에서 발견한 생활 성향이에요. 응답 일치도는 유형 간 점수 차이를 요약한 것으로, 진단 정확도를 뜻하지 않아요.</p>' +
      '<section class="result-takeaway" aria-label="오늘의 생활 팁"><span>함께 살 때 기억해 주세요</span><p>' + esc(c.dos[0]) + '</p></section>' +
      ctas +
      (isMine ? '<div class="result-sharing"><p>공유 링크에는 유형·성향 수치·생활 기준이 포함돼요. 링크를 가진 사람이 결과를 볼 수 있어요.</p><button class="similar-type" data-action="share-name" type="button" aria-pressed="' + (S.shareName !== false) + '">공유할 때 닉네임 ' + (S.shareName !== false ? '포함 · 눌러서 제외' : '제외 · 눌러서 포함') + '</button></div>' : '') +

      '<details class="card result-details" style="margin-top:16px"><summary>나의 성향 좌표 · 수치와 해석</summary>' +
      '<div class="gauge-block">' +
      gaugeHTML('생활 교류 활성도 (E)', r.eAvg, false) +
      gaugeHTML('생활 자극 민감도 (R)', r.rAvg, true) +
      '</div>' +
      '<div style="margin-top:20px">' + matrixHTML(r.charId, null, r.name || '나') + '</div>' +
      '<p class="caption text-muted" style="margin-top:16px">수치는 순위나 궁합 점수가 아니라, 20개 응답에서 나타난 성향의 위치예요. 결과는 판정이 아니라 대화를 돕는 참고 도구예요.</p>' +
      '</details>' +

      '<div class="card" style="margin-top:16px">' +
      '<h4 class="card-title">같이 살면 나는 이런 사람</h4>' +
      '<ul class="trait-list">' + c.traits.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
      '<div class="note-box ' + (c.note.type === 'warn' ? 'warn' : c.note.type === 'good' ? 'good' : 'info') + '" style="margin-top:16px">' + noteIcon + '<span>' + esc(c.note.text) + '</span></div>' +
      '</div>' +

      '<div class="card" style="margin-top:16px">' +
      '<h4 class="card-title">동거인이 실제로 보게 되는 나</h4>' +
      '<div class="view-vs">' +
      '<div class="vs-side"><span class="vs-label">내 생각</span>' + esc(c.selfView) + '</div>' +
      '<span class="vs-mark">↔</span>' +
      '<div class="vs-side"><span class="vs-label">동거인에게는</span>' + esc(c.partnerView) + '</div>' +
      '</div>' +
      '</div>' +

      '<div class="card" style="margin-top:16px">' +
      '<h4 class="card-title">갈등이 생겼을 때의 내 흐름</h4>' +
      '<div class="seq">' + seq + '</div>' +
      '</div>' +

      '<div class="card" style="margin-top:16px">' +
      '<h4 class="card-title">내가 예민해지는 순간 Top 3</h4>' +
      '<ol class="trigger-list">' + c.triggers.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol>' +
      '</div>' +

      '<div class="card" style="margin-top:16px">' +
      '<h4 class="card-title">나와 살 때 사용설명서</h4>' +
      '<div class="do-grid">' +
      '<div class="do-col do"><h5>이렇게 해주세요</h5><ul>' + c.dos.map(function (t) { return '<li>· ' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="do-col dont"><h5>이건 피해주세요</h5><ul>' + c.donts.map(function (t) { return '<li>· ' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
      '</div>' +
      '</div>' +

      '<div class="card" style="margin-top:16px">' +
      '<h4 class="card-title">나를 편하게 만드는 집</h4>' +
      '<div class="comfort-chips">' + c.comfort.map(function (t) { return '<span class="badge badge-brand">' + esc(t) + '</span>'; }).join('') + '</div>' +
      '</div>' +

      lifeHTML + histHTML + typesLink + '</div>');
  }

  /* ================= View: 상대 초대 ================= */
  /* {r:result} | {expired:true} | null */
  function resultFromLink(value) {
    if (typeof value !== 'string' || value.length > 12000) return null;
    try {
      var url = new URL(value.trim());
      var customScheme = appConfig().customScheme + ':';
      var raw = null;
      if ((url.protocol === customScheme || url.protocol === 'mateon:') && url.hostname === 'invite') raw = url.searchParams.get('data') || '';
      else if (url.protocol === 'https:' || url.protocol === 'http:') raw = url.searchParams.get('invite') || '';
      if (!raw) return null;
      var dec = decodeInvite(raw);
      if (!dec || !dec.result) return null;
      if (dec.expired) return { expired: true };
      return { r: dec.result };
    } catch (e) { /* an invalid link must not change the current partner */ }
    return null;
  }

  function qrSVG(text) {
    try {
      if (typeof window.qrcode !== 'function') return '';
      var q = window.qrcode(0, 'M');
      q.addData(text);
      q.make();
      var n = q.getModuleCount(), cell = 4, pad = 18, size = n * cell + pad * 2;
      var d = '';
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++)
        if (q.isDark(r, c)) d += 'M' + (c * cell + pad) + ' ' + (r * cell + pad) + 'h' + cell + 'v' + cell + 'h-' + cell + 'z';
      return '<svg viewBox="0 0 ' + size + ' ' + size + '" class="qr-svg" role="img" aria-label="초대 링크 QR 코드"><rect width="' + size + '" height="' + size + '" rx="14" fill="#fff"/><path d="' + d + '" fill="#303943"/></svg>';
    } catch (e) { return ''; }
  }

  function connectionHTML() {
    var pending = S.pendingPartner;
    var preview = '';
    if (pending) {
      var c = charById(pending.charId);
      var update = '';
      if (S.partner) {
        var old = charById(S.partner.charId);
        var changed = S.partner.charId !== pending.charId;
        update = '<div class="update-diff"><span class="badge ' + (changed ? 'badge-warning' : 'badge-info') + '">' + (changed ? '유형이 바뀌었어요' : '최신 결과') + '</span>' +
          '<p>' + esc(S.partner.name || '메이트') + ' · ' + esc(old.name) + ' (' + old.code + ')<span class="diff-arrow">→</span>' + esc(pending.name || '메이트') + ' · ' + esc(c.name) + ' (' + c.code + ')</p>' +
          '<p class="caption text-muted">기존 연결을 새 결과로 업데이트해요. 내 진단은 그대로예요.</p></div>';
      }
      preview = '<div class="connection-preview" role="status"><span class="badge badge-info">연결 전 확인</span><h4>' + esc(pending.name) + '님 · ' + esc(c.name) + ' (' + c.code + ')</h4>' + update +
        '<p>' + (S.partner ? '연결하면 현재 ' + esc(S.partner.name) + '님의 결과가 이 결과로 바뀌어요.' : '내 진단은 유지하고, 이 결과를 메이트로 연결해요.') + '</p>' +
        '<button class="mobile-primary" type="button" data-action="confirm-partner">' + (S.partner ? '새 결과로 업데이트' : '이 메이트와 연결하기') + '</button>' +
        '<button class="connection-cancel" type="button" data-action="cancel-partner">취소</button></div>';
    }
    return '<section class="card connection-import"><h3 class="card-title">메이트가 보낸 링크 연결하기</h3>' +
      '<p class="body-sm text-muted">상대가 공유한 결과 링크를 붙여넣으면, 실제 진단 수치로 비교할 수 있어요.</p>' +
      '<label class="field-label" for="partner-link">받은 초대 링크</label>' +
      '<input class="input" id="partner-link" type="url" inputmode="url" autocomplete="off" spellcheck="false" maxlength="12000" placeholder="https://… 또는 mateon://invite?…" value="' + esc(S.connectionInput) + '">' +
      '<button class="home-secondary" type="button" data-action="preview-partner">상대 결과 확인하기</button>' +
      preview +
      '<p class="connection-hint">링크를 만든 뒤 ' + S.inviteDays + '일이 지나면 자동으로 만료돼요. 상대가 다시 진단하면 새 링크로 업데이트할 수 있어요.</p></section>';
  }

  function vInvite() {
    if (!S.me) { go('home'); return; }
    var url = inviteURL(S.me);

    var partnerDone = '';
    if (S.partner) {
      var pc = charById(S.partner.charId);
      partnerDone = '<div class="card resume-card partner-summary">' +
        '<span class="avatar avatar-secondary">' + esc((S.partner.name || '상')[0]) + '</span>' +
        '<div class="resume-info"><strong class="body-sm">' + esc(S.partner.name) + '님 진단 완료</strong>' +
        '<p class="caption text-muted">' + esc(pc.name) + ' (' + pc.code + ')</p></div>' +
        '<button class="btn btn-primary btn-sm" data-action="report" type="button">리포트 보기</button>' +
        '<button class="btn btn-tertiary btn-sm" data-action="unlink" type="button">연결 해제</button></div>';
    }

    var shareOn = S.shareName !== false;
    var shareInfo = '<div class="card">' +
      '<h4 class="card-title">링크에 포함되는 정보</h4>' +
      '<ul class="share-list">' +
      '<li>닉네임' + (shareOn ? '' : ' <span class="text-muted">(제외됨 — “동거인”으로 표시)</span>') + '</li>' +
      '<li>관계 유형 · 동거 단계</li>' +
      '<li>16유형 결과와 성향 수치</li>' +
      '</ul>' +
      '<p class="caption text-muted">문항별 응답은 포함되지 않아요. 실무 체크를 마쳤다면 생활 기준도 포함돼요. 링크를 가진 사람은 누구나 결과를 볼 수 있고, 결과는 받은 사람의 기기에만 저장돼요.</p>' +
      '<button class="share-opt' + (shareOn ? ' on' : '') + '" data-action="share-name" type="button" aria-pressed="' + shareOn + '">' +
      '<span class="share-opt-dot"></span>닉네임 포함 ' + (shareOn ? '켜짐' : '꺼짐') + '</button>' +
      '</div>';

    shell('' +
      '<p class="eyebrow caption">Step 2</p>' +
      '<h2 class="view-title">이번에는 우리 둘의 생활을 맞춰볼까요?</h2>' +
      '<p class="view-desc body-md">상대도 진단을 마치면 두 분의 궁합 리포트가 완성돼요.<br>같은 점보다, 다른 점을 먼저 알아볼게요.</p>' +
      '<div class="view-stack">' +
      partnerDone +
      connectionHTML() +
      '<div class="card">' +
      '<h4 class="card-title">초대 링크 보내기</h4>' +
      '<p class="body-sm text-muted" style="margin-bottom:12px">내 결과가 담긴 링크예요. 상대가 열어서 진단하면 바로 비교됩니다.</p>' +
      '<div class="invite-link-box"><code>' + esc(url) + '</code></div>' +
      '<div class="chip-row" style="margin-top:14px"><span class="field-label" style="align-self:center;margin-right:4px">링크 유효기간</span>' +
      [1, 7, 30].map(function (d) { return '<button class="chip' + (S.inviteDays === d ? ' selected' : '') + '" data-action="invite-days" data-v="' + d + '" type="button">' + d + '일</button>'; }).join('') +
      '</div>' +
      '<div class="cta-col" style="margin-top:14px">' +
      '<button class="btn btn-secondary btn-md" data-action="copylink" type="button">링크 복사하기</button>' +
      '<button class="btn btn-secondary btn-md" data-action="share-invite" type="button">공유하기</button>' +
      '</div>' +
      '</div>' +
      '<div class="card qr-card">' +
      '<h4 class="card-title">QR로 바로 연결</h4>' +
      '<div class="qr-box">' + qrSVG(url) + '</div>' +
      '<p class="caption text-muted">같은 공간에 있을 때 상대 카메라로 스캔하면 바로 초대 화면이 열려요.</p>' +
      '</div>' +
      shareInfo +
      '<div class="card">' +
      '<h4 class="card-title">지금 바로 비교해보기</h4>' +
      '<div class="cta-col">' +
      '<button class="btn btn-primary btn-md" data-action="partner-survey" type="button">이 기기에서 상대 진단하기</button>' +
      '<button class="btn btn-tertiary btn-md" data-action="sample" type="button">나와 가장 다른 샘플로 미리보기</button>' +
      '</div>' +
      '</div>' +
      '<div class="card">' +
      '<h4 class="card-title">유형 코드로 바로 연결</h4>' +
      '<p class="body-sm text-muted" style="margin-bottom:12px">상대가 결과 화면의 코드(예: <code class="code-ex">E3R2</code>)를 알려줬다면 바로 비교할 수 있어요.</p>' +
      '<div class="custom-rule"><input id="code-connect-in" class="input" maxlength="4" placeholder="E3R2" autocomplete="off" spellcheck="false" style="text-transform:uppercase">' +
      '<button class="btn btn-secondary btn-md" data-action="code-connect" type="button">연결</button></div>' +
      '</div>' +
      '</div>');
  }

  /* ================= View: 궁합 리포트 ================= */
  function domainGap(a, b) {
    return Math.abs(a.e - b.e) + Math.abs(a.r - b.r);   // 0~6
  }

  function gapStatus(g) {
    if (g < 1.5) return { label: '잘 맞는 편', cls: 'badge-success' };
    if (g < 2.5) return { label: '조금 다름', cls: 'badge-warning' };
    return { label: '먼저 이야기해보기', cls: 'badge-error' };
  }

  function gapInsight(domId, me, you) {
    var ins = AREA_INSIGHTS[domId];
    var de = me.e - you.e, dr = me.r - you.r;
    if (Math.abs(de) >= Math.abs(dr)) return ins.gapE;
    return ins.gapR;
  }

  function barPos(p) { return Math.round(((p.e + p.r) / 8) * 100); }

  /* gap이 있는 영역의 추천 규칙 + 기본 규칙 */
  function recommendedRules(me, you) {
    var gapIds = DOMAINS.filter(function (d) {
      return domainGap(me.domains[d.id], you.domains[d.id]) >= 1.5;
    }).map(function (d) { return d.id; });
    return RULE_LIBRARY.filter(function (r) { return gapIds.indexOf(r.domain) >= 0; }).concat(BASE_RULES);
  }

  /* 상대(또는 내 결과)가 바뀌면 추천 규칙 재계산 — 직접 추가한 규칙의 선택 상태는 유지 */
  function resetRulesForNewPartner() {
    var keepCustom = S.customRules.filter(function (t) {
      return S.checkedRules.indexOf(t) >= 0;
    });
    var all = (S.me && S.partner) ? recommendedRules(S.me, S.partner) : [];
    S.checkedRules = all.map(function (r) { return r.text; }).concat(keepCustom);
    S.rulesReady = true;
    S.signs = { me: false, partner: false };
  }

  function vReport() {
    var shared = !!S.viewPair;
    if (!shared && (!S.me || !S.partner)) { go(S.me ? 'invite' : 'home'); return; }
    var me = shared ? S.viewPair.me : S.me, you = shared ? S.viewPair.partner : S.partner;
    var mc = charById(me.charId), yc = charById(you.charId);

    // 영역별 gap 정렬
    var rows = DOMAINS.map(function (d) {
      var a = me.domains[d.id], b = you.domains[d.id];
      return { d: d, a: a, b: b, gap: domainGap(a, b) };
    });
    var aligned = rows.filter(function (r) { return r.gap < 1.5; });
    var gapped = rows.filter(function (r) { return r.gap >= 1.5; }).sort(function (x, y) { return y.gap - x.gap; });
    var conflicts = rows.slice().sort(function (x, y) { return y.gap - x.gap; }).slice(0, 3);

    // 추천 규칙: gap 있는 도메인의 규칙 + 기본 규칙
    var gapDomains = gapped.map(function (r) { return r.d.id; });
    var allRules = recommendedRules(me, you);
    var savedAg = shared ? null : savedAgreementForPair();
    if (!shared && !S.rulesReady) {
      S.checkedRules = (savedAg ? savedAg.rules : allRules.map(function (r) { return r.text; })).slice();
      S.rulesReady = true;
      if (savedAg) S.signs = { me: true, partner: true };
    }

    var pairCards = '' +
      '<div class="pair-cards">' +
      '<div class="pair-card"><span class="avatar">' + esc((me.name || '나')[0]) + '</span>' +
      '<span class="pc-name">' + esc(me.name || '나') + '</span>' +
      '<span class="pc-char">' + esc(mc.name) + '</span>' +
      '<span class="pc-code">' + mc.code + ' · 교류 ' + pct(me.eAvg) + '% · 민감도 ' + pct(me.rAvg) + '%</span></div>' +
      '<div class="pair-card you"><span class="avatar avatar-secondary">' + esc((you.name || '상')[0]) + '</span>' +
      '<span class="pc-name">' + esc(you.name || '상대') + '</span>' +
      '<span class="pc-char">' + esc(yc.name) + '</span>' +
      '<span class="pc-code">' + yc.code + ' · 교류 ' + pct(you.eAvg) + '% · 민감도 ' + pct(you.rAvg) + '%</span></div>' +
      '</div>';

    var matrix = '<div class="card" style="margin-top:16px"><h4 class="card-title">우리 둘의 위치</h4>' + matrixHTML(me.charId, you.charId, me.name || '나', you.name || '상대') +
      '<div class="gap-legend" style="margin-top:8px"><span style="color:var(--text-brand)">● ' + esc(me.name || '나') + '</span><span style="color:var(--text-link)">● ' + esc(you.name || '상대') + '</span></div></div>';

    var alignedHTML = aligned.length ? '' +
      '<div class="sec-head"><h3>잘 맞는 부분</h3><span class="badge badge-success">' + aligned.length + '개 영역</span></div>' +
      aligned.map(function (r) {
        return '<div class="card" style="margin-bottom:12px"><div class="gap-top"><span class="gap-area">' + esc(r.d.area) + '</span><span class="badge badge-success">잘 맞는 편</span></div>' +
          '<p class="gap-desc">' + esc(AREA_INSIGHTS[r.d.id].aligned) + '</p></div>';
      }).join('') : '';

    var gappedHTML = gapped.length ? '' +
      '<div class="sec-head"><h3>미리 이야기해두면 좋은 부분</h3><span class="badge badge-warning">' + gapped.length + '개 영역</span></div>' +
      gapped.map(function (r) {
        var st = gapStatus(r.gap);
        return '<div class="gap-row" style="margin-bottom:12px"><div class="gap-top"><span class="gap-area">' + esc(r.d.area) + '</span><span class="badge ' + st.cls + '">' + st.label + '</span></div>' +
          '<div class="gap-bar" style="--p:' + barPos(r.a) + '"></div>' +
          '<div class="gap-legend"><span>' + esc(me.name || '나') + ' ' + barPos(r.a) + '</span><span>' + esc(you.name || '상대') + ' ' + barPos(r.b) + '</span></div>' +
          '<p class="gap-desc">' + esc(gapInsight(r.d.id, r.a, r.b)) + '</p></div>';
      }).join('') : '';

    var conflictHTML = '<div class="sec-head"><h3>생활 갈등 예측</h3><span class="badge badge-error">Top ' + conflicts.length + '</span></div>' +
      conflicts.map(function (r, i) {
        var sc = CONFLICT_SCENARIOS[r.d.id];
        return '<div class="card conflict-card" style="margin-bottom:12px">' +
          '<div class="conflict-rank"><span class="badge badge-error">예상 ' + (i + 1) + '</span><span class="conflict-title">' + esc(sc.title) + '</span></div>' +
          '<p class="conflict-sit">' + esc(sc.situation) + '</p>' +
          '<div class="conflict-views">' +
          '<div class="conflict-view">' + esc(sc.views[0]) + '</div>' +
          '<div class="conflict-view">' + esc(sc.views[1]) + '</div>' +
          '</div>' +
          '<div class="conflict-prev"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px"><path d="M20 6 9 17l-5-5"/></svg><span><strong>예방법</strong> · ' + esc(sc.prevention) + '</span></div>' +
          '</div>';
      }).join('');

    var commHTML = '<div class="sec-head"><h3>서로에게 필요한 대화 방식</h3></div>' +
      '<div class="card">' +
      '<div class="view-vs">' +
      '<div class="vs-side"><span class="vs-label">' + esc(me.name || '나') + ' · ' + esc(mc.name) + '</span>' + esc(mc.conflictSeq.join(' → ')) + '</div>' +
      '<span class="vs-mark">↔</span>' +
      '<div class="vs-side"><span class="vs-label">' + esc(you.name || '상대') + ' · ' + esc(yc.name) + '</span>' + esc(yc.conflictSeq.join(' → ')) + '</div>' +
      '</div>' +
      '<p class="gap-desc" style="margin-top:12px">' + commAdvice(mc, yc) + '</p>' +
      '</div>';

    // 실무 영역 비교 (둘 다 실무 체크를 마친 경우)
    var lifeCmpHTML = '';
    if (me.life && you.life) {
      lifeCmpHTML = '<div class="sec-head"><h3>실무 영역 미리보기</h3><span class="badge badge-info">청결·비용 등</span></div>' +
        '<div class="card"><div class="life-summary">' +
        me.life.map(function (ml, i) {
          var yl = you.life[i];
          var diff = Math.abs(ml.level - yl.level) >= 2;
          var ins = LIFE_INSIGHTS[ml.area];
          return '<div class="life-row" style="align-items:flex-start">' +
            '<span class="lr-area">' + esc(ml.area) + '</span>' +
            '<span class="lr-val"><span class="lr-me">' + esc(ml.label) + '</span>' +
            ' · <span class="lr-you">' + esc(yl.label) + '</span></span>' +
            (diff ? '<span class="badge badge-warning">기준 다름</span>' : '<span class="badge badge-success">비슷</span>') +
            '</div>' +
            (diff ? '<p class="gap-desc" style="padding:0 16px 12px">' + esc(ins.gap) + '</p>' : '');
        }).join('') +
        '</div></div>';
    } else if (me.life && !you.life) {
      lifeCmpHTML = '<div class="sec-head"><h3>실무 영역 미리보기</h3></div>' +
        '<div class="card"><p class="body-sm text-muted">' + esc(you.name || '상대') + '님도 실무 성향 체크를 완료하면 청결·비용·집안일 기준을 비교할 수 있어요.</p></div>';
    }

    // 함께 나눠볼 질문 (차이 큰 상위 2개 영역)
    var talkHTML = '';
    var talkRows = gapped.slice(0, 2);
    if (talkRows.length) {
      talkHTML = '<div class="sec-head"><h3>함께 나눠볼 질문</h3><span class="badge badge-info">대화 스타터</span></div>' +
        '<div class="card"><div class="talk-list">' +
        talkRows.map(function (r) {
          return '<p class="talk-area">' + esc(r.d.area) + '</p>' +
            TALK_STARTERS[r.d.id].slice(0, 2).map(function (q) {
              return '<div class="talk-q">' + esc(q) + '</div>';
            }).join('');
        }).join('') +
        '</div></div>';
    }

    var totalRules = allRules.length + S.customRules.length;
    var rulesHTML = '<div class="sec-head"><h3>우리 둘에게 맞는 생활규칙</h3><span class="badge badge-brand">선택 ' + S.checkedRules.length + ' / ' + totalRules + '</span></div>' +
      '<p class="body-sm text-muted" style="margin-bottom:12px">차이가 큰 영역을 중심으로 추천했어요. 우리집 합의서에 담을 규칙을 골라보세요.</p>' +
      '<div class="view-stack" style="margin-top:0">' +
      allRules.map(function (r) {
        var checked = S.checkedRules.indexOf(r.text) >= 0;
        var rec = gapDomains.indexOf(r.domain) >= 0;
        return '<button class="rule-item' + (checked ? ' checked' : '') + '" data-action="rule" data-v="' + esc(r.text) + '" type="button" aria-pressed="' + checked + '">' +
          '<span class="rule-check"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>' +
          '<span>' + esc(r.text) + '</span>' +
          (rec ? '<span class="badge badge-brand rule-area">추천</span>' : '<span class="rule-area">' + esc(r.area) + '</span>') +
          '</button>';
      }).join('') +
      S.customRules.map(function (t) {
        var checked = S.checkedRules.indexOf(t) >= 0;
        return '<button class="rule-item' + (checked ? ' checked' : '') + '" data-action="rule" data-v="' + esc(t) + '" type="button" aria-pressed="' + checked + '">' +
          '<span class="rule-check"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>' +
          '<span>' + esc(t) + '</span><span class="badge badge-info rule-area">직접 추가</span></button>';
      }).join('') +
      '</div>' +
      '<div class="custom-rule"><input id="custom-rule-in" class="input" maxlength="60" autocomplete="off" placeholder="우리만의 규칙 직접 추가 (예: 화요일 저녁은 각자 자유시간)">' +
      '<button class="btn btn-secondary btn-md" data-action="add-rule" type="button">추가</button></div>' +
      '<div class="cta-col"><button class="btn btn-primary btn-lg" data-action="agreement" type="button">우리집 합의서 만들기 (' + S.checkedRules.length + '개)</button></div>';

    var bottomCTA = shared
      ? '<div class="cta-col"><button class="btn btn-primary btn-lg" data-action="pair-start" type="button">나도 진단해서 우리 리포트 만들기</button></div>'
      : '<div class="cta-col">' +
        '<button class="btn btn-secondary btn-md" data-action="copy-pair" type="button">리포트 링크 복사</button>' +
        '<button class="btn btn-tertiary btn-md" data-action="invite" type="button">상대 다시 연결하기</button></div>';

    shell('' +
      (shared ? '<div class="card shared-banner"><strong>공유받은 리포트 보는 중</strong><p class="caption text-muted">' + esc(me.name || 'A') + '님과 ' + esc(you.name || 'B') + '님의 궁합 리포트예요.</p></div>' : '') +
      '<p class="eyebrow caption">Couple Report</p>' +
      '<h2 class="view-title">우리 둘 궁합 리포트</h2>' +
      '<p class="view-desc body-md">같은 점보다, 다른 점을 먼저 알아볼게요.<br>다름은 문제가 아니라 미리 맞출 부분이에요.</p>' +
      '<div style="margin-top:24px">' + pairCards + '</div>' +
      matrix +
      alignedHTML + gappedHTML + conflictHTML + commHTML + lifeCmpHTML + talkHTML + (shared ? '' : rulesHTML) +
      bottomCTA +
      '<p class="caption text-muted" style="text-align:center;margin-top:8px">이 리포트는 확정적인 판정이 아니라, 함께 살 준비를 돕는 참고 자료예요.</p>');
  }

  function commAdvice(mc, yc) {
    var mR = +mc.code[3], yR = +yc.code[3];
    if (mR >= 3 || yR >= 3) {
      return '한 분이라도 민감도가 높은 편이에요. 갈등이 생기면 바로 몰아붙이기보다 “잠깐 정리하고 몇 시에 이야기하자”처럼 시간을 정해 대화하는 방식이 안전해요.';
    }
    return '두 분 모두 비교적 안정적으로 대응하는 편이에요. 불편한 점을 쌓아두지 말고 가볍게라도 바로 나누는 습관이 좋아요.';
  }

  /* ================= View: 우리집 합의서 ================= */
  function vAgreement() {
    if (!S.me || !S.partner) { go('home'); return; }
    var ag = savedAgreementForPair();
    if (ag && !S.rulesReady) {
      S.checkedRules = ag.rules.slice();
      S.rulesReady = true;
      S.signs = { me: true, partner: true };
    }
    var rules = agreementRules();
    var today = new Date();
    var todayStr = today.getFullYear() + '년 ' + (today.getMonth() + 1) + '월 ' + today.getDate() + '일';
    var differs = !!(ag && !sameTextList(rules, ag.rules));
    var dateStr = ag && !differs ? ag.date : todayStr;
    var version = ag ? (ag.rev || 1) : 0;
    var done = S.signs.me && S.signs.partner;

    var ruleRows = rules.length ? rules.map(function (t) {
      return '<div class="agree-rule"><svg aria-hidden="true" class="check-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span>' + esc(t) + '</span></div>';
    }).join('') : '<div class="empty-rules">선택된 규칙이 없어요. 리포트에서 함께 지킬 규칙을 골라주세요.</div>';

    var savedNote = ag ? '<div class="note-box good" style="margin-top:16px"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg><span>' + esc(ag.date) + '에 저장된 합의서 v' + version + '이 있어요. (' + ag.rules.length + '개 규칙)' + (ag.updated ? ' ' + esc(ag.updated) + '에 수정됐어요.' : '') + (differs ? ' 현재 화면은 저장본과 다른 선택이에요.' : ' 저장된 규칙을 불러왔어요.') + '</span></div>' : '';
    var diffHTML = '';
    if (ag && differs) {
      var added = rules.filter(function (t) { return ag.rules.indexOf(t) < 0; });
      var removed = ag.rules.filter(function (t) { return rules.indexOf(t) < 0; });
      diffHTML = '<div class="agree-diff">' +
        '<div class="diff-head"><strong>저장된 합의서와 다른 선택이에요</strong><button class="btn btn-tertiary btn-sm" data-action="restore-agree" type="button">저장본으로 되돌리기</button></div>' +
        (added.length ? '<div class="diff-group"><span class="badge badge-brand">추가됨 ' + added.length + '</span><ul>' + added.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>' : '') +
        (removed.length ? '<div class="diff-group"><span class="badge badge-warning">제외됨 ' + removed.length + '</span><ul>' + removed.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>' : '') +
        '</div>';
    }
    var saveLabel = !rules.length ? '규칙을 한 개 이상 선택해 주세요' : done ? (differs ? '변경된 합의서 저장하기' : '합의서 저장하기') : '두 분 모두 동의하면 저장할 수 있어요';

    shell('' +
      '<p class="eyebrow caption">Our Agreement</p>' +
      '<h2 class="view-title">우리집 합의서</h2>' +
      '<p class="view-desc body-md">막연했던 기준을 명확한 약속으로 남겨보세요.<br>규칙이 바뀌면 저장본과 비교한 뒤 다시 동의할 수 있어요.</p>' +
      '<div class="agree-doc" style="margin-top:24px">' +
      '<div class="agree-doc-head">' +
      logoSVG(56) +
      '<h3 class="heading-sm" style="margin-top:8px">우리집 생활 합의서' + (version ? ' <span class="rev-tag">v' + version + '</span>' : '') + '</h3>' +
      '<p class="caption text-muted">' + esc(S.me.name || '나') + ' · ' + esc(S.partner.name || '상대') + ' — ' + dateStr + '</p>' +
      '</div>' +
      ruleRows +
      '<div class="agree-signs">' +
      '<button class="sign-box' + (S.signs.me ? ' signed' : '') + '" data-action="sign" data-who="me" type="button">' + esc(S.me.name || '나') + (S.signs.me ? ' · 동의함' : ' · 서명하기') + '</button>' +
      '<button class="sign-box' + (S.signs.partner ? ' signed' : '') + '" data-action="sign" data-who="partner" type="button">' + esc(S.partner.name || '상대') + (S.signs.partner ? ' · 동의함' : ' · 서명하기') + '</button>' +
      '</div>' +
      '</div>' +
      savedNote + diffHTML +
      '<div class="cta-col">' +
      (done && rules.length ? '<button class="btn btn-primary btn-lg" data-action="save-agree" type="button">' + saveLabel + '</button>' : '<button class="btn btn-primary btn-lg" type="button" disabled>' + saveLabel + '</button>') +
      '<button class="btn btn-secondary btn-md" data-action="agree-img" type="button">합의서 이미지로 저장</button>' +
      '<button class="btn btn-secondary btn-md" data-action="agree-ics" type="button">한 달 뒤 점검일 캘린더 추가</button>' +
      '<button class="btn btn-secondary btn-md" data-action="copy-agree" type="button">합의서 텍스트 복사</button>' +
      '<button class="btn btn-tertiary btn-md" data-action="report" type="button">리포트로 돌아가기</button>' +
      '</div>' +
      '<p class="caption text-muted" style="text-align:center;margin-top:8px">생활 합의를 돕는 문서이며, 법적 효력은 없어요.</p>');
  }

  function agreementText() {
    var rules = agreementRules();
    var ag = savedAgreementForPair();
    var today = new Date();
    var dateStr = ag && sameTextList(rules, ag.rules) ? ag.date : today.getFullYear() + '년 ' + (today.getMonth() + 1) + '월 ' + today.getDate() + '일';
    var version = ag ? ' v' + (ag.rev || 1) : '';
    return '우리집 생활 합의서 — ' + (S.me.name || '나') + ' & ' + (S.partner.name || '상대') + ' (' + dateStr + version + ')\n\n' +
      rules.map(function (t, i) { return (i + 1) + '. ' + t; }).join('\n') +
      '\n\nMATE:ON에서 만들었어요. 함께 살 준비, 서로를 아는 것부터.';
  }

  /* ================= View: 16유형 도감 ================= */
  function codeDist(a, b) {
    return Math.abs(+a.code[1] - +b.code[1]) + Math.abs(+a.code[3] - +b.code[3]);
  }

  function vTypes() {
    var myC = S.me ? charById(S.me.charId) : null;
    var cells = CHARACTERS.map(function (c, i) {
      var cls = 'type-card';
      if (S.me && S.me.charId === c.id) cls += ' mine';
      else if (S.partner && S.partner.charId === c.id) cls += ' partner';
      var dist = '';
      if (myC) {
        var d = codeDist(myC, c);
        var lbl = d === 0 ? '나와 같음' : d <= 2 ? '비슷한 편' : d <= 4 ? '다른 편' : '많이 다름';
        dist = '<span class="tc-dist">' + lbl + '</span>';
      }
      return '<button class="' + cls + '" data-action="type" data-id="' + c.id + '" type="button" style="--i:' + i + '">' +
        characterArt(c, true) + '<span class="tc-code">' + c.code + '</span><span class="tc-name">' + esc(c.name) + '</span>' + dist + '</button>';
    }).join('');

    var legend = '';
    if (S.me) legend += '<span class="badge badge-brand">' + esc(S.me.name || '나') + '</span>';
    if (S.partner) legend += '<span class="badge badge-info">' + esc(S.partner.name || '상대') + '</span>';

    shell('' +
      '<p class="eyebrow caption">Type Book</p>' +
      '<h2 class="view-title">16개 동거 캐릭터 도감</h2>' +
      '<p class="view-desc body-md">교류 활성도(E)와 자극 민감도(R), 두 축으로 만든 16개의 동거 유형이에요.<br>좋고 나쁜 유형은 없어요 — 맞추는 방식이 다를 뿐이에요.</p>' +
      (legend ? '<div class="hero-meta" style="justify-content:flex-start;margin-top:16px">' + legend + '</div>' : '') +
      '<div style="margin-top:20px">' + matrixHTML(S.me ? S.me.charId : null, S.partner ? S.partner.charId : null, S.me ? S.me.name : null, S.partner ? S.partner.name : null) + '</div>' +
      '<div class="type-grid" style="margin-top:24px">' + cells + '</div>' +
      '<div class="cta-col"><button class="btn btn-tertiary btn-md" data-action="home" type="button">홈으로</button></div>');
  }

  /* ================= View: 유형 상세 ================= */
  function vTypeDetail() {
    var c = charById(S.typeId);
    if (!c) { go('types'); return; }
    var seq = c.conflictSeq.map(function (s, i) {
      return '<div class="seq-step"><span class="seq-dot">' + (i + 1) + '</span><span class="body-sm">' + esc(s) + '</span></div>' +
        (i < c.conflictSeq.length - 1 ? '<div class="seq-line"></div>' : '');
    }).join('');
    var noteIcon = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>';

    shell('' +
      '<div class="survey-top"><button class="back-btn" data-action="types" type="button" aria-label="도감으로">' +
      '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button>' +
      '<span class="progress-num">유형 도감</span></div>' +
      '<div class="card char-hero result-hero">' +
      '<span class="char-code">' + c.code + '</span>' +
      '<h2 class="char-name">' + esc(c.name) + '</h2>' +
      characterArt(c, false) +
      '<p class="char-quote">' + esc(c.quote) + '</p></div>' +
      '<div class="card" style="margin-top:16px"><h4 class="card-title">같이 살면 이런 사람</h4>' +
      '<ul class="trait-list">' + c.traits.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
      '<div class="note-box ' + (c.note.type === 'warn' ? 'warn' : c.note.type === 'good' ? 'good' : 'info') + '" style="margin-top:16px">' + noteIcon + '<span>' + esc(c.note.text) + '</span></div></div>' +
      '<div class="card" style="margin-top:16px"><h4 class="card-title">동거인이 보게 되는 모습</h4>' +
      '<div class="view-vs">' +
      '<div class="vs-side"><span class="vs-label">본인 생각</span>' + esc(c.selfView) + '</div>' +
      '<span class="vs-mark">↔</span>' +
      '<div class="vs-side"><span class="vs-label">동거인에게는</span>' + esc(c.partnerView) + '</div></div></div>' +
      '<div class="card" style="margin-top:16px"><h4 class="card-title">갈등 시퀀스</h4><div class="seq">' + seq + '</div></div>' +
      '<div class="card" style="margin-top:16px"><h4 class="card-title">사용설명서</h4>' +
      '<div class="do-grid">' +
      '<div class="do-col do"><h5>DO</h5><ul>' + c.dos.map(function (t) { return '<li>· ' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="do-col dont"><h5>DON&#39;T</h5><ul>' + c.donts.map(function (t) { return '<li>· ' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
      '</div></div>' +
      '<div class="cta-col"><button class="btn btn-tertiary btn-md" data-action="types" type="button">도감으로 돌아가기</button></div>');
  }

  /* ================= View: 실무 성향 체크 ================= */
  function vLifeCheck() {
    var i = S.lifeQ;
    var q = LIFE_QUESTIONS[i];
    var prev = S.lifeAnswers.find(function (a) { return a.qid === q.id; });

    shell('' +
      '<div class="survey-top">' +
      '<button class="back-btn" data-action="life-prev" type="button" ' + (i === 0 ? 'disabled' : '') + ' aria-label="이전 문항">' +
      '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button>' +
      '<div class="progress"><div class="progress-fill" style="width:' + Math.round(((i + 1) / LIFE_QUESTIONS.length) * 100) + '%"></div></div>' +
      '<span class="progress-num">' + (i + 1) + ' / ' + LIFE_QUESTIONS.length + '</span></div>' +
      '<span class="badge badge-info domain-tag">실무 성향 · ' + esc(q.area) + '</span>' +
      '<h2 class="question-text">' + esc(q.text) + '</h2>' +
      '<div class="opt-list">' +
      q.options.map(function (o, idx) {
        var sel = prev && prev.level === o.level ? ' selected' : '';
        return '<button class="life-opt' + sel + '" data-action="life-answer" data-idx="' + idx + '" type="button">' +
          '<span class="lv-tag">' + esc(o.label) + '</span><span class="lv-text">' + esc(o.text) + '</span></button>';
      }).join('') +
      '</div>' +
      '<p class="survey-notice caption">이 답은 16유형 채점에 영향을 주지 않고, 생활 기준 비교에만 사용돼요.</p>');
  }

  function finishLifeCheck() {
    var life = LIFE_QUESTIONS.map(function (q) {
      var a = S.lifeAnswers.find(function (x) { return x.qid === q.id; });
      var o = q.options[a ? a.optIdx : 0];
      return { qid: q.id, area: q.area, level: o.level, label: o.label };
    });
    var target = S.flow === 'partner' ? 'partner' : 'me';
    if (!S[target]) S[target] = { name: target === 'me' ? '나' : '상대' };
    S[target].life = life;
    save('mateon.' + target, S[target]);
    S.lifeQ = 0; S.lifeAnswers = [];
    go('result');
    showToast('실무 성향이 저장됐어요');
  }

  /* ================= View: 입주 체크리스트 ================= */
  function vChecklist() {
    var total = 0, done = 0;
    CHECKLIST.forEach(function (g) {
      g.items.forEach(function (t, i) {
        total++;
        if (S.checklist[g.cat + ':' + i]) done++;
      });
    });
    S.customChecklist.forEach(function (x) {
      total++;
      if (S.checklist['own:' + x.id]) done++;
    });
    var pctDone = total ? Math.round(done / total * 100) : 0;

    var groups = CHECKLIST.map(function (g) {
      var catDone = g.items.filter(function (t, i) { return S.checklist[g.cat + ':' + i]; }).length;
      return '<div class="check-cat"><h4>' + esc(g.cat) + '</h4><span class="cat-count">' + catDone + '/' + g.items.length + '</span></div>' +
        g.items.map(function (t, i) {
          var key = g.cat + ':' + i;
          var on = !!S.checklist[key];
          return '<button class="rule-item' + (on ? ' checked' : '') + '" data-action="check" data-v="' + esc(key) + '" type="button">' +
            '<span class="rule-check"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>' +
            '<span' + (on ? ' style="text-decoration:line-through;opacity:.6"' : '') + '>' + esc(t) + '</span></button>';
        }).join('');
    }).join('');

    var customDone = S.customChecklist.filter(function (x) { return S.checklist['own:' + x.id]; }).length;
    var customHTML = '<div class="check-cat"><h4>직접 추가한 항목</h4><span class="cat-count">' + customDone + '/' + S.customChecklist.length + '</span></div>' +
      (S.customChecklist.length ? S.customChecklist.map(function (x) {
        var key = 'own:' + x.id;
        var on = !!S.checklist[key];
        return '<div class="rule-item-wrap"><button class="rule-item' + (on ? ' checked' : '') + '" data-action="check" data-v="' + esc(key) + '" type="button">' +
          '<span class="rule-check"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>' +
          '<span' + (on ? ' style="text-decoration:line-through;opacity:.6"' : '') + '>' + esc(x.text) + '</span></button>' +
          armBtn('cl-del', x.id, '삭제', '확인') + '</div>';
      }).join('') : '<p class="body-sm text-muted" style="margin:4px 0 10px">우리집만의 준비 항목이 있으면 직접 추가해 보세요.</p>') +
      '<div class="custom-rule"><input id="cl-custom-in" class="input" maxlength="40" autocomplete="off" placeholder="예: 벌레 퇴치제 사기">' +
      '<button class="btn btn-secondary btn-md" data-action="cl-add" type="button">추가</button></div>';

    shell('' +
      '<p class="eyebrow caption">Move-in Checklist</p>' +
      '<h2 class="view-title">입주 체크리스트</h2>' +
      '<p class="view-desc body-md">함께 사는 집, 시작 전에 챙길 것들을 정리했어요.<br>체크는 이 기기에만 저장돼요.</p>' +
      '<div class="check-progress">' +
      '<div class="progress"><div class="progress-fill" style="width:' + pctDone + '%"></div></div>' +
      '<span class="progress-num">' + pctDone + '%</span></div>' +
      groups + customHTML +
      '<div class="cta-col"><button class="btn btn-tertiary btn-md" data-action="home" type="button">홈으로</button></div>');
  }

  /* ================= 생활 도구 공통 ================= */
  function uid() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function payerName(w) { return w === 'me' ? ((S.me && S.me.name) || '나') : ((S.partner && S.partner.name) || '메이트'); }
  function listPageHead(over, title, desc) {
    return '<p class="app-overline">' + esc(over) + '</p><h1 class="mobile-title">' + esc(title) + '</h1><p class="mobile-subtitle">' + esc(desc) + '</p>';
  }
  function armBtn(act, v, label, armLabel) {
    var armed = S.delArm2 === act + ':' + v;
    return '<button class="' + (armed ? 'btn-danger-text' : 'item-del') + '" data-action="' + act + '" data-v="' + esc(v) + '" type="button">' + (armed ? armLabel : label) + '</button>';
  }

  /* ================= View: 생활비 정산 ================= */
  function settleNet() { return ML.settleNetOf(S.expenses); }
  var SPLIT_MODES = [
    { id: 'equal', label: '반반' },
    { id: 'percent', label: '비율 %' },
    { id: 'exact', label: '정확 금액' },
  ];
  function vSettle() {
    var list = S.expenses.slice().sort(function (a, b) { return b.ts - a.ts; });
    var meP = 0, youP = 0;
    S.expenses.forEach(function (x) { if (x.payer === 'me') meP += x.amount; else youP += x.amount; });
    var net = settleNet();
    var netText = !S.expenses.length ? '아직 기록이 없어요' :
      net === 0 ? '딱 맞게 나눴어요' :
      net > 0 ? esc(payerName('you')) + '님이 ' + esc(payerName('me')) + '님께 ' + fmtWon(net) : esc(payerName('me')) + '님이 ' + esc(payerName('you')) + '님께 ' + fmtWon(-net);

    var months = {};
    list.forEach(function (x) { var k = dateStr(x.ts).slice(0, 7); (months[k] = months[k] || []).push(x); });
    var listHTML = Object.keys(months).sort().reverse().map(function (mk) {
      var sub = months[mk].reduce(function (a, x) { return a + x.amount; }, 0);
      return '<div class="settle-month"><span>' + (+mk.slice(5)) + '월</span><span>' + fmtWon(sub) + '</span></div>' +
        months[mk].map(function (x) {
          var sh = expenseShare(x);
          var shareTag = sh === 0.5 ? '' : ' · ' + Math.round(sh * 100) + ':' + Math.round((1 - sh) * 100);
          return '<div class="settle-row"><span class="settle-cat">' + esc(x.cat || '기타') + '</span>' +
            '<span class="settle-info"><strong>' + esc(x.memo || '지출') + '</strong><small>' + esc(payerName(x.payer)) + ' · ' + fmtDate(x.ts) + shareTag + '</small></span>' +
            '<span class="settle-amt">' + fmtWon(x.amount) + '</span>' + armBtn('exp-del', x.id, '삭제', '확인') + '</div>';
        }).join('');
    }).join('');

    var settledHTML = S.settled.length ? '<details class="card" style="margin-top:16px"><summary>지난 정산 기록 (' + S.settled.length + ')</summary>' +
      S.settled.slice().reverse().map(function (z) {
        return '<div class="settle-row"><span class="settle-info"><strong>' + esc(z.label) + '</strong><small>' + esc(payerName(z.net > 0 ? 'you' : 'me')) + ' → ' + esc(payerName(z.net > 0 ? 'me' : 'you')) + ' ' + fmtWon(Math.abs(z.net)) + '</small></span></div>';
      }).join('') + '</details>' : '';

    shell(listPageHead('LIFE TOOLS', '생활비 정산', '함께 쓴 돈을 기록하고, 누가 얼마를 낼지 계산해요') +
      '<div class="settle-hero"><span>정산하면</span><strong>' + netText + '</strong><p>' + esc(payerName('me')) + ' ' + fmtWon(meP) + ' · ' + esc(payerName('you')) + ' ' + fmtWon(youP) + ' 지출</p></div>' +
      '<div class="card" style="margin-top:16px"><h4 class="card-title">지출 추가</h4>' +
      '<div class="field-group"><label class="field-label" for="exp-memo">내용</label><input id="exp-memo" class="input" maxlength="30" placeholder="예: 쓰레기봉투·세탁세제" autocomplete="off"></div>' +
      '<div class="field-group"><label class="field-label" for="exp-amt">금액</label><input id="exp-amt" class="input" type="number" inputmode="numeric" min="1" max="100000000" placeholder="0" autocomplete="off"><span class="field-unit">원</span></div>' +
      '<div class="field-group"><span class="field-label">낸 사람</span><div class="chip-row">' +
      ['me', 'you'].map(function (w) { return '<button class="chip' + (S.expPayer === w ? ' selected' : '') + '" data-action="exp-payer" data-v="' + w + '" type="button">' + esc(payerName(w)) + '</button>'; }).join('') + '</div></div>' +
      '<div class="field-group"><span class="field-label">나누는 방법</span><div class="chip-row">' +
      SPLIT_MODES.map(function (m) { return '<button class="chip' + (S.splitMode === m.id ? ' selected' : '') + '" data-action="exp-split" data-v="' + m.id + '" type="button">' + m.label + '</button>'; }).join('') + '</div>' +
      (S.splitMode === 'percent' ? '<div class="split-input"><input id="exp-share" class="input" type="number" inputmode="numeric" min="0" max="100" value="50" aria-label="내가 부담하는 비율"><span class="field-unit">%를 ' + esc(payerName('me')) + '이 부담</span></div>' : '') +
      (S.splitMode === 'exact' ? '<div class="split-input"><input id="exp-share" class="input" type="number" inputmode="numeric" min="0" placeholder="0" aria-label="내가 부담하는 금액"><span class="field-unit">원을 ' + esc(payerName('me')) + '이 부담</span></div>' : '') +
      '</div>' +
      '<div class="field-group" style="margin-bottom:0"><span class="field-label">분류</span><div class="chip-row">' +
      EXPENSE_CATS.map(function (c) { return '<button class="chip' + (S.expCat === c ? ' selected' : '') + '" data-action="exp-cat" data-v="' + esc(c) + '" type="button">' + esc(c) + '</button>'; }).join('') + '</div></div>' +
      '<div class="cta-row" style="margin-top:14px"><button class="mobile-primary" data-action="exp-add" type="button">지출 기록하기</button>' +
      '<button class="btn btn-secondary btn-md" data-action="exp-ocr" type="button">영수증 스캔</button></div>' +
      '<input id="exp-receipt" type="file" accept="image/*" capture="environment" hidden></div>' +
      (S.expenses.length ? '<div class="cta-col"><button class="btn btn-secondary btn-md" data-action="exp-copy" type="button">정산 내역 복사</button><button class="btn btn-tertiary btn-md" data-action="exp-settle" type="button">이번 정산 마감하기</button></div>' : '') +
      (listHTML ? '<div class="sec-head" style="margin-top:22px"><h3>지출 내역</h3><span class="badge badge-brand">' + S.expenses.length + '건</span></div>' + listHTML : '<div class="empty-notes" style="margin-top:22px">' + mobileIcon('chat') + '<p>아직 지출 기록이 없어요.<br>첫 공동 지출을 기록해 보세요.</p></div>') +
      settledHTML +
      '<p class="device-note">기록은 이 기기에만 저장돼요. 건별로 나누는 방법(반반·비율·정확 금액)을 정할 수 있어요.</p>');
  }

  /* ================= View: 같이 살 것 (공유 쇼핑리스트) ================= */
  function vShopping() {
    var items = S.shopping.slice().sort(function (a, b) { return (a.done - b.done) || (b.ts - a.ts); });
    var open = items.filter(function (x) { return !x.done; });
    var done = items.filter(function (x) { return x.done; });

    var row = function (x) {
      return '<div class="chore-row' + (x.done ? ' done' : '') + '">' +
        '<button class="chore-check" data-action="shop-done" data-v="' + x.id + '" type="button" aria-pressed="' + x.done + '" aria-label="' + esc(x.name) + ' 샀어요">' +
        '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></button>' +
        '<span class="chore-name">' + esc(x.name) + '</span>' +
        '<span class="chore-who shop">' + esc(x.cat) + '</span>' +
        armBtn('shop-del', x.id, '삭제', '확인') + '</div>';
    };

    var presets = SHOP_PRESETS.filter(function (p) { return !S.shopping.some(function (x) { return x.name === p; }); });

    shell(listPageHead('LIFE TOOLS', '같이 살 것', '장볼 때 필요한 것을 함께 적어두는 목록') +
      '<div class="settle-hero mint"><span>남은 항목</span><strong>' + open.length + '개' + (done.length ? ' · 산 것 ' + done.length + '개' : '') + '</strong>' +
      '<p>메이트와 동기화가 켜져 있으면 목록이 함께 업데이트돼요</p></div>' +
      '<div class="card" style="margin-top:16px"><h4 class="card-title">필요한 것 추가</h4>' +
      '<div class="custom-rule"><input id="shop-in" class="input" maxlength="30" placeholder="예: 휴지, 라면, 행주" autocomplete="off">' +
      '<button class="btn btn-secondary btn-md" data-action="shop-add" type="button">추가</button></div>' +
      '<div class="chip-row" style="margin-top:10px">' + SHOP_CATS.map(function (c) { return '<button class="chip' + (S.shopCat === c ? ' selected' : '') + '" data-action="shop-cat" data-v="' + esc(c) + '" type="button">' + esc(c) + '</button>'; }).join('') + '</div>' +
      (presets.length ? '<div class="chip-row" style="margin-top:10px">' + presets.map(function (p) { return '<button class="chip" data-action="shop-preset" data-v="' + esc(p) + '" type="button">+ ' + esc(p) + '</button>'; }).join('') + '</div>' : '') + '</div>' +
      (open.length ? '<div style="margin:18px 0 6px">' + open.map(row).join('') + '</div>' : '<div class="empty-notes" style="margin-top:18px">' + mobileIcon('chat') + '<p>살 것이 없어요.<br>필요한 게 생기면 바로 적어두세요.</p></div>') +
      (done.length ? '<details class="card" style="margin-top:14px"><summary>산 것 (' + done.length + ')</summary>' + done.map(row).join('') +
        '<button class="btn btn-tertiary btn-md" data-action="shop-clear" type="button" style="margin-top:10px">산 것 모두 지우기</button></details>' : '') +
      '<p class="device-note">목록은 이 기기에 저장되고, 동기화가 켜져 있으면 메이트와 공유돼요.</p>');
  }

  /* ================= View: 러브맵 퀴즈 ================= */
  function lovemapSave() { save('mateon.lovemap', S.lovemap); }
  function vLovemap() {
    var lm = S.lovemap;
    var total = LOVE_MAP_QUESTIONS.length;
    var doneAll = lm.asked >= total;
    var pct = Math.round(lm.asked / total * 100);
    var msg = !lm.asked ? '서로의 세계를 얼마나 아는지 알아봐요' :
      (lm.asked && lm.known / lm.asked >= 0.8) ? '서로를 꽤 잘 알고 있어요!' :
      (lm.known / lm.asked >= 0.5) ? '아는 만큼 더 궁금해지는 사이예요' : '아직 모르는 게 많아요. 더 물어봐요';

    var q = doneAll ? null : LOVE_MAP_QUESTIONS[lm.idx % total];
    shell(listPageHead('PLAY', '러브맵 퀴즈', '메이트의 세계를 얼마나 알고 있는지 맞혀보기') +
      '<div class="settle-hero"><span>' + lm.asked + ' / ' + total + ' 질문</span><strong>' + msg + '</strong>' +
      '<div class="lovemap-bar"><i style="width:' + pct + '%"></i></div></div>' +
      (q ? '<div class="lovemap-card"><span class="lovemap-no">Q' + (lm.asked + 1) + '</span><h3>' + esc(q) + '</h3>' +
        '<p class="body-sm text-muted">먼저 마음속으로 답을 떠올린 뒤, 메이트에게 물어보세요.</p></div>' +
        '<div class="cta-row"><button class="mobile-primary" data-action="lm-know" type="button">맞혔어요</button>' +
        '<button class="btn btn-secondary btn-md" data-action="lm-dont" type="button">몰랐어요</button></div>' +
        '<button class="btn btn-tertiary btn-md" data-action="lm-skip" type="button" style="margin-top:10px">이 질문 건너뛰기</button>'
      : '<div class="empty-notes">' + mobileIcon('heart') + '<p>' + total + '개 질문을 모두 나눴어요.<br>서로를 더 알아가는 데 끝은 없어요.</p>' +
        '<button class="btn btn-secondary btn-md" data-action="lm-reset" type="button">처음부터 다시 하기</button></div>') +
      '<p class="device-note">정답은 없어요 — 질문을 나누는 것 자체가 목적이에요. 진행은 이 기기에 저장돼요.</p>');
  }

  /* ================= View: 역할 분담 ================= */
  function choreState() {
    if (!S.chores || !Array.isArray(S.chores.items)) S.chores = { items: [], anchor: mondayOf(Date.now()), rot: [] };
    return S.chores;
  }
  function choreOwner(i, weekTs) {
    var ch = choreState();
    var off = Math.round((mondayOf(weekTs) - mondayOf(ch.anchor)) / (7 * 86400000));
    return ((ch.rot[i] || 0) + off) % 2 === 0 ? 'me' : 'you';
  }
  function saveChores() { save('mateon.chores', S.chores); }
  function vChores() {
    var ch = choreState();
    var now = Date.now(), wk = isoWeekKey(now);
    var log = S.choreLog[wk] || {};
    var doneCount = ch.items.filter(function (it) { return log[it.id]; }).length;

    var itemsHTML = ch.items.length ? ch.items.map(function (it, i) {
      var who = choreOwner(i, now);
      var done = !!log[it.id];
      return '<div class="chore-row' + (done ? ' done' : '') + '">' +
        '<button class="chore-check" data-action="chore-done" data-v="' + it.id + '" type="button" aria-pressed="' + done + '" aria-label="' + esc(it.name) + ' 완료">' +
        '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></button>' +
        '<span class="chore-name">' + esc(it.name) + '</span>' +
        '<span class="chore-who ' + who + '">' + esc(payerName(who)) + '</span>' +
        armBtn('chore-del', it.id, '삭제', '확인') + '</div>';
    }).join('') : '<div class="empty-notes">' + mobileIcon('chat') + '<p>아직 나눌 집안일이 없어요.<br>아래에서 추가하거나 추천 항목을 눌러보세요.</p></div>';

    var presets = CHORE_PRESETS.filter(function (p) { return !ch.items.some(function (it) { return it.name === p; }); });

    shell(listPageHead('LIFE TOOLS', '역할 분담', '집안일 담당을 정하고, 매주 자동으로 바꿔요') +
      '<div class="settle-hero mint"><span>이번 주 ' + weekRangeLabel(now) + '</span><strong>' + doneCount + ' / ' + ch.items.length + ' 완료</strong>' +
      '<p>매주 월요일마다 담당이 서로 바뀌어요</p></div>' +
      '<div style="margin:18px 0 6px">' + itemsHTML + '</div>' +
      '<div class="card" style="margin-top:16px"><h4 class="card-title">집안일 추가</h4>' +
      '<div class="custom-rule"><input id="chore-in" class="input" maxlength="16" placeholder="예: 화장실 청소" autocomplete="off">' +
      '<button class="btn btn-secondary btn-md" data-action="chore-add" type="button">추가</button></div>' +
      (presets.length ? '<div class="chip-row" style="margin-top:12px">' + presets.map(function (p) { return '<button class="chip" data-action="chore-preset" data-v="' + esc(p) + '" type="button">+ ' + esc(p) + '</button>'; }).join('') + '</div>' : '') + '</div>' +
      (ch.items.length ? '<div class="card" style="margin-top:16px"><h4 class="card-title">다음 주 미리보기</h4>' +
        ch.items.map(function (it, i) { return '<div class="chore-next"><span>' + esc(it.name) + '</span><span>' + esc(payerName(choreOwner(i, now + 7 * 86400000))) + '</span></div>'; }).join('') + '</div>' : '') +
      '<p class="device-note">담당은 매주 월요일에 자동으로 서로 교체돼요. 기록은 이 기기에만 저장돼요.</p>');
  }

  /* ================= View: 우리 일정 ================= */
  function vCalendar() {
    var today = dateStr(Date.now());
    var evs = S.events.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var upcoming = evs.filter(function (e) { return e.date >= today; });
    var past = evs.filter(function (e) { return e.date < today; });

    function row(e, isPast) {
      var d = new Date(e.date + 'T12:00:00');
      var dd = isPast ? '' : (e.date === today ? '<span class="badge badge-brand">오늘</span>' : '');
      return '<div class="event-row' + (isPast ? ' past' : '') + '"><span class="event-date"><b>' + d.getDate() + '</b><i>' + (d.getMonth() + 1) + '월</i></span>' +
        '<span class="event-info"><strong>' + esc(e.title) + '</strong>' + (e.memo ? '<small>' + esc(e.memo) + '</small>' : '') +
        '<small>' + esc(e.who === 'me' ? payerName('me') : e.who === 'you' ? payerName('you') : '함께') + '</small></span>' +
        dd + '<button class="item-del" data-action="ev-ics" data-v="' + e.id + '" type="button">ICS</button>' + armBtn('ev-del', e.id, '삭제', '확인') + '</div>';
    }

    shell(listPageHead('LIFE TOOLS', '우리 일정', '이사일, 정산일, 점검일 같은 중요한 날을 함께 기록해요') +
      '<div class="card" style="margin-top:20px"><h4 class="card-title">일정 추가</h4>' +
      '<div class="field-group"><label class="field-label" for="ev-date">날짜</label><input id="ev-date" class="input" type="date" value="' + today + '"></div>' +
      '<div class="field-group"><label class="field-label" for="ev-title">제목</label><input id="ev-title" class="input" maxlength="30" placeholder="예: 전세 만기일" autocomplete="off"></div>' +
      '<div class="field-group"><label class="field-label" for="ev-memo">메모 (선택)</label><input id="ev-memo" class="input" maxlength="60" placeholder="예: 오후 2시 집주인 연락" autocomplete="off"></div>' +
      '<div class="field-group" style="margin-bottom:0"><span class="field-label">누구의 일정</span><div class="chip-row">' +
      [['both', '함께'], ['me', payerName('me')], ['you', payerName('you')]].map(function (w) {
        return '<button class="chip' + (S.evWho === w[0] ? ' selected' : '') + '" data-action="ev-who" data-v="' + w[0] + '" type="button">' + esc(w[1]) + '</button>';
      }).join('') + '</div></div>' +
      '<button class="mobile-primary" data-action="ev-add" type="button" style="margin-top:14px">일정 추가하기</button></div>' +
      (upcoming.length ? '<div class="sec-head" style="margin-top:22px"><h3>다가오는 일정</h3><span class="badge badge-brand">' + upcoming.length + '</span></div>' + upcoming.map(function (e) { return row(e); }).join('') : '<div class="empty-notes" style="margin-top:22px">' + mobileIcon('chat') + '<p>예정된 일정이 없어요.<br>중요한 날을 추가해 보세요.</p></div>') +
      (past.length ? '<details class="card" style="margin-top:16px"><summary>지난 일정 (' + past.length + ')</summary>' + past.map(function (e) { return row(e, true); }).join('') + '</details>' : '') +
      '<p class="device-note">일정은 이 기기에만 저장돼요. ICS로 내보내면 캘린더 앱에 추가할 수 있어요.</p>');
  }

  /* ================= View: 주간 체크인 ================= */
  function thisCheckin() {
    var wk = isoWeekKey();
    return S.checkins.find(function (c) { return c.week === wk; }) || null;
  }
  function vCheckin() {
    var wk = isoWeekKey();
    var cur = S.checkins.find(function (c) { return c.week === wk; });
    var rules = agreementRules();
    var moodSel = cur ? cur.mood : 0;
    var keptSel = cur ? (cur.kept || []) : [];

    var historyHTML = '';
    var past = S.checkins.filter(function (c) { return c.week !== wk; }).slice(-4).reverse();
    if (past.length) {
      historyHTML = '<div class="sec-head" style="margin-top:22px"><h3>지난 체크인</h3></div>' +
        past.map(function (c) {
          var m = CHECKIN_MOODS.find(function (x) { return x.v === c.mood; });
          return '<div class="checkin-hist"><span class="ch-emoji">' + (m ? m.emoji : '·') + '</span><span><strong>' + esc(c.week) + '</strong><small>' + (m ? esc(m.label) : '') + (c.fix ? ' · ' + esc(c.fix) : '') + '</small></span></div>';
        }).join('');
    }

    shell(listPageHead('LIFE TOOLS', '이번 주 체크인', '일주일에 한 번, 우리 생활이 어땠는지 가볍게 돌아봐요') +
      '<div class="card" style="margin-top:20px"><h4 class="card-title">' + weekRangeLabel(Date.now()) + ' · 이번 주 우리 생활은?</h4>' +
      '<div class="mood-row" role="radiogroup" aria-label="이번 주 기분">' +
      CHECKIN_MOODS.map(function (m) {
        return '<button class="mood-btn' + (moodSel === m.v ? ' on' : '') + '" data-action="ci-mood" data-v="' + m.v + '" type="button" role="radio" aria-checked="' + (moodSel === m.v) + '" aria-label="' + esc(m.label) + '"><span>' + m.emoji + '</span><small>' + esc(m.label) + '</small></button>';
      }).join('') + '</div></div>' +
      (rules.length ? '<div class="card" style="margin-top:14px"><h4 class="card-title">잘 지켜진 우리 규칙</h4>' +
        rules.slice(0, 8).map(function (t, i) {
          var on = keptSel.indexOf(i) >= 0;
          return '<button class="rule-item' + (on ? ' checked' : '') + '" data-action="ci-kept" data-v="' + i + '" type="button" aria-pressed="' + on + '"><span class="rule-check"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span><span>' + esc(t) + '</span></button>';
        }).join('') + '</div>' : '') +
      '<div class="card" style="margin-top:14px"><h4 class="card-title">다음 주에 나누고 싶은 것 (선택)</h4>' +
      '<div class="field-group" style="margin-bottom:0"><input id="ci-fix" class="input" maxlength="80" placeholder="예: 주말엔 같이 청소하기" value="' + esc(cur ? cur.fix || '' : '') + '" autocomplete="off"></div></div>' +
      '<div class="cta-col"><button class="btn btn-primary btn-lg" data-action="ci-save" type="button">' + (cur ? '체크인 수정하기' : '체크인 저장하기') + '</button></div>' +
      historyHTML +
      '<p class="device-note">체크인은 이 기기에만 저장돼요.</p>');
  }

  /* ================= View: 갈등 가이드 ================= */
  var cgTimerId = null;
  function vConflict() {
    var step = S.cgStep;
    var dom = CONFLICT_DOMAINS.find(function (d) { return d.id === S.cgDomain; }) || CONFLICT_DOMAINS[0];
    var mc = S.me ? charById(S.me.charId) : null;
    var yc = S.partner ? charById(S.partner.charId) : null;
    var head = listPageHead('CONFLICT GUIDE', '갈등이 생겼을 때', '감정이 올라올 때일수록 순서가 중요해요') +
      '<div class="cg-steps" aria-label="갈등 대응 단계">' + ['상황 선택', '멈추기', '말하기', '합의하기'].map(function (t, i) {
        return '<span class="cg-step' + (i === step ? ' on' : i < step ? ' done' : '') + '"><i>' + (i < step ? '✓' : i + 1) + '</i>' + t + '</span>';
      }).join('') + '</div>';

    var body = '';
    if (step === 0) {
      body = '<div class="card" style="margin-top:18px"><h4 class="card-title">어떤 일이 있었나요?</h4>' +
        CONFLICT_DOMAINS.map(function (d) {
          return '<button class="conflict-pick' + (S.cgDomain === d.id ? ' on' : '') + '" data-action="cg-domain" data-v="' + d.id + '" type="button"><strong>' + esc(d.title) + '</strong><small>' + esc(d.hint) + '</small></button>';
        }).join('') +
        '<button class="mobile-primary" data-action="cg-next" type="button" style="margin-top:14px">다음 · 잠시 멈추기</button></div>';
    } else if (step === 1) {
      var started = S.cgStart;
      var left = started ? Math.max(0, Math.ceil((started + 30 * 60000 - Date.now()) / 60000)) : 30;
      body = '<div class="card" style="margin-top:18px;text-align:center"><span class="cg-timer" id="cg-timer">' + left + '</span><p class="body-md">분 각자 정리 시간</p>' +
        '<p class="body-sm text-muted" style="margin:14px 0">' + esc(CONFLICT_STEP_TIPS.calm) + '</p>' +
        (mc ? '<div class="note-box info" style="margin-bottom:14px"><span>나의 첫 반응: ' + esc(mc.conflictSeq[0]) + ' → ' + esc(mc.conflictSeq[1] || '') + '</span></div>' : '') +
        (yc ? '<div class="note-box info" style="margin-bottom:14px"><span>' + esc(S.partner.name || '메이트') + '님의 첫 반응: ' + esc(yc.conflictSeq[0]) + ' → ' + esc(yc.conflictSeq[1] || '') + '</span></div>' : '') +
        (started ? '<button class="btn btn-tertiary btn-md" data-action="cg-reset-timer" type="button">타이머 다시 시작</button>' : '<button class="mobile-primary" data-action="cg-timer" type="button">30분 타이머 시작</button>') +
        '<button class="btn btn-primary btn-lg" data-action="cg-next" type="button" style="margin-top:12px">정리됐어요 · 대화 준비</button></div>';
    } else if (step === 2) {
      var sc = CONFLICT_SCENARIOS[S.cgDomain];
      body = '<div class="card" style="margin-top:18px"><h4 class="card-title">이렇게 시작해 보세요</h4>' +
        '<p class="body-sm text-muted" style="margin-bottom:12px">' + esc(CONFLICT_STEP_TIPS.talk) + '</p>' +
        (sc ? '<div class="note-box info" style="margin-bottom:12px"><span><strong>' + esc(sc.title) + '</strong> · ' + esc(sc.prevention) + '</span></div>' : '') +
        '<div class="talk-guide"><span>내가 먼저</span><p>“' + esc('요즘 ' + dom.title.replace(/요$/, ' 것 같아서, 내가 예민한 건지 한번 이야기하고 싶었어') ) + '”</p></div>' +
        (mc && yc ? '<div class="do-grid" style="margin-top:14px"><div class="do-col do"><h5>' + esc(S.me.name || '나') + '에게 맞는 방식</h5><ul>' + yc.dos.map(function (t) { return '<li>· ' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
          '<div class="do-col dont"><h5>' + esc(S.partner.name || '메이트') + '님이 피해줬으면 하는 것</h5><ul>' + mc.donts.map(function (t) { return '<li>· ' + esc(t) + '</li>'; }).join('') + '</ul></div></div>' : '') +
        '<button class="mobile-primary" data-action="cg-next" type="button" style="margin-top:14px">합의하러 가기</button></div>';
    } else {
      body = '<div class="card" style="margin-top:18px"><h4 class="card-title">작은 약속 하나 정하기</h4>' +
        '<p class="body-sm text-muted" style="margin-bottom:12px">' + esc(CONFLICT_STEP_TIPS.agree) + '</p>' +
        '<div class="field-group"><input id="cg-note" class="input" maxlength="80" placeholder="예: 밤 11시 이후엔 이어폰 쓰기" autocomplete="off"></div>' +
        '<div class="cta-col"><button class="btn btn-primary btn-md" data-action="cg-save" type="button">합의 기록하기</button>' +
        '<button class="btn btn-secondary btn-md" data-action="cg-save-rule" type="button">생활규칙으로도 추가</button>' +
        '<button class="btn btn-tertiary btn-md" data-action="cg-restart" type="button">처음으로</button></div></div>' +
        (S.conflictLog.length ? '<div class="sec-head" style="margin-top:20px"><h3>지난 합의</h3></div>' +
          S.conflictLog.slice().reverse().slice(0, 5).map(function (l) {
            return '<div class="checkin-hist"><span><strong>' + esc(l.note) + '</strong><small>' + fmtDate(l.ts) + ' · ' + esc((CONFLICT_DOMAINS.find(function (d) { return d.id === l.domain; }) || {}).title || '') + '</small></span></div>';
          }).join('') : '');
    }
    shell(head + body);
  }

  /* ================= View: 설정 ================= */
  var DATA_ITEMS = [
    { k: 'mateon.me', t: '내 진단 결과' },
    { k: 'mateon.partner', t: '상대 결과' },
    { k: 'mateon.agreement', t: '우리집 합의서' },
    { k: 'mateon.history', t: '진단 이력' },
    { k: 'mateon.checklist', t: '입주 체크리스트' },
    { k: 'mateon.talks', t: '나의 대화 기록' },
    { k: 'mateon.customRules', t: '직접 추가한 규칙' },
    { k: 'mateon.draft.me', t: '진행 중인 설문 (나)' },
    { k: 'mateon.draft.partner', t: '진행 중인 설문 (상대)' },
    { k: 'mateon.shareName', t: '초대 링크 닉네임 설정' },
    { k: 'mateon.activeDraft', t: '진단 이어하기 상태' },
    { k: 'ds-theme', t: '테마 설정' },
    { k: 'mateon.expenses', t: '생활비 지출 기록' },
    { k: 'mateon.settled', t: '지난 정산 기록' },
    { k: 'mateon.chores', t: '역할 분담 목록' },
    { k: 'mateon.choreLog', t: '집안일 완료 기록' },
    { k: 'mateon.events', t: '우리 일정' },
    { k: 'mateon.checkins', t: '주간 체크인' },
    { k: 'mateon.customChecklist', t: '직접 추가한 준비 항목' },
    { k: 'mateon.conflictLog', t: '갈등 합의 기록' },
    { k: 'mateon.shopping', t: '같이 살 것 목록' },
    { k: 'mateon.lovemap', t: '러브맵 퀴즈 진행' },
    { k: 'mateon.tb', t: '동기화 내부 상태' },
    { k: 'mateon.reminders', t: '알림 설정' },
    { k: 'mateon.inviteDays', t: '초대 링크 유효기간' },
    { k: 'mateon.fontSize', t: '글자 크기 설정' },
    { k: 'mateon.seen', t: '앱 소개 확인 여부' },
    { k: 'mateon.sync', t: '동기화 설정' },
  ];
  var BACKUP_KEYS = DATA_ITEMS.map(function (it) { return it.k; });
  var CHECKLIST_KEYS = {};
  CHECKLIST.forEach(function (g) { g.items.forEach(function (t, i) { CHECKLIST_KEYS[g.cat + ':' + i] = true; }); });

  function rawGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function validStoredResult(r) {
    if (!r || typeof r !== 'object' || typeof r.name !== 'string' || r.name.length > 100) return false;
    if (!charById(r.charId) || !charById(r.char2Id)) return false;
    var values = [r.eAvg, r.rAvg];
    if (!r.domains || typeof r.domains !== 'object') return false;
    DOMAINS.forEach(function (d) {
      var v = r.domains[d.id];
      values.push(v && v.e, v && v.r);
    });
    if (r.life && (!Array.isArray(r.life) || r.life.length > LIFE_QUESTIONS.length || !r.life.every(function (x) {
      return x && typeof x.area === 'string' && x.area.length <= 30 && typeof x.label === 'string' && x.label.length <= 30 && x.level >= 1 && x.level <= 3;
    }))) return false;
    return values.every(function (v) { return typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 4; });
  }

  function validAgreement(ag) {
    return !!(ag && typeof ag === 'object' && Array.isArray(ag.rules) && ag.rules.length > 0 && ag.rules.length <= 60 &&
      ag.rules.every(function (t) { return typeof t === 'string' && t.length > 0 && t.length <= 80; }) &&
      typeof ag.me === 'string' && ag.me.length <= 100 && typeof ag.partner === 'string' && ag.partner.length <= 100 &&
      (!ag.meCharId || charById(ag.meCharId)) && (!ag.partnerCharId || charById(ag.partnerCharId)) &&
      (!ag.date || typeof ag.date === 'string') && (!ag.updated || typeof ag.updated === 'string') &&
      (!ag.rev || (Number.isInteger(ag.rev) && ag.rev >= 1)) && (!ag.ts || typeof ag.ts === 'number'));
  }

  function validHistoryEntry(h) {
    return !!(h && typeof h === 'object' && charById(h.charId) &&
      typeof h.eAvg === 'number' && h.eAvg >= 1 && h.eAvg <= 4 &&
      typeof h.rAvg === 'number' && h.rAvg >= 1 && h.rAvg <= 4 &&
      (!h.name || typeof h.name === 'string') && (!h.ts || typeof h.ts === 'number'));
  }

  function validBackupValue(key, value) {
    if (key === 'mateon.me' || key === 'mateon.partner') return validStoredResult(value);
    if (key === 'mateon.agreement') return validAgreement(value);
    if (key === 'mateon.history') return Array.isArray(value) && value.length <= 10 && value.every(validHistoryEntry);
    if (key === 'mateon.checklist') {
      return !!(value && typeof value === 'object' && !Array.isArray(value) &&
        Object.keys(value).every(function (k) { return CHECKLIST_KEYS[k] && typeof value[k] === 'boolean'; }));
    }
    if (key === 'mateon.talks') {
      return !!(value && typeof value === 'object' && !Array.isArray(value) &&
        Object.keys(value).every(function (k) {
          var i = +k, n = value[k];
          return Number.isInteger(i) && HOME_TALKS[i] && n && typeof n.text === 'string' && n.text.length <= 500 && (!n.ts || typeof n.ts === 'number');
        }));
    }
    if (key === 'mateon.customRules') return Array.isArray(value) && value.length <= 50 && value.every(function (t) { return typeof t === 'string' && t.length > 0 && t.length <= 60; });
    if (key === 'mateon.draft.me' || key === 'mateon.draft.partner') {
      return isValidDraft(value) && (!value.invite || !!decodeResult(value.invite));
    }
    if (key === 'mateon.shareName') return typeof value === 'boolean';
    if (key === 'mateon.activeDraft') return value === 'me' || value === 'partner';
    if (key === 'ds-theme') return value === 'light' || value === 'dark';
    if (key === 'mateon.expenses') return Array.isArray(value) && value.length <= 500 && value.every(function (x) {
      return x && typeof x.id === 'string' && x.id.length <= 24 && typeof x.ts === 'number' &&
        (x.payer === 'me' || x.payer === 'you') && typeof x.amount === 'number' && x.amount > 0 && x.amount <= 100000000 &&
        typeof x.memo === 'string' && x.memo.length <= 40 && typeof x.cat === 'string' && x.cat.length <= 12 &&
        (x.share === undefined || (typeof x.share === 'number' && x.share >= 0 && x.share <= 1));
    });
    if (key === 'mateon.settled') return Array.isArray(value) && value.length <= 200 && value.every(function (z) {
      return z && typeof z.ts === 'number' && typeof z.label === 'string' && z.label.length <= 40 && typeof z.net === 'number' && Number.isFinite(z.net);
    });
    if (key === 'mateon.chores') return !!(value && typeof value === 'object' && typeof value.anchor === 'number' &&
      Array.isArray(value.items) && value.items.length <= 30 && value.items.every(function (it) { return it && typeof it.id === 'string' && it.id.length <= 24 && typeof it.name === 'string' && it.name.length > 0 && it.name.length <= 20; }) &&
      Array.isArray(value.rot) && value.rot.length <= 30 && value.rot.every(function (n) { return n === 0 || n === 1; }));
    if (key === 'mateon.choreLog') return !!(value && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).every(function (k) {
        var log = value[k];
        return /^\d{4}-\d{2}-\d{2}$/.test(k) && log && typeof log === 'object' && !Array.isArray(log) &&
          Object.keys(log).every(function (id) { return typeof log[id] === 'boolean'; });
      }));
    if (key === 'mateon.events') return Array.isArray(value) && value.length <= 300 && value.every(function (e) {
      return e && typeof e.id === 'string' && e.id.length <= 24 && /^\d{4}-\d{2}-\d{2}$/.test(e.date) &&
        typeof e.title === 'string' && e.title.length > 0 && e.title.length <= 30 &&
        (!e.memo || (typeof e.memo === 'string' && e.memo.length <= 60)) &&
        (e.who === 'me' || e.who === 'you' || e.who === 'both');
    });
    if (key === 'mateon.checkins') return Array.isArray(value) && value.length <= 60 && value.every(function (c) {
      return c && /^\d{4}-W\d{2}$/.test(c.week) && c.mood >= 1 && c.mood <= 5 &&
        (!c.kept || (Array.isArray(c.kept) && c.kept.length <= 20 && c.kept.every(function (i) { return Number.isInteger(i) && i >= 0; }))) &&
        (!c.fix || (typeof c.fix === 'string' && c.fix.length <= 80)) && typeof c.ts === 'number';
    });
    if (key === 'mateon.customChecklist') return Array.isArray(value) && value.length <= 50 && value.every(function (x) {
      return x && typeof x.id === 'string' && x.id.length <= 24 && typeof x.text === 'string' && x.text.length > 0 && x.text.length <= 40;
    });
    if (key === 'mateon.conflictLog') return Array.isArray(value) && value.length <= 100 && value.every(function (l) {
      return l && typeof l.ts === 'number' && typeof l.note === 'string' && l.note.length > 0 && l.note.length <= 80 && typeof l.domain === 'string' && l.domain.length <= 2;
    });
    if (key === 'mateon.shopping') return Array.isArray(value) && value.length <= 200 && value.every(function (x) {
      return x && typeof x.id === 'string' && x.id.length <= 24 && typeof x.name === 'string' && x.name.length > 0 && x.name.length <= 30 &&
        SHOP_CATS.indexOf(x.cat) !== -1 && typeof x.done === 'boolean' && typeof x.ts === 'number';
    });
    if (key === 'mateon.lovemap') return !!(value && typeof value === 'object' &&
      Number.isInteger(value.idx) && value.idx >= 0 && value.idx <= LOVE_MAP_QUESTIONS.length &&
      Number.isInteger(value.known) && value.known >= 0 && Number.isInteger(value.asked) && value.asked >= 0 &&
      (!value.askedIdx || (Array.isArray(value.askedIdx) && value.askedIdx.length <= LOVE_MAP_QUESTIONS.length && value.askedIdx.every(function (i) { return Number.isInteger(i); }))));
    if (key === 'mateon.tb') return Array.isArray(value);
    if (key === 'mateon.reminders') return !!(value && typeof value === 'object' && typeof value.checkin === 'boolean' && typeof value.agreement === 'boolean');
    if (key === 'mateon.inviteDays') return value === 1 || value === 7 || value === 30;
    if (key === 'mateon.fontSize') return value === 'normal' || value === 'large';
    if (key === 'mateon.seen') return value === true;
    if (key === 'mateon.sync') return !!(value && typeof value === 'object' && typeof value.endpoint === 'string' && value.endpoint.length <= 200 &&
      typeof value.room === 'string' && value.room.length <= 64 && (value.slot === 'a' || value.slot === 'b') && (!value.token || (typeof value.token === 'string' && value.token.length <= 200)));
    return false;
  }

  function buildBackup() {
    var data = {};
    BACKUP_KEYS.forEach(function (key) {
      var raw = rawGet(key);
      if (raw === null) return;
      if (key === 'ds-theme') { data[key] = raw; return; }
      try { data[key] = JSON.parse(raw); } catch (e) { /* malformed values are not exported */ }
    });
    return {
      app: 'MATE:ON', schema: 1,
      appId: appConfig().appId,
      version: appConfig().version,
      exportedAt: new Date().toISOString(),
      data: data
    };
  }

  function parseBackup(text) {
    if (typeof text !== 'string' || text.length > 524288) return null;
    try {
      var payload = JSON.parse(text);
      if (!payload || payload.app !== 'MATE:ON' || payload.schema !== 1 || !payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) return null;
      var keys = Object.keys(payload.data);
      if (keys.some(function (k) { return BACKUP_KEYS.indexOf(k) < 0; })) return null;
      if (keys.some(function (k) { return !validBackupValue(k, payload.data[k]); })) return null;
      var clean = {};
      keys.forEach(function (k) { clean[k] = payload.data[k]; });
      return clean;
    } catch (e) { return null; }
  }

  function hydrateStateFromStorage() {
    S.me = load('mateon.me');
    S.partner = load('mateon.partner');
    S.agreement = load('mateon.agreement');
    S.history = load('mateon.history') || [];
    S.checklist = load('mateon.checklist') || {};
    S.customRules = load('mateon.customRules') || [];
    S.shareName = load('mateon.shareName') !== false;
    S.expenses = load('mateon.expenses') || [];
    S.settled = load('mateon.settled') || [];
    S.chores = load('mateon.chores');
    S.choreLog = load('mateon.choreLog') || {};
    S.events = load('mateon.events') || [];
    S.checkins = load('mateon.checkins') || [];
    S.customChecklist = load('mateon.customChecklist') || [];
    S.conflictLog = load('mateon.conflictLog') || [];
    var rm = load('mateon.reminders');
    S.reminders = { checkin: !rm || rm.checkin !== false, agreement: !rm || rm.agreement !== false };
    S.inviteDays = load('mateon.inviteDays') || 7;
    S.fontSize = load('mateon.fontSize') === 'large' ? 'large' : 'normal';
    applyFontSize();
    S.seen = load('mateon.seen') === true;
    S.syncCfg = load('mateon.sync');
    S.invite = null; S.pendingPartner = null; S.connectionInput = '';
    S.flow = 'me'; S.q = 0; S.answers = [];
    S.profile = { name: '', relation: '', stage: '' };
    S.checkedRules = []; S.rulesReady = false; S.signs = { me: false, partner: false };
    S.lifeQ = 0; S.lifeAnswers = []; S.typeId = null; S.viewPair = null;
    S.resetArm = false; S.delArm = null; S.delArm2 = null;
    S.cgStep = 0; S.cgDomain = 'D';
    setTheme(rawGet('ds-theme') === 'dark' ? 'dark' : 'light');
    restoreDraft(load('mateon.activeDraft') || 'me');
  }

  function applyBackupData(data) {
    if (!data || Object.keys(data).some(function (k) { return !validBackupValue(k, data[k]); })) return false;
    BACKUP_KEYS.forEach(remove);
    Object.keys(data).forEach(function (key) {
      if (key === 'ds-theme') {
        try { localStorage.setItem(key, data[key]); } catch (e) { /* ignore */ }
      } else save(key, data[key]);
    });
    hydrateStateFromStorage();
    return true;
  }

  function backupFilename() {
    var d = new Date();
    var stamp = String(d.getFullYear()) + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    return 'mateon-backup-' + stamp + '.json';
  }

  function exportBackup() {
    var text = JSON.stringify(buildBackup(), null, 2);
    if (window.MateNative) {
      window.MateNative.shareFile(backupFilename(), text, true).catch(function () { showToast('백업 파일 공유가 완료되지 않았어요'); });
      return;
    }
    if (window.Blob && window.URL && window.URL.createObjectURL) {
      var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = backupFilename();
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      showToast('백업 파일을 내려받았어요');
      return;
    }
    copyText(text, '백업 JSON을 복사했어요');
  }

  function importBackupText(text) {
    var data = parseBackup(text);
    if (!data) return false;
    applyBackupData(data);
    showToast('백업 데이터를 복원했어요');
    go('home');
    return true;
  }

  function readBackupFile(file) {
    if (!file) return;
    if (file.size > 524288) { showToast('백업 파일이 너무 커요'); return; }
    function done(text) {
      if (!importBackupText(text)) showToast('MATE:ON 백업 파일이 아니에요');
    }
    if (typeof file.text === 'function') { file.text().then(done).catch(function () { showToast('백업 파일을 읽지 못했어요'); }); return; }
    var reader = new FileReader();
    reader.onload = function () { done(reader.result); };
    reader.onerror = function () { showToast('백업 파일을 읽지 못했어요'); };
    reader.readAsText(file, 'utf-8');
  }

  function vSettings() {
    var shareOn = S.shareName !== false;
    var rows = DATA_ITEMS.map(function (it) {
      var has = it.k === 'ds-theme' ? rawGet(it.k) !== null : !!load(it.k);
      var armed = S.delArm === it.k;
      return '<div class="set-row"><div class="sr-info"><strong class="body-sm">' + esc(it.t) + '</strong></div>' +
        '<span class="sr-state">' + (has ? '저장됨' : '없음') + '</span>' +
        (has ? '<button class="btn ' + (armed ? 'btn-danger-text' : 'btn-tertiary') + ' btn-sm" data-action="del-data" data-v="' + it.k + '" type="button">' + (armed ? '삭제 확인' : '삭제') + '</button>' : '') +
        '</div>';
    }).join('');

    var meRow = S.me ? (function () {
      var c = charById(S.me.charId);
      return '<div class="card resume-card">' +
        '<span class="avatar">' + esc((S.me.name || '나')[0]) + '</span>' +
        '<div class="resume-info"><strong class="body-sm">' + esc(S.me.name || '나') + '님의 결과</strong>' +
        '<p class="caption text-muted">' + esc(c.name) + ' (' + c.code + ')</p></div>' +
        '<button class="btn btn-secondary btn-sm" data-action="result" type="button">보기</button></div>';
    })() : '';

    var chev = '<svg aria-hidden="true" class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';

    shell('' +
      '<p class="eyebrow caption">Settings</p>' +
      '<h2 class="view-title">설정</h2>' +
      '<p class="view-desc body-md">데이터는 서버가 아니라 이 기기의 브라우저에만 저장돼요.<br>지우면 이 기기에서 완전히 사라져요.</p>' +
      meRow +
      '<div class="sec-head" style="margin-top:20px"><h3>공유</h3></div>' +
      '<div class="card">' +
      '<p class="body-sm text-muted" style="margin-bottom:4px">초대 링크에 닉네임을 포함할지 선택할 수 있어요.</p>' +
      '<button class="share-opt' + (shareOn ? ' on' : '') + '" data-action="share-name" type="button" aria-pressed="' + shareOn + '">' +
      '<span class="share-opt-dot"></span>닉네임 포함 ' + (shareOn ? '켜짐' : '꺼짐') + '</button>' +
      '<div class="cta-col" style="margin-top:16px"><button class="btn btn-tertiary btn-md" data-action="share-home" type="button">친구에게 MATE:ON 공유</button></div>' +
      '</div>' +
      '<div class="sec-head" style="margin-top:20px"><h3>알림·화면</h3></div>' +
      '<div class="card">' +
      '<button class="share-opt' + (S.reminders.checkin ? ' on' : '') + '" data-action="rem-checkin" type="button" aria-pressed="' + S.reminders.checkin + '">' +
      '<span class="share-opt-dot"></span>주간 체크인 알림 ' + (S.reminders.checkin ? '켜짐' : '꺼짐') + '</button>' +
      '<button class="share-opt' + (S.reminders.agreement ? ' on' : '') + '" data-action="rem-agree" type="button" aria-pressed="' + S.reminders.agreement + '">' +
      '<span class="share-opt-dot"></span>합의 점검일 알림 ' + (S.reminders.agreement ? '켜짐' : '꺼짐') + '</button>' +
      '<p class="caption text-muted" style="margin-top:10px">앱에 설치된 경우에만 알림이 와요. 웹에서는 홈 배너로 안내해요.</p>' +
      '</div>' +
      '<div class="sec-head" style="margin-top:20px"><h3>글자 크기</h3></div>' +
      '<div class="card"><div class="chip-row">' +
      '<button class="chip' + (S.fontSize === 'normal' ? ' selected' : '') + '" data-action="font-size" data-v="normal" type="button">보통</button>' +
      '<button class="chip' + (S.fontSize === 'large' ? ' selected' : '') + '" data-action="font-size" data-v="large" type="button">크게</button>' +
      '</div></div>' +
      '<div class="sec-head" style="margin-top:20px"><h3>메이트 동기화 (실험적)</h3></div>' +
      '<div class="card">' + syncCardHTML() + '</div>' +
      '<div class="sec-head" style="margin-top:20px"><h3>백업</h3></div>' +
      '<div class="card backup-card">' +
      '<p class="body-sm text-muted">이 기기의 진단, 합의서, 체크리스트, 대화 기록을 JSON 파일로 옮길 수 있어요. 개인 정보가 포함되니 안전한 곳에 보관해 주세요.</p>' +
      '<div class="backup-actions">' +
      '<button class="btn btn-secondary btn-md" data-action="backup-export" type="button">백업 파일 내보내기</button>' +
      '<button class="btn btn-tertiary btn-md" data-action="backup-import" type="button">백업 파일 불러오기</button>' +
      '<input id="backup-file" class="backup-file" type="file" accept="application/json,.json" aria-label="MATE:ON 백업 파일 선택">' +
      '</div>' +
      '<p class="caption text-muted">복원하면 현재 기기의 MATE:ON 데이터가 백업 파일 내용으로 바뀌어요.</p>' +
      '</div>' +
      '<div class="sec-head" style="margin-top:20px"><h3>데이터 관리</h3></div>' +
      '<div class="set-group">' + rows + '</div>' +
      '<div style="text-align:center;margin-top:16px">' +
      '<button class="btn-danger-text" data-action="reset-all" type="button">' +
      (S.resetArm ? '한 번 더 누르면 모든 데이터가 삭제됩니다' : '모든 데이터 삭제') + '</button></div>' +
      '<div class="sec-head" style="margin-top:20px"><h3>약관 및 정보</h3></div>' +
      '<div class="set-group">' +
      '<button class="set-link" data-action="privacy" type="button">개인정보처리방침' + chev + '</button>' +
      '<button class="set-link" data-action="terms" type="button">서비스 이용약관' + chev + '</button>' +
      '<button class="set-link" data-action="tutorial" type="button">앱 소개 다시 보기' + chev + '</button>' +
      '<button class="set-link" data-action="app-tour" type="button">기능 둘러보기' + chev + '</button>' +
      (window.MateNative ? '<button class="set-link" data-action="app-update" type="button">앱 업데이트 확인' + chev + '</button>' : '') +
      '</div>' +
      '<p class="caption text-muted" style="text-align:center;margin-top:24px">MATE:ON v' + esc(appConfig().version) + ' · ' + esc(appConfig().appId) + '</p>');
  }

  /* ================= View: 개인정보처리방침 / 이용약관 (MVP) ================= */
  function docShell(title, eyebrow, dateStr, body) {
    shell('' +
      '<div class="survey-top"><button class="back-btn" data-action="settings" type="button" aria-label="설정으로">' +
      '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button>' +
      '<span class="progress-num">' + esc(eyebrow) + '</span></div>' +
      '<h2 class="view-title">' + esc(title) + '</h2>' +
      '<div class="card doc-body" style="margin-top:16px"><p class="doc-date">' + esc(dateStr) + '</p>' + body + '</div>');
  }

  function vPrivacy() {
    docShell('개인정보처리방침', 'Privacy', '시행일: 2026년 9월 24일 · 버전 0.1 (MVP)',
      '<h4>수집하는 정보</h4>' +
      '<p>MATE:ON은 회원가입 없이 사용할 수 있으며, 다음 정보를 이용자가 직접 입력하거나 진단 과정에서 생성합니다.</p>' +
      '<p>· 닉네임, 관계 유형, 동거 준비 단계<br>· 20문항 성향 진단 응답과 유형 결과<br>· 실무 성향 체크 응답, 직접 추가한 생활규칙, 합의서와 서명 상태, 입주 체크리스트</p>' +
      '<h4>저장 위치</h4>' +
      '<p>모든 정보는 이용자의 기기 브라우저(localStorage)에만 저장됩니다. 별도의 서버로 전송하거나 수집하지 않으며, 운영자가 이용자의 응답 내용을 열람할 수 없습니다.</p>' +
      '<h4>초대 링크와 공유</h4>' +
      '<p>초대 링크에는 닉네임(끄기 가능), 관계 유형, 유형 코드와 성향 수치가 URL 형태로 포함됩니다. 문항별 응답 내용은 포함되지 않습니다. 링크를 가진 사람은 누구나 그 결과를 볼 수 있으므로, 공유 대상을 신중하게 정해 주세요.</p>' +
      '<h4>정보의 이동과 삭제</h4>' +
      '<p>설정 → 백업에서 이 기기의 데이터를 JSON 파일로 내보내고 다시 불러올 수 있습니다. 백업 파일에는 이용자의 진단·합의서·기록이 포함되므로 보관과 공유에 주의해 주세요.</p>' +
      '<p>설정 → 데이터 관리에서 각 항목을 삭제하거나 모든 데이터를 한 번에 삭제할 수 있습니다. 브라우저의 사이트 데이터 삭제 기능으로도 같은 효과를 낼 수 있습니다.</p>' +
      '<h4>쿠키·분석 도구</h4>' +
      '<p>현재 버전은 광고, 분석, 추적 도구를 사용하지 않습니다.</p>' +
      '<h4>문의</h4>' +
      '<p>개인정보 관련 문의는 서비스 내 안내를 참고해 주세요. 이 방침은 MVP 단계의 안내문으로, 서비스가 확장되면 함께 업데이트됩니다.</p>');
  }

  function vTerms() {
    docShell('서비스 이용약관', 'Terms', '시행일: 2026년 9월 24일 · 버전 0.1 (MVP)',
      '<h4>서비스의 성격</h4>' +
      '<p>MATE:ON은 함께 사는 사람들이 서로의 생활 성향을 이해하고 대화할 수 있도록 돕는 참고 도구입니다. 제공되는 진단, 유형, 궁합 리포트, 갈등 예측은 의학적·심리학적·법률적 판단이 아니며, 관계의 적합성을 평가하거나 단정하지 않습니다.</p>' +
      '<h4>우리집 합의서</h4>' +
      '<p>합의서는 생활 규칙을 함께 정리하기 위한 문서 도구이며 법적 효력이 없습니다. 임대차 계약이나 법적 권리·의무는 관련 법령과 전문가 상담을 따르세요.</p>' +
      '<h4>이용자의 책임</h4>' +
      '<p>이용자는 자신의 응답과 결과를 스스로 해석하며, 초대 링크 등 공유 기능 사용 시 공유 범위를 확인할 책임이 있습니다. 타인의 동의 없이 그 사람의 결과를 공유하지 말아 주세요.</p>' +
      '<h4>저장 데이터</h4>' +
      '<p>이용자의 데이터는 기기 브라우저에 저장되며, 기기 변경·브라우저 데이터 삭제 시 복구되지 않을 수 있습니다. 백업 파일의 보관과 복원은 이용자가 직접 관리합니다.</p>' +
      '<h4>서비스 변경</h4>' +
      '<p>현재 버전은 MVP로, 기능과 화면은 예고 없이 변경·중단될 수 있습니다.</p>');
  }

  /* ================= 공유 / 이미지 / ICS ================= */
  function baseURL() {
    return publicBaseURL();
  }

  function assetBaseURL() {
    var base = publicBaseURL();
    return base.slice(-1) === '/' ? base : base.slice(0, base.lastIndexOf('/') + 1);
  }

  // 카카오 JS 키가 설정되면 카카오톡 공유 사용, 아니면 Web Share → 복사 순 fallback
  var KAKAO_APP_KEY = '';
  function shareSmart(title, text, url) {
    if (window.MateNative) {
      window.MateNative.share(title, text, url).catch(function () { showToast('공유가 완료되지 않았어요'); });
      return;
    }
    if (KAKAO_APP_KEY && window.Kakao && window.Kakao.isInitialized()) {
      try {
        window.Kakao.Share.sendDefault({
          objectType: 'feed',
          content: { title: title, description: text, imageUrl: assetBaseURL() + 'assets/og-image.png', link: { webUrl: url, mobileWebUrl: url } },
          buttons: [{ title: '진단 하러가기', link: { webUrl: url, mobileWebUrl: url } }],
        });
        return;
      } catch (e) { /* fallthrough */ }
    }
    if (navigator.share) {
      navigator.share({ title: title, text: text, url: url }).catch(function () { });
    } else {
      copyText(text + '\n' + url, '공유 텍스트가 복사됐어요');
    }
  }

  function shareKakao() {
    if (!KAKAO_APP_KEY) {
      showToast('카카오 공유는 앱 키 설정 후 사용할 수 있어요');
      shareSmart('MATE:ON', '함께 살 준비, 서로를 아는 것부터. 동거 성향 진단 해봐!', baseURL());
      return;
    }
    var s = document.createElement('script');
    s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js';
    s.onload = function () {
      if (!window.Kakao.isInitialized()) window.Kakao.init(KAKAO_APP_KEY);
      shareSmart('MATE:ON', '함께 살 준비, 서로를 아는 것부터.', baseURL());
    };
    document.head.appendChild(s);
  }

  async function saveResultImage() {
    var r = S.flow === 'partner' ? S.partner : S.me;
    if (!r) return;
    var c = charById(r.charId);
    var el = E_LEVELS[eLevel(r.eAvg)], rl = R_LEVELS[rLevel(r.rAvg)];
    showToast('캐릭터 카드를 만들고 있어요');
    if (window.MateScreenshot && document.createElement) {
      try {
        var node = buildResultCardDom(r, c, el, rl);
        document.body.appendChild(node);
        try {
          if (document.fonts && document.fonts.ready) await document.fonts.ready;
          var dataUrl = await MateScreenshot.domToPng(node, { scale: 2 });
          exportDataUrl(dataUrl, 'mateon-' + c.code + '-result.png');
          return;
        } finally { node.remove(); }
      } catch (e) { /* DOM 렌더 실패 시 캔버스 경로로 폴백 */ }
    }
    var art = new Image();
    try {
      await new Promise(function(resolve,reject) { art.onload=resolve; art.onerror=reject; art.src='assets/character-sheet.png'; });
      if(document.fonts && document.fonts.ready) await document.fonts.ready;
    } catch(e) { showToast('캐릭터 이미지를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요'); return; }
    var cv = MateCard.resultCard({
      art: art,
      code: c.code, name: c.name, quote: c.quote,
      ePct: pct(r.eAvg), rPct: pct(r.rAvg),
      eLabel: eLevel(r.eAvg) + ' ' + el.label, rLabel: rLevel(r.rAvg) + ' ' + rl.label,
    });
    exportCard(cv, 'mateon-' + c.code + '-result.png');
  }

  /* 공유용 결과 카드를 DOM으로 만든다 (modern-screenshot → PNG, 540x675 @2x = 1080x1350) */
  function buildResultCardDom(r, c, el, rl) {
    var node = document.createElement('div');
    node.className = 'share-card-dom';
    node.innerHTML =
      '<div class="sc-brand"><img src="assets/logo-symbol.svg" alt="" width="26" height="26"><span>MATE:ON</span></div>' +
      '<div class="sc-art">' + characterArt(c, false, true) + '</div>' +
      '<div class="sc-code">' + esc(c.code) + '</div>' +
      '<h2 class="sc-name">' + esc(c.name) + '</h2>' +
      '<p class="sc-quote">' + esc(c.quote) + '</p>' +
      '<div class="sc-bars">' +
      '<div class="sc-bar"><span>교류 활성도 ' + eLevel(r.eAvg) + ' ' + esc(el.label) + '</span><i><b style="width:' + pct(r.eAvg) + '%"></b></i></div>' +
      '<div class="sc-bar"><span>자극 민감도 ' + rLevel(r.rAvg) + ' ' + esc(rl.label) + '</span><i><b class="blue" style="width:' + pct(r.rAvg) + '%"></b></i></div>' +
      '</div>' +
      '<p class="sc-foot">' + esc(r.name || '나') + '의 동거 캐릭터 · ' + esc(webBaseURL().replace(/^https?:\/\//, '')) + '</p>';
    return node;
  }

  function exportDataUrl(dataUrl, filename) {
    if (window.MateNative) {
      window.MateNative.shareFile(filename, dataUrl.split(',')[1])
        .catch(function () { showToast('이미지 공유가 완료되지 않았어요'); });
      return;
    }
    var a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
    showToast('이미지 다운로드를 시작했어요');
  }

  function saveAgreeImage() {
    var rules = agreementRules();
    var ag = savedAgreementForPair();
    var today = new Date();
    var dateStr = ag && rules.join('\n') === ag.rules.join('\n') ? ag.date : today.getFullYear() + '년 ' + (today.getMonth() + 1) + '월 ' + today.getDate() + '일';
    var cv = MateCard.agreementCard({
      names: (S.me.name || '나') + ' · ' + (S.partner.name || '상대'),
      date: dateStr,
      rules: rules,
    });
    exportCard(cv, 'mateon-agreement.png');
  }

  function exportCard(canvas, filename) {
    if (window.MateNative) {
      window.MateNative.shareFile(filename, canvas.toDataURL('image/png').split(',')[1])
        .catch(function () { showToast('이미지 공유가 완료되지 않았어요'); });
    } else { MateCard.download(canvas, filename); showToast('이미지 다운로드를 시작했어요'); }
  }

  function downloadICS() {
    var d = new Date();
    d.setMonth(d.getMonth() + 1);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    var ymd = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    var ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MATEON//KO',
      'BEGIN:VEVENT',
      'UID:mateon-' + Date.now() + '@mateon',
      'DTSTART;VALUE=DATE:' + ymd,
      'SUMMARY:우리집 생활규칙 점검일 (MATE:ON)',
      'DESCRIPTION:한 달 전 함께 정한 생활규칙을 점검해요. 잘 지켜진 것, 바꾸고 싶은 것을 나눠보세요.',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    if (window.MateNative) {
      window.MateNative.shareFile('mateon-rule-check.ics', ics, true).catch(function () { showToast('캘린더 파일 공유가 완료되지 않았어요'); });
      return;
    }
    var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mateon-rule-check.ics';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    showToast('캘린더 파일이 다운로드됐어요');
  }

  /* ================= 영수증 OCR (tesseract.js, 온디바이스) =================
     tesseract.min.js는 첫 사용 시에만 로드하고, 코어·언어 데이터는
     assets/ocr/ 아래에 벤더링해 두었다(오프라인 동작, 외부 전송 없음). */
  var tessLoading = null;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (tessLoading) return tessLoading;
    tessLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'js/vendor/tesseract.min.js';
      s.onload = function () { window.Tesseract ? resolve(window.Tesseract) : reject(new Error('tesseract missing')); };
      s.onerror = function () { tessLoading = null; reject(new Error('load failed')); };
      document.head.appendChild(s);
    });
    return tessLoading;
  }

  var ocrBusy = false;
  function scanReceipt(file) {
    if (ocrBusy) { showToast('영수증을 읽는 중이에요'); return; }
    if (!file || !/^image\//.test(file.type || '')) { showToast('이미지 파일을 선택해 주세요'); return; }
    ocrBusy = true;
    showToast('영수증을 읽고 있어요. 처음엔 조금 걸릴 수 있어요');
    var prepared = (ML.preprocessReceiptImage || function (f) { return Promise.resolve(f); })(file);
    Promise.all([loadTesseract(), prepared]).then(function (r) {
      var T = r[0], image = r[1];
      return T.createWorker(['kor', 'eng'], 1, {
        workerPath: 'assets/ocr/worker.min.js',
        corePath: 'assets/ocr/tesseract-core-lstm.wasm.js',
        langPath: 'assets/ocr',
        gzip: true,
      }).then(function (worker) { return [worker, image]; });
    }).then(function (pair) {
      var worker = pair[0], image = pair[1];
      return worker.recognize(image).then(function (res) {
        return worker.terminate().then(function () { return res; });
      }, function (err) { return worker.terminate().then(function () { throw err; }); });
    }).then(function (res) {
      var text = res && res.data && res.data.text || '';
      var found = parseReceiptText(text);
      var memoEl = document.getElementById('exp-memo'), amtEl = document.getElementById('exp-amt');
      if (found.amount && amtEl) { amtEl.value = found.amount; amtEl.classList.remove('input-error'); }
      if (found.store && memoEl && !memoEl.value.trim()) memoEl.value = found.store;
      showToast(found.amount ? '금액 ' + fmtWon(found.amount) + '을 읽었어요. 확인 후 기록해 주세요' : '금액을 못 찾았어요. 직접 입력해 주세요');
    }).catch(function () {
      showToast('영수증을 읽지 못했어요. 직접 입력해 주세요');
    }).then(function () { ocrBusy = false; });
  }

  /* ================= 동기화 어댑터 (옵트인) =================
     설정에서 엔드포인트·방 코드를 등록하면, 같은 방 코드를 쓰는 메이트끼리
     슬롯 a/b 문서로 결과·합의서·생활 데이터를 주고받는다.
     백엔드는 GET/PUT JSON 만 지원하면 되는 최소 계약이며
     배포용 Cloudflare Worker 템플릿을 scripts/ 아래에 둔다. */
  function syncOn() { return !!(S.syncCfg && S.syncCfg.endpoint && S.syncCfg.room); }
  function syncURL(slot) {
    var base = S.syncCfg.endpoint.replace(/\/+$/, '');
    return base + '/mateon/' + encodeURIComponent(S.syncCfg.room) + '/' + slot;
  }
  function syncHeaders() {
    var h = { 'Content-Type': 'application/json' };
    if (S.syncCfg.token) h.Authorization = 'Bearer ' + S.syncCfg.token;
    return h;
  }
  /* ---- TinyBase MergeableStore 기반 동기화 ----
     목록 데이터(지출·쇼핑·일정·정산·체크인)는 항목당 한 행,
     문서 데이터(합의서·체크리스트 등)는 키당 한 셀로 두고
     각자 자기 슬롯에 자기 MergeableStore를 PUT, 상대 슬롯을 GET 해 머지한다.
     HLC(하이브리드 논리 시계)로 셀 단위 LWW 병합 → 서버는 저장만 하면 됨.
     TinyBase가 없으면 예전 단일 문서(v1) 형식으로 폴백한다. */
  var SYNC_ITEM_TABLES = [
    { prefix: 'e', key: 'mateon.expenses', prop: 'expenses', id: function (x) { return x.id; }, sort: function (a, b) { return a.ts - b.ts; } },
    { prefix: 'g', key: 'mateon.shopping', prop: 'shopping', id: function (x) { return x.id; }, sort: function (a, b) { return a.ts - b.ts; } },
    { prefix: 'v', key: 'mateon.events', prop: 'events', id: function (x) { return x.id; }, sort: function (a, b) { return a.date < b.date ? -1 : 1; } },
    { prefix: 't', key: 'mateon.settled', prop: 'settled', id: function (x) { return x.ts; }, sort: function (a, b) { return a.ts - b.ts; } },
    { prefix: 'c', key: 'mateon.checkins', prop: 'checkins', id: function (x) { return x.week; }, sort: function (a, b) { return a.week < b.week ? -1 : 1; } },
  ];
  var SYNC_WHOLE_KEYS = [
    'mateon.chores', 'mateon.choreLog', 'mateon.agreement', 'mateon.checklist',
    'mateon.customChecklist', 'mateon.talks', 'mateon.customRules', 'mateon.lovemap',
  ];
  var tbStore = null;
  function tb() {
    if (!window.TinyBase || !TinyBase.createMergeableStore) return null;
    if (tbStore) return tbStore;
    tbStore = TinyBase.createMergeableStore();
    var saved = load('mateon.tb');
    if (saved) { try { tbStore.setMergeableContent(saved); } catch (e) { tbStore = TinyBase.createMergeableStore(); } }
    return tbStore;
  }
  function tbItemPrefix(rid) { var p = rid.split(':')[0]; return SYNC_ITEM_TABLES.some(function (t) { return t.prefix === p; }) ? p : null; }
  /* 로컬 데이터를 MergeableStore 행으로 반영 (삭제는 툼스톤으로 전파) */
  function tbIngest() {
    var s = tb(); if (!s) return false;
    var wanted = {};
    SYNC_ITEM_TABLES.forEach(function (t) {
      (S[t.prop] || []).forEach(function (x) {
        var rid = t.prefix + ':' + t.id(x);
        wanted[rid] = true;
        s.setRow('kv', rid, { d: JSON.stringify(x) });
      });
    });
    s.getRowIds('kv').forEach(function (rid) {
      if (tbItemPrefix(rid) && !wanted[rid]) s.delRow('kv', rid);
    });
    SYNC_WHOLE_KEYS.forEach(function (k) {
      var v = load(k);
      if (v === null || v === undefined) { if (s.getCell('kv', 'w:' + k, 'd') !== undefined) s.delCell('kv', 'w:' + k, 'd', true); }
      else s.setCell('kv', 'w:' + k, 'd', JSON.stringify(v));
    });
    if (S.me && S.syncCfg && S.syncCfg.slot) s.setCell('kv', 'me:' + S.syncCfg.slot, 'd', JSON.stringify(S.me));
    save('mateon.tb', s.getMergeableContent());
    return true;
  }
  function tbApply() {
    var s = tb(); if (!s) return false;
    var changed = false;
    var mySlot = S.syncCfg && S.syncCfg.slot === 'a' ? 'a' : 'b';
    var remoteMe = s.getCell('kv', 'me:' + (mySlot === 'a' ? 'b' : 'a'), 'd');
    if (typeof remoteMe === 'string') {
      try {
        var p = JSON.parse(remoteMe);
        if (validStoredResult(p) && (!S.partner || p.ts > (S.partner.ts || 0))) {
          S.partner = p; save('mateon.partner', p); changed = true;
        }
      } catch (e) { }
    }
    SYNC_WHOLE_KEYS.forEach(function (k) {
      var c = s.getCell('kv', 'w:' + k, 'd');
      if (c === undefined) return;
      var parsed;
      try { parsed = JSON.parse(c); } catch (e) { return; }
      if (!validBackupValue(k, parsed)) return;
      if (JSON.stringify(load(k)) === c) return;
      S[k.slice(7)] = parsed; save(k, parsed); changed = true;
    });
    SYNC_ITEM_TABLES.forEach(function (t) {
      var arr = [];
      s.getRowIds('kv').forEach(function (rid) {
        if (rid.indexOf(t.prefix + ':') !== 0) return;
        var d = s.getCell('kv', rid, 'd');
        if (typeof d !== 'string') return;
        try { arr.push(JSON.parse(d)); } catch (e) { }
      });
      arr.sort(t.sort);
      if (!validBackupValue(t.key, arr)) return;
      if (JSON.stringify(S[t.prop] || []) === JSON.stringify(arr)) return;
      S[t.prop] = arr; save(t.key, arr); changed = true;
    });
    return changed;
  }
  function mergeRemoteContent(content) {
    var s = tb(); if (!s) return false;
    var remote = TinyBase.createMergeableStore();
    try { remote.setMergeableContent(content); } catch (e) { return false; }
    s.merge(remote);
    save('mateon.tb', s.getMergeableContent());
    return tbApply();
  }
  function syncPayload() {
    return {
      me: S.me, partner: null, agreement: S.agreement,
      expenses: S.expenses, settled: S.settled, chores: S.chores,
      events: S.events, checkins: S.checkins, shopping: S.shopping,
      lovemap: S.lovemap, ts: Date.now(),
    };
  }
  var syncTimer = null;
  function scheduleSyncPush() {
    if (!syncOn()) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(syncPush, 2500);
  }
  function syncPush() {
    if (!syncOn() || !S.me) return;
    var body;
    if (tbIngest()) body = JSON.stringify({ v: 2, tb: tb().getMergeableContent() });
    else body = JSON.stringify(syncPayload());
    fetch(syncURL(S.syncCfg.slot), { method: 'PUT', headers: syncHeaders(), body: body })
      .catch(function () { /* 오프라인이면 무시 */ });
  }
  function syncPull() {
    if (!syncOn()) return Promise.resolve(false);
    var other = S.syncCfg.slot === 'a' ? 'b' : 'a';
    return fetch(syncURL(other), { headers: syncHeaders() })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || typeof data !== 'object') return false;
        if (data.tb && window.TinyBase) return mergeRemoteContent(data.tb);
        var changed = false;
        if (data.me && validStoredResult(data.me)) {
          if (!S.partner || data.me.ts > (S.partner.ts || 0)) {
            S.partner = data.me; save('mateon.partner', S.partner);
            changed = true;
          }
        }
        ['expenses', 'settled', 'chores', 'events', 'checkins', 'agreement', 'shopping', 'lovemap'].forEach(function (k) {
          var key = 'mateon.' + k;
          if (data[k] != null && validBackupValue(key, data[k])) {
            var cur = S[k];
            if (JSON.stringify(cur) !== JSON.stringify(data[k])) { S[k] = data[k]; save(key, data[k]); changed = true; }
          }
        });
        return changed;
      })
      .catch(function () { return false; });
  }
  function syncCardHTML() {
    var cfg = S.syncCfg || {};
    var on = syncOn();
    return '<p class="body-sm text-muted" style="margin-bottom:10px">같은 방 코드를 쓰는 메이트와 결과·생활 데이터를 주고받아요. 호스팅된 동기화 서버가 필요해요.</p>' +
      '<div class="field-group"><label class="field-label" for="sync-end">서버 주소</label>' +
      '<input id="sync-end" class="input" type="url" maxlength="200" placeholder="https://your-worker.workers.dev" value="' + esc(cfg.endpoint || '') + '"></div>' +
      '<div class="field-group"><label class="field-label" for="sync-room">방 코드 (메이트와 같은 값)</label>' +
      '<input id="sync-room" class="input" maxlength="40" placeholder="예: dawon-haneul-2026" value="' + esc(cfg.room || '') + '" autocomplete="off"></div>' +
      '<div class="field-group"><label class="field-label" for="sync-token">접근 토큰 (서버에서 발급, 선택)</label>' +
      '<input id="sync-token" class="input" type="password" maxlength="200" placeholder="Bearer 토큰" value="' + esc(cfg.token || '') + '" autocomplete="off">' +
      (window.MateNative && window.MateNative.secureSet ? '<p class="caption text-muted" style="margin-top:6px">토큰은 기기의 암호화 저장소에 보관돼요</p>' : '') + '</div>' +
      '<div class="field-group"><span class="field-label">이 기기의 슬롯</span><div class="chip-row">' +
      '<button class="chip' + ((cfg.slot || 'a') === 'a' ? ' selected' : '') + '" data-action="sync-slot" data-v="a" type="button">슬롯 A</button>' +
      '<button class="chip' + (cfg.slot === 'b' ? ' selected' : '') + '" data-action="sync-slot" data-v="b" type="button">슬롯 B</button>' +
      '</div><p class="caption text-muted" style="margin-top:6px">둘이 같은 슬롯을 쓰면 서로 덮어써요. 보통 먼저 연 사람이 A.</p></div>' +
      '<div class="cta-col">' +
      '<button class="btn btn-secondary btn-md" data-action="sync-save" type="button">' + (on ? '동기화 설정 저장' : '동기화 켜기') + '</button>' +
      (on ? '<button class="btn btn-tertiary btn-md" data-action="sync-now" type="button">지금 주고받기</button>' +
            '<button class="btn btn-tertiary btn-md" data-action="sync-off" type="button">동기화 끄기</button>' : '') +
      '</div>' +
      (on ? '<p class="caption text-muted" style="margin-top:8px">방 코드를 아는 사람만 접근할 수 있어요. 민감한 데이터는 공유하지 마세요.</p>' : '');
  }

  /* ================= 갈등 가이드 타이머 ================= */
  function startCgCountdown() {
    if (cgTimerId) clearInterval(cgTimerId);
    cgTimerId = setInterval(function () {
      var el = document.getElementById('cg-timer');
      if (!el || !S.cgStart) { clearInterval(cgTimerId); cgTimerId = null; return; }
      var left = Math.ceil((S.cgStart + 30 * 60000 - Date.now()) / 60000);
      if (left <= 0) {
        clearInterval(cgTimerId); cgTimerId = null;
        el.textContent = '0';
        var p = el.parentElement ? el.parentElement.querySelector('p') : null;
        showToast('각자 정리 시간이 끝났어요. 이제 차분히 이야기해 보세요');
        render();
        return;
      }
      el.textContent = left;
    }, 15000);
  }

  /* ================= 첫 방문 튜토리얼 ================= */
  function tutorialHTML() {
    if (S.seen) return '';
    var slides = [
      { icon: 'user', title: '나의 동거 성향을 알아봐요', desc: '20문항으로 16가지 생활 캐릭터 중 나의 유형을 발견해요.' },
      { icon: 'heart', title: '메이트와 연결해요', desc: '초대 링크나 QR로 연결하면 두 사람의 리포트가 완성돼요.' },
      { icon: 'home', title: '함께 사는 일상을 만들어요', desc: '합의서, 생활비, 역할 분담, 주간 점검까지 차근차근.' },
    ];
    return '<div class="tutorial-overlay" role="dialog" aria-modal="true" aria-label="MATE:ON 소개">' +
      '<div class="tutorial-card"><p class="app-overline">MATE:ON</p>' +
      slides.map(function (s, i) {
        return '<div class="tut-slide"><span class="tut-icon">' + mobileIcon(s.icon) + '</span><div><strong>' + s.title + '</strong><p>' + s.desc + '</p></div></div>';
      }).join('') +
      '<button class="mobile-primary" data-action="tutorial-close" type="button">시작하기</button>' +
      '<p class="caption text-muted" style="margin-top:10px;text-align:center">설정에서 언제든 다시 볼 수 있어요</p></div></div>';
  }
  function maybeTutorial() {
    if (!document.querySelector) return;
    var overlay = document.querySelector('.tutorial-overlay');
    if (!overlay) return;
    var btn = overlay.querySelector('button');
    if (btn && btn.focus) btn.focus();
  }

  /* ---- 기능 둘러보기: driver.js 스포트라이트 투어 ----
     현재 화면에 존재하는 요소만 스텝으로 잡아 해시 라우팅 SPA에서도 동작 */
  function startTour() {
    if (!window.driver || !window.driver.js || !window.driver.js.driver) {
      showToast('투어 기능을 불러오지 못했어요'); return;
    }
    var defs = [
      { sel: '.app-greeting', title: '오늘의 미션', desc: '진단 진행 상황과 다음 할 일이 여기 모여 있어요.' },
      { sel: '.connection-strip', title: '메이트 연결', desc: '초대 링크·QR로 서로의 결과를 연결해요.' },
      { sel: '.conversation-card', title: '오늘의 대화', desc: '매일 바뀌는 주제로 생각을 나눠보세요.' },
      { sel: '.app-list', title: '생활 도구', desc: '정산·쇼핑·역할 분담·일정·체크인까지, 함께 쓰는 도구 모음이에요.' },
      { sel: '.bottom-nav', title: '빠른 이동', desc: '홈·우리 공간·유형 찾기·설정을 아래에서 오갈 수 있어요.' },
    ];
    var steps = defs.filter(function (d) { return document.querySelector(d.sel); })
      .map(function (d) { return { element: d.sel, popover: { title: d.title, description: d.desc } }; });
    if (!steps.length) { showToast('둘러볼 화면이 없어요. 홈에서 시작해 보세요'); return; }
    var drv = window.driver.js.driver({
      showProgress: true, progressText: '{{current}} / {{total}}',
      nextBtnText: '다음', prevBtnText: '이전', doneBtnText: '완료',
      steps: steps, overlayOpacity: 0.62, popoverClass: 'mateon-driver-pop',
    });
    drv.drive();
  }

  /* ================= Actions ================= */
  function resetSurvey() { S.q = 0; S.answers = []; S.qDir = 'next'; clearDraft(); }

  function finishSurvey() {
    clearDraft();
    var res = scoreAnswers(S.answers);
    var out = {
      name: S.profile.name || (S.flow === 'partner' ? '상대' : '나'),
      relation: S.profile.relation, stage: S.profile.stage,
      eAvg: res.eAvg, rAvg: res.rAvg,
      charId: res.charId, char2Id: res.char2Id,
      conf: res.conf, domains: res.domains, ts: Date.now(),
    };
    // 진단 이력 (재진단 비교용, 최대 5개)
    S.history.push({ ts: out.ts, charId: out.charId, eAvg: out.eAvg, rAvg: out.rAvg, name: out.name });
    if (S.history.length > 5) S.history = S.history.slice(-5);
    save('mateon.history', S.history);

    if (S.flow === 'partner') {
      if (S.invite) {
        // 초대 링크로 들어온 사람이 이 기기의 주인 — 본인을 me로 저장
        S.me = out; save('mateon.me', out);
        S.partner = S.invite; save('mateon.partner', S.invite);
        S.invite = null;
        S.flow = 'me';
      } else {
        // 같은 기기에서 상대가 이어서 진단 — 상대를 partner로 저장
        S.partner = out; save('mateon.partner', out);
        S.flow = 'partner';
      }
      resetRulesForNewPartner();
      go('result');
    } else {
      S.me = out; save('mateon.me', out);
      resetRulesForNewPartner();
      go('result');
    }
  }

  function resultFromCode(code, name) {
    var c = CHARACTERS.find(function (x) { return x.code === code; });
    if (!c) return null;
    var e = +code[1], r = +code[3];
    var domains = {};
    DOMAINS.forEach(function (d) { domains[d.id] = { e: e, r: r }; });
    return {
      name: name || '상대', relation: '', stage: '',
      eAvg: e, rAvg: r, charId: c.id, char2Id: c.id, conf: '직접 입력',
      domains: domains, ts: Date.now(),
    };
  }

  function farthestSample() {
    var myChar = charById(S.me.charId);
    var mb = codeBits(myChar.code);
    var best = null, bestD = -1;
    CHARACTERS.forEach(function (c) {
      var d = hamming(mb, codeBits(c.code));
      if (d > bestD) { bestD = d; best = c; }
    });
    var sm = SAMPLE_RESULTS.partner;
    return {
      name: '샘플 상대', relation: '룸메이트', stage: '고려 중',
      eAvg: +best.code[1], rAvg: +best.code[3],
      charId: best.id, char2Id: best.id, conf: '보통',
      domains: {
        A: { e: +best.code[1], r: +best.code[3] },
        B: { e: +best.code[1], r: +best.code[3] },
        C: { e: +best.code[1], r: +best.code[3] },
        D: { e: +best.code[1], r: +best.code[3] },
        E: { e: +best.code[1], r: +best.code[3] },
      },
      ts: Date.now(),
    };
  }

  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    var act = el.dataset.action;

    if (act === 'home') { S.flow = 'me'; S.invite = null; go('home'); }
    else if (act === 'back') { handleBack(); }
    else if (act === 'theme') {
      var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      setTheme(next);
      showToast(next === 'dark' ? '다크 테마로 전환했어요' : '라이트 테마로 전환했어요');
    }
    else if (act === 'start') {
      S.flow = 'me'; resetSurvey(); S.profile = { name: '', relation: '', stage: '' };
      if (S.invite) S.invite = null;
      go('onboarding');
    }
    else if (act === 'space') { go('space'); }
    else if (act === 'talk-open') { openTalk(el.dataset.talk === undefined ? talkIndex : +el.dataset.talk); }
    else if (act === 'next-talk') {
      var talkY=window.scrollY || 0;
      talkIndex = (talkIndex + 1) % HOME_TALKS.length; render(); window.scrollTo(0,talkY);
      var talkFocus=document.querySelectorAll('[data-action="next-talk"]')[0];
      if(talkFocus) talkFocus.focus({preventScroll:true});
    }
    else if (act === 'demo') {
      S.viewPair = { me: SAMPLE_RESULTS.me, partner: SAMPLE_RESULTS.partner };
      go('report');
    }
    else if (act === 'rel') { S.profile.relation = el.dataset.v; render(); }
    else if (act === 'stage') { S.profile.stage = el.dataset.v; render(); }
    else if (act === 'survey') {
      if (!S.profile.name.trim()) {
        var inp = document.getElementById('pf-name');
        if (inp) { inp.classList.add('input-error'); inp.focus(); }
        showToast('이름 또는 닉네임을 입력해 주세요');
        return;
      }
      resetSurvey(); go('survey');
    }
    else if (act === 'answer') {
      var idx = +el.dataset.idx;
      var q = QUESTIONS[S.q];
      var ex = S.answers.find(function (a) { return a.qid === q.id; });
      if (ex) ex.code = q.options[idx].code;
      else S.answers.push({ qid: q.id, code: q.options[idx].code });
      document.querySelectorAll('.opt-card').forEach(function (b) { b.classList.remove('selected'); });
      el.classList.add('selected');
      if (S.advancing) { saveDraft(); return; }   // 전환 대기 중 답변 변경만 허용
      S.advancing = true;
      saveDraft();
      var answeredFlow=S.flow, answeredList=S.answers, answeredQ=S.q;
      setTimeout(function () {
        S.advancing = false;
        if(currentRoute() !== 'survey' || S.flow !== answeredFlow || S.answers !== answeredList || S.q !== answeredQ) return;
        if (S.q < QUESTIONS.length - 1) { S.q++; S.qDir = 'next'; saveDraft(); render(); }
        else finishSurvey();
      }, 220);
    }
    else if (act === 'prev') { if (S.q > 0) { S.q--; S.qDir = 'prev'; saveDraft(); render(); } }
    else if (act === 'result') { S.flow = 'me'; go('result'); }
    else if (act === 'retry') {
      resetSurvey(); S.flow = 'me';
      S.profile = { name: S.me ? S.me.name : '', relation: S.me ? S.me.relation : '', stage: S.me ? S.me.stage : '' };
      go('onboarding');
    }
    else if (act === 'share') {
      var r = S.flow === 'partner' ? S.partner : S.me;
      var c = charById(r.charId);
      shareSmart('MATE:ON 진단 결과', resultShareText(r, c), inviteURL(r));
    }
    else if (act === 'invite') { go('invite'); }
    else if (act === 'copylink') { copyText(inviteURL(S.me), '초대 링크가 복사됐어요'); }
    else if (act === 'preview-partner') {
      var linkField = document.getElementById('partner-link');
      S.connectionInput = linkField ? linkField.value.trim() : '';
      var dec = resultFromLink(S.connectionInput);
      S.pendingPartner = dec && dec.r ? dec.r : null;
      if (dec && dec.expired) { render(); showToast('만료된 링크예요. 상대에게 새 링크를 요청해 주세요'); return; }
      if (!S.pendingPartner) { render(); showToast('유효한 MATE:ON 초대 링크를 붙여넣어 주세요'); return; }
      render();
    }
    else if (act === 'cancel-partner') { S.pendingPartner = null; S.connectionInput = ''; render(); }
    else if (act === 'confirm-partner') {
      if (!S.me || !S.pendingPartner) return;
      var wasUpdate = !!S.partner;
      try { localStorage.setItem('mateon.partner', JSON.stringify(S.pendingPartner)); }
      catch (err) { showToast('저장하지 못했어요. 기기 저장 공간을 확인해 주세요'); return; }
      S.partner = S.pendingPartner; S.pendingPartner = null; S.connectionInput = '';
      S.flow = 'me'; S.viewPair = null; resetRulesForNewPartner();
      go('report'); showToast(wasUpdate ? '메이트의 최신 결과로 업데이트했어요' : '메이트의 실제 결과와 연결했어요');
      scheduleSyncPush();
    }
    else if (act === 'partner-survey') {
      S.flow = 'partner'; resetSurvey();
      S.profile = { name: '', relation: S.me.relation, stage: S.me.stage };
      go('onboarding');
    }
    else if (act === 'sample') {
      S.partner = farthestSample(); save('mateon.partner', S.partner);
      resetRulesForNewPartner();
      go('report');
      showToast('샘플 상대와 비교한 미리보기예요 · 추천 규칙을 다시 계산했어요');
    }
    else if (act === 'report') { go('report'); }
    else if (act === 'rule') {
      var t = el.dataset.v;
      if (!S.rulesReady) S.checkedRules = agreementRules().slice();
      S.rulesReady = true;
      var i = S.checkedRules.indexOf(t);
      if (i >= 0) S.checkedRules.splice(i, 1); else S.checkedRules.push(t);
      S.signs = { me: false, partner: false };
      render();
    }
    else if (act === 'agreement') { go('agreement'); }
    else if (act === 'restore-agree') {
      var savedAg = savedAgreementForPair();
      if (!savedAg) return;
      S.checkedRules = savedAg.rules.slice();
      S.rulesReady = true;
      S.signs = { me: true, partner: true };
      showToast('저장된 합의서로 되돌렸어요');
      render();
    }
    else if (act === 'sign') {
      var who = el.dataset.who;
      S.signs[who] = !S.signs[who];
      render();
    }
    else if (act === 'save-agree') {
      var today = new Date();
      var todayLabel = today.getFullYear() + '년 ' + (today.getMonth() + 1) + '월 ' + today.getDate() + '일';
      var prevAgreement = savedAgreementForPair();
      var changed = !!(prevAgreement && !sameTextList(S.checkedRules, prevAgreement.rules));
      if (!S.checkedRules.length) { showToast('합의서에 담을 규칙을 한 개 이상 선택해 주세요'); return; }
      S.agreement = {
        rules: S.checkedRules.slice(),
        me: S.me.name, partner: S.partner.name,
        meCharId: S.me.charId, partnerCharId: S.partner.charId,
        date: prevAgreement ? prevAgreement.date : todayLabel,
        updated: prevAgreement && changed ? todayLabel : (prevAgreement ? prevAgreement.updated : null),
        rev: prevAgreement ? (prevAgreement.rev || 1) + (changed ? 1 : 0) : 1,
        ts: today.getTime(),
      };
      save('mateon.agreement', S.agreement);
      showToast(changed ? '합의서 v' + S.agreement.rev + '으로 업데이트했어요' : '우리집 합의서가 저장됐어요');
      render();
    }
    else if (act === 'copy-agree') { copyText(agreementText(), '합의서가 복사됐어요'); }

    /* ---- 신규 기능 ---- */
    else if (act === 'types') { go('types'); }
    else if (act === 'type') { S.typeId = +el.dataset.id; go('type-detail'); }
    else if (act === 'checklist') { go('checklist'); }
    else if (act === 'settle') { go('settle'); }
    else if (act === 'chores') { go('chores'); }
    else if (act === 'calendar') { go('calendar'); }
    else if (act === 'checkin') { go('checkin'); }
    else if (act === 'conflict') { go('conflict'); }
    else if (act === 'check') {
      var checkY=window.scrollY || 0;
      var key = el.dataset.v;
      S.checklist[key] = !S.checklist[key];
      save('mateon.checklist', S.checklist);
      render();
      window.scrollTo(0,checkY);
    }
    else if (act === 'lifecheck') { S.lifeQ = 0; S.lifeAnswers = []; go('lifecheck'); }
    else if (act === 'life-answer') {
      var li = +el.dataset.idx;
      var lq = LIFE_QUESTIONS[S.lifeQ];
      var lex = S.lifeAnswers.find(function (a) { return a.qid === lq.id; });
      if (lex) { lex.optIdx = li; lex.level = lq.options[li].level; }
      else S.lifeAnswers.push({ qid: lq.id, optIdx: li, level: lq.options[li].level });
      document.querySelectorAll('.life-opt').forEach(function (b) { b.classList.remove('selected'); });
      el.classList.add('selected');
      setTimeout(function () {
        if (S.lifeQ < LIFE_QUESTIONS.length - 1) { S.lifeQ++; render(); }
        else finishLifeCheck();
      }, 220);
    }
    else if (act === 'life-prev') { if (S.lifeQ > 0) { S.lifeQ--; render(); } }
    else if (act === 'saveimg') { saveResultImage(); }
    else if (act === 'agree-img') { saveAgreeImage(); }
    else if (act === 'agree-ics') { downloadICS(); }
    else if (act === 'share-home') {
      shareSmart('MATE:ON', '함께 살 준비, 서로를 아는 것부터. 동거 성향 진단 해봐!', baseURL());
    }
    else if (act === 'kakao') { shareKakao(); }
    else if (act === 'add-rule') {
      var cin = document.getElementById('custom-rule-in');
      var v = cin ? cin.value.trim() : '';
      if (!v) { if (cin) cin.focus(); showToast('규칙 내용을 입력해 주세요'); return; }
      if (S.customRules.indexOf(v) < 0) {
        S.customRules.push(v);
        save('mateon.customRules', S.customRules);
      }
      if (!S.rulesReady) S.checkedRules = agreementRules().slice();
      S.rulesReady = true;
      if (S.checkedRules.indexOf(v) < 0) S.checkedRules.push(v);
      S.signs = { me: false, partner: false };
      showToast('우리만의 규칙을 추가했어요');
      render();
    }
    else if (act === 'copy-pair') { copyText(pairURL(), '리포트 링크가 복사됐어요'); }
    else if (act === 'pair-start') {
      S.viewPair = null; S.flow = 'me'; resetSurvey();
      S.profile = { name: '', relation: '', stage: '' };
      go('onboarding');
    }
    else if (act === 'code-connect') {
      var kin = document.getElementById('code-connect-in');
      var kv = kin ? kin.value.trim().toUpperCase() : '';
      var res = /^E[1-4]R[1-4]$/.test(kv) ? resultFromCode(kv) : null;
      if (!res) {
        if (kin) { kin.classList.add('input-error'); kin.focus(); }
        showToast('E1~E4와 R1~R4 조합으로 입력해 주세요 (예: E3R2)');
        return;
      }
      S.partner = res; save('mateon.partner', res);
      resetRulesForNewPartner();
      go('report');
      showToast('유형 코드로 연결했어요 · 추천 규칙을 다시 계산했어요');
    }
    else if (act === 'resume-survey') {
      if (restoreDraft(load('mateon.activeDraft') || 'me')) go('survey');
      else showToast('이어갈 진단이 없어요. 새 진단을 시작해 주세요');
    }
    else if (act === 'share-name') {
      S.shareName = S.shareName === false;
      save('mateon.shareName', S.shareName);
      showToast(S.shareName === false ? '닉네임 없이 링크를 만들어요' : '닉네임을 포함해 링크를 만들어요');
      render();
    }
    else if (act === 'unlink') {
      S.partner = null; remove('mateon.partner');
      S.checkedRules = []; S.rulesReady = false; S.signs = { me: false, partner: false };
      showToast('상대 연결을 해제했어요');
      render();
    }
    else if (act === 'settings') { go('settings'); }
    else if (act === 'privacy') { go('privacy'); }
    else if (act === 'terms') { go('terms'); }
    else if (act === 'backup-export') { exportBackup(); }
    else if (act === 'backup-import') {
      var backupInput = document.getElementById('backup-file');
      if (backupInput) backupInput.click();
    }
    else if (act === 'del-data') {
      var dk = el.dataset.v;
      if (S.delArm !== dk) {
        S.delArm = dk;
        render();
        return;
      }
      S.delArm = null;
      remove(dk);
      if (dk === 'mateon.me') { S.me = null; }
      if (dk === 'mateon.partner') { S.partner = null; S.checkedRules = []; S.rulesReady = false; S.signs = { me: false, partner: false }; }
      if (dk === 'mateon.agreement') { S.agreement = null; S.checkedRules = []; S.rulesReady = false; S.signs = { me: false, partner: false }; }
      if (dk === 'mateon.history') { S.history = []; }
      if (dk === 'mateon.talks') { /* read fresh on render */ }
      if (dk === 'mateon.checklist') { S.checklist = {}; }
      if (dk === 'mateon.customRules') { S.customRules = []; }
      if (dk === 'mateon.shareName') { S.shareName = true; }
      if (dk === 'mateon.expenses') { S.expenses = []; }
      if (dk === 'mateon.settled') { S.settled = []; }
      if (dk === 'mateon.chores') { S.chores = null; }
      if (dk === 'mateon.choreLog') { S.choreLog = {}; }
      if (dk === 'mateon.events') { S.events = []; }
      if (dk === 'mateon.checkins') { S.checkins = []; }
      if (dk === 'mateon.customChecklist') { S.customChecklist = []; }
      if (dk === 'mateon.conflictLog') { S.conflictLog = []; }
      if (dk === 'mateon.reminders') { S.reminders = { checkin: true, agreement: true }; }
      if (dk === 'mateon.inviteDays') { S.inviteDays = 7; }
      if (dk === 'mateon.fontSize') { S.fontSize = 'normal'; applyFontSize(); }
      if (dk === 'mateon.seen') { S.seen = false; }
      if (dk === 'mateon.sync') { S.syncCfg = null; }
      showToast('삭제했어요');
      render();
    }
    /* ---- 생활비 정산 ---- */
    else if (act === 'exp-payer') { S.expPayer = el.dataset.v; render(); }
    else if (act === 'exp-cat') { S.expCat = el.dataset.v; render(); }
    else if (act === 'exp-split') { S.splitMode = el.dataset.v; render(); }
    else if (act === 'exp-ocr') {
      var rec = document.getElementById('exp-receipt');
      if (rec) rec.click();
    }
    else if (act === 'exp-add') {
      var memoEl = document.getElementById('exp-memo'), amtEl = document.getElementById('exp-amt');
      var memo = memoEl ? memoEl.value.trim() : '';
      var amt = amtEl ? Math.round(+String(amtEl.value).replace(/[^\d.]/g, '') || 0) : 0;
      if (!memo) { if (memoEl) { memoEl.classList.add('input-error'); memoEl.focus(); } showToast('어디에 썼는지 적어주세요'); return; }
      if (!amt || amt <= 0 || amt > 100000000) { if (amtEl) { amtEl.classList.add('input-error'); amtEl.focus(); } showToast('금액을 확인해 주세요'); return; }
      var share = 0.5;
      if (S.splitMode !== 'equal') {
        var shareEl = document.getElementById('exp-share');
        var sv = shareEl ? +String(shareEl.value).replace(/[^\d.]/g, '') : NaN;
        if (S.splitMode === 'percent') {
          if (!Number.isFinite(sv) || sv < 0 || sv > 100) { if (shareEl) { shareEl.classList.add('input-error'); shareEl.focus(); } showToast('부담 비율을 0~100 사이로 적어주세요'); return; }
          share = sv / 100;
        } else if (S.splitMode === 'exact') {
          if (!Number.isFinite(sv) || sv < 0 || sv > amt) { if (shareEl) { shareEl.classList.add('input-error'); shareEl.focus(); } showToast('내 부담금은 0~총액 사이로 적어주세요'); return; }
          share = sv / amt;
        }
      }
      var rec2 = { id: uid(), ts: Date.now(), memo: memo, amount: amt, payer: S.expPayer, cat: S.expCat };
      if (share !== 0.5) rec2.share = Math.round(share * 1000) / 1000;
      S.expenses.push(rec2);
      if (S.expenses.length > 500) S.expenses = S.expenses.slice(-500);
      save('mateon.expenses', S.expenses);
      showToast('지출을 기록했어요'); render(); scheduleSyncPush();
    }
    else if (act === 'exp-del') {
      var eid = el.dataset.v;
      if (S.delArm2 !== 'exp-del:' + eid) { S.delArm2 = 'exp-del:' + eid; render(); return; }
      S.delArm2 = null;
      S.expenses = S.expenses.filter(function (x) { return x.id !== eid; });
      save('mateon.expenses', S.expenses); render(); scheduleSyncPush();
    }
    else if (act === 'exp-copy') {
      var meP = 0, youP = 0;
      S.expenses.forEach(function (x) { if (x.payer === 'me') meP += x.amount; else youP += x.amount; });
      var net = settleNet();
      var lines = ['[MATE:ON 생활비 정산]', payerName('me') + ' 지출 ' + fmtWon(meP) + ' / ' + payerName('you') + ' 지출 ' + fmtWon(youP)];
      lines.push(net === 0 ? '정산: 딱 맞게 나눴어요' : '정산: ' + (net > 0 ? payerName('you') + ' → ' + payerName('me') : payerName('me') + ' → ' + payerName('you')) + ' ' + fmtWon(Math.abs(net)));
      lines.push('---');
      S.expenses.slice().sort(function (a, b) { return a.ts - b.ts; }).forEach(function (x) {
        var sh = expenseShare(x);
        var tag = sh === 0.5 ? '' : ' [' + Math.round(sh * 100) + ':' + Math.round((1 - sh) * 100) + ']';
        lines.push(dateStr(x.ts).slice(5) + ' ' + x.memo + ' ' + fmtWon(x.amount) + ' (' + payerName(x.payer) + ')' + tag);
      });
      copyText(lines.join('\n'), '정산 내역을 복사했어요');
    }
    else if (act === 'exp-settle') {
      if (!S.expenses.length) return;
      var netAmt = settleNet();
      S.settled.push({ ts: Date.now(), label: dateStr(Date.now()) + ' 정산 (' + S.expenses.length + '건)', net: netAmt });
      if (S.settled.length > 200) S.settled = S.settled.slice(-200);
      S.expenses = [];
      save('mateon.settled', S.settled); save('mateon.expenses', S.expenses);
      showToast(netAmt === 0 ? '정산을 마감했어요' : '정산할 금액 ' + fmtWon(Math.abs(netAmt)) + ' · 기록을 마감했어요');
      render(); scheduleSyncPush();
    }
    /* ---- 같이 살 것 ---- */
    else if (act === 'shop-cat') { S.shopCat = el.dataset.v; render(); }
    else if (act === 'shop-add' || act === 'shop-preset') {
      var sin = document.getElementById('shop-in');
      var sname = act === 'shop-preset' ? el.dataset.v : (sin ? sin.value.trim() : '');
      if (!sname) { if (sin) { sin.classList.add('input-error'); sin.focus(); } showToast('살 것을 적어주세요'); return; }
      if (sname.length > 30) sname = sname.slice(0, 30);
      if (S.shopping.length >= 200) { showToast('목록이 가득 찼어요. 산 것을 먼저 지워주세요'); return; }
      if (S.shopping.some(function (x) { return x.name === sname && !x.done; })) { showToast('이미 목록에 있어요'); return; }
      S.shopping.push({ id: uid(), name: sname, cat: S.shopCat, done: false, ts: Date.now() });
      save('mateon.shopping', S.shopping);
      showToast('"' + sname + '"을(를) 추가했어요'); render(); scheduleSyncPush();
    }
    else if (act === 'shop-done') {
      var sid = el.dataset.v;
      S.shopping.forEach(function (x) { if (x.id === sid) { x.done = !x.done; x.ts = Date.now(); } });
      save('mateon.shopping', S.shopping); render(); scheduleSyncPush();
    }
    else if (act === 'shop-del') {
      var sid2 = el.dataset.v;
      if (S.delArm2 !== 'shop-del:' + sid2) { S.delArm2 = 'shop-del:' + sid2; render(); return; }
      S.delArm2 = null;
      S.shopping = S.shopping.filter(function (x) { return x.id !== sid2; });
      save('mateon.shopping', S.shopping); render(); scheduleSyncPush();
    }
    else if (act === 'shop-clear') {
      if (S.delArm2 !== 'shop-clear') { S.delArm2 = 'shop-clear'; showToast('한 번 더 누르면 산 것을 모두 지워요'); return; }
      S.delArm2 = null;
      S.shopping = S.shopping.filter(function (x) { return !x.done; });
      save('mateon.shopping', S.shopping); render(); scheduleSyncPush();
    }
    /* ---- 러브맵 퀴즈 ---- */
    else if (act === 'lm-know' || act === 'lm-dont' || act === 'lm-skip') {
      var lm = S.lovemap;
      lm.asked++;
      if (act === 'lm-know') lm.known++;
      lm.askedIdx = lm.askedIdx || [];
      lm.askedIdx.push(lm.idx);
      if (lm.asked >= LOVE_MAP_QUESTIONS.length) { lm.idx = 0; }
      else { do { lm.idx = (lm.idx + 1) % LOVE_MAP_QUESTIONS.length; } while (lm.askedIdx.indexOf(lm.idx) !== -1); }
      lovemapSave();
      if (act === 'lm-know') showToast('서로를 잘 알고 있네요!');
      render();
    }
    else if (act === 'lm-reset') {
      S.lovemap = { idx: 0, known: 0, asked: 0, askedIdx: [] };
      lovemapSave(); render(); showToast('러브맵을 처음부터 다시 시작해요');
    }
    /* ---- 역할 분담 ---- */
    else if (act === 'chore-add') {
      var cin = document.getElementById('chore-in');
      var cname = cin ? cin.value.trim() : '';
      if (!cname) { if (cin) { cin.classList.add('input-error'); cin.focus(); } showToast('집안일 이름을 적어주세요'); return; }
      if (cname.length > 16) cname = cname.slice(0, 16);
      var ch = choreState();
      if (ch.items.length >= 30) { showToast('집안일은 최대 30개까지 추가할 수 있어요'); return; }
      if (ch.items.some(function (it) { return it.name === cname; })) { showToast('이미 있는 항목이에요'); return; }
      ch.items.push({ id: uid(), name: cname });
      ch.rot.push(ch.items.length % 2);
      saveChores(); showToast('집안일을 추가했어요'); render(); scheduleSyncPush();
    }
    else if (act === 'chore-preset') {
      var ch2 = choreState(); var pname = el.dataset.v;
      if (ch2.items.length >= 30 || ch2.items.some(function (it) { return it.name === pname; })) return;
      ch2.items.push({ id: uid(), name: pname });
      ch2.rot.push(ch2.items.length % 2);
      saveChores(); render(); scheduleSyncPush();
    }
    else if (act === 'chore-del') {
      var cid = el.dataset.v;
      if (S.delArm2 !== 'chore-del:' + cid) { S.delArm2 = 'chore-del:' + cid; render(); return; }
      S.delArm2 = null;
      var ch3 = choreState();
      var idx = ch3.items.findIndex(function (it) { return it.id === cid; });
      if (idx >= 0) { ch3.items.splice(idx, 1); ch3.rot.splice(idx, 1); }
      saveChores(); render(); scheduleSyncPush();
    }
    else if (act === 'chore-done') {
      var chid = el.dataset.v; var wk = isoWeekKey();
      if (!S.choreLog[wk]) S.choreLog[wk] = {};
      S.choreLog[wk][chid] = !S.choreLog[wk][chid];
      if (!S.choreLog[wk][chid]) delete S.choreLog[wk][chid];
      save('mateon.choreLog', S.choreLog); render();
    }
    /* ---- 우리 일정 ---- */
    else if (act === 'ev-who') { S.evWho = el.dataset.v; render(); }
    else if (act === 'ev-add') {
      var edEl = document.getElementById('ev-date'), etEl = document.getElementById('ev-title'), emEl = document.getElementById('ev-memo');
      var edate = edEl ? edEl.value : '';
      var etitle = etEl ? etEl.value.trim() : '';
      var ememo = emEl ? emEl.value.trim() : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(edate)) { if (edEl) { edEl.classList.add('input-error'); edEl.focus(); } showToast('날짜를 선택해 주세요'); return; }
      if (!etitle) { if (etEl) { etEl.classList.add('input-error'); etEl.focus(); } showToast('일정 제목을 적어주세요'); return; }
      if (S.events.length >= 300) { showToast('일정은 최대 300개까지 등록할 수 있어요'); return; }
      S.events.push({ id: uid(), date: edate, title: etitle.slice(0, 30), memo: ememo.slice(0, 60), who: S.evWho });
      save('mateon.events', S.events);
      showToast('일정을 추가했어요'); render(); scheduleSyncPush();
    }
    else if (act === 'ev-del') {
      var evid = el.dataset.v;
      if (S.delArm2 !== 'ev-del:' + evid) { S.delArm2 = 'ev-del:' + evid; render(); return; }
      S.delArm2 = null;
      S.events = S.events.filter(function (e2) { return e2.id !== evid; });
      save('mateon.events', S.events); render(); scheduleSyncPush();
    }
    else if (act === 'ev-ics') {
      var ev = S.events.find(function (x) { return x.id === el.dataset.v; });
      if (!ev) return;
      var evd = ev.date.replace(/-/g, '');
      var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MATEON//KO', 'BEGIN:VEVENT',
        'UID:mateon-ev-' + ev.id + '@mateon', 'DTSTART;VALUE=DATE:' + evd,
        'SUMMARY:' + ev.title.replace(/[,;\n]/g, ' ') + ' (MATE:ON)',
        ev.memo ? 'DESCRIPTION:' + ev.memo.replace(/[,;\n]/g, ' ') : '',
        'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
      var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'mateon-event.ics'; a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      showToast('캘린더 파일이 다운로드됐어요');
    }
    /* ---- 주간 체크인 ---- */
    else if (act === 'ci-mood') {
      var wkk = isoWeekKey();
      var cur = thisCheckin();
      if (!cur) { cur = { week: wkk, mood: 0, kept: [], fix: '', ts: Date.now() }; S.checkins.push(cur); }
      cur.mood = +el.dataset.v; cur.ts = Date.now();
      if (S.checkins.length > 60) S.checkins = S.checkins.slice(-60);
      save('mateon.checkins', S.checkins); render();
    }
    else if (act === 'ci-kept') {
      var wkk2 = isoWeekKey();
      var cur2 = thisCheckin();
      if (!cur2) { cur2 = { week: wkk2, mood: 0, kept: [], fix: '', ts: Date.now() }; S.checkins.push(cur2); }
      var ki = +el.dataset.v;
      var pos = cur2.kept.indexOf(ki);
      if (pos >= 0) cur2.kept.splice(pos, 1); else cur2.kept.push(ki);
      save('mateon.checkins', S.checkins); render();
    }
    else if (act === 'ci-save') {
      var wkk3 = isoWeekKey();
      var cur3 = thisCheckin();
      var fixEl = document.getElementById('ci-fix');
      var fixVal = fixEl ? fixEl.value.trim().slice(0, 80) : '';
      if (!cur3) { showToast('이번 주 기분을 먼저 골라주세요'); return; }
      if (!cur3.mood) { showToast('이번 주 기분을 먼저 골라주세요'); return; }
      cur3.fix = fixVal; cur3.ts = Date.now();
      save('mateon.checkins', S.checkins);
      showToast('이번 주 체크인을 저장했어요'); render(); scheduleSyncPush();
    }
    /* ---- 갈등 가이드 ---- */
    else if (act === 'cg-domain') { S.cgDomain = el.dataset.v; render(); }
    else if (act === 'cg-next') { S.cgStep = Math.min(3, S.cgStep + 1); S.cgStart = null; render(); }
    else if (act === 'cg-timer') { S.cgStart = Date.now(); render(); startCgCountdown(); }
    else if (act === 'cg-reset-timer') { S.cgStart = Date.now(); render(); startCgCountdown(); }
    else if (act === 'cg-restart') { S.cgStep = 0; S.cgStart = null; if (cgTimerId) { clearInterval(cgTimerId); cgTimerId = null; } render(); }
    else if (act === 'cg-save' || act === 'cg-save-rule') {
      var noteEl = document.getElementById('cg-note');
      var note = noteEl ? noteEl.value.trim().slice(0, 80) : '';
      if (!note) { if (noteEl) { noteEl.classList.add('input-error'); noteEl.focus(); } showToast('약속 내용을 적어주세요'); return; }
      S.conflictLog.push({ ts: Date.now(), note: note, domain: S.cgDomain });
      if (S.conflictLog.length > 100) S.conflictLog = S.conflictLog.slice(-100);
      save('mateon.conflictLog', S.conflictLog);
      if (act === 'cg-save-rule' && note.length <= 60) {
        if (S.customRules.indexOf(note) < 0) { S.customRules.push(note); save('mateon.customRules', S.customRules); }
        showToast('합의를 기록하고 생활규칙에도 추가했어요');
      } else showToast('합의를 기록했어요');
      S.cgStep = 0; S.cgStart = null;
      if (cgTimerId) { clearInterval(cgTimerId); cgTimerId = null; }
      go('space'); scheduleSyncPush();
    }
    /* ---- 커스텀 체크리스트 ---- */
    else if (act === 'cl-add') {
      var clin = document.getElementById('cl-custom-in');
      var cltext = clin ? clin.value.trim() : '';
      if (!cltext) { if (clin) { clin.classList.add('input-error'); clin.focus(); } showToast('항목을 적어주세요'); return; }
      if (S.customChecklist.length >= 50) { showToast('직접 추가 항목은 최대 50개까지예요'); return; }
      S.customChecklist.push({ id: uid(), text: cltext.slice(0, 40) });
      save('mateon.customChecklist', S.customChecklist);
      render();
    }
    else if (act === 'cl-del') {
      var clid = el.dataset.v;
      if (S.delArm2 !== 'cl-del:' + clid) { S.delArm2 = 'cl-del:' + clid; render(); return; }
      S.delArm2 = null;
      S.customChecklist = S.customChecklist.filter(function (x) { return x.id !== clid; });
      if (S.checklist['own:' + clid]) { delete S.checklist['own:' + clid]; save('mateon.checklist', S.checklist); }
      save('mateon.customChecklist', S.customChecklist); render();
    }
    /* ---- 알림·화면 ---- */
    else if (act === 'rem-checkin') {
      S.reminders.checkin = !S.reminders.checkin;
      save('mateon.reminders', S.reminders); syncNativeReminders();
      showToast(S.reminders.checkin ? '주간 체크인 알림을 켰어요' : '주간 체크인 알림을 껐어요'); render();
    }
    else if (act === 'rem-agree') {
      S.reminders.agreement = !S.reminders.agreement;
      save('mateon.reminders', S.reminders); syncNativeReminders();
      showToast(S.reminders.agreement ? '합의 점검일 알림을 켰어요' : '합의 점검일 알림을 껐어요'); render();
    }
    else if (act === 'font-size') {
      S.fontSize = el.dataset.v === 'large' ? 'large' : 'normal';
      save('mateon.fontSize', S.fontSize); applyFontSize(); render();
    }
    else if (act === 'tutorial') { S.seen = false; render(); showToast('앱 소개를 다시 보여드릴게요'); }
    else if (act === 'tutorial-close') {
      S.seen = true; save('mateon.seen', true); render();
    }
    /* ---- 동기화 ---- */
    else if (act === 'sync-slot') {
      if (!S.syncCfg) S.syncCfg = { endpoint: '', room: '', slot: 'a', token: '' };
      S.syncCfg.slot = el.dataset.v; render();
    }
    else if (act === 'sync-save') {
      var endEl = document.getElementById('sync-end'), roomEl = document.getElementById('sync-room'), tokEl = document.getElementById('sync-token');
      var endV = endEl ? endEl.value.trim() : '';
      var roomV = roomEl ? roomEl.value.trim() : '';
      var tokV = tokEl ? tokEl.value.trim() : '';
      if (!/^https:\/\//.test(endV)) { if (endEl) { endEl.classList.add('input-error'); endEl.focus(); } showToast('https:// 로 시작하는 서버 주소를 입력해 주세요'); return; }
      if (!/^[A-Za-z0-9\-_]{3,40}$/.test(roomV)) { if (roomEl) { roomEl.classList.add('input-error'); roomEl.focus(); } showToast('방 코드는 영문·숫자·-·_ 3~40자로 정해주세요'); return; }
      if (!S.syncCfg) S.syncCfg = { endpoint: '', room: '', slot: 'a', token: '' };
      S.syncCfg.endpoint = endV; S.syncCfg.room = roomV; S.syncCfg.token = tokV;
      if (!S.syncCfg.slot) S.syncCfg.slot = 'a';
      /* 네이티브면 토큰은 Keystore/Keychain에만 두고 로컬스토리지에는 남기지 않는다 */
      if (window.MateNative && window.MateNative.secureSet && tokV) {
        var cfgNoTok = { endpoint: endV, room: roomV, slot: S.syncCfg.slot };
        save('mateon.sync', cfgNoTok);
        window.MateNative.secureSet('sync-token', tokV).catch(function () { });
      } else {
        save('mateon.sync', S.syncCfg);
      }
      showToast('동기화를 켰어요'); render();
      syncPush();
      syncPull().then(function (changed) { if (changed) { showToast('메이트의 최신 데이터를 가져왔어요'); render(); } });
    }
    else if (act === 'sync-now') {
      showToast('동기화 중이에요…');
      syncPush();
      syncPull().then(function (changed) {
        if (changed) { showToast('메이트의 최신 데이터를 가져왔어요'); render(); }
        else showToast('가져올 새 데이터가 없어요');
      });
    }
    else if (act === 'sync-off') {
      S.syncCfg = null; remove('mateon.sync');
      if (window.MateNative && window.MateNative.secureRemove) window.MateNative.secureRemove('sync-token');
      showToast('동기화를 껐어요'); render();
    }
    /* ---- 초대 유효기간 ---- */
    else if (act === 'invite-days') {
      S.inviteDays = +el.dataset.v === 1 ? 1 : +el.dataset.v === 30 ? 30 : 7;
      save('mateon.inviteDays', S.inviteDays); render();
    }
    else if (act === 'share-invite') {
      shareSmart('MATE:ON 메이트 초대', 'MATE:ON에서 동거 성향을 비교해 봐요!', inviteURL(S.me));
    }
    else if (act === 'app-tour') { go('home'); setTimeout(startTour, 350); }
    else if (act === 'app-update') {
      if (window.MateNative && window.MateNative.checkUpdate) {
        showToast('업데이트를 확인해요…');
        window.MateNative.checkUpdate().then(function (msg) { if (msg) showToast(msg); });
      } else showToast('웹 버전은 새로고침하면 최신 상태예요');
    }
    else if (act === 'reset-all') {
      if (!S.resetArm) {
        S.resetArm = true;
        render();
        return;
      }
      S.resetArm = false;
      DATA_ITEMS.forEach(function (it) { remove(it.k); });
      S.me = null; S.partner = null; S.agreement = null; S.history = [];
      S.checklist = {}; S.customRules = []; S.checkedRules = []; S.rulesReady = false;
      S.signs = { me: false, partner: false }; S.shareName = true;
      S.answers = []; S.q = 0; S.invite = null;
      S.pendingPartner = null; S.connectionInput = '';
      S.expenses = []; S.settled = []; S.chores = null; S.choreLog = {};
      S.events = []; S.checkins = []; S.customChecklist = []; S.conflictLog = [];
      S.shopping = []; S.lovemap = { idx: 0, known: 0, asked: 0 }; tbStore = null;
      S.reminders = { checkin: true, agreement: true };
      S.inviteDays = 7; S.fontSize = 'normal'; applyFontSize();
      S.seen = true; S.syncCfg = null; S.delArm2 = null;
      S.cgStep = 0; S.cgDomain = 'D';
      showToast('이 기기의 모든 데이터를 삭제했어요');
      go('home');
    }
  });

  /* ---- 키보드 단축키: 설문 1~4/A~D, 실무체크 1~3 ---- */
  document.addEventListener('keydown', function (e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    var route = currentRoute();
    var n = -1;
    if (/^[1-4]$/.test(e.key)) n = +e.key - 1;
    else if (/^[a-dA-D]$/.test(e.key)) n = e.key.toLowerCase().charCodeAt(0) - 97;
    if (n < 0) {
      if (route === 'survey' && e.key === 'ArrowLeft') { if (S.q > 0) { S.q--; S.qDir = 'prev'; saveDraft(); render(); } }
      return;
    }
    if (route === 'survey') {
      var btns = document.querySelectorAll('.opt-card');
      if (btns[n]) btns[n].click();
    } else if (route === 'lifecheck' && n < 3) {
      var lbtns = document.querySelectorAll('.life-opt');
      if (lbtns[n]) lbtns[n].click();
    }
  });

  // 이름 입력 동기화
  app.addEventListener('input', function (e) {
    if (e.target.id === 'pf-name') S.profile.name = e.target.value;
    if (e.target.id === 'partner-link') {
      S.connectionInput = e.target.value;
      S.pendingPartner = null;
      var confirm = document.querySelectorAll('[data-action="confirm-partner"]')[0];
      if (confirm) confirm.disabled = true;
    }
  });

  app.addEventListener('change', function (e) {
    if (e.target.id === 'exp-receipt') {
      var rf = e.target.files && e.target.files[0];
      e.target.value = '';
      if (rf) scanReceipt(rf);
      return;
    }
    if (e.target.id !== 'backup-file') return;
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    readBackupFile(file);
  });

  /* ================= Router ================= */
  function go(route) {
    if (currentRoute() === route) { render(); return; }
    location.hash = '#/' + route;
  }

  function handleBack() {
    if (talkDialog && talkDialog.open) { talkDialog.close(); return true; }
    var route = currentRoute();
    if (route === 'home') return false;
    if (route === 'survey' && S.q > 0) { S.q--; S.qDir='prev'; saveDraft(); render(); return true; }
    var parents = { survey:'onboarding', 'type-detail':'types', checklist:'space', agreement:'report', privacy:'settings', terms:'settings', lifecheck:'result', settle:'space', shopping:'space', lovemap:'space', chores:'space', calendar:'space', checkin:'space', conflict:'space' };
    go(parents[route] || 'home');
    return true;
  }

  function acceptNativeLink(value) {
    try {
      var url = new URL(value);
      var scheme = appConfig().customScheme + ':';
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        var webUrl = new URL(webBaseURL());
        var basePath = webUrl.pathname.replace(/\/$/, '');
        var pathOk = !basePath || url.pathname === basePath || url.pathname === basePath + '/' || url.pathname.indexOf(basePath + '/') === 0;
        if (url.origin !== webUrl.origin || !pathOk) return false;
        var webInvite = decodeResult(url.searchParams.get('invite') || '');
        var webPair = (url.searchParams.get('pair') || '').split('.');
        if (webInvite) {
          S.invite = webInvite; S.flow = 'partner'; S.q = 0; S.answers = [];
          S.profile = { name:'', relation:'', stage:'' };
          go('onboarding'); return true;
        }
        if (webPair.length === 2) {
          var wa = decodeResult(webPair[0] || ''), wb = decodeResult(webPair[1] || '');
          if (wa && wb) { S.invite = null; S.viewPair = { me:wa, partner:wb }; go('report'); return true; }
        }
        if (!url.search && !url.hash) { go('home'); return true; }
        return false;
      }
      if (url.protocol !== scheme && url.protocol !== 'mateon:') return false;
      if (url.hostname === 'home') { go('home'); return true; }
      var data = url.searchParams.get('data') || '';
      if (url.hostname === 'invite') {
        var invite = decodeResult(data);
        if (!invite) throw new Error('Invalid invite');
        S.invite = invite; S.flow = 'partner'; S.q = 0; S.answers = [];
        S.profile = { name:'', relation:'', stage:'' };
        go('onboarding'); return true;
      }
      if (url.hostname === 'pair') {
        var pair = data.split('.');
        var a = decodeResult(pair[0] || ''), b = decodeResult(pair[1] || '');
        if (pair.length !== 2 || !a || !b) throw new Error('Invalid pair');
        S.invite = null; S.viewPair = { me:a, partner:b }; go('report'); return true;
      }
    } catch (e) { showToast('초대 링크를 확인해 주세요'); }
    return false;
  }

  function currentRoute() {
    var h = location.hash.replace(/^#\/?/, '');
    return h || 'home';
  }

  var ROUTE_TITLES = {
    home: 'MATE:ON — 함께 살 준비, 서로를 아는 것부터',
    onboarding: '시작하기 — MATE:ON',
    survey: '동거 성향 진단 — MATE:ON',
    result: '내 진단 결과 — MATE:ON',
    invite: '상대 초대 — MATE:ON',
    report: '우리 둘 궁합 리포트 — MATE:ON',
    agreement: '우리집 생활 합의서 — MATE:ON',
    types: '16유형 도감 — MATE:ON',
    'type-detail': '유형 상세 — MATE:ON',
    lifecheck: '실무 성향 체크 — MATE:ON',
    checklist: '입주 체크리스트 — MATE:ON',
    space: '우리 공간 — MATE:ON',
    settle: '생활비 정산 — MATE:ON',
    shopping: '같이 살 것 — MATE:ON',
    lovemap: '러브맵 퀴즈 — MATE:ON',
    chores: '역할 분담 — MATE:ON',
    calendar: '우리 일정 — MATE:ON',
    checkin: '주간 체크인 — MATE:ON',
    conflict: '갈등 가이드 — MATE:ON',
    settings: '설정 — MATE:ON',
    privacy: '개인정보처리방침 — MATE:ON',
    terms: '서비스 이용약관 — MATE:ON',
  };

  function render() {
    var route = currentRoute();
    // 초대 링크로 들어온 경우: 진단 전이면 온보딩으로 유도
    if (S.invite && (route === 'home' || route === '')) {
      S.flow = 'partner';
      if (!S.answers.length) S.profile = { name: '', relation: '', stage: '' };
      route = S.answers.length ? 'survey' : 'onboarding';
      history.replaceState(null, '', '#/' + route);
    }
    if (route !== 'report' && S.viewPair) S.viewPair = null;
    if (route !== 'settings') { S.delArm = null; S.resetArm = false; }
    document.title = ROUTE_TITLES[route] || 'MATE:ON';
    switch (route) {
      case 'onboarding': vOnboarding(); break;
      case 'survey': vSurvey(); break;
      case 'result': vResult(); break;
      case 'invite': vInvite(); break;
      case 'report': vReport(); break;
      case 'agreement': vAgreement(); break;
      case 'types': vTypes(); break;
      case 'type-detail': vTypeDetail(); break;
      case 'lifecheck': vLifeCheck(); break;
      case 'space': vSpace(); break;
      case 'checklist': vChecklist(); break;
      case 'settle': vSettle(); break;
      case 'shopping': vShopping(); break;
      case 'lovemap': vLovemap(); break;
      case 'chores': vChores(); break;
      case 'calendar': vCalendar(); break;
      case 'checkin': vCheckin(); break;
      case 'conflict': vConflict(); break;
      case 'settings': vSettings(); break;
      case 'privacy': vPrivacy(); break;
      case 'terms': vTerms(); break;
      default: vHome();
    }
  }

  window.addEventListener('hashchange', render);
  window.addEventListener('online', render);
  window.addEventListener('offline', render);
  render();
  maybeTutorial();

  /* ---- 스와이프 뒤로가기: 왼쪽 가장자리에서 오른쪽으로 밀기 ---- */
  (function initSwipeBack() {
    var startX = 0, startY = 0, tracking = false;
    document.addEventListener('touchstart', function (e) {
      if (!e.touches || !e.touches.length) return;
      var t = e.touches[0];
      tracking = t.clientX <= 28;
      startX = t.clientX; startY = t.clientY;
    }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      var t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      var dx = t.clientX - startX, dy = Math.abs(t.clientY - startY);
      if (dx > 72 && dy < 60) handleBack();
    }, { passive: true });
  })();

  /* ================= 스플래시 (총 ~1초: 선명해지기 620ms + 페이드 320ms) ================= */
  (function dismissSplash() {
    var sp = document.getElementById('splash');
    if (!sp) return;
    setTimeout(function () { sp.classList.add('bye'); }, 680);
    setTimeout(function () { if (sp.parentNode) sp.parentNode.removeChild(sp); }, 1200);
  })();

  syncNativeReminders();
  /* 네이티브: 보안 저장소의 동기화 토큰을 런타임 설정에 주입 */
  if (window.MateNative && window.MateNative.secureGet && S.syncCfg && !S.syncCfg.token) {
    window.MateNative.secureGet('sync-token').then(function (tok) {
      if (tok && S.syncCfg) S.syncCfg.token = tok;
    }).catch(function () { });
  }

  /* ================= PWA Service Worker ================= */
  if (!window.MateNative && 'serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', {updateViaCache:'none'}).catch(function () { });
    });
  }

  /* ================= 테스트 훅 ================= */
  window.__mateon = {
    handleBack: handleBack,
    acceptNativeLink: acceptNativeLink,
    encodeResult: encodeResult,
    decodeResult: decodeResult,
    resultFromCode: resultFromCode,
    pairURL: pairURL,
    codeDist: codeDist,
    buildBackup: buildBackup,
    parseBackup: parseBackup,
    applyBackupData: applyBackupData,
    importBackupText: importBackupText,
    encodeInvite: encodeInvite,
    decodeInvite: decodeInvite,
    resultFromLink: resultFromLink,
    qrSVG: qrSVG,
    isoWeekKey: isoWeekKey,
    choreOwner: choreOwner,
    choreState: choreState,
    thisCheckin: thisCheckin,
    syncPull: syncPull,
    settleNet: settleNet,
    expenseShare: expenseShare,
    parseReceiptText: parseReceiptText,
    tbIngest: tbIngest,
    tbApply: tbApply,
    mergeRemoteContent: mergeRemoteContent,
    startTour: startTour,
    navigate: go,
    state: S,
  };
})();
