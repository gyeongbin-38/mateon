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
  var p2 = ML.p2,
    dateStr = ML.dateStr,
    fmtWon = ML.fmtWon,
    mondayOf = ML.mondayOf,
    isoWeekKey = ML.isoWeekKey,
    weekRangeLabel = ML.weekRangeLabel,
    expenseShare = ML.expenseShare,
    parseReceiptText = ML.parseReceiptText;

  /* ================= Utils ================= */
  function showToast(msg, opts) {
    if (!toastEl) return;
    var o = opts || {};
    if (toastEl.appendChild && typeof document !== 'undefined' && document.createElement) {
      toastEl.innerHTML = '';
      var span = document.createElement('span');
      span.textContent = msg;
      toastEl.appendChild(span);
      if (o.action && typeof o.action.fn === 'function') {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'toast-action';
        btn.textContent = o.action.label || '실행';
        btn.addEventListener('click', function () {
          toastEl.classList.remove('show');
          o.action.fn();
        });
        toastEl.appendChild(btn);
      }
      if (toastEl.classList.toggle) {
        toastEl.classList.toggle('toast-warn', o.type === 'warn');
        toastEl.classList.toggle('toast-good', o.type === 'good');
      }
    } else toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
    }, o.duration || 2200);
  }
  /* 입력 오류 표시 + aria-invalid */
  function markBad(el) {
    if (!el) return;
    if (el.classList && el.classList.add) el.classList.add('input-error');
    el.setAttribute('aria-invalid', 'true');
    el.focus();
  }
  /* 웹 진동 (네이티브 햅틱 폴백) */
  function buzz(pattern) {
    try {
      if (window.MateNative && window.MateNative.haptics) {
        window.MateNative.haptics();
        return;
      }
      if (navigator.vibrate) navigator.vibrate(pattern || 15);
    } catch (e) {
      /* ignore */
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function copyText(text, msg) {
    if (window.MateNative) {
      window.MateNative.copy(text)
        .then(function () {
          showToast(msg);
        })
        .catch(function () {
          showToast('복사하지 못했어요. 다시 시도해 주세요');
        });
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
      try {
        document.execCommand('copy');
        showToast(msg);
      } catch (e) {
        showToast(text);
      }
      ta.remove();
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(text)
        .then(function () {
          showToast(msg);
        })
        .catch(fallback);
    } else fallback();
  }

  function load(key) {
    try {
      var v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch (e) {
      return null;
    }
  }
  function save(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      /* ignore */
    }
  }
  function remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      /* ignore */
    }
  }

  function mean(arr) {
    if (!arr.length) return 0;
    return (
      arr.reduce(function (a, b) {
        return a + b;
      }, 0) / arr.length
    );
  }

  var _dateFmt = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' });
  function fmtDate(ts) {
    return _dateFmt.format(new Date(ts));
  }
  /* 알림용 상대시간 — 방금/N분/N시간 전, 하루 지나면 날짜 */
  function fmtDateTime(ts) {
    var d = Date.now() - ts;
    if (d < 60000) return '방금';
    if (d < 3600000) return Math.floor(d / 60000) + '분 전';
    if (d < 86400000) return Math.floor(d / 3600000) + '시간 전';
    return fmtDate(ts);
  }

  function charById(id) {
    return CHARACTERS.find(function (c) {
      return c.id === id;
    });
  }

  /* ================= Theme ================= */
  var root = document.documentElement;
  function themeMode() {
    try {
      return localStorage.getItem('ds-theme') || 'system';
    } catch (e) {
      return 'system';
    }
  }
  function systemDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function applyTheme() {
    var m = themeMode();
    root.dataset.theme = m === 'system' ? (systemDark() ? 'dark' : 'light') : m;
  }
  function setTheme(t) {
    /* t: 'light' | 'dark' | 'system' — 저장은 모드, 적용은 유효 테마 */
    try {
      localStorage.setItem('ds-theme', t);
    } catch (e) {
      /* ignore */
    }
    applyTheme();
  }
  applyTheme();
  /* 시스템 모드에서는 OS 테마 변경을 따라간다 */
  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
        if (themeMode() === 'system') applyTheme();
      });
    } catch (e) {
      /* 구형 WebView 무시 */
    }
  }

  function applyFontSize() {
    root.dataset.font = S && S.fontSize === 'large' ? 'large' : '';
  }
  applyFontSize();

  function syncNativeReminders() {
    if (window.MateNative && window.MateNative.syncReminders) {
      window.MateNative.syncReminders(S.reminders).catch(function () {});
    }
    if (typeof syncEventReminders === 'function') syncEventReminders();
  }

  /* ================= Scoring =================
     4-bit 직교 대비 코드: E1=(0,1) E2=(0,0) E3=(1,0) E4=(1,1), R도 동일.
     선택지 코드와 캐릭터 코드의 해밍 거리 d → 가중치 = 2 - d  */
  var BITMAP = {
    1: [0, 1],
    2: [0, 0],
    3: [1, 0],
    4: [1, 1],
  };

  function codeBits(code) {
    // 'E3R2' → [1,0,0,0]
    return BITMAP[code[1]].concat(BITMAP[code[3]]);
  }

  function hamming(a, b) {
    var d = 0;
    for (var i = 0; i < 4; i++) if (a[i] !== b[i]) d++;
    return d;
  }

  function scoreAnswers(answers) {
    // answers: [{qid, code}]
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
      return y.plus2 - x.plus2; // 동점 시 +2 직접 대응이 많은 쪽 우선
    });

    var eAvg = mean(
      answers.map(function (a) {
        return +a.code[1];
      })
    );
    var rAvg = mean(
      answers.map(function (a) {
        return +a.code[3];
      })
    );

    var domains = {};
    DOMAINS.forEach(function (d) {
      var list = answers.filter(function (a) {
        var q = QUESTIONS.find(function (qq) {
          return qq.id === a.qid;
        });
        return q && q.domain === d.id;
      });
      domains[d.id] = {
        e: mean(
          list.map(function (a) {
            return +a.code[1];
          })
        ),
        r: mean(
          list.map(function (a) {
            return +a.code[3];
          })
        ),
      };
    });

    var margin = scored[0].s - scored[1].s;
    var conf = margin >= 6 ? '높은 편' : margin >= 3 ? '보통' : '경계형';

    return {
      scores: scored,
      charId: scored[0].c.id,
      char2Id: scored[1].c.id,
      eAvg: eAvg,
      rAvg: rAvg,
      domains: domains,
      conf: conf,
      margin: margin,
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
    fixedExpenses: load('mateon.fixedExpenses') || [],
    chores: load('mateon.chores'),
    choreLog: load('mateon.choreLog') || {},
    events: load('mateon.events') || [],
    checkins: load('mateon.checkins') || [],
    customChecklist: load('mateon.customChecklist') || [],
    conflictLog: load('mateon.conflictLog') || [],
    shopping: load('mateon.shopping') || [],
    lovemap: load('mateon.lovemap') || { idx: 0, known: 0, asked: 0 },
    reminders: (function (r) {
      return {
        checkin: !r || r.checkin !== false,
        agreement: !r || r.agreement !== false,
        chore: !r || r.chore !== false,
        day: r && Number.isInteger(r.day) ? r.day : 0,
      };
    })(load('mateon.reminders')),
    homeName: load('mateon.homeName') || '',
    inviteDays: load('mateon.inviteDays') || 7,
    fontSize: load('mateon.fontSize') === 'large' ? 'large' : 'normal',
    seen: load('mateon.seen') === true,
    syncCfg: load('mateon.sync'),
    budgets: load('mateon.budgets') || {},
    anniv: load('mateon.anniv') || [],
    missions: load('mateon.missions') || { week: '', list: [] },
    talkFavs: load('mateon.talkFavs') || [],
    syncMeta: load('mateon.syncMeta') || {},
    syncStat: load('mateon.syncStat') || null,
    lastBackup: load('mateon.lastBackup') || 0,
    inviteExpired: false,
    pendingUpdate: null,
    cgStep: 0,
    cgDomain: 'D',
    delArm2: null,
    expCat: load('mateon.lastExpCat') || '생활비',
    expPayer: 'me',
    evWho: 'both',
    splitMode: (function (ls) {
      return ls && ['equal', 'percent', 'exact'].indexOf(ls.mode) >= 0 ? ls.mode : 'equal';
    })(load('mateon.lastSplit')),
    splitShare: '5:5',
    shopCat: '식료품',
    settleMonth: null,
    expFilter: '전체',
    expQuery: '',
    expEditId: null,
    pendingReceipt: null,
    expPayerFilter: 'all',
    expShowN: 15,
    expEditFx: null,
    expUndo: null,
    calMonth: null,
    calDay: null,
    evEditId: null,
    lmReview: false,
    pantry: load('mateon.pantry') || [],
    coupons: load('mateon.coupons') || [],
    debts: load('mateon.debts') || [],
    roulette: load('mateon.roulette') || { opts: ROULETTE_PRESETS.slice(), last: '' },
    moveDate: load('mateon.moveDate') || null,
    homeWidgets: load('mateon.homeWidgets') || null,
    lock: load('mateon.lock') || null,
    ciReplies: load('mateon.ciReplies') || {},
    shopHist: load('mateon.shopHist') || [],
    pantryLoc: '냉장',
    debtDir: 'lent',
    couponCustom: false,
    proofTarget: null,
    goal: load('mateon.goal') || null,
    care: load('mateon.care') || [],
    memos: load('mateon.memos') || [],
    settlePaid: load('mateon.settlePaid') || [],
    loveLang: load('mateon.loveLang') || null,
    trash: load('mateon.trash') || [],
    badges: load('mateon.badges') || [],
    snapshots: load('mateon.snapshots') || [],
    ciQuestions: load('mateon.ciQuestions') || [],
    fxDismiss: load('mateon.fxDismiss') || [],
    lmCustom: load('mateon.lmCustom') || [],
    notifs: load('mateon.notifs') || [],
    notifOpen: false,
    notifReadTs: load('mateon.notifRead') || 0,
    photos: load('mateon.photos') || [],
    rate: load('mateon.rate') || null,
    memoTag: '일반',
    memoFilter: '',
    rcptFor: null,
    evDraft: null,
    expIncome: false,
    expTag: null,
    calView: 'm',
    careKind: 'pet',
    searchOpen: false,
    lastRoute: '',
    scrollY: {},
  };
  S.locked = !!S.lock;
  S.demo = load('mateon.demo') === true;

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
    return !!(
      d &&
      Array.isArray(d.answers) &&
      d.answers.length > 0 &&
      d.answers.length <= QUESTIONS.length &&
      Number.isInteger(d.q) &&
      d.q >= 0 &&
      d.q < QUESTIONS.length &&
      d.profile &&
      typeof d.profile.name === 'string' &&
      d.answers.every(function (a) {
        var q =
          a &&
          QUESTIONS.find(function (q) {
            return q.id === a.qid;
          });
        return (
          q &&
          q.options.some(function (o) {
            return o.code === a.code;
          })
        );
      })
    );
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
    S.profile = {
      name: d.profile.name.slice(0, 12),
      relation: typeof d.profile.relation === 'string' ? d.profile.relation : '',
      stage: typeof d.profile.stage === 'string' ? d.profile.stage : '',
    };
    S.invite = invite;
    return true;
  }

  /* ---- 초대 링크 인코딩/디코딩 (v3 만료·난독화, v2 압축 배열, v1 객체 하위호환) ---- */
  function resultToArr(r) {
    return [
      r.name,
      r.relation || '',
      r.stage || '',
      +r.eAvg.toFixed(2),
      +r.rAvg.toFixed(2),
      r.charId,
      r.char2Id,
      r.conf || '',
      DOMAINS.map(function (d) {
        var dd = r.domains[d.id];
        return [+dd.e.toFixed(2), +dd.r.toFixed(2)];
      }),
      r.life
        ? r.life.map(function (x) {
            return x.level;
          })
        : null,
    ];
  }
  function b64urlEncode(s) {
    return btoa(unescape(encodeURIComponent(s)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
  function encodeResult(r) {
    return b64urlEncode(JSON.stringify(resultToArr(r)));
  }

  /* v3: XOR 스트림 난독화 + 만료 시각. URL 안에 결과가 그대로 읽히지 않게 하고,
     일정 시간이 지나면 링크가 더 이상 열리지 않게 한다. (난독화이지 암호화는 아님) */
  function xorStream(seed) {
    return function () {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return (seed >>> 16) & 0xff;
    };
  }
  var INVITE_XOR_SEED = 0x9e3779b9;
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
      } catch (e) {
        return null;
      }
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
        out.name = obj[0] || '상대';
        out.relation = obj[1] || '';
        out.stage = obj[2] || '';
        out.eAvg = obj[3];
        out.rAvg = obj[4];
        out.charId = obj[5];
        out.char2Id = obj[6];
        out.conf = obj[7] || '';
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
        out.name = obj.n || '상대';
        out.relation = obj.rel || '';
        out.stage = obj.st || '';
        out.eAvg = obj.e;
        out.rAvg = obj.r;
        out.charId = obj.c1;
        out.char2Id = obj.c2;
        out.conf = obj.cf || '';
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
      DOMAINS.forEach(function (d) {
        values.push(out.domains[d.id].e, out.domains[d.id].r);
      });
      return values.every(function (v) {
        return typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 4;
      })
        ? out
        : null;
    } catch (e) {
      return null;
    }
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
      var a = decodeResult(p[1]),
        b = decodeResult(p[2]);
      if (a && b) S.viewPair = { me: a, partner: b };
    }
  })();

  restoreDraft(S.invite ? 'partner' : load('mateon.activeDraft') || 'me');

  /* ---- 공개 배포 링크 ----
     네이티브에서도 HTTPS 링크를 공유한다. 앱 링크가 연결되면 앱이 열리고,
     미설치 사용자는 웹 초대/리포트 화면으로 자연스럽게 이어진다. */
  var DEFAULT_CONFIG = {
    appId: 'io.github.gyeongbin38.mateon',
    version: '0.3.0',
    webBaseUrl: 'https://gyeongbin-38.github.io/mateon/',
    customScheme: 'mateon',
    privacyPolicyUrl: 'https://gyeongbin-38.github.io/mateon/#/privacy',
  };

  function appConfig() {
    var cfg = window.MATEON_CONFIG || {};
    return {
      appId: cfg.appId || DEFAULT_CONFIG.appId,
      version: cfg.version || DEFAULT_CONFIG.version,
      webBaseUrl: cfg.webBaseUrl || DEFAULT_CONFIG.webBaseUrl,
      customScheme: cfg.customScheme || DEFAULT_CONFIG.customScheme,
      privacyPolicyUrl: cfg.privacyPolicyUrl || DEFAULT_CONFIG.privacyPolicyUrl,
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
    return (
      '' +
      '<header class="app-header"><div class="app-header-inner">' +
      (detail
        ? '<button class="icon-button app-back" data-action="back" type="button" aria-label="이전 화면">' +
          mobileIcon('back') +
          '</button><span class="app-screen-title">' +
          esc((ROUTE_TITLES[r] || 'MATE:ON').split(' — ')[0]) +
          '</span>'
        : '<button class="logo" data-action="home" type="button" aria-label="MATE:ON 홈">' +
          logoSVG(40) +
          '<span class="wordmark" translate="no">MATE<span class="wm-on">:ON</span></span>' +
          '</button>') +
      '<button class="icon-button" data-action="search-open" type="button" aria-label="검색">' +
      '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></button>' +
      /* 알림 센터 — 읽지 않은 알림이 있으면 점 표시 */
      '<button class="icon-button notif-btn" data-action="notif-open" type="button" aria-label="알림' +
      (unreadNotifs() ? ' · 새 알림 ' + unreadNotifs() + '개' : '') +
      '">' +
      '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>' +
      (unreadNotifs() ? '<i class="notif-dot" aria-hidden="true"></i>' : '') +
      '</button>' +
      '<button class="btn btn-tertiary btn-sm" data-action="theme" type="button" aria-label="테마 전환">' +
      '<svg aria-hidden="true" class="icon-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>' +
      '<svg aria-hidden="true" class="icon-moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' +
      '</button>' +
      '</div></header>'
    );
  }

  /* ---- 하단 네비게이션 ---- */
  var NAV_ICONS = {
    home: '<svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/></svg>',
    types:
      '<svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    checklist:
      '<svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    settings:
      '<svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  };

  function navActive(nav) {
    var r = currentRoute();
    if (nav === 'home') return ['home', 'onboarding', 'survey', 'result', 'invite', 'report', 'lifecheck'].indexOf(r) >= 0;
    if (nav === 'types') return r === 'types' || r === 'type-detail';
    if (nav === 'space')
      return ['space', 'checklist', 'agreement', 'settle', 'shopping', 'lovemap', 'chores', 'calendar', 'checkin', 'conflict'].indexOf(r) >= 0;
    if (nav === 'settings') return r === 'settings' || r === 'privacy' || r === 'terms';
    return false;
  }

  function T(k) {
    return (
      window.MateI18n || {
        t: function (x) {
          return x;
        },
      }
    ).t(k);
  }
  function bottomNavHTML() {
    var i18n = window.MateI18n || {
      t: function (k) {
        return k;
      },
    };
    var items = [
      ['home', i18n.t('nav.home')],
      ['space', i18n.t('nav.space')],
      ['types', i18n.t('nav.types')],
      ['settings', i18n.t('nav.settings')],
    ];
    return (
      '<nav class="bottom-nav" aria-label="' +
      esc(T('nav.aria')) +
      '">' +
      items
        .map(function (it) {
          var on = navActive(it[0]);
          return (
            '<button class="nav-item' +
            (on ? ' on' : '') +
            '" data-action="' +
            it[0] +
            '" type="button"' +
            (on ? ' aria-current="page"' : '') +
            '>' +
            (it[0] === 'space' ? mobileIcon('heart') : it[0] === 'settings' ? mobileIcon('user') : NAV_ICONS[it[0]]) +
            '<span>' +
            it[1] +
            '</span></button>'
          );
        })
        .join('') +
      '</nav>'
    );
  }

  var lastShellRoute = null;
  var lastShellScroll = 0;
  var lastShellContent = '';
  function shell(content) {
    if (homeCarouselObserver) {
      homeCarouselObserver.disconnect();
      homeCarouselObserver = null;
    }
    var offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    var r = currentRoute();
    var sameRoute = r === lastShellRoute;
    /* 렌더 스킵 — 같은 라우트에 같은 내용·부가 상태면 DOM을 건드리지 않는다.
       부가 상태(오프라인·FAB·튜토리얼)가 시그니처에 빠지면 그 변경이 반영되지 않으므로 전부 포함한다. */
    var sig =
      content +
      '|' +
      (offline ? 1 : 0) +
      '|' +
      (S.fabOpen ? 1 : 0) +
      '|' +
      tutorialHTML() +
      '|' +
      (S.locked ? 1 : 0) +
      '|' +
      (S.demo ? 1 : 0) +
      '|' +
      (S.searchOpen ? 1 : 0) +
      '|' +
      (S.notifOpen ? 1 : 0) +
      '|' +
      unreadNotifs();
    if (sameRoute && sig === lastShellContent) return;
    app.innerHTML =
      '<div class="app-shell' +
      (r === 'home' ? ' is-home' : '') +
      '">' +
      headerHTML() +
      (offline ? '<div class="offline-bar" role="status">' + esc(T('offline.banner')) + '</div>' : '') +
      (S.demo
        ? '<div class="demo-bar" role="status">🎭 지금은 데모 데이터예요 <button class="demo-end" data-action="demo-end" type="button">끝내기</button></div>'
        : '') +
      '<main class="app-main" id="main">' +
      content +
      '</main>' +
      fabHTML(r) +
      bottomNavHTML() +
      tutorialHTML() +
      lockScreenHTML() +
      searchOverlayHTML() +
      notifOverlayHTML() +
      '</div>';
    if (sameRoute) window.scrollTo(0, lastShellScroll);
    else window.scrollTo(0, 0);
    lastShellContent = sig;
    /* 라우트가 바뀌면 제목으로 포커스 이동 — 스크린리더가 새 화면을 알린다 */
    if (!sameRoute) {
      var h = typeof app.querySelector === 'function' ? app.querySelector('h1') : null;
      if (h) {
        try {
          h.setAttribute('tabindex', '-1');
          h.focus({ preventScroll: true });
        } catch (e) {}
      }
    }
    lastShellRoute = r;
    lastShellScroll = window.scrollY || 0;
  }
  /* 스크롤 위치를 기록 — 같은 라우트 리렌더 시 위치 복원에 사용 */
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener(
      'scroll',
      function () {
        if (window.scrollY || window.scrollY === 0) lastShellScroll = window.scrollY;
      },
      { passive: true }
    );
  }

  /* 홈·우리공간의 빠른 추가 버튼 */
  function fabHTML(route) {
    if (route !== 'home' && route !== 'space') return '';
    var open = !!S.fabOpen;
    return (
      '<div class="fab-wrap' +
      (open ? ' open' : '') +
      '">' +
      (open
        ? '<div class="fab-menu" role="menu">' +
          '<button type="button" role="menuitem" data-action="settle">💸 지출 기록</button>' +
          '<button type="button" role="menuitem" data-action="checkin">💗 주간 체크인</button>' +
          '<button type="button" role="menuitem" data-action="calendar">📅 일정 추가</button>' +
          '<button type="button" role="menuitem" data-action="shopping">🛒 살 것 추가</button></div>'
        : '') +
      '<button class="fab" data-action="fab-menu" type="button" aria-label="빠른 추가" aria-expanded="' +
      open +
      '"><span aria-hidden="true">' +
      (open ? '✕' : '+') +
      '</span></button></div>'
    );
  }

  /* ================= 공용 UI 조각 ================= */

  function pct(avg) {
    // 1~4 → 0~100%
    return Math.round(((avg - 1) / 3) * 100);
  }

  function eLevel(avg) {
    return 'E' + Math.max(1, Math.min(4, Math.round(avg)));
  }
  function rLevel(avg) {
    return 'R' + Math.max(1, Math.min(4, Math.round(avg)));
  }

  function gaugeHTML(label, avg, blue) {
    var lv = blue ? rLevel(avg) : eLevel(avg);
    var meta = blue ? R_LEVELS[lv] : E_LEVELS[lv];
    return (
      '' +
      '<div class="gauge-row">' +
      '<div class="gauge-head"><span class="gauge-label">' +
      label +
      '</span>' +
      '<span class="gauge-val">' +
      lv +
      ' ' +
      meta.label +
      ' · ' +
      pct(avg) +
      '%</span></div>' +
      '<div class="gauge-track"><div class="gauge-fill' +
      (blue ? ' gauge-blue' : '') +
      '" style="width:' +
      pct(avg) +
      '%"></div></div>' +
      '<div class="gauge-caption"><span>' +
      (blue ? '낮음' : '독립적') +
      '</span><span>' +
      meta.desc +
      '</span><span>' +
      (blue ? '높음' : '주도적') +
      '</span></div>' +
      '</div>'
    );
  }

  function matrixHTML(mineId, partnerId, nameA, nameB) {
    var cells = '';
    CHARACTERS.forEach(function (c) {
      var cls = 'matrix-cell';
      var label = c.code;
      if (c.id === mineId && c.id === partnerId) {
        cls += ' same';
        label = c.name;
      } else if (c.id === mineId) {
        cls += ' mine';
        label = c.name;
      } else if (c.id === partnerId) {
        cls += ' partner';
        label = c.name;
      }
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
    return (
      '<div class="matrix" role="img" aria-label="' +
      esc(aria) +
      '">' +
      cells +
      '</div>' +
      '<div class="matrix-axis"><span>← 교류 적음 (E1)</span><span>민감도 낮음 R1 ↑ · ↓ R4 민감도 높음</span><span>교류 많음 (E4) →</span></div>'
    );
  }

  /* ================= View: 홈 ================= */
  var HOME_TALKS = [
    ['생활 리듬', '혼자만의 시간이 필요할 때, 어떻게 알려주면 좋을까요?', '혼자 있는 시간이 길어질 때 서로가 서운해하지 않으려면 어떤 게 필요할까요?'],
    ['공간과 청결', '우리 집의 깨끗함은 어느 정도면 충분할까요?', '서로의 "치웠다" 기준이 다르다면 어디에 맞추는 게 좋을까요?'],
    ['생활비', '함께 쓰는 물건의 비용은 어떻게 나누면 편할까요?', '수입 차이가 있을 때 비용 분담은 어떤 기준이 공평할까요?'],
    ['개인 경계', '서로 물건을 빌릴 때 미리 물어볼 범위는 어디까지일까요?', '반대로, 물어보지 않아도 되는 물건의 기준은 뭘까요?'],
    [
      '갈등 대화',
      '서운한 일이 생겼을 때 바로 말하는 편이 좋을까요, 조금 정리하고 말하는 편이 좋을까요?',
      '상대가 나랑 다른 방식을 선택했을 때, 어떻게 맞춰갈 수 있을까요?',
    ],
    ['손님과 일정', '집에 손님을 부를 때 얼마나 미리 알려주면 편할까요?', '손님이 오는 날 공용 공간 정리는 누가 어디까지 할까요?'],
    ['수면과 소음', '밤에 꼭 지켜지면 좋은 조용한 시간은 언제부터일까요?', '수면 시간이 다른 두 사람이 서로 배려하는 방법은 뭐가 있을까요?'],
    ['회복 시간', '의견이 부딪힌 뒤에는 바로 대화할까요, 잠시 정리할까요?', '정리 시간이 끝난 뒤 먼저 말을 건네는 게 어색할 때 어떻게 시작할까요?'],
    ['일상 공유', '하루 중 있었던 일을 서로 얼마나 나누는 게 좋을까요?', '바빠서 대화가 뜸했던 주에는 어떻게 다시 연결될까요?'],
    ['식사 습관', '같이 먹는 식사는 어느 정도면 서로 부담이 없을까요?', '식사 시간이 안 맞을 때 음식 준비·설거지는 어떻게 나눌까요?'],
    ['집의 의미', '집이 서로에게 어떤 장소이길 바라나요?', '그 "장소"를 만들기 위해 이번 달에 하나씩 바꿔본다면 뭘까요?'],
    ['애정 표현', '평소에 고마움을 어떻게 표현하는 게 서로 편할까요?', '표현 방식이 다를 때, 서로가 주고받은 게 같다고 느끼려면 뭐가 필요할까요?'],
    ['휴일 계획', '주말·휴일은 각자 쓰는 게 좋을까요, 같이 계획하는 게 좋을까요?', '함께 쓰는 날과 각자 쓰는 날, 대략 어떤 비율이 편할까요?'],
    ['스트레스 신호', '내가 힘들 때 나오는 신호를 메이트가 알아채려면 뭘 알려줘야 할까요?', '그 신호를 알아챘을 때 상대가 해주면 좋은 행동은 뭘까요?'],
    [
      '비상 상황',
      '몸이 아프거나 급한 일이 생겼을 때 서로 어떻게 돌봐주면 좋을까요?',
      '연락이 안 될 때의 대비 방법(비상연락처·위치 공유)은 어디까지 정해둘까요?',
    ],
    ['집안일 공정', '집안일을 나눌 때 "공평"은 같은 양일까요, 같은 체감일까요?', '한쪽이 바쁜 시기가 되면 그동안 분담을 어떻게 조정할까요?'],
    ['미래 이야기', '1년 뒤 우리의 생활이 어떤 모습이면 좋겠어요?', '그 모습에 가까워지려면 지금 시작할 작은 습관 하나는 뭘까요?'],
    ['감사 찾기', '최근에 메이트가 해준 것 중 고마웠던 일 하나는?', '그 고마움을 말로 전한다면 지금 어떻게 말할 수 있을까요?'],
    [
      '혼자 있는 규칙',
      '메이트가 집을 비우는 날, 혼자 있는 시간을 어떻게 쓰면 좋을까요?',
      '혼자 있는 날에도 서로에게 알려주면 좋은 것과 안 알려도 되는 것의 기준은?',
    ],
    ['집 소개', '집에 처음 온 사람에게 우리 집을 어떻게 소개하고 싶어요?', '그 소개가 사실이 되려면 우리가 지금 채우면 좋은 것 하나는 뭘까요?'],
  ];
  var talkIndex = (function () {
    var now = new Date();
    var yearStart = new Date(now.getFullYear(), 0, 0);
    var day = Math.floor((now.getTime() - yearStart.getTime()) / 86400000);
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
      back: '<path d="m15 5-7 7 7 7"/>',
    };
    return (
      '<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      (paths[name] || paths.heart) +
      '</svg>'
    );
  }
  function checklistStats() {
    var total = 0,
      done = 0;
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
    return { total: total, done: done };
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
    return BASE_RULES.map(function (r) {
      return r.text;
    });
  }
  function sameTextList(a, b) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every(function (v, i) {
        return v === b[i];
      })
    );
  }
  function draftBannerHTML() {
    var flow = load('mateon.activeDraft') || 'me';
    var draft = load('mateon.draft.' + flow);
    if (!draft || !Array.isArray(draft.answers) || !draft.answers.length || !draft.profile) return '';
    return (
      '<button class="draft-banner" type="button" data-action="resume-survey"><span><strong>' +
      esc(draft.profile.name || (flow === 'partner' ? '메이트' : '나')) +
      '님의 진단 이어하기</strong><small>' +
      draft.answers.length +
      ' / 20 문항 완료 · 자동 저장됨</small></span>' +
      mobileIcon('arrow') +
      '</button>'
    );
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
      if (track.clientWidth !== width) return;
      index = Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
      status.textContent = index + 1 + ' / ' + slides.length;
      previous.disabled = index === 0;
      next.disabled = index === slides.length - 1;
      slides.forEach(function (slide, i) {
        var active = i === index;
        slide.setAttribute('aria-hidden', String(!active));
        if (active) slide.setAttribute('aria-current', 'true');
        else slide.removeAttribute('aria-current');
        var button = slide.querySelector('button');
        if (button) button.tabIndex = active ? 0 : -1;
      });
      dots.forEach(function (dot, i) {
        dot.classList.toggle('on', i === index);
      });
    }
    function move(step) {
      var target = Math.max(0, Math.min(slides.length - 1, index + step));
      track.scrollTo({ left: target * track.clientWidth, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
    previous.addEventListener('click', function () {
      move(-1);
    });
    next.addEventListener('click', function () {
      move(1);
    });
    track.addEventListener('scroll', update, { passive: true });
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        move(e.key === 'ArrowLeft' ? -1 : 1);
      }
    });
    track.scrollLeft = index * track.clientWidth;
    update();
    if (window.ResizeObserver) {
      homeCarouselObserver = new ResizeObserver(function () {
        if (width === track.clientWidth) return;
        width = track.clientWidth;
        track.scrollLeft = index * width;
        update();
      });
      homeCarouselObserver.observe(track);
    }
  }
  function personalTalkHTML() {
    if (!S.me || !S.partner) return '';
    var rows = DOMAINS.map(function (d) {
      return { d: d, gap: domainGap(S.me.domains[d.id], S.partner.domains[d.id]) };
    })
      .filter(function (r) {
        return r.gap >= 1.5;
      })
      .sort(function (x, y) {
        return y.gap - x.gap;
      });
    if (!rows.length) return '';
    var dom = rows[0].d;
    var scenario = (CONFLICT_SCENARIOS[dom.id] || {}).prevention || '';
    return (
      '<div class="personal-talk"><span class="pt-tag">우리에게 맞춘 주제</span><p>“' +
      esc('요즘 ' + dom.area + ' 얘기, 우리 한번 나눠볼까요?') +
      '”' +
      (scenario ? '<small>' + esc(scenario) + '</small>' : '') +
      '</div>'
    );
  }
  function vHome() {
    var draft = S.answers.length > 0 && S.answers.length < QUESTIONS.length;
    var action = !S.me ? (draft ? 'resume-survey' : 'start') : !S.partner ? 'invite' : 'report';
    var installBanner = S.installPrompt
      ? '<button class="checkin-banner install-banner" type="button" data-action="app-install"><span>' +
        mobileIcon('plus') +
        '</span><span><strong>홈 화면에 MATE:ON 설치</strong><small>앱처럼 바로 열 수 있어요</small></span>' +
        mobileIcon('arrow') +
        '</button>'
      : '';
    var title = !S.me ? (draft ? '나를 알아가는 중이에요' : '나는 어떤 메이트일까?') : !S.partner ? '이제, 서로를 알아볼 차례' : '우리의 다름을 알아봐요';
    var cta = !S.me ? (draft ? '이어서 진단하기' : '나의 동거 성향 알아보기') : !S.partner ? '메이트 초대하기' : '우리 둘 리포트 보기';
    var savedAg = savedAgreementForPair();
    var count = (S.me ? 1 : 0) + (S.me && S.partner ? 1 : 0) + (savedAg ? 1 : 0);
    var saved = load('mateon.talks') || {};
    var stats = checklistStats();
    var startId = S.me ? S.me.charId : 12;
    var carouselCharacters = [charById(startId)].concat(
      CHARACTERS.filter(function (c) {
        return c.id !== startId;
      })
    );
    var steps = [
      ['나 진단', !!S.me],
      ['메이트 연결', !!(S.me && S.partner)],
      ['합의서 저장', !!savedAg],
    ];
    var nextStep = 0;
    while (nextStep < steps.length && steps[nextStep][1]) nextStep++;
    var missionSteps =
      '<div class="mission-steps" aria-label="함께 준비하는 단계">' +
      steps
        .map(function (step, i) {
          var done = step[1],
            current = i === nextStep;
          return (
            '<span class="mission-step' +
            (done ? ' done' : current ? ' current' : '') +
            '"' +
            (current ? ' aria-current="step"' : '') +
            '><i aria-hidden="true">' +
            (done ? '✓' : i + 1) +
            '</i>' +
            step[0] +
            '</span>'
          );
        })
        .join('') +
      '</div>';
    /* 홈 배너: 가장 가까운 기념일 D-day / 미정산 잔액 / 백업 리마인더 */
    var annivNext = S.anniv
      .map(function (a) {
        var t = ML.nextAnnivTs(a.date);
        return t === null ? null : { a: a, ts: t };
      })
      .filter(Boolean)
      .sort(function (x, y) {
        return x.ts - y.ts;
      })[0];
    var netNow = S.expenses.length ? settleNet() : 0;
    /* 정산 리마인드 — 월말(25일+)이거나 지출이 쌓인 지 35일 넘었으면 닫아주라는 신호 */
    var oldestExp = S.expenses.length
      ? Math.min.apply(
          null,
          S.expenses.map(function (x) {
            return x.ts;
          })
        )
      : 0;
    var settleDue = S.expenses.length > 0 && (new Date().getDate() >= 25 || (oldestExp && Date.now() - oldestExp > 35 * 86400000));
    var backupStale = !S.lastBackup || Date.now() - S.lastBackup > 30 * 86400000;
    var banners =
      (annivNext
        ? '<button class="dday-banner" type="button" data-action="calendar"><span class="dday-num">' +
          esc(ML.ddayLabel(annivNext.ts)) +
          '</span><span class="dday-text"><strong>' +
          esc(annivNext.a.title) +
          '</strong><small>' +
          esc(dateStr(annivNext.ts).slice(5)) +
          ' · 매년 기념</small></span>' +
          mobileIcon('arrow') +
          '</button>'
        : '') +
      (netNow !== 0
        ? '<button class="checkin-banner settle-banner" type="button" data-action="settle"><span>' +
          mobileIcon('plus') +
          '</span><span><strong>정산할 금액 ' +
          fmtWon(Math.abs(netNow)) +
          '</strong><small>' +
          (netNow > 0 ? esc(payerName('you')) + '님이 ' + esc(payerName('me')) + '님께' : esc(payerName('me')) + '님이 ' + esc(payerName('you')) + '님께') +
          (settleDue ? ' · 월말 정산 시기예요' : '') +
          '</small></span>' +
          mobileIcon('arrow') +
          '</button>'
        : '') +
      (netNow === 0 && settleDue
        ? '<button class="checkin-banner" type="button" data-action="settle"><span>' +
          mobileIcon('checklist') +
          '</span><span><strong>이번 달 생활비 ' +
          S.expenses.length +
          '건 정산 안 했어요</strong><small>월말에 마감하면 깔끔해요</small></span>' +
          mobileIcon('arrow') +
          '</button>'
        : '') +
      (S.me && S.partner && backupStale
        ? '<div class="note-box warn" style="margin:14px 0"><span>백업한 지 ' +
          (S.lastBackup ? Math.floor((Date.now() - S.lastBackup) / 86400000) + '일' : '한 번도 안') +
          ' 됐어요. 설정에서 JSON으로 저장해 두세요.</span></div>'
        : '') +
      (rateReady()
        ? '<div class="rate-card" role="status"><span class="rate-star">⭐</span>' +
          (S.rate.fbOpen
            ? '<div class="rate-body"><strong>어떤 점이 아쉬웠나요?</strong><small>의견은 이 기기에만 저장돼요</small></div><div class="rate-btns" style="flex:1 1 100%"><input class="input" id="rate-fb" type="text" maxlength="200" placeholder="불편했던 점을 알려주세요" style="flex:1"><button class="chip chip-sm" data-action="rate-fb-send" type="button">보내기</button></div>'
            : '<div class="rate-body"><strong>MATE:ON이 도움이 되고 있나요?</strong><small>스토어에서 별점을 남겨주시면 큰 힘이 돼요</small></div><div class="rate-btns"><button class="chip chip-sm" data-action="rate-yes" type="button">좋아요</button><button class="chip chip-sm" data-action="rate-nope" type="button">아쉬워요</button><button class="chip chip-sm" data-action="rate-later" type="button">나중에</button><button class="icon-button" data-action="rate-never" type="button" aria-label="다시 보지 않기">' +
              mobileIcon('close') +
              '</button></div>') +
          '</div>'
        : '');
    var portraits =
      '<div class="character-carousel"><div class="character-track" id="home-carousel" role="region" aria-roledescription="캐러셀" aria-label="16가지 동거 캐릭터 · 좌우 방향키로 이동" tabindex="0">' +
      carouselCharacters
        .map(function (c, i) {
          var mine = S.me && c.id === S.me.charId;
          var partner = S.partner && c.id === S.partner.charId;
          return (
            '<article class="character-slide" role="group" aria-roledescription="슬라이드" aria-label="' +
            (i + 1) +
            ' / 16 · ' +
            esc(c.name) +
            '" aria-hidden="' +
            (i !== 0) +
            '"' +
            (i === 0 ? ' aria-current="true"' : '') +
            '><span class="carousel-label">' +
            c.code +
            ' · ' +
            (mine ? '나의 캐릭터' : partner ? '메이트의 캐릭터' : '캐릭터 미리보기') +
            '</span>' +
            characterArt(c, c.id !== startId, true) +
            '<h3>' +
            esc(c.name) +
            '</h3><p>' +
            esc(c.quote) +
            '</p><button class="carousel-detail" data-action="type" data-id="' +
            c.id +
            '" type="button" tabindex="' +
            (i === 0 ? '0' : '-1') +
            '">이 캐릭터 알아보기 ' +
            mobileIcon('arrow') +
            '</button></article>'
          );
        })
        .join('') +
      '</div><div class="carousel-dots" aria-hidden="true">' +
      carouselCharacters
        .map(function (c, i) {
          return '<span class="carousel-dot' + (i === 0 ? ' on' : '') + '"></span>';
        })
        .join('') +
      '</div><div class="carousel-controls"><button id="character-previous" class="icon-button" type="button" aria-label="이전 캐릭터">' +
      mobileIcon('arrow') +
      '</button><span id="character-position" role="status" aria-live="polite"></span><button id="character-next" class="icon-button" type="button" aria-label="다음 캐릭터">' +
      mobileIcon('arrow') +
      '</button></div><p class="carousel-hint">옆으로 넘겨 다른 메이트도 만나보세요</p></div>';
    var connection =
      '<section class="connection-strip" aria-label="메이트 연결 상태"><div class="paired-avatars"><span>' +
      esc(S.me ? S.me.name.slice(0, 1) : '나') +
      '</span><span>' +
      (S.partner ? esc(S.partner.name.slice(0, 1)) : mobileIcon('plus')) +
      '</span></div><div><strong>' +
      (S.partner ? esc(S.partner.name) + '님과 함께' : S.me ? '메이트를 초대해 보세요' : '서로를 알아가는 첫걸음') +
      '</strong><p>' +
      (S.partner ? '두 사람의 생활방식을 함께 맞춰봐요' : S.me ? '결과 링크로 우리의 성향을 비교해요' : '내 성향을 알아본 뒤, 메이트와 연결해요') +
      '</p></div><button class="icon-button" data-action="' +
      (S.me ? 'invite' : 'start') +
      '" aria-label="메이트 연결하기" type="button">' +
      mobileIcon('arrow') +
      '</button></section>';
    /* 오늘 할 일 — 오늘 일정·내 집안일·남은 쇼핑을 한눈에 */
    var todayStr = dateStr(Date.now());
    var todayEvs = ML.eventsOnDay(S.events, S.anniv, todayStr);
    var wkNow = isoWeekKey();
    var wkLog = (S.chores && S.choreLog[wkNow]) || {};
    var myChores = (S.chores && Array.isArray(S.chores.items) ? S.chores.items : []).filter(function (it, i) {
      return choreOwner(i, Date.now()) === 'me' && !wkLog[it.id];
    });
    var shopOpen = S.shopping.filter(function (x) {
      return !x.done;
    }).length;
    var todayTasks =
      S.me && S.partner && (todayEvs.length || myChores.length || shopOpen)
        ? '<section class="today-tasks" aria-label="오늘 할 일"><h2>오늘 할 일 <span>' +
          ML.dateLabel(Date.now()) +
          '</span></h2>' +
          todayEvs
            .map(function (e) {
              return (
                '<button type="button" data-action="calendar" class="tt-row"><span class="tt-dot ev"></span>' +
                esc(e.title) +
                (e.time ? ' <small>' + esc(e.time) + '</small>' : '') +
                '</button>'
              );
            })
            .join('') +
          myChores
            .slice(0, 3)
            .map(function (it) {
              return (
                '<button type="button" data-action="chores" class="tt-row"><span class="tt-dot ch"></span>' + esc(it.name) + ' <small>내 차례</small></button>'
              );
            })
            .join('') +
          (shopOpen
            ? '<button type="button" data-action="shopping" class="tt-row"><span class="tt-dot sh"></span>살 것 ' + shopOpen + '개 남음</button>'
            : '') +
          '</section>'
        : '';
    /* 다가오는 일정 — 다음 7일 안의 일정을 홈에서 미리 본다 */
    var next7 = dateStr(Date.now() + 7 * 86400000);
    var upEvs = S.events
      .map(function (e) {
        var occ = nextOccurrence(e, todayStr);
        return occ && occ <= next7 ? { e: e, occ: occ } : null;
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return a.occ < b.occ ? -1 : a.occ > b.occ ? 1 : 0;
      })
      .slice(0, 4);
    var upcomingCard =
      S.me && S.partner && upEvs.length
        ? '<section class="today-tasks" aria-label="다가오는 일정"><h2>다가오는 일정 <span>7일 이내 ' +
          upEvs.length +
          '건</span></h2>' +
          upEvs
            .map(function (u) {
              return (
                '<button type="button" data-action="calendar" class="tt-row"><span class="tt-dot ev"></span>' +
                esc(u.e.title) +
                ' <small>' +
                esc(ML.dateLabel(new Date(u.occ + 'T12:00:00').getTime())) +
                (u.e.time ? ' ' + esc(u.e.time) : '') +
                '</small></button>'
              );
            })
            .join('') +
          '</section>'
        : '';
    /* 홈 위젯 — 설정에서 순서·표시를 바꿀 수 있다 ('off:' 접두어 = 숨김) */
    var widgetHTML = {
      today: todayTasks,
      upcoming: upcomingCard,
      talk:
        '<section class="conversation-section"><div class="mobile-section-head"><h2>' +
        esc(T('home.talk')) +
        '</h2><span>' +
        esc(T('home.talk.sub')) +
        ' ' +
        (talkIndex + 1) +
        ' / ' +
        HOME_TALKS.length +
        '</span></div><div class="conversation-card"><div class="conversation-top"><span>' +
        HOME_TALKS[talkIndex][0] +
        '</span><button class="icon-button" data-action="next-talk" type="button" aria-label="다른 대화 주제">' +
        mobileIcon('refresh') +
        '</button></div><h3>' +
        HOME_TALKS[talkIndex][1] +
        '</h3><button type="button" class="conversation-open" data-action="talk-open">' +
        (saved[talkIndex] ? '내 답변 다시 보기' : '내 생각 남기기') +
        mobileIcon('arrow') +
        '</button></div>' +
        personalTalkHTML() +
        '</section>',
      prep:
        '<button class="preparation-row" type="button" data-action="space"><span class="preparation-icon">' +
        NAV_ICONS.home +
        '</span><span><strong>우리의 입주 준비</strong><small>' +
        stats.total +
        '개 중 ' +
        stats.done +
        '개 완료했어요</small></span><span class="tiny-ring" style="--done:' +
        Math.round((stats.done / stats.total) * 100) +
        '%">' +
        Math.round((stats.done / stats.total) * 100) +
        '%</span>' +
        mobileIcon('arrow') +
        '</button>',
    };
    var widgetRows = widgetOrder()
      .map(function (w) {
        if (w.indexOf('off:') === 0) return '';
        return widgetHTML[w] || '';
      })
      .join('');
    shell(
      '<div class="mobile-home">' +
        '<section class="app-greeting"><p>' +
        (S.me ? esc(S.me.name) + '님, 반가워요' : '함께 살 준비, 서로를 아는 것부터.') +
        '</p><h1>우리의 일상,<br> 조금 더 가까이<span class="coral-dot">.</span></h1></section>' +
        draftBannerHTML() +
        banners +
        installBanner +
        '<section class="today-mission"><div class="mission-top"><span class="mission-label">' +
        (!S.me ? '나를 알아가는 시간' : S.partner ? '함께 맞춰가는 생활' : '우리의 다음 단계') +
        '</span><span class="mission-count">' +
        (count < 3 ? '0' + (count + 1) : '03') +
        ' <span>/ 03</span></span></div><h2>' +
        title +
        '</h2><p>' +
        (!S.me ? '16가지 캐릭터 속, 나의 생활방식을 발견해요.' : !S.partner ? '나와 메이트의 생활방식을 맞춰봐요.' : '잘 맞는 부분도, 대화가 필요한 부분도.') +
        '</p>' +
        missionSteps +
        portraits +
        '<div class="mission-footer"><span>' +
        (draft ? S.answers.length + ' / 20 문항 완료 · 자동 저장됨' : S.me ? '나를 알고, 서로를 이해하는 시간' : '동거 성향 테스트 · 20문항 · 약 3분') +
        '</span><button class="mobile-primary home-primary" data-action="' +
        action +
        '" type="button">' +
        cta +
        mobileIcon('arrow') +
        '</button></div></section>' +
        '<div class="home-support">' +
        connection +
        '<div class="app-shortcuts"><button type="button" data-action="' +
        (S.me ? 'result' : 'start') +
        '"><span class="shortcut-icon pink">' +
        mobileIcon('user') +
        '</span>나의 성향</button><button type="button" data-action="' +
        (S.me && S.partner ? 'report' : 'demo') +
        '"><span class="shortcut-icon blue">' +
        mobileIcon('heart') +
        '</span>궁합 리포트</button><button type="button" data-action="checklist"><span class="shortcut-icon mint">' +
        NAV_ICONS.checklist +
        '</span>입주 준비</button></div>' +
        (S.me && S.partner
          ? '<div class="app-shortcuts life"><button type="button" data-action="settle"><span class="shortcut-icon pink">' +
            mobileIcon('plus') +
            '</span>생활비</button><button type="button" data-action="chores"><span class="shortcut-icon blue">' +
            NAV_ICONS.checklist +
            '</span>역할 분담</button><button type="button" data-action="calendar"><span class="shortcut-icon mint">' +
            mobileIcon('plus') +
            '</span>우리 일정</button><button type="button" data-action="checkin"><span class="shortcut-icon pink">' +
            mobileIcon('heart') +
            '</span>주간 점검</button></div>'
          : '') +
        (S.inviteExpired
          ? '<div class="note-box warn" style="margin:14px 0"><span>받은 초대 링크가 만료됐어요. 메이트에게 새 링크를 요청해 주세요.</span></div>'
          : '') +
        (S.me && S.partner && !thisCheckin()
          ? '<button class="checkin-banner" type="button" data-action="checkin"><span>' +
            mobileIcon('heart') +
            '</span><span><strong>이번 주 우리 생활 어땠어요?</strong><small>일주일 한 번, 가볍게 점검해요</small></span>' +
            mobileIcon('arrow') +
            '</button>'
          : '') +
        widgetRows +
        '</div></div>'
    );
    bindHomeCarousel(startId);
  }
  /* 홈 위젯 메타 — id → 설정에서 보이는 이름 */
  var WIDGET_META = { today: '오늘 할 일', upcoming: '다가오는 일정', talk: '오늘의 대화', prep: '입주 준비 현황' };
  function widgetOrder() {
    var base = ['today', 'upcoming', 'talk', 'prep'];
    var o = S.homeWidgets;
    if (!Array.isArray(o)) return base;
    var known = o.filter(function (w) {
      return WIDGET_META[w.replace('off:', '')];
    });
    /* 누락된 위젯은 기본 위치에 보충한다 */
    base.forEach(function (b) {
      if (
        !known.some(function (w) {
          return w === b || w === 'off:' + b;
        })
      )
        known.push(b);
    });
    return known;
  }
  /* 생활 도구 최근 활동 피드 — 지출·쇼핑·체크인·정산·합의서를 시간순으로 모은다 */
  function activityFeed() {
    var feed = [];
    S.expenses.forEach(function (x) {
      feed.push({ ts: x.ts, icon: 'plus', text: esc(payerName(x.payer)) + ' 지출 · ' + esc(x.memo || '지출') + ' ' + fmtWon(x.amount) });
    });
    S.shopping.forEach(function (x) {
      feed.push({ ts: x.ts, icon: 'checklist', text: (x.done ? '같이 살 것 완료 · ' : '같이 살 것 추가 · ') + esc(x.name) });
    });
    S.checkins.forEach(function (c) {
      feed.push({ ts: c.ts, icon: 'heart', text: '주간 체크인 · ' + (c.week === isoWeekKey() ? '이번 주' : c.week) });
    });
    S.settled.forEach(function (z) {
      feed.push({ ts: z.ts, icon: 'checklist', text: '정산 마감 · ' + esc(z.label) });
    });
    if (S.agreement && S.agreement.ts) {
      feed.push({ ts: S.agreement.ts, icon: 'heart', text: '생활규칙 합의서 v' + (S.agreement.rev || 1) + ' 저장' });
    }
    S.conflictLog.forEach(function (c) {
      feed.push({ ts: c.ts, icon: 'chat', text: '갈등 대화 합의 · ' + esc(c.note || '').slice(0, 30) });
    });
    /* 메이트(상대) 활동 — 동기화로 들어온 기록 */
    var pname = esc(payerName('you'));
    Object.keys(S.choreLog).forEach(function (wk) {
      var log2 = S.choreLog[wk] || {};
      Object.keys(log2).forEach(function (cid) {
        var v = log2[cid];
        if (v && typeof v === 'object' && v.by === 'you') {
          feed.push({ ts: v.ts, icon: 'checklist', text: '🧑‍🤝‍🧑 ' + pname + '님이 집안일 완료 · ' + wk, partner: 1 });
        }
      });
    });
    S.coupons.forEach(function (c) {
      if (c.by === 'you') feed.push({ ts: c.ts, icon: 'heart', text: '🧑‍🤝‍🧑 ' + pname + '님이 쿠폰 발급 · ' + esc(c.title), partner: 1 });
      if (c.usedTs) feed.push({ ts: c.usedTs, icon: 'heart', text: '쿠폰 사용 · ' + esc(c.title) });
    });
    if (S.goal && S.goal.saves.length) {
      var gs = S.goal.saves[S.goal.saves.length - 1];
      feed.push({ ts: gs.ts, icon: 'heart', text: '공동 저축 · ' + esc(S.goal.name) + ' +' + fmtWon(gs.amt) });
    }
    return feed
      .sort(function (a, b) {
        return b.ts - a.ts;
      })
      .slice(0, 10);
  }

  function vSpace() {
    checkBadges();
    var stats = checklistStats();
    var notes = load('mateon.talks') || {};
    var savedAg = savedAgreementForPair();
    var rulesAction = S.me && S.partner ? (savedAg ? 'agreement' : 'report') : 'demo';
    var rulesLabel = savedAg ? '저장된 합의서 보기' : S.me && S.partner ? '서로 편안한 기준을 정해요' : '샘플로 먼저 살펴보기';
    var checkinDone = thisCheckin();
    var lifeTools =
      '<div class="mobile-section-head"><h2>' +
      esc(T('home.tools')) +
      '</h2><span>' +
      esc(T('home.tools.sub')) +
      '</span></div><div class="app-list">' +
      '<button type="button" data-action="settle">' +
      mobileIcon('plus') +
      '<span><strong>생활비 정산</strong><small>함께 쓴 돈 기록하고 나누기 · 영수증 스캔</small></span>' +
      mobileIcon('arrow') +
      '</button>' +
      '<button type="button" data-action="shopping">' +
      NAV_ICONS.checklist +
      '<span><strong>같이 살 것</strong><small>' +
      (S.shopping.filter(function (x) {
        return !x.done;
      }).length
        ? S.shopping.filter(function (x) {
            return !x.done;
          }).length + '개 사야 해요'
        : '장볼 때 함께 보는 목록') +
      '</small></span>' +
      mobileIcon('arrow') +
      '</button>' +
      '<button type="button" data-action="chores">' +
      NAV_ICONS.checklist +
      '<span><strong>역할 분담</strong><small>집안일 담당, 매주 자동 교체</small></span>' +
      mobileIcon('arrow') +
      '</button>' +
      '<button type="button" data-action="calendar">' +
      mobileIcon('plus') +
      '<span><strong>우리 일정</strong><small>이사일·정산일·점검일</small></span>' +
      mobileIcon('arrow') +
      '</button>' +
      '<button type="button" data-action="checkin">' +
      mobileIcon('heart') +
      '<span><strong>주간 체크인</strong><small>' +
      (checkinDone ? '이번 주 점검 완료' : '일주일 한 번, 우리 생활 돌아보기') +
      '</small></span>' +
      mobileIcon('arrow') +
      '</button>' +
      '<button type="button" data-action="lovemap">' +
      mobileIcon('heart') +
      '<span><strong>러브맵 퀴즈</strong><small>서로의 세계를 얼마나 아는지</small></span>' +
      mobileIcon('arrow') +
      '</button>' +
      '<button type="button" data-action="conflict">' +
      mobileIcon('chat') +
      '<span><strong>갈등 가이드</strong><small>서운한 일이 생겼을 때 차근차근</small></span>' +
      mobileIcon('arrow') +
      '</button></div>';
    var feed = activityFeed();
    var feedHTML = feed.length
      ? '<div class="mobile-section-head"><h2>' +
        esc(T('home.feed')) +
        '</h2><span>' +
        esc(T('home.feed.sub')) +
        '</span></div><div class="activity-feed">' +
        feed
          .map(function (f) {
            var partnerCls = /** @type {any} */ (f).partner ? ' partner' : '';
            return (
              '<div class="feed-row' +
              partnerCls +
              '"><span class="feed-icon">' +
              (f.icon === 'checklist' ? NAV_ICONS.checklist : mobileIcon(f.icon)) +
              '</span><span class="feed-text">' +
              f.text +
              '</span><time>' +
              fmtDate(f.ts) +
              '</time></div>'
            );
          })
          .join('') +
        '</div>'
      : '';
    /* 관계 온도 — 최근 체크인 기분 + 미션 달성률 + 스트릭으로 산출 */
    var tempCard = '';
    var moods = S.checkins
      .filter(function (c) {
        return c.mood;
      })
      .slice(-4);
    if (moods.length) {
      var wkSet = {};
      S.checkins.forEach(function (c) {
        wkSet[c.week] = true;
      });
      var stk = ML.streakWeeks(wkSet);
      var moodAvg =
        moods.reduce(function (a, c) {
          return a + c.mood;
        }, 0) / moods.length;
      var mRate = S.missions.list.length
        ? S.missions.list.filter(function (m) {
            return m.done;
          }).length / S.missions.list.length
        : 0;
      var temp = Math.round((moodAvg / 5) * 60 + mRate * 25 + Math.min(stk, 5) * 3);
      var tFace = temp >= 75 ? '🥰' : temp >= 50 ? '🙂' : temp >= 30 ? '😐' : '😶';
      var tMsg =
        temp >= 75
          ? '따뜻한 한 주를 보내고 있어요'
          : temp >= 50
            ? '차분하게 지내고 있어요'
            : temp >= 30
              ? '조금 서먹한 요즘이에요'
              : '서로에게 조금 더 관심을 줘볼까요?';
      tempCard =
        '<div class="mobile-section-head"><h2>' +
        esc(T('home.temp')) +
        '</h2><span>' +
        stk +
        '주 연속 기록</span></div>' +
        '<div class="temp-card" role="img" aria-label="관계 온도 ' +
        temp +
        '도"><span class="temp-face">' +
        tFace +
        '</span><div class="temp-info"><strong>' +
        temp +
        '°C</strong><div class="temp-bar"><i style="width:' +
        temp +
        '%"></i></div><p>' +
        tMsg +
        '</p></div></div>';
    }
    /* 이번 주 리포트 — 지출·집안일·체크인 요약 */
    var wkKey = isoWeekKey();
    var wkMon = mondayOf(Date.now());
    var wkExp = S.expenses.filter(function (e) {
      return (e.ts || 0) >= wkMon;
    });
    var wkChores = Object.keys(S.choreLog[wkKey] || {}).length;
    var wkReport =
      '<div class="mobile-section-head"><h2>' +
      esc(T('home.weekly')) +
      '</h2><span>' +
      weekRangeLabel(Date.now()) +
      '</span></div>' +
      '<div class="week-report"><div class="wr-item"><strong>' +
      wkExp.length +
      '</strong><small>지출 ' +
      fmtWon(
        wkExp.reduce(function (a, e) {
          return a + e.amount;
        }, 0)
      ) +
      '</small></div>' +
      '<div class="wr-item"><strong>' +
      wkChores +
      '</strong><small>집안일 완료</small></div>' +
      '<div class="wr-item"><strong>' +
      S.missions.list.filter(function (m) {
        return m.done;
      }).length +
      '/' +
      S.missions.list.length +
      '</strong><small>우리 미션</small></div>' +
      '<div class="wr-item"><strong>' +
      (checkinDone ? '완료' : '전') +
      '</strong><small>주간 체크인</small></div></div>';
    /* 즐겨찾는 대화 주제 */
    var favHTML = S.talkFavs.length
      ? '<div class="mobile-section-head"><h2>' +
        esc(T('home.favtalk')) +
        '</h2><span>' +
        S.talkFavs.length +
        '개</span></div><div class="chip-row">' +
        S.talkFavs
          .map(function (i) {
            return HOME_TALKS[i]
              ? '<button class="chip" data-action="talk-open" data-talk="' + i + '" type="button">★ ' + esc(HOME_TALKS[i][0]) + '</button>'
              : '';
          })
          .join('') +
        '</div>'
      : '';
    shell(
      '<section class="space-page"><p class="app-overline">OUR SPACE</p><h1 class="mobile-title">' +
        esc(S.homeName || '우리 공간') +
        '</h1><p class="mobile-subtitle">' +
        esc(T('view.space.desc')) +
        '</p><div class="space-summary"><span>' +
        NAV_ICONS.home +
        '</span><h2>우리의 시작을 준비해요</h2><p>입주 준비 ' +
        stats.done +
        ' / ' +
        stats.total +
        ' 완료</p><div class="space-progress"><i style="width:' +
        (stats.done / stats.total) * 100 +
        '%"></i></div></div><div class="app-list"><button type="button" data-action="checklist">' +
        NAV_ICONS.checklist +
        '<span><strong>입주 체크리스트</strong><small>계약부터 생활용품까지</small></span>' +
        mobileIcon('arrow') +
        '</button><button type="button" data-action="' +
        rulesAction +
        '">' +
        mobileIcon('heart') +
        '<span><strong>우리집 생활규칙</strong><small>' +
        rulesLabel +
        '</small></span>' +
        mobileIcon('arrow') +
        '</button><button type="button" data-action="' +
        (S.me ? 'invite' : 'start') +
        '">' +
        mobileIcon('user') +
        '<span><strong>메이트 연결</strong><small>' +
        (S.partner ? esc(S.partner.name) + '님과 연결됨' : '함께할 메이트 초대하기') +
        '</small></span>' +
        mobileIcon('arrow') +
        '</button></div>' +
        lifeTools +
        tempCard +
        wkReport +
        feedHTML +
        favHTML +
        monthReportHTML() +
        couponHTML() +
        rouletteHTML() +
        careHTML() +
        memosHTML() +
        lovelangHTML() +
        badgesHTML() +
        albumHTML() +
        yearReviewHTML() +
        '<div class="mobile-section-head"><h2>' +
        esc(T('home.mytalks')) +
        '</h2><span>' +
        Object.keys(notes).filter(function (k) {
          return HOME_TALKS[k];
        }).length +
        '개</span></div>' +
        (Object.keys(notes).filter(function (k) {
          return HOME_TALKS[k];
        }).length
          ? Object.keys(notes)
              .filter(function (k) {
                return HOME_TALKS[k];
              })
              .map(function (k) {
                return (
                  '<button class="saved-talk" data-action="talk-open" data-talk="' +
                  k +
                  '" type="button"><span>' +
                  HOME_TALKS[k][0] +
                  (notes[k].ts ? ' · ' + ML.dateLabel(notes[k].ts) : '') +
                  '</span><strong>' +
                  esc(HOME_TALKS[k][1]) +
                  '</strong><p>' +
                  esc(notes[k].text) +
                  '</p></button>'
                );
              })
              .join('')
          : '<div class="empty-notes">' +
            mobileIcon('chat') +
            '<p>아직 남긴 이야기가 없어요.</p><button type="button" data-action="talk-open">첫 생각 남기기</button></div>') +
        '<p class="device-note">대화 기록은 이 기기에만 저장돼요.</p></section>'
    );
  }

  /* ISO 주차 키('YYYY-Www') → 그 주의 월요일 Date */
  function isoWeekMonday(k) {
    var m = /^(\d{4})-W(\d{2})$/.exec(k || '');
    if (!m) return null;
    var jan4 = new Date(+m[1], 0, 4);
    var off = jan4.getDay() === 0 ? 6 : jan4.getDay() - 1;
    var wk1 = new Date(jan4.getTime() - off * 86400000);
    return new Date(wk1.getTime() + (+m[2] - 1) * 7 * 86400000);
  }
  /* ---- 이번 달 리포트 — 지출·체크인·집안일의 월간 요약 ---- */
  /* ---- 생활 카드 렌더러 — js/household.js (window.MateHouse) ---- */
  var MH = window.MateHouse;
  MH.bind({ S: S, esc: esc, fmtWon: fmtWon, payerName: payerName, armBtn: armBtn, dateStr: dateStr, isoWeekMonday: isoWeekMonday });
  var MV = window.MateViews;
  MV.bind({ S: S, esc: esc, shell: shell, docShell: docShell });
  function monthReportHTML() {
    return MH.monthReportHTML();
  }
  function couponHTML() {
    return MH.couponHTML();
  }
  function rouletteHTML() {
    return MH.rouletteHTML();
  }
  function careHTML() {
    return MH.careHTML();
  }
  function memosHTML() {
    return MH.memosHTML();
  }

  /* ---- 업적 배지 — 쌓인 기록으로 자동 달성 (렌더는 js/household.js) ---- */
  function earnedBadges() {
    return MH.earnedBadges();
  }
  function checkBadges() {
    var now = earnedBadges();
    var fresh = now.filter(function (id) {
      return S.badges.indexOf(id) === -1;
    });
    if (!fresh.length) return;
    S.badges = now;
    save('mateon.badges', S.badges);
    var def = BADGE_DEFS.find(function (d) {
      return d.id === fresh[0];
    });
    if (def) {
      showToast('배지 획득! ' + def.icon + ' ' + def.name, { type: 'good' });
      buzz(60);
      pushNotif(def.icon, '배지 획득: ' + def.name, 'space');
    }
  }
  function badgesHTML() {
    return MH.badgesHTML();
  }
  function yearReviewHTML() {
    return MH.yearReviewHTML();
  }
  function albumHTML() {
    return MH.albumHTML();
  }
  function lovelangHTML() {
    return MH.lovelangHTML();
  }

  var albumDialog = null;
  function openAlbum() {
    var ids = [];
    S.expenses.forEach(function (x) {
      if (x.rcpt) ids.push({ id: x.id, label: '🧾 ' + (x.memo || '영수증') });
    });
    Object.keys(S.choreLog).forEach(function (wk) {
      var log = S.choreLog[wk] || {};
      Object.keys(log).forEach(function (cid) {
        if (log[cid] && log[cid].img) ids.push({ id: 'proof:' + wk + ':' + cid, label: '📷 인증샷' });
      });
    });
    (S.photos || []).forEach(function (p) {
      ids.push({ id: 'photo:' + p.id, label: '🖼️ ' + (p.label || '공유 사진') });
    });
    if (!albumDialog) {
      albumDialog = document.createElement('dialog');
      albumDialog.className = 'talk-sheet album-sheet';
      albumDialog.innerHTML =
        '<div class="sheet-handle" aria-hidden="true"></div><div class="sheet-heading"><span>사진 모아보기</span><button class="icon-button" type="button" aria-label="닫기" data-album-close>' +
        mobileIcon('close') +
        '</button></div><div class="album-grid"></div>';
      albumDialog.addEventListener('click', function (e) {
        if (e.target.closest('[data-album-close]')) albumDialog.close();
      });
      albumDialog.addEventListener('close', function () {
        albumDialog.querySelectorAll('img').forEach(function (i) {
          if (i.src.indexOf('blob:') === 0) URL.revokeObjectURL(i.src);
        });
        albumDialog.querySelector('.album-grid').innerHTML = '';
      });
      document.body.appendChild(albumDialog);
    }
    var grid = albumDialog.querySelector('.album-grid');
    grid.innerHTML = '';
    ids.forEach(function (it) {
      var cell = document.createElement('div');
      cell.className = 'album-cell';
      var lb = document.createElement('small');
      lb.textContent = it.label;
      cell.appendChild(lb);
      grid.appendChild(cell);
      rcptGet(it.id)
        .then(function (blob) {
          if (!blob) {
            cell.classList.add('miss');
            cell.insertAdjacentText('beforeend', '없음');
            return;
          }
          var img = document.createElement('img');
          img.src = URL.createObjectURL(blob);
          img.alt = it.label;
          img.loading = 'lazy';
          img.addEventListener('click', function () {
            showReceipt(it.id);
          });
          cell.insertBefore(img, lb);
        })
        .catch(function () {
          /* 이미지 로딩 실패는 빈 칸으로 */
        });
    });
    if (albumDialog.showModal) albumDialog.showModal();
    else albumDialog.setAttribute('open', '');
  }

  var talkDialog = null;
  var talkOpener = null;
  function openTalk(index) {
    if (Number.isInteger(index) && HOME_TALKS[index]) talkIndex = index;
    var notes = load('mateon.talks') || {};
    talkOpener = document.activeElement;
    talkDialog = document.createElement('dialog');
    talkDialog.className = 'talk-sheet';
    talkDialog.setAttribute('aria-labelledby', 'talk-title');
    var follow = HOME_TALKS[talkIndex][2];
    var isFav = S.talkFavs.indexOf(talkIndex) >= 0;
    talkDialog.innerHTML =
      '<div class="sheet-handle" aria-hidden="true"></div><div class="sheet-heading"><span>오늘의 대화 · ' +
      HOME_TALKS[talkIndex][0] +
      '</span><span><button class="icon-button" type="button" aria-label="즐겨찾기" aria-pressed="' +
      isFav +
      '" data-sheet-fav>' +
      (isFav ? '★' : '☆') +
      '</button><button class="icon-button" type="button" aria-label="닫기" data-sheet-close>' +
      mobileIcon('close') +
      '</button></span></div><h2 id="talk-title">' +
      HOME_TALKS[talkIndex][1] +
      '</h2>' +
      (follow ? '<p class="talk-follow"><span>이어서 물어보기</span>' + esc(follow) + '</p>' : '') +
      '<label for="talk-note">나의 생각</label><textarea id="talk-note" maxlength="500" rows="4" placeholder="정답은 없어요. 편하게 적어보세요.">' +
      esc(notes[talkIndex] ? notes[talkIndex].text : S.sharedText || '') +
      '</textarea>' +
      (notes[talkIndex] && notes[talkIndex].ts ? '<p class="sheet-hint">마지막 기록 ' + ML.dateLabel(notes[talkIndex].ts) + '</p>' : '') +
      '<p class="sheet-hint">이 기기에만 저장되며, 메이트에게 자동 전송되지 않아요.</p><button class="mobile-primary" type="button" data-sheet-save>내 생각 저장하기</button>';
    if (notes[talkIndex]) talkDialog.innerHTML += '<button class="connection-cancel" type="button" data-sheet-delete>이 기록 삭제하기</button>';
    var deleteArmed = false;
    document.body.appendChild(talkDialog);
    talkDialog.addEventListener('close', function () {
      talkDialog.remove();
      talkDialog = null;
      document.body.classList.remove('sheet-open');
      if (talkOpener && talkOpener.isConnected) talkOpener.focus();
    });
    talkDialog.addEventListener('click', function (e) {
      if (e.target.closest('[data-sheet-close]')) talkDialog.close();
      else if (e.target.closest('[data-sheet-fav]')) {
        var fi = S.talkFavs.indexOf(talkIndex);
        if (fi >= 0) S.talkFavs.splice(fi, 1);
        else S.talkFavs.push(talkIndex);
        save('mateon.talkFavs', S.talkFavs);
        var fb = talkDialog.querySelector('[data-sheet-fav]');
        if (fb) {
          fb.textContent = fi >= 0 ? '☆' : '★';
          fb.setAttribute('aria-pressed', String(fi < 0));
        }
      } else if (e.target.closest('[data-sheet-delete]')) {
        if (!deleteArmed) {
          deleteArmed = true;
          e.target.closest('[data-sheet-delete]').textContent = '한 번 더 눌러 삭제';
          return;
        }
        delete notes[talkIndex];
        try {
          localStorage.setItem('mateon.talks', JSON.stringify(notes));
        } catch (err) {
          showToast('저장 공간을 확인해 주세요');
          return;
        }
        talkDialog.close();
        render();
        var deleteFocus = document.querySelectorAll('[data-action="talk-open"]')[0];
        if (deleteFocus) deleteFocus.focus({ preventScroll: true });
        showToast('대화 기록을 삭제했어요');
      } else if (e.target.closest('[data-sheet-save]')) {
        var value = document.getElementById('talk-note').value.trim();
        if (!value) {
          document.getElementById('talk-note').focus();
          showToast('생각을 한 줄 남겨주세요');
          return;
        }
        notes[talkIndex] = { text: value, ts: Date.now() };
        S.sharedText = '';
        try {
          localStorage.setItem('mateon.talks', JSON.stringify(notes));
        } catch (err) {
          showToast('저장 공간을 확인해 주세요');
          return;
        }
        var savedY = window.scrollY || 0;
        talkDialog.close();
        render();
        window.scrollTo(0, savedY);
        var savedFocus = document.querySelectorAll('[data-action="talk-open"]')[0];
        if (savedFocus) savedFocus.focus({ preventScroll: true });
        showToast('나의 생각을 저장했어요');
      }
    });
    document.body.classList.add('sheet-open');
    talkDialog.showModal();
  }

  /* ================= View: 온보딩 ================= */

  function vOnboarding() {
    MV.vOnboarding();
  }

  /* ================= View: 설문 ================= */
  function vSurvey() {
    var i = S.q;
    var q = QUESTIONS[i];
    var dom = DOMAINS.find(function (d) {
      return d.id === q.domain;
    });
    var keys = ['A', 'B', 'C', 'D'];
    var prev = S.answers.find(function (a) {
      return a.qid === q.id;
    });

    shell(
      '' +
        '<div class="survey-top">' +
        '<button class="back-btn" data-action="prev" type="button" ' +
        (i === 0 ? 'disabled' : '') +
        ' aria-label="이전 문항">' +
        '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>' +
        '</button>' +
        '<div class="progress"><div class="progress-fill" style="width:' +
        Math.round(((i + 1) / QUESTIONS.length) * 100) +
        '%"></div></div>' +
        '<span class="progress-num">' +
        (i + 1) +
        ' / ' +
        QUESTIONS.length +
        '</span>' +
        '</div>' +
        '<div class="q-slide ' +
        (S.qDir === 'prev' ? 'q-prev' : 'q-next') +
        '">' +
        '<span class="badge badge-brand domain-tag">' +
        esc(dom.label) +
        '</span>' +
        '<h2 class="question-text">' +
        esc(q.text) +
        '</h2>' +
        '<div class="opt-list">' +
        q.options
          .map(function (o, idx) {
            var sel = prev && prev.code === o.code ? ' selected' : '';
            return (
              '<button class="opt-card' +
              sel +
              '" data-action="answer" data-idx="' +
              idx +
              '" type="button">' +
              '<span class="opt-key">' +
              keys[idx] +
              '</span><span>' +
              esc(o.text) +
              '</span></button>'
            );
          })
          .join('') +
        '</div>' +
        '<p class="survey-notice caption">가장 이상적인 행동이 아니라, 실제 내 모습과 가장 가까운 답을 골라주세요.</p></div>'
    );
  }

  /* ================= View: 개인 결과 ================= */
  // Character sheets: E increases left-to-right; R4 is the top row.
  function characterArt(c, lazy, cutout) {
    if (cutout) {
      var cutoutX = [0, 340, 680, 1021][+c.code[1] - 1];
      var cutoutY = [890, 610, 330, 0][+c.code[3] - 1];
      var cutoutHeight = [266, 280, 280, 330][+c.code[3] - 1];
      return (
        '<span class="character-art character-art-cutout" style="aspect-ratio:340.25/' +
        cutoutHeight +
        '"><picture><source srcset="assets/character-sheet-cutout-v2.webp" type="image/webp"><img src="assets/character-sheet-cutout-v2.png" alt="' +
        esc(c.name) +
        ' 캐릭터" width="1361" height="1156" ' +
        (lazy ? 'loading="lazy"' : 'fetchpriority="high"') +
        ' style="left:' +
        (-cutoutX / 340.25) * 100 +
        '%;top:' +
        (-cutoutY / cutoutHeight) * 100 +
        '%"></picture></span>'
      );
    }
    var x = [126, 430, 734, 1031][+c.code[1] - 1];
    var y = [843, 604, 365, 123][+c.code[3] - 1];
    var height = +c.code[3] === 1 ? 202 : 229;
    return (
      '<span class="character-art" style="aspect-ratio:294/' +
      height +
      '"><picture><source srcset="assets/character-sheet.webp" type="image/webp"><img src="assets/character-sheet.png" alt="' +
      esc(c.name) +
      ' 캐릭터" width="1361" height="1156" ' +
      (lazy ? 'loading="lazy"' : 'fetchpriority="high"') +
      ' style="left:' +
      (-x / 294) * 100 +
      '%;top:' +
      (-y / height) * 100 +
      '%"></picture></span>'
    );
  }

  function resultShareText(r, c) {
    return (
      'MATE:ON 동거 성향 진단 결과\n' +
      '나의 동거 캐릭터: ' +
      c.name +
      ' (' +
      c.code +
      ')\n' +
      '교류 활성도 ' +
      pct(r.eAvg) +
      '% · 자극 민감도 ' +
      pct(r.rAvg) +
      '%\n' +
      c.quote +
      '\n' +
      '너는 어떤 유형일까? ' +
      inviteURL(r)
    );
  }

  function inviteURL(r) {
    var rr = r;
    if (S.shareName === false) rr = Object.assign({}, r, { name: '동거인' });
    return publicBaseURL() + '?invite=' + encodeInvite(rr, S.inviteDays);
  }

  function vResult() {
    var r = S.flow === 'partner' ? S.partner : S.me;
    if (!r) {
      go('home');
      return;
    }
    var c = charById(r.charId);
    var c2 = charById(r.char2Id);
    var isMine = S.flow === 'me';
    var noteIcon =
      '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>';

    var seq = c.conflictSeq
      .map(function (s, i) {
        return (
          '<div class="seq-step"><span class="seq-dot">' +
          (i + 1) +
          '</span><span class="body-sm">' +
          esc(s) +
          '</span></div>' +
          (i < c.conflictSeq.length - 1 ? '<div class="seq-line"></div>' : '')
        );
      })
      .join('');

    var ctas;
    if (isMine && S.partner) {
      ctas =
        '<div class="cta-col">' +
        '<button class="btn btn-primary btn-lg" data-action="report" type="button">우리 둘 궁합 리포트 보기</button>' +
        '<button class="btn btn-secondary btn-md" data-action="saveimg" type="button">결과 카드 이미지 저장</button>' +
        '<button class="btn btn-secondary btn-md" data-action="share" type="button">결과 공유하기</button>' +
        '<button class="btn btn-tertiary btn-md" data-action="retry" type="button">다시 진단하기</button></div>';
    } else if (isMine) {
      ctas =
        '<div class="cta-col">' +
        '<button class="btn btn-primary btn-lg" data-action="invite" type="button">상대 초대하고 궁합 보기</button>' +
        '<button class="btn btn-secondary btn-md" data-action="saveimg" type="button">결과 카드 이미지 저장</button>' +
        '<button class="btn btn-secondary btn-md" data-action="share" type="button">결과 공유하기</button>' +
        '<button class="btn btn-tertiary btn-md" data-action="retry" type="button">다시 진단하기</button></div>';
    } else {
      ctas =
        '<div class="cta-col">' +
        '<button class="btn btn-primary btn-lg" data-action="report" type="button">우리 둘 궁합 리포트 보기</button>' +
        '<button class="btn btn-secondary btn-md" data-action="saveimg" type="button">결과 카드 이미지 저장</button></div>';
    }

    // 실무 성향 (E/R과 별도 영역)
    var lifeHTML;
    if (r.life && r.life.length) {
      lifeHTML =
        '<div class="card" style="margin-top:16px"><h4 class="card-title">실무 성향 메모</h4>' +
        '<div class="life-summary">' +
        r.life
          .map(function (x) {
            return '<div class="life-row"><span class="lr-area">' + esc(x.area) + '</span><span class="lr-val">' + esc(x.label) + '</span></div>';
          })
          .join('') +
        '</div></div>';
    } else if (isMine) {
      lifeHTML =
        '<div class="card" style="margin-top:16px"><h4 class="card-title">실무 성향 체크 (6문항)</h4>' +
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
      histHTML =
        '<div class="card" style="margin-top:16px"><h4 class="card-title">이전 진단과 비교</h4>' +
        '<div class="hist-row"><span class="h-date">' +
        fmtDate(prev.ts) +
        '</span><span class="h-char">' +
        esc(prevC.name) +
        '</span><span class="h-date">' +
        prevC.code +
        '</span></div>' +
        '<div class="hist-arrow">↓</div>' +
        '<div class="hist-row current"><span class="h-date">지금</span><span class="h-char">' +
        esc(c.name) +
        '</span><span class="h-date">' +
        c.code +
        '</span></div>' +
        (prev.charId === r.charId
          ? '<p class="gap-desc" style="margin-top:12px">같은 유형이에요. 생활 성향이 안정적인 편이에요.</p>'
          : '<p class="gap-desc" style="margin-top:12px">유형이 바뀌었어요. 상황이나 생활 패턴이 달라졌을 수 있어요.</p>') +
        '</div>';
    }

    var typesLink =
      '<div class="cta-col" style="margin-top:16px"><button class="btn btn-tertiary btn-md" data-action="types" type="button">16유형 도감 보기</button></div>';

    shell(
      '<div class="result-page">' +
        '<p class="eyebrow caption" style="text-align:center;display:block">' +
        (isMine ? '나의 동거 캐릭터' : esc(r.name) + '님의 동거 캐릭터') +
        '</p>' +
        '<div class="card char-hero result-hero tone-r' +
        c.code[3] +
        '">' +
        '<span class="char-code">' +
        c.code +
        '</span>' +
        '<h2 class="char-name">' +
        esc(c.name) +
        '</h2>' +
        characterArt(c, false) +
        '<p class="char-quote">' +
        esc(c.quote) +
        '</p>' +
        '<div class="char-meta">' +
        '<span class="badge badge-neutral">응답 일치도 ' +
        esc(r.conf) +
        '</span>' +
        (c2 && c2.id !== c.id
          ? '<button class="similar-type" data-action="type" data-id="' + c2.id + '" type="button">비슷한 유형 · ' + esc(c2.name) + ' →</button>'
          : '') +
        '</div>' +
        '</div>' +
        '<p class="result-context">20문항에서 발견한 생활 성향이에요. 응답 일치도는 유형 간 점수 차이를 요약한 것으로, 진단 정확도를 뜻하지 않아요.</p>' +
        '<section class="result-takeaway" aria-label="오늘의 생활 팁"><span>함께 살 때 기억해 주세요</span><p>' +
        esc(c.dos[0]) +
        '</p></section>' +
        ctas +
        (isMine
          ? '<div class="result-sharing"><p>공유 링크에는 유형·성향 수치·생활 기준이 포함돼요. 링크를 가진 사람이 결과를 볼 수 있어요.</p><button class="similar-type" data-action="share-name" type="button" aria-pressed="' +
            (S.shareName !== false) +
            '">공유할 때 닉네임 ' +
            (S.shareName !== false ? '포함 · 눌러서 제외' : '제외 · 눌러서 포함') +
            '</button></div>'
          : '') +
        '<details class="card result-details" style="margin-top:16px"><summary>나의 성향 좌표 · 수치와 해석</summary>' +
        '<div class="gauge-block">' +
        gaugeHTML('생활 교류 활성도 (E)', r.eAvg, false) +
        gaugeHTML('생활 자극 민감도 (R)', r.rAvg, true) +
        '</div>' +
        '<div style="margin-top:20px">' +
        matrixHTML(r.charId, null, r.name || '나') +
        '</div>' +
        '<p class="caption text-muted" style="margin-top:16px">수치는 순위나 궁합 점수가 아니라, 20개 응답에서 나타난 성향의 위치예요. 결과는 판정이 아니라 대화를 돕는 참고 도구예요.</p>' +
        '</details>' +
        '<div class="card" style="margin-top:16px">' +
        '<h4 class="card-title">같이 살면 나는 이런 사람</h4>' +
        '<ul class="trait-list">' +
        c.traits
          .map(function (t) {
            return '<li>' + esc(t) + '</li>';
          })
          .join('') +
        '</ul>' +
        '<div class="note-box ' +
        (c.note.type === 'warn' ? 'warn' : c.note.type === 'good' ? 'good' : 'info') +
        '" style="margin-top:16px">' +
        noteIcon +
        '<span>' +
        esc(c.note.text) +
        '</span></div>' +
        '</div>' +
        '<div class="card" style="margin-top:16px">' +
        '<h4 class="card-title">동거인이 실제로 보게 되는 나</h4>' +
        '<div class="view-vs">' +
        '<div class="vs-side"><span class="vs-label">내 생각</span>' +
        esc(c.selfView) +
        '</div>' +
        '<span class="vs-mark">↔</span>' +
        '<div class="vs-side"><span class="vs-label">동거인에게는</span>' +
        esc(c.partnerView) +
        '</div>' +
        '</div>' +
        '</div>' +
        '<div class="card" style="margin-top:16px">' +
        '<h4 class="card-title">갈등이 생겼을 때의 내 흐름</h4>' +
        '<div class="seq">' +
        seq +
        '</div>' +
        '</div>' +
        '<div class="card" style="margin-top:16px">' +
        '<h4 class="card-title">내가 예민해지는 순간 Top 3</h4>' +
        '<ol class="trigger-list">' +
        c.triggers
          .map(function (t) {
            return '<li>' + esc(t) + '</li>';
          })
          .join('') +
        '</ol>' +
        '</div>' +
        '<div class="card" style="margin-top:16px">' +
        '<h4 class="card-title">나와 살 때 사용설명서</h4>' +
        '<div class="do-grid">' +
        '<div class="do-col do"><h5>이렇게 해주세요</h5><ul>' +
        c.dos
          .map(function (t) {
            return '<li>· ' + esc(t) + '</li>';
          })
          .join('') +
        '</ul></div>' +
        '<div class="do-col dont"><h5>이건 피해주세요</h5><ul>' +
        c.donts
          .map(function (t) {
            return '<li>· ' + esc(t) + '</li>';
          })
          .join('') +
        '</ul></div>' +
        '</div>' +
        '</div>' +
        '<div class="card" style="margin-top:16px">' +
        '<h4 class="card-title">나를 편하게 만드는 집</h4>' +
        '<div class="comfort-chips">' +
        c.comfort
          .map(function (t) {
            return '<span class="badge badge-brand">' + esc(t) + '</span>';
          })
          .join('') +
        '</div>' +
        '</div>' +
        lifeHTML +
        histHTML +
        typesLink +
        '</div>'
    );
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
    } catch (e) {
      /* an invalid link must not change the current partner */
    }
    return null;
  }

  function qrSVG(text) {
    try {
      if (typeof window.qrcode !== 'function') return '';
      var q = window.qrcode(0, 'M');
      q.addData(text);
      q.make();
      var n = q.getModuleCount(),
        cell = 4,
        pad = 18,
        size = n * cell + pad * 2;
      var d = '';
      for (var r = 0; r < n; r++)
        for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c * cell + pad) + ' ' + (r * cell + pad) + 'h' + cell + 'v' + cell + 'h-' + cell + 'z';
      return (
        '<svg viewBox="0 0 ' +
        size +
        ' ' +
        size +
        '" class="qr-svg" role="img" aria-label="초대 링크 QR 코드"><rect width="' +
        size +
        '" height="' +
        size +
        '" rx="14" fill="#fff"/><path d="' +
        d +
        '" fill="#303943"/></svg>'
      );
    } catch (e) {
      return '';
    }
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
        update =
          '<div class="update-diff"><span class="badge ' +
          (changed ? 'badge-warning' : 'badge-info') +
          '">' +
          (changed ? '유형이 바뀌었어요' : '최신 결과') +
          '</span>' +
          '<p>' +
          esc(S.partner.name || '메이트') +
          ' · ' +
          esc(old.name) +
          ' (' +
          old.code +
          ')<span class="diff-arrow">→</span>' +
          esc(pending.name || '메이트') +
          ' · ' +
          esc(c.name) +
          ' (' +
          c.code +
          ')</p>' +
          '<p class="caption text-muted">기존 연결을 새 결과로 업데이트해요. 내 진단은 그대로예요.</p></div>';
      }
      preview =
        '<div class="connection-preview" role="status"><span class="badge badge-info">연결 전 확인</span><h4>' +
        esc(pending.name) +
        '님 · ' +
        esc(c.name) +
        ' (' +
        c.code +
        ')</h4>' +
        update +
        '<p>' +
        (S.partner ? '연결하면 현재 ' + esc(S.partner.name) + '님의 결과가 이 결과로 바뀌어요.' : '내 진단은 유지하고, 이 결과를 메이트로 연결해요.') +
        '</p>' +
        '<button class="mobile-primary" type="button" data-action="confirm-partner">' +
        (S.partner ? '새 결과로 업데이트' : '이 메이트와 연결하기') +
        '</button>' +
        '<button class="connection-cancel" type="button" data-action="cancel-partner">취소</button></div>';
    }
    return (
      '<section class="card connection-import"><h3 class="card-title">메이트가 보낸 링크 연결하기</h3>' +
      '<p class="body-sm text-muted">상대가 공유한 결과 링크를 붙여넣으면, 실제 진단 수치로 비교할 수 있어요.</p>' +
      '<label class="field-label" for="partner-link">받은 초대 링크</label>' +
      '<input class="input" id="partner-link" type="url" inputmode="url" autocomplete="off" spellcheck="false" maxlength="12000" placeholder="https://… 또는 mateon://invite?…" value="' +
      esc(S.connectionInput) +
      '">' +
      '<button class="home-secondary" type="button" data-action="preview-partner">상대 결과 확인하기</button>' +
      preview +
      '<p class="connection-hint">링크를 만든 뒤 ' +
      S.inviteDays +
      '일이 지나면 자동으로 만료돼요. 상대가 다시 진단하면 새 링크로 업데이트할 수 있어요.</p></section>'
    );
  }

  function vInvite() {
    if (!S.me) {
      go('home');
      return;
    }
    var url = inviteURL(S.me);

    var partnerDone = '';
    if (S.partner) {
      var pc = charById(S.partner.charId);
      partnerDone =
        '<div class="card resume-card partner-summary">' +
        '<span class="avatar avatar-secondary">' +
        esc((S.partner.name || '상')[0]) +
        '</span>' +
        '<div class="resume-info"><strong class="body-sm">' +
        esc(S.partner.name) +
        '님 진단 완료</strong>' +
        '<p class="caption text-muted">' +
        esc(pc.name) +
        ' (' +
        pc.code +
        ')</p></div>' +
        '<button class="btn btn-primary btn-sm" data-action="report" type="button">리포트 보기</button>' +
        '<button class="btn btn-tertiary btn-sm" data-action="unlink" type="button">연결 해제</button></div>';
    }

    var shareOn = S.shareName !== false;
    var shareInfo =
      '<div class="card">' +
      '<h4 class="card-title">링크에 포함되는 정보</h4>' +
      '<ul class="share-list">' +
      '<li>닉네임' +
      (shareOn ? '' : ' <span class="text-muted">(제외됨 — “동거인”으로 표시)</span>') +
      '</li>' +
      '<li>관계 유형 · 동거 단계</li>' +
      '<li>16유형 결과와 성향 수치</li>' +
      '</ul>' +
      '<p class="caption text-muted">문항별 응답은 포함되지 않아요. 실무 체크를 마쳤다면 생활 기준도 포함돼요. 링크를 가진 사람은 누구나 결과를 볼 수 있고, 결과는 받은 사람의 기기에만 저장돼요.</p>' +
      '<button class="share-opt' +
      (shareOn ? ' on' : '') +
      '" data-action="share-name" type="button" aria-pressed="' +
      shareOn +
      '">' +
      '<span class="share-opt-dot"></span>닉네임 포함 ' +
      (shareOn ? '켜짐' : '꺼짐') +
      '</button>' +
      '</div>';

    shell(
      '' +
        '<p class="eyebrow caption">Step 2</p>' +
        '<h2 class="view-title">이번에는 우리 둘의 생활을 맞춰볼까요?</h2>' +
        '<p class="view-desc body-md">상대도 진단을 마치면 두 분의 궁합 리포트가 완성돼요.<br>같은 점보다, 다른 점을 먼저 알아볼게요.</p>' +
        '<div class="view-stack">' +
        partnerDone +
        connectionHTML() +
        '<div class="card">' +
        '<h4 class="card-title">초대 링크 보내기</h4>' +
        '<p class="body-sm text-muted" style="margin-bottom:12px">내 결과가 담긴 링크예요. 상대가 열어서 진단하면 바로 비교됩니다.</p>' +
        '<div class="invite-link-box"><code>' +
        esc(url) +
        '</code></div>' +
        '<div class="chip-row" style="margin-top:14px"><span class="field-label" style="align-self:center;margin-right:4px">링크 유효기간</span>' +
        [1, 7, 30]
          .map(function (d) {
            return (
              '<button class="chip' +
              (S.inviteDays === d ? ' selected' : '') +
              '" data-action="invite-days" data-v="' +
              d +
              '" type="button">' +
              d +
              '일</button>'
            );
          })
          .join('') +
        '</div>' +
        '<div class="cta-col" style="margin-top:14px">' +
        '<button class="btn btn-secondary btn-md" data-action="copylink" type="button">링크 복사하기</button>' +
        '<button class="btn btn-secondary btn-md" data-action="share-invite" type="button">공유하기</button>' +
        '</div>' +
        '</div>' +
        '<div class="card qr-card">' +
        '<h4 class="card-title">QR로 바로 연결</h4>' +
        '<div class="qr-box">' +
        qrSVG(url) +
        '</div>' +
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
        '</div>'
    );
  }

  /* ================= View: 궁합 리포트 ================= */
  function domainGap(a, b) {
    if (!a || !b || typeof a.e !== 'number' || typeof b.e !== 'number') return 0;
    return Math.abs(a.e - b.e) + Math.abs(a.r - b.r); // 0~6
  }

  function gapStatus(g) {
    if (g < 1.5) return { label: '잘 맞는 편', cls: 'badge-success' };
    if (g < 2.5) return { label: '조금 다름', cls: 'badge-warning' };
    return { label: '먼저 이야기해보기', cls: 'badge-error' };
  }

  function gapInsight(domId, me, you) {
    var ins = AREA_INSIGHTS[domId];
    var de = me.e - you.e,
      dr = me.r - you.r;
    if (Math.abs(de) >= Math.abs(dr)) return ins.gapE;
    return ins.gapR;
  }

  function barPos(p) {
    return Math.round(((p.e + p.r) / 8) * 100);
  }

  /* gap이 있는 영역의 추천 규칙 + 기본 규칙 */
  function recommendedRules(me, you) {
    var gapIds = DOMAINS.filter(function (d) {
      return domainGap(me.domains[d.id], you.domains[d.id]) >= 1.5;
    }).map(function (d) {
      return d.id;
    });
    return RULE_LIBRARY.filter(function (r) {
      return gapIds.indexOf(r.domain) >= 0;
    }).concat(/** @type {any[]} */ (BASE_RULES));
  }

  /* 상대(또는 내 결과)가 바뀌면 추천 규칙 재계산 — 직접 추가한 규칙의 선택 상태는 유지 */
  function resetRulesForNewPartner() {
    var keepCustom = S.customRules.filter(function (t) {
      return S.checkedRules.indexOf(t) >= 0;
    });
    var all = S.me && S.partner ? recommendedRules(S.me, S.partner) : [];
    S.checkedRules = all
      .map(function (r) {
        return r.text;
      })
      .concat(keepCustom);
    S.rulesReady = true;
    S.signs = { me: false, partner: false };
  }

  function vReport() {
    var shared = !!S.viewPair;
    if (!shared && (!S.me || !S.partner)) {
      go(S.me ? 'invite' : 'home');
      return;
    }
    var me = shared ? S.viewPair.me : S.me,
      you = shared ? S.viewPair.partner : S.partner;
    var mc = charById(me.charId),
      yc = charById(you.charId);

    // 영역별 gap 정렬
    var rows = DOMAINS.map(function (d) {
      var a = me.domains[d.id],
        b = you.domains[d.id];
      return { d: d, a: a, b: b, gap: domainGap(a, b) };
    });
    var aligned = rows.filter(function (r) {
      return r.gap < 1.5;
    });
    var gapped = rows
      .filter(function (r) {
        return r.gap >= 1.5;
      })
      .sort(function (x, y) {
        return y.gap - x.gap;
      });
    var conflicts = rows
      .slice()
      .sort(function (x, y) {
        return y.gap - x.gap;
      })
      .slice(0, 3);

    // 추천 규칙: gap 있는 도메인의 규칙 + 기본 규칙
    var gapDomains = gapped.map(function (r) {
      return r.d.id;
    });
    var allRules = recommendedRules(me, you);
    var savedAg = shared ? null : savedAgreementForPair();
    if (!shared && !S.rulesReady) {
      S.checkedRules = (
        savedAg
          ? savedAg.rules
          : allRules.map(function (r) {
              return r.text;
            })
      ).slice();
      S.rulesReady = true;
      if (savedAg) S.signs = { me: true, partner: true };
    }

    var pairCards =
      '' +
      '<div class="pair-cards">' +
      '<div class="pair-card"><span class="avatar">' +
      esc((me.name || '나')[0]) +
      '</span>' +
      '<span class="pc-name">' +
      esc(me.name || '나') +
      '</span>' +
      '<span class="pc-char">' +
      esc(mc.name) +
      '</span>' +
      '<span class="pc-code">' +
      mc.code +
      ' · 교류 ' +
      pct(me.eAvg) +
      '% · 민감도 ' +
      pct(me.rAvg) +
      '%</span></div>' +
      '<div class="pair-card you"><span class="avatar avatar-secondary">' +
      esc((you.name || '상')[0]) +
      '</span>' +
      '<span class="pc-name">' +
      esc(you.name || '상대') +
      '</span>' +
      '<span class="pc-char">' +
      esc(yc.name) +
      '</span>' +
      '<span class="pc-code">' +
      yc.code +
      ' · 교류 ' +
      pct(you.eAvg) +
      '% · 민감도 ' +
      pct(you.rAvg) +
      '%</span></div>' +
      '</div>';

    var matrix =
      '<div class="card" style="margin-top:16px"><h4 class="card-title">우리 둘의 위치</h4>' +
      matrixHTML(me.charId, you.charId, me.name || '나', you.name || '상대') +
      '<div class="gap-legend" style="margin-top:8px"><span style="color:var(--text-brand)">● ' +
      esc(me.name || '나') +
      '</span><span style="color:var(--text-link)">● ' +
      esc(you.name || '상대') +
      '</span></div></div>';

    var alignedHTML = aligned.length
      ? '' +
        '<div class="sec-head"><h3>잘 맞는 부분</h3><span class="badge badge-success">' +
        aligned.length +
        '개 영역</span></div>' +
        aligned
          .map(function (r) {
            return (
              '<div class="card" style="margin-bottom:12px"><div class="gap-top"><span class="gap-area">' +
              esc(r.d.area) +
              '</span><span class="badge badge-success">잘 맞는 편</span></div>' +
              '<p class="gap-desc">' +
              esc(AREA_INSIGHTS[r.d.id].aligned) +
              '</p></div>'
            );
          })
          .join('')
      : '';

    var gappedHTML = gapped.length
      ? '' +
        '<div class="sec-head"><h3>미리 이야기해두면 좋은 부분</h3><span class="badge badge-warning">' +
        gapped.length +
        '개 영역</span></div>' +
        gapped
          .map(function (r) {
            var st = gapStatus(r.gap);
            return (
              '<div class="gap-row" style="margin-bottom:12px"><div class="gap-top"><span class="gap-area">' +
              esc(r.d.area) +
              '</span><span class="badge ' +
              st.cls +
              '">' +
              st.label +
              '</span></div>' +
              '<div class="gap-bar" style="--p:' +
              barPos(r.a) +
              '"></div>' +
              '<div class="gap-legend"><span>' +
              esc(me.name || '나') +
              ' ' +
              barPos(r.a) +
              '</span><span>' +
              esc(you.name || '상대') +
              ' ' +
              barPos(r.b) +
              '</span></div>' +
              '<p class="gap-desc">' +
              esc(gapInsight(r.d.id, r.a, r.b)) +
              '</p></div>'
            );
          })
          .join('')
      : '';

    var conflictHTML =
      '<div class="sec-head"><h3>생활 갈등 예측</h3><span class="badge badge-error">Top ' +
      conflicts.length +
      '</span></div>' +
      conflicts
        .map(function (r, i) {
          var sc = CONFLICT_SCENARIOS[r.d.id];
          return (
            '<div class="card conflict-card" style="margin-bottom:12px">' +
            '<div class="conflict-rank"><span class="badge badge-error">예상 ' +
            (i + 1) +
            '</span><span class="conflict-title">' +
            esc(sc.title) +
            '</span></div>' +
            '<p class="conflict-sit">' +
            esc(sc.situation) +
            '</p>' +
            '<div class="conflict-views">' +
            '<div class="conflict-view">' +
            esc(sc.views[0]) +
            '</div>' +
            '<div class="conflict-view">' +
            esc(sc.views[1]) +
            '</div>' +
            '</div>' +
            '<div class="conflict-prev"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px"><path d="M20 6 9 17l-5-5"/></svg><span><strong>예방법</strong> · ' +
            esc(sc.prevention) +
            '</span></div>' +
            '</div>'
          );
        })
        .join('');

    var commHTML =
      '<div class="sec-head"><h3>서로에게 필요한 대화 방식</h3></div>' +
      '<div class="card">' +
      '<div class="view-vs">' +
      '<div class="vs-side"><span class="vs-label">' +
      esc(me.name || '나') +
      ' · ' +
      esc(mc.name) +
      '</span>' +
      esc(mc.conflictSeq.join(' → ')) +
      '</div>' +
      '<span class="vs-mark">↔</span>' +
      '<div class="vs-side"><span class="vs-label">' +
      esc(you.name || '상대') +
      ' · ' +
      esc(yc.name) +
      '</span>' +
      esc(yc.conflictSeq.join(' → ')) +
      '</div>' +
      '</div>' +
      '<p class="gap-desc" style="margin-top:12px">' +
      commAdvice(mc, yc) +
      '</p>' +
      '</div>';

    // 실무 영역 비교 (둘 다 실무 체크를 마친 경우)
    var lifeCmpHTML = '';
    if (me.life && you.life) {
      lifeCmpHTML =
        '<div class="sec-head"><h3>실무 영역 미리보기</h3><span class="badge badge-info">청결·비용 등</span></div>' +
        '<div class="card"><div class="life-summary">' +
        me.life
          .map(function (ml, i) {
            var yl = you.life[i];
            var diff = Math.abs(ml.level - yl.level) >= 2;
            var ins = LIFE_INSIGHTS[ml.area];
            return (
              '<div class="life-row" style="align-items:flex-start">' +
              '<span class="lr-area">' +
              esc(ml.area) +
              '</span>' +
              '<span class="lr-val"><span class="lr-me">' +
              esc(ml.label) +
              '</span>' +
              ' · <span class="lr-you">' +
              esc(yl.label) +
              '</span></span>' +
              (diff ? '<span class="badge badge-warning">기준 다름</span>' : '<span class="badge badge-success">비슷</span>') +
              '</div>' +
              (diff ? '<p class="gap-desc" style="padding:0 16px 12px">' + esc(ins.gap) + '</p>' : '')
            );
          })
          .join('') +
        '</div></div>';
    } else if (me.life && !you.life) {
      lifeCmpHTML =
        '<div class="sec-head"><h3>실무 영역 미리보기</h3></div>' +
        '<div class="card"><p class="body-sm text-muted">' +
        esc(you.name || '상대') +
        '님도 실무 성향 체크를 완료하면 청결·비용·집안일 기준을 비교할 수 있어요.</p></div>';
    }

    // 함께 나눠볼 질문 (차이 큰 상위 2개 영역)
    var talkHTML = '';
    var talkRows = gapped.slice(0, 2);
    if (talkRows.length) {
      talkHTML =
        '<div class="sec-head"><h3>함께 나눠볼 질문</h3><span class="badge badge-info">대화 스타터</span></div>' +
        '<div class="card"><div class="talk-list">' +
        talkRows
          .map(function (r) {
            return (
              '<p class="talk-area">' +
              esc(r.d.area) +
              '</p>' +
              TALK_STARTERS[r.d.id]
                .slice(0, 2)
                .map(function (q) {
                  return '<div class="talk-q">' + esc(q) + '</div>';
                })
                .join('')
            );
          })
          .join('') +
        '</div></div>';
    }

    var totalRules = allRules.length + S.customRules.length;
    var rulesHTML =
      '<div class="sec-head"><h3>우리 둘에게 맞는 생활규칙</h3><span class="badge badge-brand">선택 ' +
      S.checkedRules.length +
      ' / ' +
      totalRules +
      '</span></div>' +
      '<p class="body-sm text-muted" style="margin-bottom:12px">차이가 큰 영역을 중심으로 추천했어요. 우리집 합의서에 담을 규칙을 골라보세요.</p>' +
      '<div class="view-stack" style="margin-top:0">' +
      allRules
        .map(function (r) {
          var checked = S.checkedRules.indexOf(r.text) >= 0;
          var rec = gapDomains.indexOf(r.domain) >= 0;
          return (
            '<button class="rule-item' +
            (checked ? ' checked' : '') +
            '" data-action="rule" data-v="' +
            esc(r.text) +
            '" type="button" aria-pressed="' +
            checked +
            '">' +
            '<span class="rule-check"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>' +
            '<span>' +
            esc(r.text) +
            '</span>' +
            (rec ? '<span class="badge badge-brand rule-area">추천</span>' : '<span class="rule-area">' + esc(r.area) + '</span>') +
            '</button>'
          );
        })
        .join('') +
      S.customRules
        .map(function (t) {
          var checked = S.checkedRules.indexOf(t) >= 0;
          return (
            '<button class="rule-item' +
            (checked ? ' checked' : '') +
            '" data-action="rule" data-v="' +
            esc(t) +
            '" type="button" aria-pressed="' +
            checked +
            '">' +
            '<span class="rule-check"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>' +
            '<span>' +
            esc(t) +
            '</span><span class="badge badge-info rule-area">직접 추가</span></button>'
          );
        })
        .join('') +
      '</div>' +
      '<div class="custom-rule"><input id="custom-rule-in" class="input" maxlength="60" autocomplete="off" placeholder="우리만의 규칙 직접 추가 (예: 화요일 저녁은 각자 자유시간)">' +
      '<button class="btn btn-secondary btn-md" data-action="add-rule" type="button">추가</button></div>' +
      '<div class="cta-col"><button class="btn btn-primary btn-lg" data-action="agreement" type="button">우리집 합의서 만들기 (' +
      S.checkedRules.length +
      '개)</button></div>';

    var bottomCTA = shared
      ? '<div class="cta-col"><button class="btn btn-primary btn-lg" data-action="pair-start" type="button">나도 진단해서 우리 리포트 만들기</button></div>'
      : '<div class="cta-col">' +
        '<button class="btn btn-secondary btn-md" data-action="copy-pair" type="button">리포트 링크 복사</button>' +
        '<button class="btn btn-tertiary btn-md" data-action="invite" type="button">상대 다시 연결하기</button></div>';

    shell(
      '' +
        (shared
          ? '<div class="card shared-banner"><strong>공유받은 리포트 보는 중</strong><p class="caption text-muted">' +
            esc(me.name || 'A') +
            '님과 ' +
            esc(you.name || 'B') +
            '님의 궁합 리포트예요.</p></div>'
          : '') +
        '<p class="eyebrow caption">Couple Report</p>' +
        '<h2 class="view-title">우리 둘 궁합 리포트</h2>' +
        '<p class="view-desc body-md">같은 점보다, 다른 점을 먼저 알아볼게요.<br>다름은 문제가 아니라 미리 맞출 부분이에요.</p>' +
        '<div style="margin-top:24px">' +
        pairCards +
        '</div>' +
        matrix +
        alignedHTML +
        gappedHTML +
        conflictHTML +
        commHTML +
        lifeCmpHTML +
        talkHTML +
        (shared ? '' : rulesHTML) +
        bottomCTA +
        '<p class="caption text-muted" style="text-align:center;margin-top:8px">이 리포트는 확정적인 판정이 아니라, 함께 살 준비를 돕는 참고 자료예요.</p>'
    );
  }

  function commAdvice(mc, yc) {
    var mR = +mc.code[3],
      yR = +yc.code[3];
    if (mR >= 3 || yR >= 3) {
      return '한 분이라도 민감도가 높은 편이에요. 갈등이 생기면 바로 몰아붙이기보다 “잠깐 정리하고 몇 시에 이야기하자”처럼 시간을 정해 대화하는 방식이 안전해요.';
    }
    return '두 분 모두 비교적 안정적으로 대응하는 편이에요. 불편한 점을 쌓아두지 말고 가볍게라도 바로 나누는 습관이 좋아요.';
  }

  /* ================= View: 우리집 합의서 ================= */
  function vAgreement() {
    if (!S.me || !S.partner) {
      go('home');
      return;
    }
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
    var version = ag ? ag.rev || 1 : 0;
    var done = S.signs.me && S.signs.partner;

    var ruleRows = rules.length
      ? rules
          .map(function (t) {
            return (
              '<div class="agree-rule"><svg aria-hidden="true" class="check-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span>' +
              esc(t) +
              '</span></div>'
            );
          })
          .join('')
      : '<div class="empty-rules">선택된 규칙이 없어요. 리포트에서 함께 지킬 규칙을 골라주세요.</div>';

    var savedNote = ag
      ? '<div class="note-box good" style="margin-top:16px"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg><span>' +
        esc(ag.date) +
        '에 저장된 합의서 v' +
        version +
        '이 있어요. (' +
        ag.rules.length +
        '개 규칙)' +
        (ag.updated ? ' ' + esc(ag.updated) + '에 수정됐어요.' : '') +
        (differs ? ' 현재 화면은 저장본과 다른 선택이에요.' : ' 저장된 규칙을 불러왔어요.') +
        '</span></div>'
      : '';
    var diffHTML = '';
    if (ag && differs) {
      var added = rules.filter(function (t) {
        return ag.rules.indexOf(t) < 0;
      });
      var removed = ag.rules.filter(function (t) {
        return rules.indexOf(t) < 0;
      });
      diffHTML =
        '<div class="agree-diff">' +
        '<div class="diff-head"><strong>저장된 합의서와 다른 선택이에요</strong><button class="btn btn-tertiary btn-sm" data-action="restore-agree" type="button">저장본으로 되돌리기</button></div>' +
        (added.length
          ? '<div class="diff-group"><span class="badge badge-brand">추가됨 ' +
            added.length +
            '</span><ul>' +
            added
              .map(function (t) {
                return '<li>' + esc(t) + '</li>';
              })
              .join('') +
            '</ul></div>'
          : '') +
        (removed.length
          ? '<div class="diff-group"><span class="badge badge-warning">제외됨 ' +
            removed.length +
            '</span><ul>' +
            removed
              .map(function (t) {
                return '<li>' + esc(t) + '</li>';
              })
              .join('') +
            '</ul></div>'
          : '') +
        '</div>';
    }
    var saveLabel = !rules.length
      ? '규칙을 한 개 이상 선택해 주세요'
      : done
        ? differs
          ? '변경된 합의서 저장하기'
          : '합의서 저장하기'
        : '두 분 모두 동의하면 저장할 수 있어요';

    shell(
      '' +
        '<p class="eyebrow caption">Our Agreement</p>' +
        '<h2 class="view-title">' +
        esc(T('view.agreement.title')) +
        '</h2>' +
        '<p class="view-desc body-md">' +
        esc(T('view.agreement.desc')) +
        '</p>' +
        /* 상황별 템플릿 — 선택지 없이 시작하고 싶을 때 기본 세트를 불러온다 */
        (!rules.length
          ? '<div class="card" style="margin-top:18px"><h4 class="card-title">템플릿으로 시작하기</h4>' +
            '<div class="agree-tpls">' +
            AGREE_TEMPLATES.map(function (t) {
              return (
                '<button class="agree-tpl" type="button" data-action="agree-tpl" data-v="' +
                t.id +
                '"><strong>' +
                esc(t.label) +
                '</strong><small>' +
                esc(t.desc) +
                ' · ' +
                t.rules.length +
                '조항</small></button>'
              );
            }).join('') +
            '</div></div>'
          : '') +
        '<div class="agree-doc" style="margin-top:24px">' +
        '<div class="agree-doc-head">' +
        logoSVG(56) +
        '<h3 class="heading-sm" style="margin-top:8px">우리집 생활 합의서' +
        (version ? ' <span class="rev-tag">v' + version + '</span>' : '') +
        '</h3>' +
        '<p class="caption text-muted">' +
        esc(S.me.name || '나') +
        ' · ' +
        esc(S.partner.name || '상대') +
        ' — ' +
        dateStr +
        '</p>' +
        '</div>' +
        ruleRows +
        '<div class="agree-signs">' +
        '<button class="sign-box' +
        (S.signs.me ? ' signed' : '') +
        '" data-action="sign" data-who="me" type="button">' +
        esc(S.me.name || '나') +
        (S.signs.me ? ' · 동의함' : ' · 서명하기') +
        '</button>' +
        '<button class="sign-box' +
        (S.signs.partner ? ' signed' : '') +
        '" data-action="sign" data-who="partner" type="button">' +
        esc(S.partner.name || '상대') +
        (S.signs.partner ? ' · 동의함' : ' · 서명하기') +
        '</button>' +
        '</div>' +
        '</div>' +
        savedNote +
        diffHTML +
        '<div class="cta-col">' +
        (done && rules.length
          ? '<button class="btn btn-primary btn-lg" data-action="save-agree" type="button">' + saveLabel + '</button>'
          : '<button class="btn btn-primary btn-lg" type="button" disabled>' + saveLabel + '</button>') +
        '<button class="btn btn-secondary btn-md" data-action="agree-img" type="button">합의서 이미지로 저장</button>' +
        '<button class="btn btn-secondary btn-md" data-action="agree-ics" type="button">한 달 뒤 점검일 캘린더 추가</button>' +
        '<button class="btn btn-secondary btn-md" data-action="copy-agree" type="button">합의서 텍스트 복사</button>' +
        '<button class="btn btn-secondary btn-md" data-action="print" type="button">인쇄/PDF로 저장</button>' +
        '<button class="btn btn-tertiary btn-md" data-action="report" type="button">리포트로 돌아가기</button>' +
        '</div>' +
        '<p class="caption text-muted" style="text-align:center;margin-top:8px">생활 합의를 돕는 문서이며, 법적 효력은 없어요.</p>'
    );
  }

  function agreementText() {
    var rules = agreementRules();
    var ag = savedAgreementForPair();
    var today = new Date();
    var dateStr = ag && sameTextList(rules, ag.rules) ? ag.date : today.getFullYear() + '년 ' + (today.getMonth() + 1) + '월 ' + today.getDate() + '일';
    var version = ag ? ' v' + (ag.rev || 1) : '';
    return (
      '우리집 생활 합의서 — ' +
      (S.me.name || '나') +
      ' & ' +
      (S.partner.name || '상대') +
      ' (' +
      dateStr +
      version +
      ')\n\n' +
      rules
        .map(function (t, i) {
          return i + 1 + '. ' + t;
        })
        .join('\n') +
      '\n\nMATE:ON에서 만들었어요. 함께 살 준비, 서로를 아는 것부터.'
    );
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
      return (
        '<button class="' +
        cls +
        '" data-action="type" data-id="' +
        c.id +
        '" type="button" style="--i:' +
        i +
        '">' +
        characterArt(c, true) +
        '<span class="tc-code">' +
        c.code +
        '</span><span class="tc-name">' +
        esc(c.name) +
        '</span>' +
        dist +
        '</button>'
      );
    }).join('');

    var legend = '';
    if (S.me) legend += '<span class="badge badge-brand">' + esc(S.me.name || '나') + '</span>';
    if (S.partner) legend += '<span class="badge badge-info">' + esc(S.partner.name || '상대') + '</span>';

    shell(
      '' +
        '<p class="eyebrow caption">Type Book</p>' +
        '<h2 class="view-title">' +
        esc(T('view.types.title')) +
        '</h2>' +
        '<p class="view-desc body-md">' +
        esc(T('view.types.desc')) +
        '</p>' +
        (legend ? '<div class="hero-meta" style="justify-content:flex-start;margin-top:16px">' + legend + '</div>' : '') +
        '<div style="margin-top:20px">' +
        matrixHTML(S.me ? S.me.charId : null, S.partner ? S.partner.charId : null, S.me ? S.me.name : null, S.partner ? S.partner.name : null) +
        '</div>' +
        '<div class="type-grid" style="margin-top:24px">' +
        cells +
        '</div>' +
        '<div class="cta-col"><button class="btn btn-tertiary btn-md" data-action="home" type="button">홈으로</button></div>'
    );
  }

  /* ================= View: 유형 상세 ================= */
  function vTypeDetail() {
    var c = charById(S.typeId);
    if (!c) {
      go('types');
      return;
    }
    var seq = c.conflictSeq
      .map(function (s, i) {
        return (
          '<div class="seq-step"><span class="seq-dot">' +
          (i + 1) +
          '</span><span class="body-sm">' +
          esc(s) +
          '</span></div>' +
          (i < c.conflictSeq.length - 1 ? '<div class="seq-line"></div>' : '')
        );
      })
      .join('');
    var noteIcon =
      '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>';

    shell(
      '' +
        '<div class="survey-top"><button class="back-btn" data-action="types" type="button" aria-label="도감으로">' +
        '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button>' +
        '<span class="progress-num">유형 도감</span></div>' +
        '<div class="card char-hero result-hero">' +
        '<span class="char-code">' +
        c.code +
        '</span>' +
        '<h2 class="char-name">' +
        esc(c.name) +
        '</h2>' +
        characterArt(c, false) +
        '<p class="char-quote">' +
        esc(c.quote) +
        '</p></div>' +
        '<div class="card" style="margin-top:16px"><h4 class="card-title">같이 살면 이런 사람</h4>' +
        '<ul class="trait-list">' +
        c.traits
          .map(function (t) {
            return '<li>' + esc(t) + '</li>';
          })
          .join('') +
        '</ul>' +
        '<div class="note-box ' +
        (c.note.type === 'warn' ? 'warn' : c.note.type === 'good' ? 'good' : 'info') +
        '" style="margin-top:16px">' +
        noteIcon +
        '<span>' +
        esc(c.note.text) +
        '</span></div></div>' +
        '<div class="card" style="margin-top:16px"><h4 class="card-title">동거인이 보게 되는 모습</h4>' +
        '<div class="view-vs">' +
        '<div class="vs-side"><span class="vs-label">본인 생각</span>' +
        esc(c.selfView) +
        '</div>' +
        '<span class="vs-mark">↔</span>' +
        '<div class="vs-side"><span class="vs-label">동거인에게는</span>' +
        esc(c.partnerView) +
        '</div></div></div>' +
        '<div class="card" style="margin-top:16px"><h4 class="card-title">갈등 시퀀스</h4><div class="seq">' +
        seq +
        '</div></div>' +
        '<div class="card" style="margin-top:16px"><h4 class="card-title">사용설명서</h4>' +
        '<div class="do-grid">' +
        '<div class="do-col do"><h5>DO</h5><ul>' +
        c.dos
          .map(function (t) {
            return '<li>· ' + esc(t) + '</li>';
          })
          .join('') +
        '</ul></div>' +
        '<div class="do-col dont"><h5>DON&#39;T</h5><ul>' +
        c.donts
          .map(function (t) {
            return '<li>· ' + esc(t) + '</li>';
          })
          .join('') +
        '</ul></div>' +
        '</div></div>' +
        '<div class="cta-col"><button class="btn btn-tertiary btn-md" data-action="types" type="button">도감으로 돌아가기</button></div>'
    );
  }

  /* ================= View: 실무 성향 체크 ================= */
  function vLifeCheck() {
    var i = S.lifeQ;
    var q = LIFE_QUESTIONS[i];
    var prev = S.lifeAnswers.find(function (a) {
      return a.qid === q.id;
    });

    shell(
      '' +
        '<div class="survey-top">' +
        '<button class="back-btn" data-action="life-prev" type="button" ' +
        (i === 0 ? 'disabled' : '') +
        ' aria-label="이전 문항">' +
        '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button>' +
        '<div class="progress"><div class="progress-fill" style="width:' +
        Math.round(((i + 1) / LIFE_QUESTIONS.length) * 100) +
        '%"></div></div>' +
        '<span class="progress-num">' +
        (i + 1) +
        ' / ' +
        LIFE_QUESTIONS.length +
        '</span></div>' +
        '<span class="badge badge-info domain-tag">실무 성향 · ' +
        esc(q.area) +
        '</span>' +
        '<h2 class="question-text">' +
        esc(q.text) +
        '</h2>' +
        '<div class="opt-list">' +
        q.options
          .map(function (o, idx) {
            var sel = prev && prev.level === o.level ? ' selected' : '';
            return (
              '<button class="life-opt' +
              sel +
              '" data-action="life-answer" data-idx="' +
              idx +
              '" type="button">' +
              '<span class="lv-tag">' +
              esc(o.label) +
              '</span><span class="lv-text">' +
              esc(o.text) +
              '</span></button>'
            );
          })
          .join('') +
        '</div>' +
        '<p class="survey-notice caption">이 답은 16유형 채점에 영향을 주지 않고, 생활 기준 비교에만 사용돼요.</p>'
    );
  }

  function finishLifeCheck() {
    var life = LIFE_QUESTIONS.map(function (q) {
      var a = S.lifeAnswers.find(function (x) {
        return x.qid === q.id;
      });
      var o = q.options[a ? a.optIdx : 0];
      return { qid: q.id, area: q.area, level: o.level, label: o.label };
    });
    var target = S.flow === 'partner' ? 'partner' : 'me';
    if (!S[target]) S[target] = { name: target === 'me' ? '나' : '상대' };
    S[target].life = life;
    save('mateon.' + target, S[target]);
    S.lifeQ = 0;
    S.lifeAnswers = [];
    go('result');
    showToast('실무 성향이 저장됐어요');
  }

  /* ================= View: 입주 체크리스트 ================= */
  function vChecklist() {
    var total = 0,
      done = 0;
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
    var pctDone = total ? Math.round((done / total) * 100) : 0;

    /* 입주일을 알면 카테고리별로 언제 하면 좋은지 표시해준다 */
    var MOVE_WINDOWS = { '계약·서류': [45, 14], '집·공간': [21, 7], 생활용품: [14, 3], '비용·관리': [14, 7], '함께 정할 것': [30, 1] };
    var today0 = new Date();
    today0.setHours(0, 0, 0, 0);
    var dLeft = S.moveDate ? Math.ceil((new Date(S.moveDate + 'T00:00:00').getTime() - today0.getTime()) / 86400000) : null;
    var moveBanner = S.moveDate
      ? '<div class="settle-hero mint" style="margin-bottom:14px"><span>입주일 ' +
        esc(ML.dateLabel(new Date(S.moveDate + 'T00:00:00').getTime())) +
        '</span>' +
        '<strong>' +
        (dLeft > 0 ? 'D-' + dLeft : dLeft === 0 ? '오늘 입주!' : '입주 완료') +
        '</strong>' +
        '<p>' +
        (dLeft > 0 ? '각 카테고리 옆에 권장 시기를 표시해 뒀어요.' : '늦은 항목부터 하나씩 해봐요.') +
        '</p></div>'
      : '';

    var groups = CHECKLIST.map(function (g) {
      var catDone = g.items.filter(function (t, i) {
        return S.checklist[g.cat + ':' + i];
      }).length;
      var winTag = '';
      if (dLeft !== null && MOVE_WINDOWS[g.cat]) {
        var w = MOVE_WINDOWS[g.cat];
        /* dLeft는 남은 일수 — 창 [멀리, 가까이] 안에 있으면 "지금" */
        var now = dLeft <= w[0] && dLeft >= w[1],
          late = dLeft < w[1] && catDone < g.items.length;
        winTag =
          '<span class="pantry-d ' +
          (late ? 'expired' : now ? 'week' : 'ok') +
          '" style="margin-left:6px">' +
          (late ? '늦었어요' : now ? '지금 할 차례' : 'D-' + w[0] + '~' + w[1]) +
          '</span>';
      }
      return (
        '<div class="check-cat"><h4>' +
        esc(g.cat) +
        winTag +
        '</h4><span class="cat-count">' +
        catDone +
        '/' +
        g.items.length +
        '</span></div>' +
        g.items
          .map(function (t, i) {
            var key = g.cat + ':' + i;
            var on = !!S.checklist[key];
            return (
              '<button class="rule-item' +
              (on ? ' checked' : '') +
              '" data-action="check" data-v="' +
              esc(key) +
              '" type="button">' +
              '<span class="rule-check"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>' +
              '<span' +
              (on ? ' style="text-decoration:line-through;opacity:.6"' : '') +
              '>' +
              esc(t) +
              '</span></button>'
            );
          })
          .join('')
      );
    }).join('');

    var customDone = S.customChecklist.filter(function (x) {
      return S.checklist['own:' + x.id];
    }).length;
    var customHTML =
      '<div class="check-cat"><h4>직접 추가한 항목</h4><span class="cat-count">' +
      customDone +
      '/' +
      S.customChecklist.length +
      '</span></div>' +
      (S.customChecklist.length
        ? S.customChecklist
            .map(function (x) {
              var key = 'own:' + x.id;
              var on = !!S.checklist[key];
              return (
                '<div class="rule-item-wrap"><button class="rule-item' +
                (on ? ' checked' : '') +
                '" data-action="check" data-v="' +
                esc(key) +
                '" type="button">' +
                '<span class="rule-check"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>' +
                '<span' +
                (on ? ' style="text-decoration:line-through;opacity:.6"' : '') +
                '>' +
                esc(x.text) +
                '</span></button>' +
                armBtn('cl-del', x.id, '삭제', '확인') +
                '</div>'
              );
            })
            .join('')
        : '<p class="body-sm text-muted" style="margin:4px 0 10px">우리집만의 준비 항목이 있으면 직접 추가해 보세요.</p>') +
      '<div class="custom-rule"><input id="cl-custom-in" class="input" maxlength="40" autocomplete="off" placeholder="예: 벌레 퇴치제 사기">' +
      '<button class="btn btn-secondary btn-md" data-action="cl-add" type="button">추가</button></div>';

    shell(
      '' +
        '<p class="eyebrow caption">Move-in Checklist</p>' +
        '<h2 class="view-title">' +
        esc(T('view.checklist.title')) +
        '</h2>' +
        '<p class="view-desc body-md">' +
        esc(T('view.checklist.desc')) +
        '</p>' +
        '<div class="check-progress">' +
        '<div class="progress"><div class="progress-fill" style="width:' +
        pctDone +
        '%"></div></div>' +
        '<span class="progress-num">' +
        pctDone +
        '%</span></div>' +
        '<div class="custom-rule" style="margin:4px 0 14px"><label class="sr-only" for="move-date-in">입주 예정일</label>' +
        '<input id="move-date-in" class="input" type="date" value="' +
        esc(S.moveDate || '') +
        '" aria-label="입주 예정일">' +
        '<button class="btn btn-secondary btn-md" data-action="move-date-set" type="button">' +
        (S.moveDate ? '변경' : '입주일 설정') +
        '</button>' +
        (S.moveDate ? '<button class="btn-ghost" data-action="move-date-clear" type="button" aria-label="입주일 지우기">✕</button>' : '') +
        '</div>' +
        moveBanner +
        groups +
        customHTML +
        '<div class="cta-col"><button class="btn btn-tertiary btn-md" data-action="home" type="button">홈으로</button></div>'
    );
  }

  /* ================= 생활 도구 공통 ================= */
  function uid() {
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function payerName(w) {
    return w === 'me' ? (S.me && S.me.name) || '나' : (S.partner && S.partner.name) || '메이트';
  }
  function listPageHead(over, title, desc) {
    return '<p class="app-overline">' + esc(over) + '</p><h1 class="mobile-title">' + esc(title) + '</h1><p class="mobile-subtitle">' + esc(desc) + '</p>';
  }
  function armBtn(act, v, label, armLabel) {
    var armed = S.delArm2 === act + ':' + v;
    return (
      '<button class="' +
      (armed ? 'btn-danger-text' : 'item-del') +
      '" data-action="' +
      act +
      '" data-v="' +
      esc(v) +
      '" type="button">' +
      (armed ? armLabel : label) +
      '</button>'
    );
  }

  /* ================= View: 생활비 정산 ================= */
  function settleNet() {
    return ML.settleNetOf(
      S.expenses.filter(function (x) {
        return !x.income;
      })
    );
  }
  var SPLIT_MODES = [
    { id: 'equal', label: '반반' },
    { id: 'percent', label: '비율 %' },
    { id: 'exact', label: '정확 금액' },
  ];
  /* 영수증 원본 사진은 IndexedDB에 (지출 id를 키로). 백업·동기화 대상 아님 */
  function rcptDB() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) {
        rej(new Error('no idb'));
        return;
      }
      var rq = indexedDB.open('mateon-receipts', 1);
      rq.onupgradeneeded = function () {
        rq.result.createObjectStore('receipts');
      };
      rq.onsuccess = function () {
        res(rq.result);
      };
      rq.onerror = function () {
        rej(rq.error);
      };
    });
  }
  function rcptPut(id, blob) {
    return rcptDB().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('receipts', 'readwrite');
        tx.objectStore('receipts').put(blob, id);
        tx.oncomplete = function () {
          res();
        };
        tx.onerror = function () {
          rej(tx.error);
        };
      });
    });
  }
  function rcptGet(id) {
    return rcptDB().then(function (db) {
      return new Promise(function (res, rej) {
        var rq = db.transaction('receipts', 'readonly').objectStore('receipts').get(id);
        rq.onsuccess = function () {
          res(rq.result || null);
        };
        rq.onerror = function () {
          rej(rq.error);
        };
      });
    });
  }
  function rcptDel(id) {
    return rcptDB()
      .then(function (db) {
        return new Promise(function (res) {
          var tx = db.transaction('receipts', 'readwrite');
          tx.objectStore('receipts').delete(id);
          tx.oncomplete = function () {
            res();
          };
          tx.onerror = function () {
            res();
          };
        });
      })
      .catch(function () {});
  }
  var rcptDialog = null;
  function showReceipt(id) {
    rcptGet(id)
      .then(function (blob) {
        if (!blob) {
          showToast('이 기기에 영수증 사진이 없어요');
          return;
        }
        var url = URL.createObjectURL(blob);
        if (!rcptDialog) {
          rcptDialog = document.createElement('dialog');
          rcptDialog.className = 'talk-sheet rcpt-sheet';
          rcptDialog.innerHTML =
            '<div class="sheet-handle" aria-hidden="true"></div><div class="sheet-heading"><span>영수증</span><button class="icon-button" type="button" aria-label="닫기" data-rcpt-close>' +
            mobileIcon('close') +
            '</button></div><img class="rcpt-img" alt="영수증 사진">';
          rcptDialog.addEventListener('click', function (e) {
            if (e.target.closest('[data-rcpt-close]')) rcptDialog.close();
          });
          rcptDialog.addEventListener('close', function () {
            var i = rcptDialog.querySelector('img');
            if (i && i.src.indexOf('blob:') === 0) URL.revokeObjectURL(i.src);
          });
          document.body.appendChild(rcptDialog);
        }
        rcptDialog.querySelector('img').src = url;
        rcptDialog.showModal();
      })
      .catch(function () {
        showToast('영수증을 열지 못했어요');
      });
  }
  /* 등록된 고정비를 이번 달 지출에 자동 반영. id를 'fx:{고정비id}:{월}'로
     결정적으로 만들어 두 기기가 각각 생성해도 동기화 시 한 건으로 머지된다. */
  function applyFixedExpenses() {
    if (!S.fixedExpenses.length) return;
    var ym = dateStr(Date.now()).slice(0, 7);
    var have = {};
    S.expenses.forEach(function (x) {
      if (x.fx) have[x.fx] = true;
    });
    var added = false;
    S.fixedExpenses.forEach(function (f) {
      var tag = f.id + ':' + ym;
      if (have[tag]) return;
      var day = Math.min(Math.max(1, f.day || 1), 28);
      var d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(day);
      S.expenses.push({ id: ML.fixedExpId(f.id, ym), fx: tag, ts: d.getTime(), memo: f.memo, amount: f.amount, payer: f.payer, cat: f.cat, share: f.share });
      added = true;
    });
    if (added) {
      save('mateon.expenses', S.expenses);
      scheduleSyncPush();
    }
  }
  /* 고정비 후보 감지 — 같은 메모+금액이 서로 다른 2개월 이상에 나오면 제안.
     이미 등록된 고정비·사용자가 닫은 조합(fxDismiss)은 건너뛴다. */
  function fxSuggestions() {
    var groups = {};
    S.expenses.forEach(function (x) {
      if (x.income || x.fx) return;
      var k = (x.memo || '').trim() + '|' + x.amount;
      if (!groups[k]) groups[k] = { memo: x.memo, amount: x.amount, cat: x.cat, payer: x.payer, months: {}, lastDay: 0 };
      var ym = dateStr(x.ts).slice(0, 7);
      groups[k].months[ym] = x.ts;
    });
    var out = [];
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      if (S.fxDismiss.indexOf(k) !== -1) return;
      var months = Object.keys(g.months);
      if (months.length < 2) return;
      var dup = S.fixedExpenses.some(function (f) {
        return (f.memo || '').trim() === g.memo.trim() && f.amount === g.amount;
      });
      if (dup) return;
      var lastTs = 0;
      months.forEach(function (m) {
        if (g.months[m] > lastTs) lastTs = g.months[m];
      });
      g.day = Math.min(new Date(lastTs).getDate(), 28);
      g.key = k;
      g.monthsN = months.length;
      out.push(g);
    });
    out.sort(function (a, b) {
      return b.monthsN - a.monthsN;
    });
    return out.slice(0, 3);
  }
  /* 영수증을 기존 지출에 직접 첨부 (OCR 없이 사진만 연결) */
  function attachReceiptToExpense(id, file) {
    var x = S.expenses.find(function (e2) {
      return e2.id === id;
    });
    if (!x) {
      showToast('지출을 찾지 못했어요');
      return;
    }
    rcptPut(id, file)
      .then(function () {
        x.rcpt = 1;
        save('mateon.expenses', S.expenses);
        showToast('영수증을 연결했어요');
        render();
        scheduleSyncPush();
      })
      .catch(function () {
        showToast('사진 저장에 실패했어요');
      });
  }

  function vSettle() {
    applyFixedExpenses();
    var nowYm = dateStr(Date.now()).slice(0, 7);
    if (!S.settleMonth) S.settleMonth = nowYm;
    var list = S.expenses.slice().sort(function (a, b) {
      return b.ts - a.ts;
    });
    var meP = 0,
      youP = 0;
    S.expenses.forEach(function (x) {
      if (x.income) return;
      if (x.payer === 'me') meP += x.amount;
      else youP += x.amount;
    });
    var net = settleNet();
    /* 부분 정산 반영 — 상대가 준 돈(y2m)은 부채를 줄이고, 내가 준 돈(m2y)은 늘린다 */
    var paidNet = S.settlePaid.reduce(function (a, p) {
      return a + (p.dir === 'y2m' ? p.amt : -p.amt);
    }, 0);
    var remain = net - paidNet;
    var netText = !S.expenses.length
      ? '아직 기록이 없어요'
      : remain === 0
        ? '딱 맞게 나눴어요'
        : remain > 0
          ? esc(payerName('you')) + '님이 ' + esc(payerName('me')) + '님께 ' + fmtWon(remain)
          : esc(payerName('me')) + '님이 ' + esc(payerName('you')) + '님께 ' + fmtWon(-remain);
    if (paidNet !== 0 && remain !== 0) netText += ' <small>(원래 ' + fmtWon(Math.abs(net)) + ' 중 ' + fmtWon(Math.abs(paidNet)) + ' 정산됨)</small>';

    /* 월 이동: 다음 달(미래)은 현재 달까지만 */
    var viewAll = S.settleMonth === 'all';
    var spentOnly = S.expenses.filter(function (x) {
      return !x.income;
    });
    var mst = ML.monthStats(spentOnly, viewAll ? null : S.settleMonth);
    var monthLabel = viewAll ? '전체' : +S.settleMonth.slice(0, 4) + '년 ' + +S.settleMonth.slice(5) + '월';
    var monthNav =
      '<div class="settle-monthnav"><button class="chip" type="button" data-action="exp-month" data-v="-1" aria-label="이전 달"' +
      (viewAll ? ' disabled' : '') +
      '>‹</button>' +
      '<strong>' +
      monthLabel +
      '</strong>' +
      '<button class="chip" type="button" data-action="exp-month" data-v="1" aria-label="다음 달"' +
      (viewAll || S.settleMonth >= nowYm ? ' disabled' : '') +
      '>›</button>' +
      '<button class="chip' +
      (viewAll ? ' selected' : '') +
      '" type="button" data-action="exp-month" data-v="all">전체</button></div>';
    var catBars = mst.byCat.length
      ? '<div class="cat-bars">' +
        mst.byCat
          .map(function (c) {
            var bud = S.budgets[c.cat];
            var lv = ML.budgetLevel(c.sum, bud);
            var warnTag = lv === 2 ? ' <small class="warn-tag">초과</small>' : lv === 1 ? ' <small class="warn-tag warn">80%↑</small>' : '';
            return (
              '<div class="cat-bar' +
              (lv === 2 ? ' over' : '') +
              '" role="img" aria-label="' +
              esc(c.cat) +
              ' ' +
              fmtWon(c.sum) +
              (bud ? ' / 예산 ' + fmtWon(bud) : '') +
              '"><span>' +
              esc(CAT_EMOJI[c.cat] || '📦') +
              ' ' +
              esc(c.cat) +
              '</span><i style="width:' +
              Math.max(4, Math.round((c.sum / mst.byCat[0].sum) * 100)) +
              '%"></i><b>' +
              fmtWon(c.sum) +
              (bud ? ' <small>/ ' + fmtWon(bud) + '</small>' : '') +
              warnTag +
              '</b></div>'
            );
          })
          .join('') +
        '</div>'
      : '<p class="field-hint">이 기간의 지출이 아직 없어요.</p>';
    /* 최근 4개월 추이 미니 바 */
    var trend = ML.monthTrend(spentOnly, 4);
    var tmax = Math.max(
      1,
      Math.max.apply(
        null,
        trend.map(function (t) {
          return t.total;
        })
      )
    );
    var trendHTML =
      '<div class="trend-bars" role="img" aria-label="최근 4개월 지출 추이">' +
      trend
        .map(function (t) {
          return (
            '<div class="trend-bar" title="' +
            t.ym +
            ' ' +
            fmtWon(t.total) +
            '"><i style="height:' +
            Math.max(4, Math.round((t.total / tmax) * 100)) +
            '%"></i><span>' +
            +t.ym.slice(5) +
            '월</span></div>'
          );
        })
        .join('') +
      '</div>';
    var incMonth = (
      viewAll
        ? S.expenses
        : S.expenses.filter(function (x) {
            return dateStr(x.ts).slice(0, 7) === S.settleMonth;
          })
    )
      .filter(function (x) {
        return x.income;
      })
      .reduce(function (a, x) {
        return a + x.amount;
      }, 0);
    /* 카테고리 도넛 — 비중을 한눈에. conic-gradient로 세그먼트를 쌓는다 */
    var catDonut = '';
    if (mst.byCat.length && mst.total > 0) {
      var acc = 0,
        segs = [];
      mst.byCat.forEach(function (c, i) {
        var deg = (c.sum / mst.total) * 360;
        segs.push(CAT_COLORS[i % CAT_COLORS.length] + ' ' + acc.toFixed(1) + 'deg ' + (acc + deg).toFixed(1) + 'deg');
        acc += deg;
      });
      catDonut =
        '<div class="cat-donut-wrap"><div class="cat-donut" role="img" aria-label="카테고리별 지출 비중: ' +
        mst.byCat
          .map(function (c) {
            return c.cat + ' ' + Math.round((c.sum / mst.total) * 100) + '%';
          })
          .join(', ') +
        '" style="background:conic-gradient(' +
        segs.join(',') +
        ')"><span>' +
        esc(monthLabel) +
        '</span></div>' +
        '<div class="cat-legend">' +
        mst.byCat
          .slice(0, 6)
          .map(function (c, i) {
            return (
              '<span><i style="background:' +
              CAT_COLORS[i % CAT_COLORS.length] +
              '"></i>' +
              esc(c.cat) +
              ' ' +
              Math.round((c.sum / mst.total) * 100) +
              '%</span>'
            );
          })
          .join('') +
        '</div></div>';
    }
    var statsCard =
      '<div class="card" style="margin-top:16px"><h4 class="card-title">' +
      monthLabel +
      ' 지출 요약</h4>' +
      '<div class="month-stats"><div><span>합계</span><strong>' +
      fmtWon(mst.total) +
      '</strong></div>' +
      '<div><span>' +
      esc(payerName('me')) +
      '</span><strong>' +
      fmtWon(mst.me) +
      '</strong></div>' +
      '<div><span>' +
      esc(payerName('you')) +
      '</span><strong>' +
      fmtWon(mst.you) +
      '</strong></div></div>' +
      (incMonth ? '<p class="field-hint" style="margin-top:6px">이 기간 수입 +' + fmtWon(incMonth) + ' (정산 대상 아님)</p>' : '') +
      catDonut +
      catBars +
      trendHTML +
      '</div>';

    /* 카테고리별 월 예산 편집기 */
    var budgetKeys = Object.keys(S.budgets).filter(function (k) {
      return S.budgets[k] > 0;
    });
    var budgetTotal = budgetKeys.reduce(function (a, k) {
      return a + S.budgets[k];
    }, 0);
    var curYmMst = viewAll ? ML.monthStats(spentOnly, nowYm) : mst;
    var usedByCat = {};
    curYmMst.byCat.forEach(function (c) {
      usedByCat[c.cat] = c.sum;
    });
    var budgetCard =
      '<details class="card" style="margin-top:14px"><summary>월 예산 (' +
      (budgetKeys.length ? '설정됨 ' + budgetKeys.length + '개 · 합계 ' + ML.fmtWonShort(budgetTotal) : '미설정') +
      ')</summary>' +
      '<p class="field-hint" style="margin-bottom:10px">카테고리별 이번 달 목표를 정하면 위 요약에서 사용량을 함께 보여줘요.</p>' +
      EXPENSE_CATS.map(function (c) {
        var used = usedByCat[c] || 0,
          bud = S.budgets[c] || 0;
        var stat = bud
          ? used > bud
            ? ' <small class="warn-tag">초과 ' + fmtWon(used - bud) + '</small>'
            : ' <small class="field-hint">남음 ' + fmtWon(bud - used) + '</small>'
          : '';
        return (
          '<div class="budget-row"><span>' +
          esc(c) +
          stat +
          '</span><input class="input budget-in" type="number" inputmode="numeric" min="0" max="100000000" placeholder="0" data-cat="' +
          esc(c) +
          '" value="' +
          (S.budgets[c] || '') +
          '" aria-label="' +
          esc(c) +
          ' 월 예산"></div>'
        );
      }).join('') +
      '<button class="btn btn-secondary btn-md" data-action="budget-set" type="button" style="margin-top:10px">예산 저장</button></details>';

    var view = viewAll
      ? list
      : list.filter(function (x) {
          return dateStr(x.ts).slice(0, 7) === S.settleMonth;
        });
    if (S.expFilter !== '전체')
      view = view.filter(function (x) {
        return S.expFilter === '수입' ? !!x.income : (x.cat || '기타') === S.expFilter && !x.income;
      });
    if (S.expPayerFilter !== 'all')
      view = view.filter(function (x) {
        return x.payer === S.expPayerFilter;
      });
    if (S.expTag)
      view = view.filter(function (x) {
        return (x.tags || []).indexOf(S.expTag) !== -1;
      });
    var q = (S.expQuery || '').trim();
    if (q)
      view = view.filter(function (x) {
        return (x.memo || '').indexOf(q) !== -1 || (x.tags || []).join(' ').indexOf(q) !== -1;
      });
    /* 등록된 태그 모음 — 필터 칩으로 노출 */
    var allTags = {};
    S.expenses.forEach(function (x) {
      (x.tags || []).forEach(function (t) {
        allTags[t] = 1;
      });
    });
    var tagChips = Object.keys(allTags).length
      ? '<div class="chip-row" role="group" aria-label="태그 필터">' +
        Object.keys(allTags)
          .sort()
          .map(function (t) {
            return (
              '<button class="chip chip-sm' +
              (S.expTag === t ? ' selected' : '') +
              '" data-action="exp-tag" data-v="' +
              esc(t) +
              '" type="button" aria-pressed="' +
              (S.expTag === t) +
              '">#' +
              esc(t) +
              '</button>'
            );
          })
          .join('') +
        (S.expTag ? '<button class="chip chip-sm" data-action="exp-tag" data-v="" type="button">태그 해제</button>' : '') +
        '</div>'
      : '';
    var viewTotal = view.reduce(function (a, x) {
      return a + x.amount;
    }, 0);
    /* 긴 목록은 15건씩 잘라 "더 보기"로 펼친다 */
    var showN = S.expShowN || 15;
    var hidden = Math.max(0, view.length - showN);
    var shown = view.slice(0, showN);
    var months = {};
    shown.forEach(function (x) {
      var k = dateStr(x.ts).slice(0, 7);
      (months[k] = months[k] || []).push(x);
    });
    var listHTML = Object.keys(months)
      .sort()
      .reverse()
      .map(function (mk) {
        var sub = months[mk].reduce(function (a, x) {
          return a + x.amount;
        }, 0);
        return (
          '<div class="settle-month"><span>' +
          +mk.slice(5) +
          '월</span><span>' +
          fmtWon(sub) +
          '</span></div>' +
          months[mk]
            .map(function (x) {
              var sh = expenseShare(x);
              var shareTag = sh === 0.5 ? '' : ' · ' + Math.round(sh * 100) + ':' + Math.round((1 - sh) * 100);
              var fxTag = x.fx ? ' · 고정비' : '';
              var tagTxt = (x.tags || []).length
                ? ' <small class="exp-tags">' +
                  x.tags
                    .map(function (t) {
                      return '#' + esc(t);
                    })
                    .join(' ') +
                  '</small>'
                : '';
              var rcptTag = x.rcpt
                ? '<button class="item-del" data-action="exp-rcpt" data-v="' + x.id + '" type="button" aria-label="영수증 보기">🧾</button>'
                : '<button class="item-del exp-rcpt-add" data-action="exp-rcpt-add" data-v="' +
                  x.id +
                  '" type="button" aria-label="영수증 연결" title="영수증 사진 연결">＋🧾</button>';
              return (
                '<div class="settle-row' +
                (x.income ? ' inc' : '') +
                '"><span class="settle-cat">' +
                (x.income ? '💰' : esc(CAT_EMOJI[x.cat] || '📦')) +
                '</span>' +
                '<span class="settle-info"><strong>' +
                esc(x.memo || (x.income ? '수입' : '지출')) +
                tagTxt +
                '</strong><small>' +
                esc(payerName(x.payer)) +
                ' · ' +
                ML.dateLabel(x.ts) +
                shareTag +
                fxTag +
                '</small></span>' +
                '<span class="settle-amt">' +
                (x.income ? '+' : '') +
                fmtWon(x.amount) +
                '</span>' +
                rcptTag +
                '<button class="item-del" data-action="exp-edit" data-v="' +
                x.id +
                '" type="button">수정</button>' +
                armBtn('exp-del', x.id, '삭제', '확인') +
                '</div>'
              );
            })
            .join('')
        );
      })
      .join('');
    if (hidden > 0)
      listHTML +=
        '<button class="btn btn-tertiary btn-md" data-action="exp-more" type="button" style="width:100%;margin-top:8px">' + hidden + '건 더 보기</button>';

    var fxEditing = S.expEditFx
      ? S.fixedExpenses.find(function (f) {
          return f.id === S.expEditFx;
        })
      : null;
    if (S.expEditFx && !fxEditing) S.expEditFx = null;
    var fixedHTML =
      '<details class="card" style="margin-top:16px"' +
      (fxEditing ? ' open' : '') +
      '><summary>고정비 (' +
      S.fixedExpenses.length +
      ') — 매월 자동 기록</summary>' +
      (S.fixedExpenses.length
        ? S.fixedExpenses
            .map(function (f) {
              var nextTs = ML.nextFixedTs(f.day || 1);
              return (
                '<div class="settle-row"><span class="settle-cat">' +
                esc(CAT_EMOJI[f.cat] || '📦') +
                '</span>' +
                '<span class="settle-info"><strong>' +
                esc(f.memo) +
                '</strong><small>매월 ' +
                f.day +
                '일 · ' +
                esc(payerName(f.payer)) +
                (nextTs ? ' · 다음 ' + ML.dateLabel(nextTs) : '') +
                '</small></span>' +
                '<span class="settle-amt">' +
                fmtWon(f.amount) +
                '</span>' +
                '<button class="item-del" data-action="fx-edit" data-v="' +
                f.id +
                '" type="button">수정</button>' +
                armBtn('fx-del', f.id, '삭제', '확인') +
                '</div>'
              );
            })
            .join('')
        : '<p class="field-hint">지출 추가 시 "매월 반복"을 켜면 고정비로 등록돼요.</p>') +
      '</details>';

    var lastSettled = S.settled.length ? S.settled[S.settled.length - 1].ts : 0;
    var settledHTML = S.settled.length
      ? '<details class="card" style="margin-top:16px"><summary>지난 정산 기록 (' +
        S.settled.length +
        (lastSettled ? ' · 마지막 ' + ML.dateLabel(lastSettled) : '') +
        ')</summary>' +
        S.settled
          .slice()
          .reverse()
          .map(function (z) {
            return (
              '<div class="settle-row"><span class="settle-info"><strong>' +
              esc(z.label) +
              '</strong><small>' +
              (z.ts ? ML.dateLabel(z.ts) + ' · ' : '') +
              esc(payerName(z.net > 0 ? 'you' : 'me')) +
              ' → ' +
              esc(payerName(z.net > 0 ? 'me' : 'you')) +
              ' ' +
              fmtWon(Math.abs(z.net)) +
              '</small></span></div>'
            );
          })
          .join('') +
        '</details>'
      : '';

    var editing = S.expEditId
      ? S.expenses.find(function (x) {
          return x.id === S.expEditId;
        })
      : null;
    if (S.expEditId && !editing) S.expEditId = null;
    var filterBar =
      '<div class="exp-filter"><div class="exp-q-wrap"><input id="exp-q" class="input exp-q" maxlength="30" placeholder="내용 검색" autocomplete="off" value="' +
      esc(S.expQuery || '') +
      '" aria-label="지출 내용 검색">' +
      (q ? '<button class="exp-q-clear" data-action="exp-q-clear" type="button" aria-label="검색 지우기">✕</button>' : '') +
      '</div>' +
      '<div class="chip-row">' +
      ['전체']
        .concat(EXPENSE_CATS)
        .concat(['수입'])
        .map(function (c) {
          return (
            '<button class="chip' +
            (S.expFilter === c ? ' selected' : '') +
            '" data-action="exp-filter" data-v="' +
            esc(c) +
            '" type="button" aria-pressed="' +
            (S.expFilter === c) +
            '">' +
            esc(c) +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      tagChips +
      '<div class="chip-row" role="group" aria-label="낸 사람 필터">' +
      [
        ['all', '모두'],
        ['me', payerName('me')],
        ['you', payerName('you')],
      ]
        .map(function (p) {
          return (
            '<button class="chip chip-sm' +
            (S.expPayerFilter === p[0] ? ' selected' : '') +
            '" data-action="exp-payer-filter" data-v="' +
            p[0] +
            '" type="button" aria-pressed="' +
            (S.expPayerFilter === p[0]) +
            '">' +
            esc(p[1]) +
            '</button>'
          );
        })
        .join('') +
      '</div></div>';

    shell(
      listPageHead('LIFE TOOLS', T('view.settle.title'), T('view.settle.desc')) +
        '<div class="settle-hero"><span>정산하면</span><strong>' +
        netText +
        '</strong><p>' +
        esc(payerName('me')) +
        ' ' +
        fmtWon(meP) +
        ' · ' +
        esc(payerName('you')) +
        ' ' +
        fmtWon(youP) +
        ' 지출</p></div>' +
        monthNav +
        statsCard +
        goalHTML() +
        budgetCard +
        (net !== 0 || S.settlePaid.length
          ? '<div class="card" style="margin-top:14px"><h4 class="card-title">부분 정산</h4>' +
            '<p class="field-hint">전부 갚기 전에 일부만 먼저 주고받았을 때 기록해요. 남은 금액: <strong>' +
            fmtWon(Math.abs(remain)) +
            '</strong>' +
            (remain !== 0
              ? remain > 0
                ? ' (' + esc(payerName('you')) + ' → ' + esc(payerName('me')) + ')'
                : ' (' + esc(payerName('me')) + ' → ' + esc(payerName('you')) + ')'
              : '') +
            '</p>' +
            '<div class="custom-rule"><input id="part-amt" class="input" type="number" inputmode="numeric" min="1" max="100000000" placeholder="금액" aria-label="부분 정산 금액">' +
            '<button class="btn btn-secondary btn-md" data-action="settle-part" data-v="y2m" type="button">' +
            esc(payerName('you')) +
            '가 줌</button>' +
            '<button class="btn btn-secondary btn-md" data-action="settle-part" data-v="m2y" type="button">' +
            esc(payerName('me')) +
            '가 줌</button></div>' +
            (S.settlePaid.length
              ? S.settlePaid
                  .slice(-5)
                  .reverse()
                  .map(function (p) {
                    return (
                      '<div class="settle-row"><span class="settle-info"><small>' +
                      ML.dateLabel(p.ts) +
                      ' · ' +
                      esc(p.dir === 'y2m' ? payerName('you') + ' → ' + payerName('me') : payerName('me') + ' → ' + payerName('you')) +
                      '</small></span><span class="settle-amt">' +
                      fmtWon(p.amt) +
                      '</span><button class="item-del" data-action="settle-part-del" data-v="' +
                      p.ts +
                      '" type="button" aria-label="기록 삭제">✕</button></div>'
                    );
                  })
                  .join('')
              : '') +
            '</div>'
          : '') +
        '<div class="card" style="margin-top:16px"><h4 class="card-title">' +
        (fxEditing ? '고정비 수정' : editing ? '지출 수정' : '지출 추가') +
        '</h4>' +
        '<div class="field-group"><span class="field-label">종류</span><div class="chip-row">' +
        [
          [false, '지출'],
          [true, '수입'],
        ]
          .map(function (k) {
            return (
              '<button class="chip' +
              (S.expIncome === k[0] ? ' selected' : '') +
              '" data-action="exp-kind" data-v="' +
              (k[0] ? '1' : '0') +
              '" type="button" aria-pressed="' +
              (S.expIncome === k[0]) +
              '">' +
              k[1] +
              '</button>'
            );
          })
          .join('') +
        '</div>' +
        (S.expIncome ? '<p class="field-hint" style="margin-top:6px">수입은 정산 계산에 포함되지 않고 잔액 참고용으로만 기록돼요.</p>' : '') +
        '</div>' +
        '<div class="field-group"><label class="field-label" for="exp-memo">내용</label><input id="exp-memo" class="input" maxlength="30" placeholder="' +
        (S.expIncome ? '예: 용돈·환급·이자' : '예: 쓰레기봉투·세탁세제') +
        '" autocomplete="off" value="' +
        esc(S.expMemo || '') +
        '"></div>' +
        '<div class="field-group"><label class="field-label" for="exp-amt">금액</label><input id="exp-amt" class="input" type="number" inputmode="numeric" min="1" max="100000000" placeholder="0" autocomplete="off" value="' +
        esc(S.expAmt || '') +
        '"><span class="field-unit">원</span><small id="exp-amt-hint" class="field-hint amt-hint" aria-live="polite"></small></div>' +
        '<div class="field-group"><label class="field-label" for="exp-date">날짜</label><input id="exp-date" class="input" type="date" value="' +
        esc(S.expDate || dateStr(Date.now())) +
        '" max="' +
        dateStr(Date.now()) +
        '" aria-label="지출 날짜"></div>' +
        '<div class="field-group"><label class="field-label" for="exp-tags">태그 (선택)</label><input id="exp-tags" class="input" maxlength="40" placeholder="예: 여행 기념일 (띄어쓰기로 구분)" autocomplete="off" value="' +
        esc(S.expTags || '') +
        '"></div>' +
        '<div class="field-group"><span class="field-label">낸 사람</span><div class="chip-row">' +
        ['me', 'you']
          .map(function (w) {
            return (
              '<button class="chip' +
              (S.expPayer === w ? ' selected' : '') +
              '" data-action="exp-payer" data-v="' +
              w +
              '" type="button">' +
              esc(payerName(w)) +
              '</button>'
            );
          })
          .join('') +
        '</div></div>' +
        (S.expIncome
          ? ''
          : '<div class="field-group"><span class="field-label">나누는 방법</span><div class="chip-row">' +
            SPLIT_MODES.map(function (m) {
              return (
                '<button class="chip' +
                (S.splitMode === m.id ? ' selected' : '') +
                '" data-action="exp-split" data-v="' +
                m.id +
                '" type="button">' +
                m.label +
                '</button>'
              );
            }).join('') +
            '</div>' +
            (S.splitMode === 'percent'
              ? '<div class="split-input"><input id="exp-share" class="input" type="number" inputmode="numeric" min="0" max="100" value="' +
                esc(S.expShare || '50') +
                '" aria-label="내가 부담하는 비율"><span class="field-unit">%를 ' +
                esc(payerName('me')) +
                '이 부담</span></div>' +
                '<div class="chip-row" style="margin-top:8px"><button class="chip chip-sm" data-action="exp-share-qc" data-v="100" type="button">내가 전액</button><button class="chip chip-sm" data-action="exp-share-qc" data-v="0" type="button">' +
                esc(payerName('you')) +
                '이 전액</button><button class="chip chip-sm" data-action="exp-share-qc" data-v="50" type="button">반반</button></div>'
              : '') +
            (S.splitMode === 'exact'
              ? '<div class="split-input"><input id="exp-share" class="input" type="number" inputmode="numeric" min="0" placeholder="0" value="' +
                esc(S.expShare || '') +
                '" aria-label="내가 부담하는 금액"><span class="field-unit">원을 ' +
                esc(payerName('me')) +
                '이 부담</span></div>'
              : '') +
            '</div>' +
            '<div class="field-group" style="margin-bottom:0"><span class="field-label">분류</span><div class="chip-row">' +
            EXPENSE_CATS.map(function (c) {
              return (
                '<button class="chip' +
                (S.expCat === c ? ' selected' : '') +
                '" data-action="exp-cat" data-v="' +
                esc(c) +
                '" type="button" aria-pressed="' +
                (S.expCat === c) +
                '">' +
                esc(CAT_EMOJI[c] || '') +
                ' ' +
                esc(c) +
                '</button>'
              );
            }).join('') +
            '</div></div>' +
            (editing
              ? ''
              : '<label class="check-row"><input type="checkbox" id="exp-recur"' +
                (fxEditing ? ' checked' : '') +
                '> <span>매월 반복되는 고정비로 등록</span></label>' +
                '<label class="check-row fx-day-row"><span>매월</span><input id="exp-day" class="input fx-day" type="number" inputmode="numeric" min="1" max="28" value="' +
                (fxEditing ? fxEditing.day : new Date().getDate()) +
                '" aria-label="고정비 기록일"><span>일에 기록</span></label>')) +
        (S.pendingReceipt
          ? '<p class="field-hint" style="margin-top:8px">🧾 방금 스캔한 영수증이 이 지출에 첨부돼요 <button class="exp-rcpt-x" data-action="exp-rcpt-cancel" type="button">첨부 취소</button></p>'
          : '') +
        '<div class="cta-row" style="margin-top:14px"><button class="mobile-primary" data-action="exp-add" type="button">' +
        (fxEditing ? '고정비 저장' : editing ? '수정 저장' : '지출 기록하기') +
        '</button>' +
        (editing || fxEditing
          ? '<button class="btn btn-tertiary btn-md" data-action="exp-edit-cancel" type="button">취소</button>'
          : '<button class="btn btn-secondary btn-md" data-action="exp-ocr" type="button">영수증 스캔</button>') +
        '</div>' +
        '<input id="exp-receipt" type="file" accept="image/*" capture="environment" hidden></div>' +
        /* 같은 메모+금액이 2개월 이상 반복되면 고정비 등록을 제안 */
        fxSuggestions()
          .map(function (g) {
            return (
              '<div class="fx-suggest"><span>🔁 <b>' +
              esc(g.memo) +
              '</b> ' +
              fmtWon(g.amount) +
              '이 ' +
              g.monthsN +
              '개월째 반복돼요</span>' +
              '<span class="fx-suggest-btns"><button class="btn btn-secondary btn-sm" data-action="fx-suggest-add" data-v="' +
              esc(g.key) +
              '" type="button">고정비로 등록</button>' +
              '<button class="btn btn-tertiary btn-sm" data-action="fx-suggest-x" data-v="' +
              esc(g.key) +
              '" type="button" aria-label="제안 닫기">닫기</button></span></div>'
            );
          })
          .join('') +
        fixedHTML +
        (S.expenses.length
          ? '<div class="cta-col"><button class="btn btn-secondary btn-md" data-action="exp-copy" type="button">정산 내역 복사</button><button class="btn btn-secondary btn-md" data-action="exp-csv" type="button">CSV보내기</button><button class="btn btn-tertiary btn-md" data-action="exp-settle" type="button">이번 정산 마감하기</button></div>'
          : '') +
        (S.expenses.length ? filterBar : '') +
        (listHTML
          ? '<div class="sec-head" style="margin-top:22px"><h3>지출 내역</h3><span class="badge badge-brand">' +
            view.length +
            '건 · ' +
            ML.fmtWonShort(viewTotal) +
            '</span></div>' +
            listHTML
          : q || S.expFilter !== '전체' || S.expPayerFilter !== 'all'
            ? '<p class="field-hint" style="margin-top:16px">조건에 맞는 지출이 없어요.</p>'
            : '<div class="empty-notes" style="margin-top:22px">' +
              mobileIcon('chat') +
              '<p>아직 지출 기록이 없어요.<br>첫 공동 지출을 기록해 보세요.</p></div>') +
        settledHTML +
        debtsHTML() +
        '<p class="device-note">기록은 이 기기에만 저장돼요. 건별로 나누는 방법(반반·비율·정확 금액)을 정할 수 있고, 고정비는 매월 자동 기록돼요. 영수증 사진은 백업에 포함되지 않아요.</p>'
    );
  }

  /* ---- 공동 목표 저축 — 함께 모으는 목표와 진행률 ---- */
  function goalHTML() {
    return MH.goalHTML();
  }
  /* ---- 빌려준 돈 — 정산과 별도로 주고받은 돈 추적 ---- */
  function debtsHTML() {
    return MH.debtsHTML();
  }

  /* ================= View: 같이 살 것 (공유 쇼핑리스트) ================= */
  function vShopping() {
    var items = S.shopping.slice().sort(function (a, b) {
      return a.done - b.done || b.ts - a.ts;
    });
    var open = items.filter(function (x) {
      return !x.done;
    });
    var done = items.filter(function (x) {
      return x.done;
    });

    var row = function (x) {
      return (
        '<div class="chore-row' +
        (x.done ? ' done' : '') +
        '">' +
        '<button class="chore-check" data-action="shop-done" data-v="' +
        x.id +
        '" type="button" aria-pressed="' +
        x.done +
        '" aria-label="' +
        esc(x.name) +
        ' 샀어요">' +
        '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></button>' +
        '<span class="chore-name">' +
        esc(x.name) +
        (x.qty && x.qty > 1 ? ' <small class="chore-last">×' + x.qty + '</small>' : '') +
        '</span>' +
        '<span class="chore-who shop">' +
        esc(SHOP_EMOJI[x.cat] || '📦') +
        ' ' +
        esc(x.cat) +
        '</span>' +
        armBtn('shop-del', x.id, '삭제', '확인') +
        '</div>'
      );
    };

    var presets = SHOP_PRESETS.filter(function (p) {
      return !S.shopping.some(function (x) {
        return x.name === p;
      });
    });
    /* 다시 담기 제안 — 구매 이력 빈도 순, 현재 목록에 없는 것 */
    var restock = S.shopHist
      .slice()
      .sort(function (a, b) {
        return (b.cnt || 1) - (a.cnt || 1) || b.ts - a.ts;
      })
      .filter(function (h) {
        return (
          !open.some(function (o) {
            return o.name === h.name;
          }) &&
          !presets.some(function (p) {
            return p === h.name;
          })
        );
      })
      .slice(0, 5);

    shell(
      listPageHead('LIFE TOOLS', T('view.shopping.title'), T('view.shopping.desc')) +
        '<div class="settle-hero mint"><span>남은 항목</span><strong>' +
        open.length +
        '개' +
        (done.length ? ' · 산 것 ' + done.length + '개' : '') +
        '</strong>' +
        '<p>메이트와 동기화가 켜져 있으면 목록이 함께 업데이트돼요</p></div>' +
        '<div class="card" style="margin-top:16px"><h4 class="card-title">필요한 것 추가</h4>' +
        '<div class="custom-rule"><input id="shop-in" class="input" maxlength="30" placeholder="예: 휴지, 라면, 행주" autocomplete="off">' +
        '<input id="shop-qty" class="input shop-qty" type="number" inputmode="numeric" min="1" max="99" placeholder="1" aria-label="수량">' +
        '<button class="btn btn-secondary btn-md" data-action="shop-add" type="button">추가</button></div>' +
        '<div class="chip-row" style="margin-top:10px">' +
        SHOP_CATS.map(function (c) {
          return (
            '<button class="chip' +
            (S.shopCat === c ? ' selected' : '') +
            '" data-action="shop-cat" data-v="' +
            esc(c) +
            '" type="button" aria-pressed="' +
            (S.shopCat === c) +
            '">' +
            esc(SHOP_EMOJI[c] || '') +
            ' ' +
            esc(c) +
            '</button>'
          );
        }).join('') +
        '</div>' +
        (presets.length
          ? '<div class="chip-row" style="margin-top:10px">' +
            presets
              .map(function (p) {
                return '<button class="chip" data-action="shop-preset" data-v="' + esc(p) + '" type="button">+ ' + esc(p) + '</button>';
              })
              .join('') +
            '</div>'
          : '') +
        (restock.length
          ? '<div class="chip-row" style="margin-top:10px"><span class="field-hint" style="width:100%">자주 사는 것, 다시 담기:</span>' +
            restock
              .map(function (x) {
                return (
                  '<button class="chip chip-sm" data-action="shop-restock" data-v="' +
                  esc(x.name) +
                  '" type="button">↻ ' +
                  esc(x.name) +
                  (x.cnt > 1 ? ' ×' + x.cnt : '') +
                  '</button>'
                );
              })
              .join('') +
            '</div>'
          : '') +
        '</div>' +
        /* 남은 항목은 카테고리별로 묶어서 보여준다 — 장바구니 동선처럼 */
        (open.length
          ? '<div style="margin:18px 0 6px">' +
            SHOP_CATS.map(function (c) {
              var grp = open.filter(function (x) {
                return (x.cat || '기타') === c;
              });
              if (!grp.length) return '';
              return (
                '<div class="shop-group"><h5 class="shop-group-t">' +
                esc(SHOP_EMOJI[c] || '') +
                ' ' +
                esc(c) +
                '<span>' +
                grp.length +
                '</span></h5>' +
                grp.map(row).join('') +
                '</div>'
              );
            }).join('') +
            open
              .filter(function (x) {
                return SHOP_CATS.indexOf(x.cat || '기타') === -1;
              })
              .map(row)
              .join('') +
            '</div>'
          : '<div class="empty-notes" style="margin-top:18px">' + mobileIcon('chat') + '<p>살 것이 없어요.<br>필요한 게 생기면 바로 적어두세요.</p></div>') +
        (open.length || done.length
          ? '<div class="cta-row"><button class="btn btn-secondary btn-md" data-action="shop-copy" type="button">목록 복사</button></div>'
          : '') +
        (done.length
          ? '<details class="card" style="margin-top:14px"><summary>산 것 (' +
            done.length +
            ')</summary>' +
            done.map(row).join('') +
            '<button class="btn btn-tertiary btn-md" data-action="shop-clear" type="button" style="margin-top:10px">산 것 모두 지우기</button></details>'
          : '') +
        pantryHTML() +
        '<p class="device-note">목록은 이 기기에 저장되고, 동기화가 켜져 있으면 메이트와 공유돼요.</p>'
    );
  }

  /* ---- 유통기한 관리 — 냉장/냉동/상온 재고 + 임박 배지 ---- */
  function pantryHTML() {
    return MH.pantryHTML();
  }

  /* ================= View: 러브맵 퀴즈 ================= */
  function lovemapSave() {
    save('mateon.lovemap', S.lovemap);
  }
  /* 질문 풀 = 기본 + 우리가 직접 만든 질문. 인덱스는 통합 배열 기준 */
  function lmPool() {
    return LOVE_MAP_QUESTIONS.concat(S.lmCustom || []);
  }
  function vLovemap() {
    var lm = S.lovemap;
    var pool = lmPool();
    var total = pool.length;
    var doneAll = lm.asked >= total;
    var pct = Math.round((lm.asked / total) * 100);
    var msg = !lm.asked
      ? '서로의 세계를 얼마나 아는지 알아봐요'
      : lm.asked && lm.known / lm.asked >= 0.8
        ? '서로를 꽤 잘 알고 있어요!'
        : lm.known / lm.asked >= 0.5
          ? '아는 만큼 더 궁금해지는 사이예요'
          : '아직 모르는 게 많아요. 더 물어봐요';

    var review = !!S.lmReview && (lm.wrong || []).length;
    var qIdx = review ? lm.wrong[0] : lm.idx % total;
    var q = doneAll && !review ? null : pool[qIdx];
    var nextQ = !doneAll && !review ? pool[(lm.idx + 1) % total] : null;
    shell(
      listPageHead('PLAY', T('view.lovemap.title'), T('view.lovemap.desc')) +
        '<div class="settle-hero"><span>' +
        lm.asked +
        ' / ' +
        total +
        ' 질문' +
        (lm.asked
          ? ' · 정답률 ' +
            Math.round((lm.known / lm.asked) * 100) +
            '%' +
            (lm.best ? ' · 최고 ' + lm.best + '%' : '') +
            (lm.rounds ? ' · ' + lm.rounds + '회차' : '')
          : '') +
        '</span><strong>' +
        msg +
        '</strong>' +
        '<div class="lovemap-bar"><i style="width:' +
        pct +
        '%"></i></div></div>' +
        (review
          ? '<div class="note-box info" style="margin-top:14px"><span>복습 모드 · 몰랐던 질문 ' +
            lm.wrong.length +
            '개 남음</span><button class="btn btn-tertiary btn-sm" data-action="lm-review-off" type="button">복습 종료</button></div>'
          : '') +
        (q
          ? '<div class="lovemap-card"><span class="lovemap-no">' +
            (review ? '복습' : 'Q' + (lm.asked + 1)) +
            ' · ' +
            esc(qIdx < LOVE_MAP_QUESTIONS.length ? LOVE_MAP_CATS[qIdx] || '질문' : '우리 질문') +
            '</span><h3>' +
            esc(q) +
            '</h3>' +
            '<p class="body-sm text-muted">먼저 마음속으로 답을 떠올린 뒤, 메이트에게 물어보세요.</p></div>' +
            '<div class="cta-row"><button class="mobile-primary" data-action="lm-know" type="button">맞혔어요</button>' +
            '<button class="btn btn-secondary btn-md" data-action="lm-dont" type="button">몰랐어요</button></div>' +
            '<button class="btn btn-tertiary btn-md" data-action="lm-skip" type="button" style="margin-top:10px">이 질문 건너뛰기</button>' +
            (nextQ ? '<p class="lm-next"><small>다음 질문 · ' + esc(nextQ.length > 24 ? nextQ.slice(0, 24) + '…' : nextQ) + '</small></p>' : '') +
            ((lm.wrong || []).length && !review
              ? '<button class="btn btn-tertiary btn-md" data-action="lm-review" type="button" style="margin-top:8px">몰랐던 질문 복습 (' +
                lm.wrong.length +
                ')</button>'
              : '')
          : '<div class="empty-notes">' +
            mobileIcon('heart') +
            '<p>' +
            total +
            '개 질문을 모두 나눴어요.<br>서로를 더 알아가는 데 끝은 없어요.</p>' +
            ((lm.wrong || []).length
              ? '<button class="btn btn-secondary btn-md" data-action="lm-review" type="button" style="margin-bottom:10px">몰랐던 질문 복습 (' +
                lm.wrong.length +
                ')</button>'
              : '') +
            '<button class="btn btn-secondary btn-md" data-action="lm-reset" type="button">처음부터 다시 하기</button></div>') +
        /* 우리만의 질문을 풀에 추가 — 다음 질문부터 섞여 나온다 */
        '<div class="card" style="margin-top:14px"><h4 class="card-title">우리 질문 직접 만들기' +
        (S.lmCustom.length ? ' <span class="field-hint">' + S.lmCustom.length + '개 추가됨</span>' : '') +
        '</h4>' +
        '<div class="custom-rule"><input id="lmq-in" class="input" maxlength="80" placeholder="예: 내가 요즘 가장 자주 듣는 노래는?" autocomplete="off">' +
        '<button class="btn btn-secondary btn-md" data-action="lmq-add" type="button">추가</button></div>' +
        (S.lmCustom.length
          ? S.lmCustom
              .map(function (qc, qi) {
                return (
                  '<div class="ciq-row"><span class="ciq-label">' +
                  esc(qc) +
                  '</span><span style="flex:1"></span>' +
                  armBtn('lmq-del', String(qi), '질문 삭제', '확인') +
                  '</div>'
                );
              })
              .join('')
          : '') +
        '</div>' +
        '<p class="device-note">정답은 없어요 — 질문을 나누는 것 자체가 목적이에요. 진행은 이 기기에 저장돼요.</p>'
    );
  }

  /* ================= View: 역할 분담 ================= */
  function choreState() {
    if (!S.chores || !Array.isArray(S.chores.items)) S.chores = { items: [], anchor: mondayOf(Date.now()), rot: [] };
    return S.chores;
  }
  function choreOwner(i, weekTs) {
    var ch = choreState();
    var it = ch.items[i];
    var weeks = Math.round((mondayOf(weekTs) - mondayOf(ch.anchor)) / (7 * 86400000));
    var off = it && it.freq === 'bw' ? Math.floor(weeks / 2) : weeks;
    return ((ch.rot[i] || 0) + off) % 2 === 0 ? 'me' : 'you';
  }
  /* 항목별 마지막 완료 정보: 로그값 {ts,by} 또는 구버전 true */
  function choreLastDone(id) {
    var best = null;
    Object.keys(S.choreLog).forEach(function (wk) {
      var v = S.choreLog[wk][id];
      if (!v) return;
      var ts = typeof v === 'object' ? v.ts : 0;
      var by = typeof v === 'object' ? v.by : null;
      if (!best || ts > best.ts) best = { ts: ts, by: by, week: wk };
    });
    return best;
  }
  function saveChores() {
    save('mateon.chores', S.chores);
  }
  function vChores() {
    var ch = choreState();
    var now = Date.now(),
      wk = isoWeekKey(now);
    var log = S.choreLog[wk] || {};
    var doneCount = ch.items.filter(function (it) {
      return log[it.id];
    }).length;
    /* 주간 분담 집계 — 완료자 기준 */
    var myDone = 0,
      yourDone = 0;
    ch.items.forEach(function (it) {
      var v = log[it.id];
      if (!v) return;
      var by = typeof v === 'object' ? v.by : choreOwner(ch.items.indexOf(it), now);
      if (by === 'me') myDone++;
      else yourDone++;
    });
    var shareTotal = myDone + yourDone;
    var shareHTML = shareTotal
      ? '<div class="card" style="margin-top:14px"><h4 class="card-title">이번 주 분담</h4>' +
        '<div class="chore-share" role="img" aria-label="완료한 집안일: ' +
        payerName('me') +
        ' ' +
        myDone +
        '개, ' +
        payerName('you') +
        ' ' +
        yourDone +
        '개"><i class="me" style="width:' +
        Math.round((myDone / shareTotal) * 100) +
        '%"></i><i class="you" style="width:' +
        Math.round((yourDone / shareTotal) * 100) +
        '%"></i></div>' +
        '<div class="chore-share-meta"><span>' +
        esc(payerName('me')) +
        ' ' +
        myDone +
        '개</span><span>' +
        esc(payerName('you')) +
        ' ' +
        yourDone +
        '개</span></div></div>'
      : '';

    var DOW_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
    var todayDow = new Date(now).getDay();
    function dowTag(it) {
      if (!it.days || !it.days.length || it.days.length === 7) return '';
      return (
        '<small class="chore-days">' +
        it.days
          .slice()
          .sort()
          .map(function (d) {
            return DOW_NAMES[d];
          })
          .join('·') +
        '요일</small>'
      );
    }
    function choreRow(it, i, muted) {
      var who = choreOwner(i, now);
      var done = !!log[it.id];
      var last = choreLastDone(it.id);
      return (
        '<div class="chore-row' +
        (done ? ' done' : '') +
        (muted ? ' offday' : '') +
        '">' +
        '<button class="chore-check" data-action="chore-done" data-v="' +
        it.id +
        '" type="button" aria-pressed="' +
        done +
        '" aria-label="' +
        esc(it.name) +
        ' 완료">' +
        '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></button>' +
        '<span class="chore-name">' +
        esc(it.name) +
        dowTag(it) +
        (last && last.ts ? '<small class="chore-last">마지막 완료 ' + ML.dateLabel(last.ts) + '</small>' : '') +
        '</span>' +
        (done
          ? '<button class="item-del" data-action="' +
            (log[it.id] && log[it.id].img ? 'chore-proof-view' : 'chore-proof') +
            '" data-v="' +
            it.id +
            '" type="button" aria-label="인증샷 ' +
            (log[it.id] && log[it.id].img ? '보기' : '올리기') +
            '">' +
            (log[it.id] && log[it.id].img ? '📷' : '📷+') +
            '</button>'
          : '') +
        '<button class="chip chip-sm' +
        (it.freq === 'bw' ? ' selected' : '') +
        '" data-action="chore-freq" data-v="' +
        it.id +
        '" type="button" aria-label="주기 변경">' +
        (it.freq === 'bw' ? '격주' : '매주') +
        '</button>' +
        (it.days && it.days.length
          ? '<button class="chip chip-sm" data-action="chore-days" data-v="' +
            it.id +
            '" type="button" aria-label="요일 지정 해제" title="누르면 매일로 변경">매일로</button>'
          : '') +
        '<span class="chore-who ' +
        who +
        '">' +
        esc(payerName(who)) +
        '</span>' +
        armBtn('chore-del', it.id, '삭제', '확인') +
        '</div>'
      );
    }
    var todays = [],
      others = [];
    ch.items.forEach(function (it, i) {
      if (it.days && it.days.length && it.days.indexOf(todayDow) === -1) others.push([it, i]);
      else todays.push([it, i]);
    });
    var itemsHTML = ch.items.length
      ? todays
          .map(function (p) {
            return choreRow(p[0], p[1]);
          })
          .join('') +
        (others.length
          ? '<p class="field-hint" style="margin:14px 0 6px">오늘 하는 날이 아닌 항목</p>' +
            others
              .map(function (p) {
                return choreRow(p[0], p[1], true);
              })
              .join('')
          : '')
      : '<div class="empty-notes">' + mobileIcon('chat') + '<p>아직 나눌 집안일이 없어요.<br>아래에서 추가하거나 추천 항목을 눌러보세요.</p></div>';

    var presets = CHORE_PRESETS.filter(function (p) {
      return !ch.items.some(function (it) {
        return it.name === p;
      });
    });

    shell(
      listPageHead('LIFE TOOLS', T('view.chores.title'), T('view.chores.desc')) +
        '<div class="settle-hero mint"><span>이번 주 ' +
        weekRangeLabel(now) +
        '</span><strong>' +
        doneCount +
        ' / ' +
        ch.items.length +
        ' 완료</strong>' +
        '<p>매주 월요일마다 담당이 서로 바뀌어요</p></div>' +
        shareHTML +
        '<div style="margin:18px 0 6px">' +
        itemsHTML +
        '</div>' +
        '<div class="card" style="margin-top:16px"><h4 class="card-title">집안일 추가</h4>' +
        '<div class="custom-rule"><input id="chore-in" class="input" maxlength="16" placeholder="예: 화장실 청소" autocomplete="off">' +
        '<button class="btn btn-secondary btn-md" data-action="chore-add" type="button">추가</button></div>' +
        '<div class="field-group" style="margin-top:10px;margin-bottom:0"><span class="field-label">하는 요일 (선택 안 하면 매일)</span><div class="chip-row">' +
        [1, 2, 3, 4, 5, 6, 0]
          .map(function (d) {
            return (
              '<button class="chip chip-sm' +
              ((S.choreDays || []).indexOf(d) !== -1 ? ' selected' : '') +
              '" data-action="chore-day-pick" data-v="' +
              d +
              '" type="button" aria-pressed="' +
              ((S.choreDays || []).indexOf(d) !== -1) +
              '">' +
              DOW_NAMES[d] +
              '</button>'
            );
          })
          .join('') +
        '</div></div>' +
        (presets.length
          ? '<div class="chip-row" style="margin-top:12px">' +
            presets
              .map(function (p) {
                return '<button class="chip" data-action="chore-preset" data-v="' + esc(p) + '" type="button">+ ' + esc(p) + '</button>';
              })
              .join('') +
            '</div>'
          : '') +
        '</div>' +
        '<input id="chore-proof-file" type="file" accept="image/*" capture="environment" hidden>' +
        (ch.items.length
          ? '<div class="card" style="margin-top:16px"><h4 class="card-title">다음 주 미리보기</h4>' +
            ch.items
              .map(function (it, i) {
                return '<div class="chore-next"><span>' + esc(it.name) + '</span><span>' + esc(payerName(choreOwner(i, now + 7 * 86400000))) + '</span></div>';
              })
              .join('') +
            '</div>'
          : '') +
        '<p class="device-note">담당은 매주 월요일에 자동으로 서로 교체돼요. 기록은 이 기기에만 저장돼요.</p>'
    );
  }

  /* ================= View: 우리 일정 ================= */
  /* 반복 일정: date는 최초 시작일로 고정하고, 표시는 그 주기로 굴려 계산한다.
     e.until이 있으면 그 날짜까지만 발생한다. */
  function nextOccurrence(e, from) {
    if (e.rpt !== 'w' || e.date >= from) {
      return e.until && e.date > e.until ? null : e.date;
    }
    var d = new Date(e.date + 'T12:00:00');
    while (dateStr(d.getTime()) < from) d.setDate(d.getDate() + 7);
    var out = dateStr(d.getTime());
    return e.until && out > e.until ? null : out;
  }
  function monthEvents(ym) {
    var map = {};
    var mend = ym + '-32';
    S.events.forEach(function (e) {
      if (e.rpt === 'w') {
        var cur = new Date(e.date + 'T12:00:00');
        while (dateStr(cur.getTime()) < ym + '-01') cur.setDate(cur.getDate() + 7);
        while (dateStr(cur.getTime()) < mend && dateStr(cur.getTime()).slice(0, 7) === ym) {
          var iso = dateStr(cur.getTime());
          if (!e.until || iso <= e.until) map[iso] = true;
          cur.setDate(cur.getDate() + 7);
        }
      } else if (e.date.slice(0, 7) === ym) map[e.date] = true;
    });
    S.anniv.forEach(function (a) {
      if (a.date.slice(5, 7) === ym.slice(5)) map[ym + a.date.slice(4)] = true;
    });
    return map;
  }
  /* 일정 알림 — 네이티브 로컬 알림으로 예약 (웹은 알림 없음) */
  function syncEventReminders() {
    if (!window.MateNative || !window.MateNative.scheduleEventReminders) return;
    var today = dateStr(Date.now());
    var list = [];
    S.events.forEach(function (e) {
      if (!e.rem) return;
      var occ = e.rpt === 'w' ? nextOccurrence(e, today) : e.date;
      if (!occ) return;
      var at = new Date(occ + 'T' + (e.time || '09:00') + ':00').getTime() - e.rem * 60000;
      if (at > Date.now()) list.push({ id: e.id, title: e.title, at: at, rem: e.rem });
    });
    window.MateNative.scheduleEventReminders(list.slice(0, 40)).catch(function () {});
  }

  function vCalendar() {
    var today = dateStr(Date.now());
    var nowYm = today.slice(0, 7);
    if (!S.calMonth) S.calMonth = nowYm;
    if (!S.calDay) S.calDay = today;
    var evs = S.events.slice();
    var upcoming = evs
      .filter(function (e) {
        return e.date >= today || e.rpt === 'w';
      })
      .map(function (e) {
        return { e: e, occ: nextOccurrence(e, today) };
      })
      .filter(function (x) {
        return x.occ !== null;
      })
      .sort(function (a, b) {
        return a.occ < b.occ ? -1 : 1;
      })
      .map(function (x) {
        return x.e;
      });
    var past = evs
      .filter(function (e) {
        return e.date < today && e.rpt !== 'w';
      })
      .sort(function (a, b) {
        return a.date < b.date ? -1 : 1;
      });
    var evEditing = S.evEditId
      ? S.events.find(function (e) {
          return e.id === S.evEditId;
        })
      : null;
    if (S.evEditId && !evEditing) S.evEditId = null;

    function row(e, isPast) {
      var showDate = isPast ? e.date : nextOccurrence(e, today);
      var d = new Date(showDate + 'T12:00:00');
      var dd = isPast
        ? ''
        : showDate === today
          ? '<span class="badge badge-brand">오늘</span>'
          : showDate !== e.date
            ? '<span class="badge">' + showDate.slice(5).replace('-', '/') + '</span>'
            : '';
      var timeTag = e.time ? ' · ' + esc(e.time) : '';
      var rptTag = e.rpt === 'w' ? ' · 매주' + (e.until ? ' (~' + e.until.slice(5).replace('-', '/') + ')' : '') : '';
      var remTag = e.rem
        ? ' · 🔔' + (e.rem >= 1440 ? Math.round(e.rem / 1440) + '일 전' : e.rem >= 60 ? Math.round(e.rem / 60) + '시간 전' : e.rem + '분 전')
        : '';
      return (
        '<div class="event-row' +
        (isPast ? ' past' : '') +
        '"><span class="event-date"><b>' +
        d.getDate() +
        '</b><i>' +
        (d.getMonth() + 1) +
        '월</i></span>' +
        '<span class="event-info"><strong>' +
        esc(e.title) +
        '</strong>' +
        (e.memo ? '<small>' + esc(e.memo) + '</small>' : '') +
        '<small>' +
        esc(e.who === 'me' ? payerName('me') : e.who === 'you' ? payerName('you') : '함께') +
        timeTag +
        rptTag +
        remTag +
        '</small></span>' +
        dd +
        '<button class="item-del" data-action="ev-ics" data-v="' +
        e.id +
        '" type="button">ICS</button>' +
        '<button class="item-del" data-action="ev-edit" data-v="' +
        e.id +
        '" type="button">수정</button>' +
        armBtn('ev-del', e.id, '삭제', '확인') +
        '</div>'
      );
    }

    /* 월 뷰 그리드 — 일정·기념일이 있는 날에 점 표시, 탭하면 그날 일정 */
    var my = S.calMonth.split('-').map(Number);
    var first = new Date(my[0], my[1] - 1, 1);
    var dim = new Date(my[0], my[1], 0).getDate();
    var startOffset = (first.getDay() + 6) % 7;
    var has = monthEvents(S.calMonth);
    /* 주간 체크인 기분을 달력 주에 옅은 색으로 입힌다 — 기분 캘린더 */
    var wkMood = {};
    S.checkins.forEach(function (c) {
      wkMood[c.week] = c.mood;
    });
    var cells = '';
    for (var i = 0; i < startOffset; i++) cells += '<span class="cal-cell empty"></span>';
    for (var day = 1; day <= dim; day++) {
      var iso = S.calMonth + '-' + p2(day);
      var dows = ['일', '월', '화', '수', '목', '금', '토'][new Date(my[0], my[1] - 1, day).getDay()];
      var cellWk = wkMood[ML.isoWeekKey(new Date(my[0], my[1] - 1, day, 12).getTime())];
      var moodTag = cellWk ? ' m' + cellWk : '';
      cells +=
        '<button class="cal-cell' +
        moodTag +
        (iso === today ? ' today' : '') +
        (iso === S.calDay ? ' sel' : '') +
        (has[iso] ? ' has' : '') +
        '" type="button" data-action="cal-day" data-v="' +
        iso +
        '" aria-label="' +
        my[1] +
        '월 ' +
        day +
        '일 ' +
        dows +
        '요일' +
        (has[iso] ? ', 일정 있음' : '') +
        '">' +
        day +
        (has[iso] ? '<i></i>' : '') +
        '</button>';
    }
    var calGrid;
    if (S.calView === 'w') {
      /* 주간 뷰 — 선택 날짜가 속한 주를 세로 리스트로 */
      var wBase = new Date(S.calDay + 'T12:00:00');
      var wOff = (wBase.getDay() + 6) % 7;
      wBase.setDate(wBase.getDate() - wOff);
      var wRows = '';
      for (var wi = 0; wi < 7; wi++) {
        var wIso = dateStr(wBase.getTime());
        var wEvs = ML.eventsOnDay(S.events, S.anniv, wIso);
        wRows +=
          '<button class="cal-wrow' +
          (wIso === today ? ' today' : '') +
          (wIso === S.calDay ? ' sel' : '') +
          '" type="button" data-action="cal-day" data-v="' +
          wIso +
          '">' +
          '<span class="cal-wdow">' +
          ['월', '화', '수', '목', '금', '토', '일'][wi] +
          '</span><b>' +
          +wIso.slice(8) +
          '</b>' +
          '<span class="cal-wevs">' +
          (wEvs.length
            ? wEvs
                .map(function (x) {
                  return '<i>' + esc(x.title) + '</i>';
                })
                .join('')
            : '<i class="none">일정 없음</i>') +
          '</span></button>';
        wBase.setDate(wBase.getDate() + 1);
      }
      var wStart = dateStr(wBase.getTime() - 7 * 86400000),
        wEnd = dateStr(wBase.getTime() - 86400000);
      calGrid =
        '<div class="cal-grid-wrap card" style="margin-top:16px">' +
        '<div class="cal-nav"><button class="chip" type="button" data-action="cal-week" data-v="-1" aria-label="이전 주">‹</button>' +
        '<strong>' +
        +wStart.slice(5, 7) +
        '/' +
        +wStart.slice(8) +
        ' ~ ' +
        +wEnd.slice(8) +
        '</strong>' +
        '<span><button class="chip chip-sm' +
        (S.calView === 'w' ? ' selected' : '') +
        '" type="button" data-action="cal-view" data-v="w">주간</button><button class="chip chip-sm" type="button" data-action="cal-view" data-v="m">월간</button>' +
        '<button class="chip chip-sm" type="button" data-action="cal-today">오늘</button>' +
        '<button class="chip" type="button" data-action="cal-week" data-v="1" aria-label="다음 주">›</button></span></div>' +
        '<div class="cal-week">' +
        wRows +
        '</div>';
    } else {
      calGrid =
        '<div class="cal-grid-wrap card" style="margin-top:16px">' +
        '<div class="cal-nav"><button class="chip" type="button" data-action="cal-month" data-v="-1" aria-label="이전 달">‹</button>' +
        '<strong>' +
        my[0] +
        '년 ' +
        my[1] +
        '월</strong>' +
        '<span><button class="chip chip-sm" type="button" data-action="cal-view" data-v="w">주간</button><button class="chip chip-sm selected" type="button" data-action="cal-view" data-v="m">월간</button>' +
        '<button class="chip chip-sm" type="button" data-action="cal-today">오늘</button>' +
        '<button class="chip" type="button" data-action="cal-month" data-v="1" aria-label="다음 달">›</button></span></div>' +
        '<div class="cal-grid" role="grid"><span class="cal-dow">월</span><span class="cal-dow">화</span><span class="cal-dow">수</span><span class="cal-dow">목</span><span class="cal-dow">금</span><span class="cal-dow sat">토</span><span class="cal-dow sun">일</span>' +
        cells +
        '</div>' +
        (Object.keys(wkMood).length
          ? '<div class="cal-mood-legend"><span class="field-hint">주별 체크인 기분:</span>' +
            [
              [5, '😊'],
              [4, '🙂'],
              [3, '😐'],
              [2, '😕'],
              [1, '😣'],
            ]
              .map(function (m) {
                return '<span class="cal-mood-key m' + m[0] + '">' + m[1] + '</span>';
              })
              .join('') +
            '</div>'
          : '');
    }

    /* 선택한 날짜의 일정 상세 */
    var selItems = ML.eventsOnDay(S.events, S.anniv, S.calDay);
    var selLabel = ML.dateLabel(new Date(S.calDay + 'T12:00:00').getTime());
    calGrid +=
      '<div class="cal-day-detail"><h5>' +
      esc(selLabel) +
      '</h5>' +
      (selItems.length
        ? selItems
            .map(function (x) {
              return (
                '<div class="cal-day-item"><span class="k ' +
                x.kind +
                '"></span><span>' +
                esc(x.title) +
                (x.memo ? ' <small style="color:var(--app-muted)">' + esc(x.memo) + '</small>' : '') +
                '</span></div>'
              );
            })
            .join('')
        : '<p class="field-hint">이 날의 일정이 없어요.</p>') +
      '<button class="btn btn-tertiary btn-sm" data-action="cal-add-day" type="button" style="margin-top:8px">이 날에 일정 추가</button></div></div>';

    /* 기념일 — 매년 같은 날에 D-day로 표시, 마일스톤 배지 */
    var annivRows = S.anniv
      .map(function (a) {
        var nxt = ML.nextAnnivTs(a.date);
        var dd = nxt === null ? '' : ML.ddayLabel(nxt);
        var since = Math.floor((Date.now() - new Date(a.date + 'T12:00:00').getTime()) / 86400000);
        var mile = ML.ddayMilestone(since);
        return (
          '<div class="settle-row"><span class="settle-cat">기념일</span><span class="settle-info"><strong>' +
          esc(a.title) +
          '</strong><small>' +
          esc(a.date.slice(5)) +
          ' · 매년' +
          (mile ? ' · 오늘 ' + mile : ' · D+' + Math.max(0, since) + '일째') +
          '</small></span>' +
          '<span class="badge badge-brand">' +
          esc(dd) +
          '</span>' +
          '<button class="item-del" data-action="anniv-ics" data-v="' +
          a.id +
          '" type="button">ICS</button>' +
          armBtn('anniv-del', a.id, '삭제', '확인') +
          '</div>'
        );
      })
      .join('');
    var annivHTML =
      '<div class="card" style="margin-top:16px"><h4 class="card-title">우리 기념일</h4>' +
      (annivRows || '<p class="field-hint">만난 날, 입주일 같은 기념일을 등록해 두면 홈에 D-day로 떠요.</p>') +
      '<div class="custom-rule" style="margin-top:10px"><input id="anniv-title" class="input" maxlength="20" placeholder="예: 만난 날" autocomplete="off">' +
      '<input id="anniv-date" class="input" type="date" value="' +
      today +
      '" aria-label="기념일 날짜">' +
      '<button class="btn btn-secondary btn-md" data-action="anniv-add" type="button">추가</button></div></div>';

    shell(
      listPageHead('LIFE TOOLS', T('view.calendar.title'), T('view.calendar.desc')) +
        calGrid +
        '<div class="card" style="margin-top:20px"><h4 class="card-title">' +
        (evEditing ? '일정 수정' : '일정 추가') +
        '</h4>' +
        (evEditing
          ? ''
          : '<div class="chip-row" style="margin-bottom:12px"><span class="field-hint" style="width:100%">자주 쓰는 일정:</span>' +
            EV_TEMPLATES.map(function (t, i) {
              return '<button class="chip" data-action="ev-tpl" data-v="' + i + '" type="button">' + esc(t.label) + '</button>';
            }).join('') +
            '</div>') +
        '<div class="field-group"><label class="field-label" for="ev-date">날짜</label><input id="ev-date" class="input" type="date" value="' +
        esc(evEditing ? evEditing.date : S.calDay || today) +
        '"></div>' +
        '<div class="field-group"><label class="field-label" for="ev-time">시간 (선택)</label><input id="ev-time" class="input" type="time" value="' +
        esc(evEditing && evEditing.time ? evEditing.time : '') +
        '"></div>' +
        '<div class="field-group"><label class="field-label" for="ev-title">제목</label><input id="ev-title" class="input" maxlength="30" placeholder="예: 전세 만기일" autocomplete="off" value="' +
        esc(evEditing ? evEditing.title : S.evDraft ? S.evDraft.title : '') +
        '"></div>' +
        '<div class="field-group"><label class="field-label" for="ev-memo">메모 (선택)</label><input id="ev-memo" class="input" maxlength="60" placeholder="예: 오후 2시 집주인 연락" autocomplete="off" value="' +
        esc(evEditing && evEditing.memo ? evEditing.memo : S.evDraft ? S.evDraft.memo : '') +
        '"></div>' +
        '<div class="field-group" style="margin-bottom:0"><span class="field-label">누구의 일정</span><div class="chip-row">' +
        [
          ['both', '함께'],
          ['me', payerName('me')],
          ['you', payerName('you')],
        ]
          .map(function (w) {
            return (
              '<button class="chip' +
              (S.evWho === w[0] ? ' selected' : '') +
              '" data-action="ev-who" data-v="' +
              w[0] +
              '" type="button" aria-pressed="' +
              (S.evWho === w[0]) +
              '">' +
              esc(w[1]) +
              '</button>'
            );
          })
          .join('') +
        '</div></div>' +
        '<div class="field-group"><label class="field-label" for="ev-rem">알림 (선택)</label><select id="ev-rem" class="input">' +
        [
          [0, '알림 없음'],
          [60, '1시간 전'],
          [180, '3시간 전'],
          [1440, '하루 전'],
          [4320, '3일 전'],
        ]
          .map(function (o) {
            var cur = evEditing && evEditing.rem !== undefined ? evEditing.rem : S.evDraft && S.evDraft.rem !== undefined ? S.evDraft.rem : 0;
            return '<option value="' + o[0] + '"' + (cur === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
          })
          .join('') +
        '</select>' +
        (window.MateNative ? '' : '<small class="field-hint">알림은 앱(Android/iOS)에서 울려요.</small>') +
        '</div>' +
        '<label class="check-row"><input type="checkbox" id="ev-rpt"' +
        (evEditing && evEditing.rpt === 'w' ? ' checked' : '') +
        '> <span>매주 같은 요일에 반복</span></label>' +
        '<label class="check-row" style="margin-bottom:0"><span>반복 종료일 (선택)</span><input id="ev-until" class="input" type="date" value="' +
        esc(evEditing && evEditing.until ? evEditing.until : '') +
        '" aria-label="반복 종료일"></label>' +
        '<div class="cta-row" style="margin-top:14px"><button class="mobile-primary" data-action="ev-add" type="button">' +
        (evEditing ? '수정 저장' : '일정 추가하기') +
        '</button>' +
        (evEditing ? '<button class="btn btn-tertiary btn-md" data-action="ev-edit-cancel" type="button">취소</button>' : '') +
        '</div></div>' +
        annivHTML +
        (upcoming.length
          ? '<div class="sec-head" style="margin-top:22px"><h3>다가오는 일정</h3><span class="badge badge-brand">' +
            upcoming.length +
            '</span></div>' +
            upcoming
              .map(function (e) {
                return row(e);
              })
              .join('')
          : '<div class="empty-notes" style="margin-top:22px">' + mobileIcon('chat') + '<p>예정된 일정이 없어요.<br>중요한 날을 추가해 보세요.</p></div>') +
        (past.length
          ? '<details class="card" style="margin-top:16px"><summary>지난 일정 (' +
            past.length +
            ')</summary>' +
            past
              .map(function (e) {
                return row(e, true);
              })
              .join('') +
            '</details>'
          : '') +
        '<p class="device-note">일정·기념일은 이 기기에 저장되고 동기화 시 메이트와 공유돼요. ICS로내면 캘린더 앱에 추가할 수 있어요.</p>'
    );
    /* 달력 스와이프 — 좌우 밀기로 이전/다음 달 */
    var cw = document.querySelector ? document.querySelector('.cal-grid-wrap') : null;
    if (cw && cw.addEventListener) {
      var swipeX0 = null;
      cw.addEventListener(
        'touchstart',
        function (t) {
          swipeX0 = /** @type {TouchEvent} */ (t).touches[0].clientX;
        },
        { passive: true }
      );
      cw.addEventListener(
        'touchend',
        function (t) {
          if (swipeX0 === null) return;
          var dx = /** @type {TouchEvent} */ (t).changedTouches[0].clientX - swipeX0;
          swipeX0 = null;
          if (Math.abs(dx) < 50) return;
          var btn = document.querySelector('[data-action="cal-month"][data-v="' + (dx < 0 ? '1' : '-1') + '"]');
          if (btn) /** @type {HTMLElement} */ (btn).click();
        },
        { passive: true }
      );
    }
  }

  /* ================= View: 주간 체크인 ================= */
  function thisCheckin() {
    var wk = isoWeekKey();
    return (
      S.checkins.find(function (c) {
        return c.week === wk;
      }) || null
    );
  }
  function vCheckin() {
    var wk = isoWeekKey();
    var cur = S.checkins.find(function (c) {
      return c.week === wk;
    });
    var rules = agreementRules();
    var moodSel = cur ? cur.mood : 0;
    var keptSel = cur ? cur.kept || [] : [];
    /* 연속 체크인 스트릭 */
    var weekSet = {};
    S.checkins.forEach(function (c) {
      weekSet[c.week] = true;
    });
    var streak = ML.streakWeeks(weekSet);

    var historyHTML = '';
    var past = S.checkins
      .filter(function (c) {
        return c.week !== wk;
      })
      .slice(-4)
      .reverse();
    if (past.length) {
      historyHTML =
        '<div class="sec-head" style="margin-top:22px"><h3>지난 체크인</h3></div>' +
        past
          .map(function (c) {
            var m = CHECKIN_MOODS.find(function (x) {
              return x.v === c.mood;
            });
            var customBits = '';
            if (c.custom) {
              Object.keys(c.custom).forEach(function (k) {
                var qq = S.ciQuestions.find(function (q2) {
                  return q2.id === k;
                });
                customBits += ' · ' + esc(qq ? qq.q.slice(0, 12) : '질문') + ': ' + esc(c.custom[k]);
              });
            }
            return (
              '<div class="checkin-hist"><span class="ch-emoji">' +
              (m ? m.emoji : '·') +
              '</span><span><strong>' +
              esc(c.week) +
              '</strong><small>' +
              (m ? esc(m.label) : '') +
              (c.fix ? ' · ' + esc(c.fix) : '') +
              (c.thanks ? ' · 💌 ' + esc(c.thanks) : '') +
              customBits +
              '</small></span></div>'
            );
          })
          .join('');
    }
    /* 기분 추이 차트 — 최근 8주 */
    var trend = S.checkins
      .filter(function (c) {
        return c.mood;
      })
      .slice(-8);
    var chartHTML =
      trend.length >= 2
        ? '<div class="card" style="margin-top:14px"><h4 class="card-title">우리 생활 기분 추이</h4><div class="mood-chart" role="img" aria-label="최근 ' +
          trend.length +
          '주 기분 추이">' +
          trend
            .map(function (c) {
              return (
                '<div class="mood-col"><i style="height:' +
                Math.round((c.mood / 5) * 100) +
                '%" title="' +
                esc(c.week) +
                '"></i><small>' +
                esc(c.week.slice(4)) +
                '</small></div>'
              );
            })
            .join('') +
          '</div>' +
          '<p class="caption text-muted">평균 ' +
          Math.round(
            (trend.reduce(function (a, c) {
              return a + c.mood;
            }, 0) /
              trend.length) *
              10
          ) /
            10 +
          ' / 5</p></div>'
        : '';
    /* 이번 주 우리 미션 — 주가 바뀌면 프리셋에서 결정적으로 새로 고른다 */
    var msn = S.missions;
    if (msn.week !== wk) {
      /* 각 카테고리에서 1개씩 골라 다양하게 — 프리셋 인덱스를 함께 추적 */
      msn = {
        week: wk,
        list: ML.missionPick(wk, MISSION_PRESETS, 2).map(function (t, i) {
          var pi = MISSION_PRESETS.indexOf(t);
          return { id: 'm-' + wk + '-' + i, text: t, cat: pi >= 0 ? MISSION_CATS[pi] : '직접', done: false };
        }),
      };
      S.missions = msn;
      save('mateon.missions', msn);
    }
    var mDone = msn.list.filter(function (m) {
      return m.done;
    }).length;
    var missionHTML =
      '<div class="card" style="margin-top:14px"><h4 class="card-title">이번 주 우리 미션 <span class="mission-rate">' +
      mDone +
      '/' +
      msn.list.length +
      '</span></h4>' +
      msn.list
        .map(function (m) {
          var mcat = m.cat || '직접';
          return (
            '<button class="rule-item' +
            (m.done ? ' checked' : '') +
            '" data-action="mission-done" data-v="' +
            m.id +
            '" type="button" aria-pressed="' +
            m.done +
            '"><span class="rule-check"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span><span>' +
            esc(m.text) +
            '<small class="msn-cat">' +
            esc(MISSION_CAT_EMOJI[mcat] || '✏️') +
            ' ' +
            esc(mcat) +
            '</small></span></button>'
          );
        })
        .join('') +
      '<div class="custom-rule" style="margin-top:10px"><input id="mission-in" class="input" maxlength="30" placeholder="우리만의 미션 추가" autocomplete="off">' +
      '<button class="btn btn-secondary btn-md" data-action="mission-add" type="button">추가</button></div></div>';

    var cheer =
      streak >= 4
        ? streak + '주 연속 체크인 중이에요. 꾸준함이 곧 애정이에요.'
        : streak >= 2
          ? streak + '주 연속 체크인 중이에요. 좋은 리듬이에요.'
          : '매주 일요일 저녁, 한 주를 돌아보기 좋은 시간이에요.';

    shell(
      listPageHead('LIFE TOOLS', T('view.checkin.title'), T('view.checkin.desc')) +
        (streak ? '<div class="streak-badge" role="status">🔥 ' + streak + '주 연속 체크인</div>' : '') +
        '<p class="field-hint" style="margin:10px 2px 0">' +
        esc(cheer) +
        '</p>' +
        '<div class="card" style="margin-top:12px"><h4 class="card-title">' +
        weekRangeLabel(Date.now()) +
        ' · 이번 주 우리 생활은?</h4>' +
        '<div class="mood-row" role="radiogroup" aria-label="이번 주 기분">' +
        CHECKIN_MOODS.map(function (m) {
          return (
            '<button class="mood-btn' +
            (moodSel === m.v ? ' on' : '') +
            '" data-action="ci-mood" data-v="' +
            m.v +
            '" type="button" role="radio" aria-checked="' +
            (moodSel === m.v) +
            '" aria-label="' +
            esc(m.label) +
            '"><span>' +
            m.emoji +
            '</span><small>' +
            esc(m.label) +
            '</small></button>'
          );
        }).join('') +
        '</div></div>' +
        (rules.length
          ? '<div class="card" style="margin-top:14px"><h4 class="card-title">잘 지켜진 우리 규칙</h4>' +
            rules
              .slice(0, 8)
              .map(function (t, i) {
                var on = keptSel.indexOf(i) >= 0;
                return (
                  '<button class="rule-item' +
                  (on ? ' checked' : '') +
                  '" data-action="ci-kept" data-v="' +
                  i +
                  '" type="button" aria-pressed="' +
                  on +
                  '"><span class="rule-check"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span><span>' +
                  esc(t) +
                  '</span></button>'
                );
              })
              .join('') +
            '</div>'
          : '') +
        '<div class="card" style="margin-top:14px"><h4 class="card-title">이번 주 고마웠던 일 (선택)</h4>' +
        '<div class="field-group" style="margin-bottom:0"><input id="ci-thanks" class="input" maxlength="60" placeholder="예: 설거지 다 해줘서" value="' +
        esc(cur ? cur.thanks || '' : '') +
        '" autocomplete="off"></div></div>' +
        '<div class="card" style="margin-top:14px"><h4 class="card-title">다음 주에 나누고 싶은 것 (선택)</h4>' +
        '<div class="field-group" style="margin-bottom:0"><input id="ci-fix" class="input" maxlength="80" placeholder="예: 주말엔 같이 청소하기" value="' +
        esc(cur ? cur.fix || '' : '') +
        '" autocomplete="off"></div></div>' +
        /* 우리만의 질문 — 매주 물어볼 커스텀 항목 */
        '<div class="card" style="margin-top:14px"><h4 class="card-title">우리만의 질문 <span class="field-hint">매주 함께 답해요</span></h4>' +
        (S.ciQuestions.length
          ? S.ciQuestions
              .map(function (cq) {
                var ans = cur && cur.custom ? cur.custom[cq.id] : '';
                return (
                  '<div class="ciq-row"><label class="ciq-label" for="ciq-' +
                  esc(cq.id) +
                  '">' +
                  esc(cq.q) +
                  '</label>' +
                  '<input id="ciq-' +
                  esc(cq.id) +
                  '" class="input ciq-in" maxlength="80" placeholder="한 줄 답변" autocomplete="off" value="' +
                  esc(ans || '') +
                  '" data-q="' +
                  esc(cq.id) +
                  '">' +
                  armBtn('ciq-del', cq.id, '질문 삭제', '확인') +
                  '</div>'
                );
              })
              .join('')
          : '<p class="field-hint" style="margin-bottom:8px">예: 이번 주 가장 맛있었던 반찬, 다음 달 함께 가고 싶은 곳</p>') +
        '<div class="custom-rule"><input id="ciq-in" class="input" maxlength="40" placeholder="새 질문 만들기" autocomplete="off">' +
        '<button class="btn btn-secondary btn-md" data-action="ciq-add" type="button">추가</button></div></div>' +
        '<div class="cta-col"><button class="btn btn-primary btn-lg" data-action="ci-save" type="button">' +
        (cur ? '체크인 수정하기' : '체크인 저장하기') +
        '</button></div>' +
        (cur
          ? '<div class="card" style="margin-top:14px"><h4 class="card-title">이번 체크인에 답장</h4>' +
            ((S.ciReplies[wk] || []).length
              ? (S.ciReplies[wk] || [])
                  .map(function (r, ri) {
                    return (
                      '<div class="checkin-hist"><span class="ch-emoji">💬</span><span><strong>' +
                      esc(r.text) +
                      '</strong><small>' +
                      ML.dateLabel(r.ts) +
                      '</small></span>' +
                      armBtn('ci-reply-del', wk + ':' + ri, '삭제', '확인') +
                      '</div>'
                    );
                  })
                  .join('')
              : '<p class="field-hint" style="margin-bottom:10px">저장한 체크인에 한 줄 답장을 남길 수 있어요. 상대에게 전하는 마음이에요.</p>') +
            '<div class="custom-rule"><input id="ci-reply-in" class="input" maxlength="100" placeholder="예: 이번 주 고생했어 💛" autocomplete="off">' +
            '<button class="btn btn-secondary btn-md" data-action="ci-reply-add" type="button">답장</button></div></div>'
          : '') +
        missionHTML +
        chartHTML +
        historyHTML +
        '<p class="device-note">체크인과 미션은 이 기기에 저장되고, 동기화 시 메이트와 공유돼요.</p>'
    );
  }

  /* ================= View: 갈등 가이드 ================= */
  var cgTimerId = null;
  function vConflict() {
    var step = S.cgStep;
    var dom =
      CONFLICT_DOMAINS.find(function (d) {
        return d.id === S.cgDomain;
      }) || CONFLICT_DOMAINS[0];
    var mc = S.me ? charById(S.me.charId) : null;
    var yc = S.partner ? charById(S.partner.charId) : null;
    var head =
      listPageHead('CONFLICT GUIDE', T('view.conflict.title'), T('view.conflict.desc')) +
      '<div class="cg-steps" aria-label="갈등 대응 단계">' +
      ['상황 선택', '멈추기', '말하기', '합의하기']
        .map(function (t, i) {
          return '<span class="cg-step' + (i === step ? ' on' : i < step ? ' done' : '') + '"><i>' + (i < step ? '✓' : i + 1) + '</i>' + t + '</span>';
        })
        .join('') +
      '</div>';

    var body = '';
    if (step === 0) {
      body =
        '<div class="card" style="margin-top:18px"><h4 class="card-title">어떤 일이 있었나요?</h4>' +
        CONFLICT_DOMAINS.map(function (d) {
          return (
            '<button class="conflict-pick' +
            (S.cgDomain === d.id ? ' on' : '') +
            '" data-action="cg-domain" data-v="' +
            d.id +
            '" type="button"><strong>' +
            esc(d.title) +
            '</strong><small>' +
            esc(d.hint) +
            '</small></button>'
          );
        }).join('') +
        '<button class="mobile-primary" data-action="cg-next" type="button" style="margin-top:14px">다음 · 잠시 멈추기</button></div>';
    } else if (step === 1) {
      var started = S.cgStart;
      var left = started ? Math.max(0, Math.ceil((started + 30 * 60000 - Date.now()) / 60000)) : 30;
      body =
        '<div class="card" style="margin-top:18px;text-align:center"><span class="cg-timer" id="cg-timer">' +
        left +
        '</span><p class="body-md">분 각자 정리 시간</p>' +
        '<p class="body-sm text-muted" style="margin:14px 0">' +
        esc(CONFLICT_STEP_TIPS.calm) +
        '</p>' +
        (mc
          ? '<div class="note-box info" style="margin-bottom:14px"><span>나의 첫 반응: ' +
            esc(mc.conflictSeq[0]) +
            ' → ' +
            esc(mc.conflictSeq[1] || '') +
            '</span></div>'
          : '') +
        (yc
          ? '<div class="note-box info" style="margin-bottom:14px"><span>' +
            esc(S.partner.name || '메이트') +
            '님의 첫 반응: ' +
            esc(yc.conflictSeq[0]) +
            ' → ' +
            esc(yc.conflictSeq[1] || '') +
            '</span></div>'
          : '') +
        (started
          ? '<button class="btn btn-tertiary btn-md" data-action="cg-reset-timer" type="button">타이머 다시 시작</button>'
          : '<button class="mobile-primary" data-action="cg-timer" type="button">30분 타이머 시작</button>') +
        '<button class="btn btn-primary btn-lg" data-action="cg-next" type="button" style="margin-top:12px">정리됐어요 · 대화 준비</button></div>';
    } else if (step === 2) {
      var sc = CONFLICT_SCENARIOS[S.cgDomain];
      body =
        '<div class="card" style="margin-top:18px"><h4 class="card-title">이렇게 시작해 보세요</h4>' +
        '<p class="body-sm text-muted" style="margin-bottom:12px">' +
        esc(CONFLICT_STEP_TIPS.talk) +
        '</p>' +
        (sc
          ? '<div class="note-box info" style="margin-bottom:12px"><span><strong>' + esc(sc.title) + '</strong> · ' + esc(sc.prevention) + '</span></div>'
          : '') +
        '<div class="talk-guide"><span>내가 먼저</span><p>“' +
        esc('요즘 ' + dom.title.replace(/요$/, ' 것 같아서, 내가 예민한 건지 한번 이야기하고 싶었어')) +
        '”</p></div>' +
        (mc && yc
          ? '<div class="do-grid" style="margin-top:14px"><div class="do-col do"><h5>' +
            esc(S.me.name || '나') +
            '에게 맞는 방식</h5><ul>' +
            yc.dos
              .map(function (t) {
                return '<li>· ' + esc(t) + '</li>';
              })
              .join('') +
            '</ul></div>' +
            '<div class="do-col dont"><h5>' +
            esc(S.partner.name || '메이트') +
            '님이 피해줬으면 하는 것</h5><ul>' +
            mc.donts
              .map(function (t) {
                return '<li>· ' + esc(t) + '</li>';
              })
              .join('') +
            '</ul></div></div>'
          : '') +
        '<button class="mobile-primary" data-action="cg-next" type="button" style="margin-top:14px">합의하러 가기</button></div>';
    } else {
      body =
        '<div class="card" style="margin-top:18px"><h4 class="card-title">작은 약속 하나 정하기</h4>' +
        '<p class="body-sm text-muted" style="margin-bottom:12px">' +
        esc(CONFLICT_STEP_TIPS.agree) +
        '</p>' +
        '<div class="field-group"><input id="cg-note" class="input" maxlength="80" placeholder="예: 밤 11시 이후엔 이어폰 쓰기" autocomplete="off"></div>' +
        '<div class="cta-col"><button class="btn btn-primary btn-md" data-action="cg-save" type="button">합의 기록하기</button>' +
        '<button class="btn btn-secondary btn-md" data-action="cg-save-rule" type="button">생활규칙으로도 추가</button>' +
        '<button class="btn btn-tertiary btn-md" data-action="cg-restart" type="button">처음으로</button></div></div>' +
        (S.conflictLog.length
          ? '<div class="sec-head" style="margin-top:20px"><h3>지난 합의</h3></div>' +
            S.conflictLog
              .map(function (l, i) {
                return { l: l, i: i };
              })
              .reverse()
              .slice(0, 8)
              .map(function (x) {
                var l = x.l;
                return (
                  '<div class="checkin-hist"><span><strong>' +
                  esc(l.note) +
                  '</strong><small>' +
                  fmtDate(l.ts) +
                  ' · ' +
                  esc(
                    (
                      CONFLICT_DOMAINS.find(function (d) {
                        return d.id === l.domain;
                      }) || {}
                    ).title || ''
                  ) +
                  '</small></span>' +
                  armBtn('cglog-del', x.i, '삭제', '확인') +
                  '</div>'
                );
              })
              .join('')
          : '');
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
    { k: 'mateon.fixedExpenses', t: '고정비 목록' },
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
    { k: 'mateon.budgets', t: '카테고리별 월 예산' },
    { k: 'mateon.anniv', t: '우리 기념일' },
    { k: 'mateon.missions', t: '이번 주 우리 미션' },
    { k: 'mateon.syncMeta', t: '마지막 동기화 시각' },
    { k: 'mateon.syncStat', t: '마지막 동기화 결과' },
    { k: 'mateon.lastBackup', t: '마지막 백업 시각' },
    { k: 'mateon.talkFavs', t: '대화 주제 즐겨찾기' },
    { k: 'mateon.homeName', t: '우리 공간 이름' },
    { k: 'mateon.pantry', t: '유통기한 관리 목록' },
    { k: 'mateon.coupons', t: '러브 쿠폰' },
    { k: 'mateon.debts', t: '빌려준 돈 기록' },
    { k: 'mateon.roulette', t: '결정 룰렛 설정' },
    { k: 'mateon.moveDate', t: '입주 예정일' },
    { k: 'mateon.homeWidgets', t: '홈 카드 순서' },
    { k: 'mateon.lock', t: '앱 잠금 설정' },
    { k: 'mateon.ciReplies', t: '체크인 답장' },
    { k: 'mateon.shopHist', t: '쇼핑 구매 이력' },
    { k: 'mateon.demo', t: '데모 모드 상태' },
    { k: 'mateon.goal', t: '공동 목표 저축' },
    { k: 'mateon.care', t: '돌봄 일정' },
    { k: 'mateon.memos', t: '우리집 정보 메모' },
    { k: 'mateon.settlePaid', t: '부분 정산 기록' },
    { k: 'mateon.loveLang', t: '애정 언어 결과' },
    { k: 'mateon.trash', t: '휴지통' },
    { k: 'mateon.badges', t: '획득한 배지' },
    { k: 'mateon.errors', t: '오류 기록' },
    { k: 'mateon.snapshots', t: '자동 스냅샷' },
    { k: 'mateon.ciQuestions', t: '체크인 커스텀 질문' },
    { k: 'mateon.fxDismiss', t: '고정비 제안 닫기' },
    { k: 'mateon.lmCustom', t: '러브맵 직접 질문' },
    { k: 'mateon.notifs', t: '알림 기록' },
    { k: 'mateon.photos', t: '공유받은 사진' },
    { k: 'mateon.rate', t: '앱 평가 프롬프트 상태' },
  ];
  var BACKUP_KEYS = DATA_ITEMS.map(function (it) {
    return it.k;
  });
  var CHECKLIST_KEYS = {};
  CHECKLIST.forEach(function (g) {
    g.items.forEach(function (t, i) {
      CHECKLIST_KEYS[g.cat + ':' + i] = true;
    });
  });

  function rawGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
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
    if (
      r.life &&
      (!Array.isArray(r.life) ||
        r.life.length > LIFE_QUESTIONS.length ||
        !r.life.every(function (x) {
          return x && typeof x.area === 'string' && x.area.length <= 30 && typeof x.label === 'string' && x.label.length <= 30 && x.level >= 1 && x.level <= 3;
        }))
    )
      return false;
    return values.every(function (v) {
      return typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 4;
    });
  }

  function validAgreement(ag) {
    return !!(
      ag &&
      typeof ag === 'object' &&
      Array.isArray(ag.rules) &&
      ag.rules.length > 0 &&
      ag.rules.length <= 60 &&
      ag.rules.every(function (t) {
        return typeof t === 'string' && t.length > 0 && t.length <= 80;
      }) &&
      typeof ag.me === 'string' &&
      ag.me.length <= 100 &&
      typeof ag.partner === 'string' &&
      ag.partner.length <= 100 &&
      (!ag.meCharId || charById(ag.meCharId)) &&
      (!ag.partnerCharId || charById(ag.partnerCharId)) &&
      (!ag.date || typeof ag.date === 'string') &&
      (!ag.updated || typeof ag.updated === 'string') &&
      (!ag.rev || (Number.isInteger(ag.rev) && ag.rev >= 1)) &&
      (!ag.ts || typeof ag.ts === 'number')
    );
  }

  function validHistoryEntry(h) {
    return !!(
      h &&
      typeof h === 'object' &&
      charById(h.charId) &&
      typeof h.eAvg === 'number' &&
      h.eAvg >= 1 &&
      h.eAvg <= 4 &&
      typeof h.rAvg === 'number' &&
      h.rAvg >= 1 &&
      h.rAvg <= 4 &&
      (!h.name || typeof h.name === 'string') &&
      (!h.ts || typeof h.ts === 'number')
    );
  }

  function validBackupValue(key, value) {
    if (key === 'mateon.me' || key === 'mateon.partner') return validStoredResult(value);
    if (key === 'mateon.agreement') return validAgreement(value);
    if (key === 'mateon.history') return Array.isArray(value) && value.length <= 10 && value.every(validHistoryEntry);
    if (key === 'mateon.checklist') {
      return !!(
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value).every(function (k) {
          return CHECKLIST_KEYS[k] && typeof value[k] === 'boolean';
        })
      );
    }
    if (key === 'mateon.talks') {
      return !!(
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value).every(function (k) {
          var i = +k,
            n = value[k];
          return Number.isInteger(i) && HOME_TALKS[i] && n && typeof n.text === 'string' && n.text.length <= 500 && (!n.ts || typeof n.ts === 'number');
        })
      );
    }
    if (key === 'mateon.customRules')
      return (
        Array.isArray(value) &&
        value.length <= 50 &&
        value.every(function (t) {
          return typeof t === 'string' && t.length > 0 && t.length <= 60;
        })
      );
    if (key === 'mateon.draft.me' || key === 'mateon.draft.partner') {
      return isValidDraft(value) && (!value.invite || !!decodeResult(value.invite));
    }
    if (key === 'mateon.shareName') return typeof value === 'boolean';
    if (key === 'mateon.activeDraft') return value === 'me' || value === 'partner';
    if (key === 'ds-theme') return value === 'light' || value === 'dark' || value === 'system';
    if (key === 'mateon.expenses')
      return (
        Array.isArray(value) &&
        value.length <= 500 &&
        value.every(function (x) {
          return (
            x &&
            typeof x.id === 'string' &&
            x.id.length <= 40 &&
            typeof x.ts === 'number' &&
            (x.payer === 'me' || x.payer === 'you') &&
            typeof x.amount === 'number' &&
            x.amount > 0 &&
            x.amount <= 100000000 &&
            typeof x.memo === 'string' &&
            x.memo.length <= 40 &&
            typeof x.cat === 'string' &&
            x.cat.length <= 12 &&
            (x.share === undefined || (typeof x.share === 'number' && x.share >= 0 && x.share <= 1)) &&
            (x.fx === undefined || (typeof x.fx === 'string' && x.fx.length <= 40)) &&
            (x.rcpt === undefined || x.rcpt === 1) &&
            (x.income === undefined || x.income === 1) &&
            (x.tags === undefined ||
              (Array.isArray(x.tags) &&
                x.tags.length <= 5 &&
                x.tags.every(function (t) {
                  return typeof t === 'string' && t.length <= 12;
                })))
          );
        })
      );
    if (key === 'mateon.fixedExpenses')
      return (
        Array.isArray(value) &&
        value.length <= 50 &&
        value.every(function (f) {
          return (
            f &&
            typeof f.id === 'string' &&
            f.id.length <= 24 &&
            typeof f.memo === 'string' &&
            f.memo.length > 0 &&
            f.memo.length <= 40 &&
            (f.payer === 'me' || f.payer === 'you') &&
            typeof f.amount === 'number' &&
            f.amount > 0 &&
            f.amount <= 100000000 &&
            typeof f.cat === 'string' &&
            f.cat.length <= 12 &&
            Number.isInteger(f.day) &&
            f.day >= 1 &&
            f.day <= 28 &&
            (f.share === undefined || (typeof f.share === 'number' && f.share >= 0 && f.share <= 1))
          );
        })
      );
    if (key === 'mateon.settled')
      return (
        Array.isArray(value) &&
        value.length <= 200 &&
        value.every(function (z) {
          return z && typeof z.ts === 'number' && typeof z.label === 'string' && z.label.length <= 40 && typeof z.net === 'number' && Number.isFinite(z.net);
        })
      );
    if (key === 'mateon.chores')
      return !!(
        value &&
        typeof value === 'object' &&
        typeof value.anchor === 'number' &&
        Array.isArray(value.items) &&
        value.items.length <= 30 &&
        value.items.every(function (it) {
          return (
            it &&
            typeof it.id === 'string' &&
            it.id.length <= 24 &&
            typeof it.name === 'string' &&
            it.name.length > 0 &&
            it.name.length <= 20 &&
            (!it.freq || it.freq === 'w' || it.freq === 'bw') &&
            (!it.days ||
              (Array.isArray(it.days) &&
                it.days.length <= 7 &&
                it.days.every(function (d) {
                  return Number.isInteger(d) && d >= 0 && d <= 6;
                })))
          );
        }) &&
        Array.isArray(value.rot) &&
        value.rot.length <= 30 &&
        value.rot.every(function (n) {
          return n === 0 || n === 1;
        })
      );
    if (key === 'mateon.choreLog')
      return !!(
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value).every(function (k) {
          var log = value[k];
          return (
            /^\d{4}-W\d{2}$/.test(k) &&
            log &&
            typeof log === 'object' &&
            !Array.isArray(log) &&
            Object.keys(log).every(function (id) {
              var v = log[id];
              return (
                v === true ||
                (v && typeof v === 'object' && typeof v.ts === 'number' && (!v.by || v.by === 'me' || v.by === 'you') && (v.img === undefined || v.img === 1))
              );
            })
          );
        })
      );
    if (key === 'mateon.events')
      return (
        Array.isArray(value) &&
        value.length <= 300 &&
        value.every(function (e) {
          return (
            e &&
            typeof e.id === 'string' &&
            e.id.length <= 24 &&
            /^\d{4}-\d{2}-\d{2}$/.test(e.date) &&
            typeof e.title === 'string' &&
            e.title.length > 0 &&
            e.title.length <= 30 &&
            (!e.memo || (typeof e.memo === 'string' && e.memo.length <= 60)) &&
            (e.who === 'me' || e.who === 'you' || e.who === 'both') &&
            (e.rpt === undefined || e.rpt === 'w') &&
            (e.rem === undefined || (Number.isInteger(e.rem) && [60, 180, 1440, 4320].indexOf(e.rem) !== -1)) &&
            (!e.time || /^\d{2}:\d{2}$/.test(e.time)) &&
            (!e.until || /^\d{4}-\d{2}-\d{2}$/.test(e.until))
          );
        })
      );
    if (key === 'mateon.checkins')
      return (
        Array.isArray(value) &&
        value.length <= 60 &&
        value.every(function (c) {
          return (
            c &&
            /^\d{4}-W\d{2}$/.test(c.week) &&
            c.mood >= 1 &&
            c.mood <= 5 &&
            (!c.kept ||
              (Array.isArray(c.kept) &&
                c.kept.length <= 20 &&
                c.kept.every(function (i) {
                  return Number.isInteger(i) && i >= 0;
                }))) &&
            (!c.fix || (typeof c.fix === 'string' && c.fix.length <= 80)) &&
            typeof c.ts === 'number' &&
            (!c.thanks || (typeof c.thanks === 'string' && c.thanks.length <= 60)) &&
            (!c.custom ||
              (typeof c.custom === 'object' &&
                !Array.isArray(c.custom) &&
                Object.keys(c.custom).length <= 10 &&
                Object.keys(c.custom).every(function (k) {
                  return k.length <= 24 && typeof c.custom[k] === 'string' && c.custom[k].length <= 80;
                })))
          );
        })
      );
    if (key === 'mateon.customChecklist')
      return (
        Array.isArray(value) &&
        value.length <= 50 &&
        value.every(function (x) {
          return x && typeof x.id === 'string' && x.id.length <= 24 && typeof x.text === 'string' && x.text.length > 0 && x.text.length <= 40;
        })
      );
    if (key === 'mateon.conflictLog')
      return (
        Array.isArray(value) &&
        value.length <= 100 &&
        value.every(function (l) {
          return (
            l &&
            typeof l.ts === 'number' &&
            typeof l.note === 'string' &&
            l.note.length > 0 &&
            l.note.length <= 80 &&
            typeof l.domain === 'string' &&
            l.domain.length <= 2
          );
        })
      );
    if (key === 'mateon.shopping')
      return (
        Array.isArray(value) &&
        value.length <= 200 &&
        value.every(function (x) {
          return (
            x &&
            typeof x.id === 'string' &&
            x.id.length <= 24 &&
            typeof x.name === 'string' &&
            x.name.length > 0 &&
            x.name.length <= 30 &&
            SHOP_CATS.indexOf(x.cat) !== -1 &&
            typeof x.done === 'boolean' &&
            typeof x.ts === 'number' &&
            (!x.qty || (Number.isInteger(x.qty) && x.qty >= 1 && x.qty <= 99))
          );
        })
      );
    if (key === 'mateon.lovemap')
      return !!(
        value &&
        typeof value === 'object' &&
        Number.isInteger(value.idx) &&
        value.idx >= 0 &&
        value.idx <= LOVE_MAP_QUESTIONS.length &&
        Number.isInteger(value.known) &&
        value.known >= 0 &&
        Number.isInteger(value.asked) &&
        value.asked >= 0 &&
        (!value.askedIdx ||
          (Array.isArray(value.askedIdx) &&
            value.askedIdx.length <= LOVE_MAP_QUESTIONS.length &&
            value.askedIdx.every(function (i) {
              return Number.isInteger(i);
            }))) &&
        (!value.wrong ||
          (Array.isArray(value.wrong) &&
            value.wrong.length <= LOVE_MAP_QUESTIONS.length &&
            value.wrong.every(function (i) {
              return Number.isInteger(i);
            }))) &&
        (value.rounds === undefined || Number.isInteger(value.rounds)) &&
        (value.best === undefined || (Number.isInteger(value.best) && value.best >= 0 && value.best <= 100))
      );
    if (key === 'mateon.tb') return Array.isArray(value);
    if (key === 'mateon.reminders')
      return !!(
        value &&
        typeof value === 'object' &&
        typeof value.checkin === 'boolean' &&
        typeof value.agreement === 'boolean' &&
        (value.chore === undefined || typeof value.chore === 'boolean') &&
        (value.day === undefined || (Number.isInteger(value.day) && value.day >= 0 && value.day <= 6))
      );
    if (key === 'mateon.homeName') return value === '' || (typeof value === 'string' && value.length <= 12);
    if (key === 'mateon.budgets')
      return !!(
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value).every(function (k) {
          return EXPENSE_CATS.indexOf(k) !== -1 && typeof value[k] === 'number' && value[k] > 0 && value[k] <= 100000000;
        })
      );
    if (key === 'mateon.anniv')
      return (
        Array.isArray(value) &&
        value.length <= 20 &&
        value.every(function (a) {
          return (
            a &&
            typeof a.id === 'string' &&
            a.id.length <= 24 &&
            typeof a.title === 'string' &&
            a.title.length > 0 &&
            a.title.length <= 20 &&
            /^\d{4}-\d{2}-\d{2}$/.test(a.date)
          );
        })
      );
    if (key === 'mateon.missions')
      return (
        !!(value && typeof value === 'object' && !Array.isArray(value) && (value.week === '' || /^\d{4}-W\d{2}$/.test(value.week || ''))) &&
        Array.isArray(value.list) &&
        value.list.length <= 5 &&
        value.list.every(function (m) {
          return (
            m &&
            typeof m.id === 'string' &&
            m.id.length <= 24 &&
            typeof m.text === 'string' &&
            m.text.length <= 40 &&
            typeof m.done === 'boolean' &&
            (!m.cat || (typeof m.cat === 'string' && m.cat.length <= 8))
          );
        })
      );
    if (key === 'mateon.syncMeta')
      return !!(
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        ['push', 'pull', 'err'].every(function (k) {
          return value[k] === undefined || typeof value[k] === 'number';
        })
      );
    if (key === 'mateon.lastBackup') return typeof value === 'number' && value >= 0;
    if (key === 'mateon.talkFavs')
      return (
        Array.isArray(value) &&
        value.length <= HOME_TALKS.length &&
        value.every(function (i) {
          return Number.isInteger(i) && i >= 0 && i < HOME_TALKS.length;
        })
      );
    if (key === 'mateon.syncStat')
      return (
        value === null ||
        !!(
          value &&
          typeof value === 'object' &&
          typeof value.ts === 'number' &&
          typeof value.ok === 'boolean' &&
          (value.merged === undefined || (typeof value.merged === 'number' && value.merged >= 0 && value.merged <= 100000))
        )
      );
    if (key === 'mateon.inviteDays') return value === 1 || value === 7 || value === 30;
    if (key === 'mateon.fontSize') return value === 'normal' || value === 'large';
    if (key === 'mateon.seen') return value === true;
    if (key === 'mateon.demo') return value === true;
    if (key === 'mateon.sync')
      return !!(
        value &&
        typeof value === 'object' &&
        typeof value.endpoint === 'string' &&
        value.endpoint.length <= 200 &&
        typeof value.room === 'string' &&
        value.room.length <= 64 &&
        (value.slot === 'a' || value.slot === 'b') &&
        (!value.token || (typeof value.token === 'string' && value.token.length <= 200))
      );
    if (key === 'mateon.pantry')
      return (
        Array.isArray(value) &&
        value.length <= 200 &&
        value.every(function (x) {
          return (
            x &&
            typeof x.id === 'string' &&
            x.id.length <= 24 &&
            typeof x.name === 'string' &&
            x.name.length > 0 &&
            x.name.length <= 30 &&
            /^\d{4}-\d{2}-\d{2}$/.test(x.exp) &&
            PANTRY_LOCS.indexOf(x.loc) !== -1 &&
            typeof x.ts === 'number'
          );
        })
      );
    if (key === 'mateon.coupons')
      return (
        Array.isArray(value) &&
        value.length <= 100 &&
        value.every(function (x) {
          return (
            x &&
            typeof x.id === 'string' &&
            x.id.length <= 24 &&
            typeof x.title === 'string' &&
            x.title.length > 0 &&
            x.title.length <= 20 &&
            typeof x.ts === 'number' &&
            (!x.usedTs || typeof x.usedTs === 'number') &&
            (!x.pendTs || typeof x.pendTs === 'number') &&
            (x.by === 'me' || x.by === 'you')
          );
        })
      );
    if (key === 'mateon.debts')
      return (
        Array.isArray(value) &&
        value.length <= 100 &&
        value.every(function (x) {
          return (
            x &&
            typeof x.id === 'string' &&
            x.id.length <= 24 &&
            (x.dir === 'lent' || x.dir === 'borrowed') &&
            typeof x.amount === 'number' &&
            x.amount > 0 &&
            x.amount <= 100000000 &&
            typeof x.memo === 'string' &&
            x.memo.length <= 30 &&
            typeof x.ts === 'number' &&
            (!x.repaidTs || typeof x.repaidTs === 'number')
          );
        })
      );
    if (key === 'mateon.roulette')
      return !!(
        value &&
        typeof value === 'object' &&
        Array.isArray(value.opts) &&
        value.opts.length <= 20 &&
        value.opts.every(function (o) {
          return typeof o === 'string' && o.length > 0 && o.length <= 20;
        }) &&
        (value.last === undefined || typeof value.last === 'string')
      );
    if (key === 'mateon.moveDate') return value === null || /^\d{4}-\d{2}-\d{2}$/.test(value);
    if (key === 'mateon.homeWidgets')
      return (
        Array.isArray(value) &&
        value.length <= 20 &&
        value.every(function (w) {
          return typeof w === 'string' && w.length <= 20;
        })
      );
    if (key === 'mateon.lock')
      return (
        value === null ||
        !!(
          value &&
          typeof value === 'object' &&
          typeof value.hash === 'string' &&
          value.hash.length === 64 &&
          typeof value.salt === 'string' &&
          value.salt.length <= 24 &&
          (value.tries === undefined || Number.isInteger(value.tries)) &&
          (value.until === undefined || typeof value.until === 'number') &&
          (value.cred === undefined || typeof value.cred === 'string')
        )
      );
    if (key === 'mateon.ciReplies')
      return !!(
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value).every(function (k) {
          return (
            /^\d{4}-W\d{2}$/.test(k) &&
            Array.isArray(value[k]) &&
            value[k].length <= 20 &&
            value[k].every(function (r) {
              return r && typeof r.text === 'string' && r.text.length <= 100 && typeof r.ts === 'number';
            })
          );
        })
      );
    if (key === 'mateon.shopHist')
      return (
        Array.isArray(value) &&
        value.length <= 300 &&
        value.every(function (x) {
          return (
            x &&
            typeof x.name === 'string' &&
            x.name.length > 0 &&
            x.name.length <= 30 &&
            typeof x.ts === 'number' &&
            (!x.cnt || (Number.isInteger(x.cnt) && x.cnt > 0 && x.cnt <= 99))
          );
        })
      );
    if (key === 'mateon.goal')
      return (
        value === null ||
        !!(
          value &&
          typeof value === 'object' &&
          typeof value.name === 'string' &&
          value.name.length > 0 &&
          value.name.length <= 20 &&
          typeof value.target === 'number' &&
          value.target > 0 &&
          value.target <= 1000000000 &&
          Array.isArray(value.saves) &&
          value.saves.length <= 500 &&
          value.saves.every(function (s) {
            return s && typeof s.amt === 'number' && s.amt > 0 && s.amt <= 100000000 && typeof s.ts === 'number';
          })
        )
      );
    if (key === 'mateon.care')
      return (
        Array.isArray(value) &&
        value.length <= 30 &&
        value.every(function (x) {
          return (
            x &&
            typeof x.id === 'string' &&
            x.id.length <= 24 &&
            (x.kind === 'pet' || x.kind === 'plant') &&
            typeof x.name === 'string' &&
            x.name.length > 0 &&
            x.name.length <= 20 &&
            Number.isInteger(x.days) &&
            x.days >= 1 &&
            x.days <= 365 &&
            typeof x.last === 'number'
          );
        })
      );
    if (key === 'mateon.memos')
      return (
        Array.isArray(value) &&
        value.length <= 50 &&
        value.every(function (x) {
          return (
            x &&
            typeof x.id === 'string' &&
            x.id.length <= 24 &&
            typeof x.title === 'string' &&
            x.title.length > 0 &&
            x.title.length <= 20 &&
            typeof x.text === 'string' &&
            x.text.length <= 200 &&
            typeof x.ts === 'number' &&
            (x.pin === undefined || x.pin === true) &&
            (!x.tag || (typeof x.tag === 'string' && x.tag.length <= 12))
          );
        })
      );
    if (key === 'mateon.ciQuestions')
      return (
        Array.isArray(value) &&
        value.length <= 10 &&
        value.every(function (x) {
          return x && typeof x.id === 'string' && x.id.length <= 24 && typeof x.q === 'string' && x.q.length > 0 && x.q.length <= 40;
        })
      );
    if (key === 'mateon.fxDismiss')
      return (
        Array.isArray(value) &&
        value.length <= 100 &&
        value.every(function (x) {
          return typeof x === 'string' && x.length <= 80;
        })
      );
    if (key === 'mateon.lmCustom')
      return (
        Array.isArray(value) &&
        value.length <= 30 &&
        value.every(function (x) {
          return typeof x === 'string' && x.length > 0 && x.length <= 80;
        })
      );
    if (key === 'mateon.notifs')
      return (
        Array.isArray(value) &&
        value.length <= 50 &&
        value.every(function (x) {
          return (
            x &&
            typeof x.id === 'string' &&
            x.id.length <= 24 &&
            typeof x.icon === 'string' &&
            x.icon.length <= 8 &&
            typeof x.text === 'string' &&
            x.text.length > 0 &&
            x.text.length <= 80 &&
            typeof x.ts === 'number' &&
            (!x.route || (typeof x.route === 'string' && x.route.length <= 16))
          );
        })
      );
    if (key === 'mateon.settlePaid')
      return (
        Array.isArray(value) &&
        value.length <= 200 &&
        value.every(function (x) {
          return x && (x.dir === 'y2m' || x.dir === 'm2y') && typeof x.amt === 'number' && x.amt > 0 && x.amt <= 100000000 && typeof x.ts === 'number';
        })
      );
    if (key === 'mateon.loveLang')
      return (
        value === null ||
        !!(
          value &&
          typeof value === 'object' &&
          typeof value.type === 'string' &&
          Object.keys(LOVE_LANGS).indexOf(value.type) !== -1 &&
          typeof value.ts === 'number'
        )
      );
    if (key === 'mateon.trash')
      return (
        Array.isArray(value) &&
        value.length <= 50 &&
        value.every(function (x) {
          return (
            x &&
            typeof x.id === 'string' &&
            x.id.length <= 24 &&
            (x.k === 'exp' || x.k === 'ev' || x.k === 'shop') &&
            typeof x.label === 'string' &&
            x.label.length <= 80 &&
            x.item &&
            typeof x.item === 'object' &&
            typeof x.ts === 'number'
          );
        })
      );
    if (key === 'mateon.badges')
      return (
        Array.isArray(value) &&
        value.length <= BADGE_DEFS.length &&
        value.every(function (b) {
          return (
            typeof b === 'string' &&
            BADGE_DEFS.some(function (d) {
              return d.id === b;
            })
          );
        })
      );
    if (key === 'mateon.errors')
      return (
        Array.isArray(value) &&
        value.length <= 20 &&
        value.every(function (x) {
          return x && typeof x.msg === 'string' && x.msg.length <= 300 && typeof x.ts === 'number';
        })
      );
    if (key === 'mateon.snapshots')
      return (
        Array.isArray(value) &&
        value.length <= 4 &&
        value.every(function (x) {
          return x && typeof x.ts === 'number' && x.data && typeof x.data === 'object';
        })
      );
    if (key === 'mateon.notifRead') return typeof value === 'number' && value >= 0;
    if (key === 'mateon.photos')
      return (
        Array.isArray(value) &&
        value.length <= 100 &&
        value.every(function (x) {
          return (
            x &&
            typeof x.id === 'string' &&
            x.id.length <= 24 &&
            typeof x.ts === 'number' &&
            (x.label === undefined || (typeof x.label === 'string' && x.label.length <= 40))
          );
        })
      );
    if (key === 'mateon.rate')
      return (
        value === null ||
        !!(
          value &&
          typeof value === 'object' &&
          typeof value.first === 'number' &&
          typeof value.count === 'number' &&
          (!value.state || value.state === 'later' || value.state === 'done' || value.state === 'never') &&
          (!value.lastAsk || typeof value.lastAsk === 'number')
        )
      );
    return false;
  }

  /* ---- 휴지통 — 삭제한 지출·일정·쇼핑 항목을 7일간 보관 ---- */
  function toTrash(k, label, item) {
    if (!item) return;
    S.trash.push({ id: 'tr' + Date.now().toString(36) + Math.floor(Math.random() * 999), k: k, label: label, item: item, ts: Date.now() });
    if (S.trash.length > 50) S.trash = S.trash.slice(-50);
    save('mateon.trash', S.trash);
  }
  /* ---- 자동 스냅샷 — 주 1회, 최근 4개 유지 ---- */
  function maybeSnapshot() {
    var last = S.snapshots.length ? S.snapshots[0].ts : 0;
    if (Date.now() - last < 7 * 86400000) return;
    try {
      var snapData = buildBackup().data;
      delete snapData['mateon.snapshots'];
      S.snapshots.unshift({ ts: Date.now(), data: snapData });
      if (S.snapshots.length > 4) S.snapshots = S.snapshots.slice(0, 4);
      save('mateon.snapshots', S.snapshots);
    } catch (e) {
      S.snapshots = S.snapshots.slice(0, 2);
      try {
        save('mateon.snapshots', S.snapshots);
      } catch (e2) {
        /* 저장 공간 부족 시 스냅샷 생략 */
      }
    }
  }
  function trashCardHTML() {
    return MH.trashCardHTML();
  }
  function snapCardHTML() {
    return MH.snapCardHTML();
  }
  /* ---- 동기화 충돌 — 양쪽 값이 다를 때 미리보기/선택 ---- */
  var syncConflict = null; /* 세션 한정: {ts, keys:[{k,label,local,remote}], pre:{k:값}} */
  function conflictBannerHTML() {
    if (!syncConflict) return '';
    return (
      '<div class="conflict-banner"><span>⚡ 양쪽에서 다르게 바뀐 항목 ' +
      syncConflict.keys.length +
      '개</span>' +
      '<button class="chip chip-sm" data-action="conflict-open" type="button">확인하기</button></div>'
    );
  }
  var conflictDialog = null;
  function syncItemCount(v) {
    if (Array.isArray(v)) return v.length + '개';
    if (v && typeof v === 'object') return Object.keys(v).length + '개 항목';
    return v == null ? '없음' : '값 있음';
  }
  function openConflict() {
    if (!syncConflict) return;
    if (!conflictDialog) {
      conflictDialog = document.createElement('dialog');
      conflictDialog.className = 'talk-sheet';
      document.body.appendChild(conflictDialog);
    }
    conflictDialog.innerHTML =
      '<div class="sheet-handle" aria-hidden="true"></div><div class="sheet-heading"><span>동기화 충돌 확인</span><button class="icon-button" type="button" aria-label="닫기" data-conflict-close>' +
      mobileIcon('close') +
      '</button></div>' +
      '<p class="body-sm text-muted">이 기기와 메이트 기기가 같은 항목을 다르게 바꿨어요. 지금은 합친 결과가 적용된 상태예요.</p>' +
      '<div class="conflict-list">' +
      syncConflict.keys
        .map(function (c) {
          return (
            '<div class="conflict-row"><strong>' +
            esc(c.label) +
            '</strong><span>이 기기: ' +
            esc(c.local) +
            '</span><span>메이트: ' +
            esc(c.remote) +
            '</span></div>'
          );
        })
        .join('') +
      '</div>' +
      '<div class="cta-col">' +
      '<button class="btn btn-secondary btn-md" data-conflict-keep type="button">합친 결과 유지</button>' +
      '<button class="btn btn-tertiary btn-md" data-conflict-local type="button">이 기기 값으로 되돌리기</button></div>';
    conflictDialog.addEventListener(
      'click',
      conflictDialog._once
        ? null
        : ((conflictDialog._once = true),
          function (e) {
            if (e.target.closest('[data-conflict-close]') || e.target.closest('[data-conflict-keep]')) {
              conflictDialog.close();
              return;
            }
            if (e.target.closest('[data-conflict-local]')) {
              Object.keys(syncConflict.pre).forEach(function (k) {
                S[k] = syncConflict.pre[k];
                save('mateon.' + k, S[k]);
              });
              syncConflict = null;
              conflictDialog.close();
              render();
              scheduleSyncPush();
              showToast('이 기기 값으로 되돌렸어요', { type: 'good' });
            }
          })
    );
    if (conflictDialog.showModal) conflictDialog.showModal();
    else conflictDialog.setAttribute('open', '');
  }
  /* ---- WebAuthn 생체 잠금 해제 ---- */
  function bioAvailable() {
    return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
  }
  function bufToB64(buf) {
    var b = '',
      u = new Uint8Array(buf);
    for (var i = 0; i < u.length; i++) b += String.fromCharCode(u[i]);
    return btoa(b);
  }
  function b64ToBuf(b) {
    var s = atob(b),
      u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u.buffer;
  }
  function bioRegister() {
    var ch = new Uint8Array(32);
    crypto.getRandomValues(ch);
    var uid = new Uint8Array(16);
    crypto.getRandomValues(uid);
    navigator.credentials
      .create({
        publicKey: {
          challenge: ch,
          rp: { name: 'MATE:ON' },
          user: { id: uid, name: 'mateon', displayName: 'MATE:ON' },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
          timeout: 60000,
        },
      })
      .then(function (cred) {
        var pk = /** @type {PublicKeyCredential} */ (cred);
        if (!pk || !pk.rawId) throw new Error('no cred');
        S.lock.cred = bufToB64(pk.rawId);
        save('mateon.lock', S.lock);
        render();
        showToast('생체 인증을 등록했어요', { type: 'good' });
      })
      .catch(function () {
        showToast('이 기기에서는 생체 인증을 쓸 수 없어요');
      });
  }
  function bioUnlock() {
    if (!S.lock || !S.lock.cred) return;
    var ch = new Uint8Array(32);
    crypto.getRandomValues(ch);
    navigator.credentials
      .get({
        publicKey: {
          challenge: ch,
          allowCredentials: [{ type: 'public-key', id: b64ToBuf(S.lock.cred) }],
          userVerification: 'required',
          timeout: 60000,
        },
      })
      .then(function (cred) {
        if (cred) {
          S.locked = false;
          render();
        } else showToast('인증이 취소됐어요');
      })
      .catch(function () {
        showToast('인증이 취소됐어요');
      });
  }

  function buildBackup() {
    var data = {};
    BACKUP_KEYS.forEach(function (key) {
      var raw = rawGet(key);
      if (raw === null) return;
      if (key === 'ds-theme') {
        data[key] = raw;
        return;
      }
      try {
        data[key] = JSON.parse(raw);
      } catch (e) {
        /* malformed values are not exported */
      }
    });
    return {
      app: 'MATE:ON',
      schema: 1,
      appId: appConfig().appId,
      version: appConfig().version,
      exportedAt: new Date().toISOString(),
      data: data,
    };
  }

  function parseBackup(text) {
    if (typeof text !== 'string' || text.length > 524288) return null;
    try {
      var payload = JSON.parse(text);
      if (!payload || payload.app !== 'MATE:ON' || payload.schema !== 1 || !payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data))
        return null;
      var keys = Object.keys(payload.data);
      if (
        keys.some(function (k) {
          return BACKUP_KEYS.indexOf(k) < 0;
        })
      )
        return null;
      if (
        keys.some(function (k) {
          return !validBackupValue(k, payload.data[k]);
        })
      )
        return null;
      var clean = {};
      keys.forEach(function (k) {
        clean[k] = payload.data[k];
      });
      return clean;
    } catch (e) {
      return null;
    }
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
    S.fixedExpenses = load('mateon.fixedExpenses') || [];
    S.chores = load('mateon.chores');
    S.choreLog = load('mateon.choreLog') || {};
    S.events = load('mateon.events') || [];
    S.checkins = load('mateon.checkins') || [];
    S.customChecklist = load('mateon.customChecklist') || [];
    S.conflictLog = load('mateon.conflictLog') || [];
    var rm = load('mateon.reminders');
    S.reminders = {
      checkin: !rm || rm.checkin !== false,
      agreement: !rm || rm.agreement !== false,
      chore: !rm || rm.chore !== false,
      day: rm && Number.isInteger(rm.day) ? rm.day : 0,
    };
    S.inviteDays = load('mateon.inviteDays') || 7;
    S.fontSize = load('mateon.fontSize') === 'large' ? 'large' : 'normal';
    applyFontSize();
    S.seen = load('mateon.seen') === true;
    S.syncCfg = load('mateon.sync');
    S.budgets = load('mateon.budgets') || {};
    S.anniv = load('mateon.anniv') || [];
    S.missions = load('mateon.missions') || { week: '', list: [] };
    S.talkFavs = load('mateon.talkFavs') || [];
    S.homeName = load('mateon.homeName') || '';
    S.syncMeta = load('mateon.syncMeta') || {};
    S.syncStat = load('mateon.syncStat') || null;
    S.lastBackup = load('mateon.lastBackup') || 0;
    S.pantry = load('mateon.pantry') || [];
    S.coupons = load('mateon.coupons') || [];
    S.debts = load('mateon.debts') || [];
    S.roulette = load('mateon.roulette') || { opts: ROULETTE_PRESETS.slice(), last: '' };
    S.moveDate = load('mateon.moveDate') || null;
    S.homeWidgets = load('mateon.homeWidgets') || null;
    S.lock = load('mateon.lock') || null;
    S.locked = !!S.lock;
    S.demo = load('mateon.demo') === true;
    S.ciReplies = load('mateon.ciReplies') || {};
    S.shopHist = load('mateon.shopHist') || [];
    S.goal = load('mateon.goal') || null;
    S.care = load('mateon.care') || [];
    S.memos = load('mateon.memos') || [];
    S.settlePaid = load('mateon.settlePaid') || [];
    S.loveLang = load('mateon.loveLang') || null;
    S.trash = (load('mateon.trash') || []).filter(function (t) {
      return t && t.ts > Date.now() - 7 * 86400000;
    });
    save('mateon.trash', S.trash);
    S.badges = load('mateon.badges') || [];
    S.snapshots = load('mateon.snapshots') || [];
    S.ciQuestions = load('mateon.ciQuestions') || [];
    S.fxDismiss = load('mateon.fxDismiss') || [];
    S.lmCustom = load('mateon.lmCustom') || [];
    maybeSnapshot();
    S.expEditId = null;
    S.pendingReceipt = null;
    S.invite = null;
    S.pendingPartner = null;
    S.connectionInput = '';
    S.flow = 'me';
    S.q = 0;
    S.answers = [];
    S.profile = { name: '', relation: '', stage: '' };
    S.checkedRules = [];
    S.rulesReady = false;
    S.signs = { me: false, partner: false };
    S.lifeQ = 0;
    S.lifeAnswers = [];
    S.typeId = null;
    S.viewPair = null;
    S.resetArm = false;
    S.delArm = null;
    S.delArm2 = null;
    S.cgStep = 0;
    S.cgDomain = 'D';
    applyTheme();
    restoreDraft(load('mateon.activeDraft') || 'me');
  }

  function applyBackupData(data, onlyKeys) {
    if (
      !data ||
      Object.keys(data).some(function (k) {
        return !validBackupValue(k, data[k]);
      })
    )
      return false;
    if (!onlyKeys) BACKUP_KEYS.forEach(remove);
    Object.keys(data).forEach(function (key) {
      if (onlyKeys && onlyKeys.indexOf(key) < 0) return;
      if (key === 'ds-theme') {
        try {
          localStorage.setItem(key, data[key]);
        } catch (e) {
          /* ignore */
        }
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

  /* ---- 암호화 백업/해시 — js/secure.js (window.MateSecure) ---- */
  var MXC = window.MateSecure;
  function encSubtle() {
    return MXC.encSubtle();
  }
  function encryptBackupText(text, pw) {
    return MXC.encryptBackupText(text, pw);
  }
  function decryptBackupText(obj, pw) {
    return MXC.decryptBackupText(obj, pw);
  }
  function backupPw() {
    var el = document.getElementById('bk-pw');
    return el ? el.value : '';
  }

  function exportBackup() {
    S.lastBackup = Date.now();
    save('mateon.lastBackup', S.lastBackup);
    var pw = backupPw();
    var finish = function (text) {
      exportBackupText(text);
    };
    if (pw && encSubtle()) {
      encryptBackupText(JSON.stringify(buildBackup()), pw)
        .then(function (enc) {
          exportBackupText(enc);
          showToast('암호화된 백업을 만들었어요');
        })
        .catch(function () {
          showToast('암호화에 실패해서 일반 백업으로 저장해요');
          exportBackupText(JSON.stringify(buildBackup(), null, 2));
        });
      return;
    }
    if (pw) showToast('이 환경은 암호화를 지원하지 않아 일반 백업으로 저장해요');
    finish(JSON.stringify(buildBackup(), null, 2));
  }
  function exportBackupText(text) {
    if (window.MateNative) {
      window.MateNative.shareFile(backupFilename(), text, true).catch(function () {
        showToast('백업 파일 공유가 완료되지 않았어요');
      });
      return;
    }
    if (window.Blob && window.URL && window.URL.createObjectURL) {
      var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = backupFilename();
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(a.href);
      }, 1000);
      showToast('백업 파일을 내려받았어요');
      return;
    }
    copyText(text, '백업 JSON을 복사했어요');
  }

  /* ---- 데모 모드: 파트너 없이 둘러볼 수 있는 샘플 데이터 ---- */
  var demoSnapshot = null;
  var DEMO_KEYS = [
    'mateon.me',
    'mateon.partner',
    'mateon.expenses',
    'mateon.shopping',
    'mateon.chores',
    'mateon.choreLog',
    'mateon.checkins',
    'mateon.missions',
    'mateon.homeName',
    'mateon.events',
    'mateon.coupons',
    'mateon.checklist',
    'mateon.pantry',
    'mateon.anniv',
  ];
  function demoStart() {
    demoSnapshot = {};
    DEMO_KEYS.forEach(function (k) {
      demoSnapshot[k] = rawGet(k);
    });
    var now = Date.now(),
      day = 86400000;
    var demoDom = function (e, r) {
      var o = {};
      DOMAINS.forEach(function (d, i) {
        o[d.id] = { e: e[i % e.length], r: r[i % r.length] };
      });
      return o;
    };
    save('mateon.me', {
      name: '나(데모)',
      ts: now,
      charId: 7,
      char2Id: 8,
      eAvg: 2.8,
      rAvg: 2.4,
      domains: demoDom([3, 2.5, 3, 2.5], [2, 2.5, 2.5, 2.5]),
      conf: '보통',
      margin: 4,
      life: [],
    });
    save('mateon.partner', {
      name: '메이트(데모)',
      ts: now,
      charId: 12,
      char2Id: 8,
      eAvg: 3.2,
      rAvg: 3.1,
      domains: demoDom([3.5, 3, 3, 3], [3, 3.5, 3, 3]),
      conf: '보통',
      margin: 3.5,
      life: [],
    });
    save('mateon.homeName', '우리 집');
    save('mateon.expenses', [
      { id: 'de1', amount: 12800, memo: '장보기', payer: 'me', cat: '식비', share: 0.5, ts: now - 2 * day, date: dateStr(now - 2 * day) },
      { id: 'de2', amount: 45000, memo: '전기요금', payer: 'you', cat: '공과금', share: 0.5, ts: now - 5 * day, date: dateStr(now - 5 * day) },
      { id: 'de3', amount: 8600, memo: '세제·휴지', payer: 'me', cat: '생활비', share: 0.5, ts: now - 9 * day, date: dateStr(now - 9 * day) },
      { id: 'de4', amount: 24000, memo: '주말 외식', payer: 'you', cat: '식비', share: 0.6, ts: now - 12 * day, date: dateStr(now - 12 * day) },
    ]);
    save('mateon.shopping', [
      { id: 'ds1', name: '계란', cat: '식료품', done: false, ts: now - day, qty: 1 },
      { id: 'ds2', name: '두부', cat: '식료품', done: true, ts: now - 3 * day, qty: 2 },
      { id: 'ds3', name: '쓰레기봉투', cat: '생활용품', done: false, ts: now - 4 * day, qty: 1 },
    ]);
    save('mateon.chores', {
      anchor: now - 10 * day,
      items: [
        { id: 'dc1', name: '설거지' },
        { id: 'dc2', name: '빨래' },
        { id: 'dc3', name: '화장실 청소', freq: 'bw' },
      ],
      rot: [0, 1, 0],
    });
    var wk = isoWeekKey();
    save(
      'mateon.choreLog',
      (function () {
        var o = {};
        o[wk] = { dc1: { ts: now - day, by: 'me' }, dc2: { ts: now - 2 * day, by: 'you' } };
        return o;
      })()
    );
    save('mateon.checkins', [
      { week: wk, mood: 4, memo: '이번 주 평온해요', thanks: '저녁 차려줘서', fix: '', ts: now - 2 * day },
      { week: isoWeekKey(now - 7 * day), mood: 3, memo: '조금 바빴어요', thanks: '', fix: '', ts: now - 9 * day },
      { week: isoWeekKey(now - 14 * day), mood: 5, memo: '주말 나들이 좋았어', thanks: '운전해줘서', fix: '', ts: now - 16 * day },
    ]);
    save('mateon.missions', {
      week: wk,
      list: [
        { id: 'm-' + wk + '-0', text: '같이 저녁 요리하기', done: true },
        { id: 'm-' + wk + '-1', text: '20분 산책하기', done: false },
        { id: 'mc-demo1', text: '침구 세탁 돌아가며 하기', done: false },
      ],
    });
    save('mateon.events', [
      { id: 'dv1', date: dateStr(now + 3 * day), title: '관리비 납부일', who: 'both', ts: now - 10 * day },
      { id: 'dv2', date: dateStr(now + 7 * day), title: '주말 대청소', who: 'both', ts: now - 10 * day, rpt: 'w' },
    ]);
    save('mateon.coupons', [{ id: 'dcx1', title: '마사지권', ts: now - 3 * day, by: 'you' }]);
    save('mateon.pantry', [
      { id: 'dp1', name: '우유', exp: dateStr(now + 2 * day), loc: '냉장', ts: now - day },
      { id: 'dp2', name: '냉동만두', exp: dateStr(now + 40 * day), loc: '냉동', ts: now - day },
    ]);
    save('mateon.anniv', [{ id: 'da1', date: dateStr(now - 200 * day), title: '처음 만난 날', ts: now - 30 * day }]);
    save('mateon.checklist', { '계약·서류:0': true, '계약·서류:1': true, '집·공간:0': true, '함께 정할 것:0': true });
    save('mateon.demo', true);
    S.demo = true;
    hydrateStateFromStorage();
    S.demo = true;
    render();
    scheduleSyncPush();
    showToast('데모 데이터를 넣었어요. 상단 배너로 언제든 끝낼 수 있어요', { type: 'good' });
  }
  function demoEnd() {
    DEMO_KEYS.forEach(function (k) {
      if (demoSnapshot && demoSnapshot[k] != null) save(k, JSON.parse(demoSnapshot[k]));
      else remove(k);
    });
    demoSnapshot = null;
    remove('mateon.demo');
    S.demo = false;
    hydrateStateFromStorage();
    render();
    scheduleSyncPush();
    showToast('데모를 끝냈어요. 샘플 데이터는 지워졌어요');
  }

  /* 백업 파일 미리보기 — 무엇이 들어있는지 보여준 뒤 전체/부분 복원 선택 */
  var bkDialog = null;
  function previewBackup(data) {
    var info = DATA_ITEMS.filter(function (it) {
      return data[it.k] !== undefined;
    });
    if (!info.length) {
      showToast('복원할 항목이 없어요');
      return;
    }
    if (!bkDialog) {
      bkDialog = document.createElement('dialog');
      bkDialog.className = 'talk-sheet';
      document.body.appendChild(bkDialog);
    }
    bkDialog.innerHTML =
      '<div class="sheet-handle" aria-hidden="true"></div><div class="sheet-heading"><span>백업 내용</span><button class="icon-button" type="button" aria-label="닫기" data-bk-close>' +
      mobileIcon('close') +
      '</button></div>' +
      '<p class="sheet-hint">복원할 항목을 골라주세요. 선택한 항목만 이 기기 데이터를 덮어써요.</p>' +
      '<div class="bk-list">' +
      info
        .map(function (it) {
          var v = data[it.k];
          var n = Array.isArray(v) ? v.length + '개' : typeof v === 'object' ? '있음' : '있음';
          return (
            '<label class="bk-row"><input type="checkbox" data-bk-key="' + it.k + '" checked><span>' + esc(it.t) + '</span><small>' + n + '</small></label>'
          );
        })
        .join('') +
      '</div>' +
      '<button class="mobile-primary" type="button" data-bk-apply>선택한 항목 복원</button>' +
      '<button class="btn btn-tertiary btn-md" type="button" data-bk-all style="margin-top:8px">전부 복원</button>';
    bkDialog.onclick = function (e) {
      if (e.target.closest('[data-bk-close]')) {
        bkDialog.close();
        return;
      }
      if (e.target.closest('[data-bk-apply]')) {
        var keys = [];
        bkDialog.querySelectorAll('[data-bk-key]').forEach(function (c) {
          if (c.checked) keys.push(c.getAttribute('data-bk-key'));
        });
        if (!keys.length) {
          showToast('복원할 항목을 골라주세요');
          return;
        }
        bkDialog.close();
        if (applyBackupData(data, keys)) {
          showToast('선택한 데이터를 복원했어요');
          go('home');
        }
        return;
      }
      if (e.target.closest('[data-bk-all]')) {
        bkDialog.close();
        if (applyBackupData(data)) {
          showToast('백업 데이터를 복원했어요');
          go('home');
        }
      }
    };
    if (typeof bkDialog.showModal === 'function') bkDialog.showModal();
    else if (applyBackupData(data)) {
      showToast('백업 데이터를 복원했어요');
      go('home');
    }
  }
  function importBackupText(text) {
    /* 암호화된 백업은 먼저 복호화 — 비밀번호는 백업 카드의 비밀번호 필드에서 읽는다 */
    var head = null;
    try {
      head = JSON.parse(text);
    } catch (e) {}
    if (head && head.app === 'mateon-enc') {
      var pw = backupPw();
      if (!pw) {
        showToast('암호화된 백업이에요. 비밀번호를 입력하고 다시 불러와 주세요');
        return true;
      }
      if (!encSubtle()) {
        showToast('이 환경에서는 암호화 백업을 열 수 없어요');
        return true;
      }
      decryptBackupText(head, pw)
        .then(function (plain) {
          var d = parseBackup(plain);
          if (d) previewBackup(d);
          else showToast('백업 내용을 읽지 못했어요');
        })
        .catch(function () {
          showToast('비밀번호가 다르거나 파일이 손상됐어요');
        });
      return true;
    }
    var data = parseBackup(text);
    if (!data) return false;
    previewBackup(data);
    return true;
  }

  function readBackupFile(file) {
    if (!file) return;
    if (file.size > 524288) {
      showToast('백업 파일이 너무 커요');
      return;
    }
    function done(text) {
      if (!importBackupText(text)) showToast('MATE:ON 백업 파일이 아니에요');
    }
    if (typeof file.text === 'function') {
      file
        .text()
        .then(done)
        .catch(function () {
          showToast('백업 파일을 읽지 못했어요');
        });
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      done(reader.result);
    };
    reader.onerror = function () {
      showToast('백업 파일을 읽지 못했어요');
    };
    reader.readAsText(file, 'utf-8');
  }

  function vSettings() {
    var shareOn = S.shareName !== false;
    var rows = DATA_ITEMS.map(function (it) {
      var has = it.k === 'ds-theme' ? rawGet(it.k) !== null : !!load(it.k);
      var armed = S.delArm === it.k;
      return (
        '<div class="set-row"><div class="sr-info"><strong class="body-sm">' +
        esc(it.t) +
        '</strong></div>' +
        '<span class="sr-state">' +
        (has ? '저장됨' : '없음') +
        '</span>' +
        (has
          ? '<button class="btn ' +
            (armed ? 'btn-danger-text' : 'btn-tertiary') +
            ' btn-sm" data-action="del-data" data-v="' +
            it.k +
            '" type="button">' +
            (armed ? '삭제 확인' : '삭제') +
            '</button>'
          : '') +
        '</div>'
      );
    }).join('');

    var meRow = S.me
      ? (function () {
          var c = charById(S.me.charId);
          return (
            '<div class="card resume-card">' +
            '<span class="avatar">' +
            esc((S.me.name || '나')[0]) +
            '</span>' +
            '<div class="resume-info"><strong class="body-sm">' +
            esc(S.me.name || '나') +
            '님의 결과</strong>' +
            '<p class="caption text-muted">' +
            esc(c.name) +
            ' (' +
            c.code +
            ')</p></div>' +
            '<button class="btn btn-secondary btn-sm" data-action="result" type="button">보기</button></div>'
          );
        })()
      : '';

    var chev =
      '<svg aria-hidden="true" class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';

    shell(
      '' +
        '<p class="eyebrow caption">Settings</p>' +
        '<h2 class="view-title">' +
        esc(T('view.settings.title')) +
        '</h2>' +
        '<p class="view-desc body-md">' +
        esc(T('view.settings.desc')) +
        '</p>' +
        meRow +
        '<div class="sec-head" style="margin-top:20px"><h3>' +
        esc(T('set.share')) +
        '</h3></div>' +
        '<div class="card">' +
        '<p class="body-sm text-muted" style="margin-bottom:4px">초대 링크에 닉네임을 포함할지 선택할 수 있어요.</p>' +
        '<button class="share-opt' +
        (shareOn ? ' on' : '') +
        '" data-action="share-name" type="button" aria-pressed="' +
        shareOn +
        '">' +
        '<span class="share-opt-dot"></span>닉네임 포함 ' +
        (shareOn ? '켜짐' : '꺼짐') +
        '</button>' +
        '<div class="cta-col" style="margin-top:16px"><button class="btn btn-tertiary btn-md" data-action="share-home" type="button">친구에게 MATE:ON 공유</button></div>' +
        '</div>' +
        '<div class="sec-head" style="margin-top:20px"><h3>' +
        esc(T('set.space')) +
        '</h3></div>' +
        '<div class="card">' +
        '<div class="field-group"><label class="field-label" for="home-name">우리 공간 이름</label>' +
        '<div class="custom-rule"><input id="home-name" class="input" maxlength="12" placeholder="예: 다원이네 🏠" value="' +
        esc(S.homeName || '') +
        '" autocomplete="off">' +
        '<button class="btn btn-secondary btn-md" data-action="home-name" type="button">저장</button></div></div></div>' +
        '<div class="sec-head" style="margin-top:20px"><h3>' +
        esc(T('set.notif')) +
        '</h3></div>' +
        '<div class="card">' +
        '<button class="share-opt' +
        (S.reminders.checkin ? ' on' : '') +
        '" data-action="rem-checkin" type="button" aria-pressed="' +
        S.reminders.checkin +
        '">' +
        '<span class="share-opt-dot"></span>주간 체크인 알림 ' +
        (S.reminders.checkin ? '켜짐' : '꺼짐') +
        '</button>' +
        '<button class="share-opt' +
        (S.reminders.agreement ? ' on' : '') +
        '" data-action="rem-agree" type="button" aria-pressed="' +
        S.reminders.agreement +
        '">' +
        '<span class="share-opt-dot"></span>합의 점검일 알림 ' +
        (S.reminders.agreement ? '켜짐' : '꺼짐') +
        '</button>' +
        '<button class="share-opt' +
        (S.reminders.chore ? ' on' : '') +
        '" data-action="rem-chore" type="button" aria-pressed="' +
        S.reminders.chore +
        '">' +
        '<span class="share-opt-dot"></span>주말 집안일 알림 ' +
        (S.reminders.chore ? '켜짐' : '꺼짐') +
        '</button>' +
        '<div class="field-group" style="margin-top:12px"><span class="field-label">체크인 알림 요일</span><div class="chip-row">' +
        [
          ['6', '토요일'],
          ['0', '일요일'],
          ['1', '월요일'],
        ]
          .map(function (d) {
            return (
              '<button class="chip chip-sm' +
              (String(S.reminders.day || '0') === d[0] ? ' selected' : '') +
              '" data-action="rem-day" data-v="' +
              d[0] +
              '" type="button" aria-pressed="' +
              (String(S.reminders.day || '0') === d[0]) +
              '">' +
              d[1] +
              '</button>'
            );
          })
          .join('') +
        '</div></div>' +
        '<p class="caption text-muted" style="margin-top:10px">앱에 설치된 경우에만 알림이 와요. 웹에서는 홈 배너로 안내해요.</p>' +
        '</div>' +
        '<div class="sec-head" style="margin-top:20px"><h3>' +
        esc(T('set.theme')) +
        '</h3></div>' +
        '<div class="card"><div class="chip-row">' +
        [
          ['system', '시스템'],
          ['light', '라이트'],
          ['dark', '다크'],
        ]
          .map(function (m) {
            return (
              '<button class="chip' +
              (themeMode() === m[0] ? ' selected' : '') +
              '" data-action="theme-mode" data-v="' +
              m[0] +
              '" type="button" aria-pressed="' +
              (themeMode() === m[0]) +
              '">' +
              m[1] +
              '</button>'
            );
          })
          .join('') +
        '</div>' +
        '<p class="caption text-muted" style="margin-top:8px">시스템은 기기 설정을 따라가요.</p></div>' +
        '<div class="sec-head" style="margin-top:20px"><h3>' +
        esc(T('set.font')) +
        '</h3></div>' +
        '<div class="card"><div class="chip-row">' +
        '<button class="chip' +
        (S.fontSize === 'normal' ? ' selected' : '') +
        '" data-action="font-size" data-v="normal" type="button">보통</button>' +
        '<button class="chip' +
        (S.fontSize === 'large' ? ' selected' : '') +
        '" data-action="font-size" data-v="large" type="button">크게</button>' +
        '</div></div>' +
        '<div class="sec-head" style="margin-top:20px"><h3>' +
        esc(T('set.homeedit')) +
        '</h3></div>' +
        '<div class="card">' +
        widgetOrder()
          .map(function (w, wi) {
            var off = w.indexOf('off:') === 0,
              id = w.replace('off:', '');
            return (
              '<div class="bk-row"><span>' +
              esc(WIDGET_META[id] || id) +
              '</span>' +
              '<button class="chip chip-sm" data-action="widget-toggle" data-v="' +
              wi +
              '" type="button" aria-pressed="' +
              off +
              '">' +
              (off ? '숨김' : '표시') +
              '</button>' +
              '<button class="icon-button" data-action="widget-move" data-v="' +
              wi +
              ':-1" type="button" aria-label="위로"' +
              (wi === 0 ? ' disabled' : '') +
              '>↑</button>' +
              '<button class="icon-button" data-action="widget-move" data-v="' +
              wi +
              ':1" type="button" aria-label="아래로"' +
              (wi === widgetOrder().length - 1 ? ' disabled' : '') +
              '>↓</button></div>'
            );
          })
          .join('') +
        '</div>' +
        '<div class="sec-head" style="margin-top:20px"><h3>' +
        esc(T('set.sync')) +
        '</h3></div>' +
        '<div class="card">' +
        syncCardHTML() +
        '</div>' +
        '<div class="sec-head" style="margin-top:20px"><h3>' +
        esc(T('set.backup')) +
        '</h3></div>' +
        '<div class="card backup-card">' +
        '<p class="body-sm text-muted">이 기기의 진단, 합의서, 체크리스트, 대화 기록을 JSON 파일로 옮길 수 있어요. 개인 정보가 포함되니 안전한 곳에 보관해 주세요.</p>' +
        (S.quotaInfo
          ? '<p class="caption ' +
            (S.quotaInfo.pct > 80 ? 'sync-bad' : 'text-muted') +
            '" style="margin-top:6px">저장 공간 ' +
            S.quotaInfo.pct +
            '% 사용 중' +
            (S.quotaInfo.pct > 80 ? ' — 거의 찼어요. 백업 후 오래된 데이터를 정리해 주세요.' : '') +
            '</p>'
          : '') +
        '<div class="backup-actions">' +
        '<button class="btn btn-secondary btn-md" data-action="backup-export" type="button">백업 파일 내보내기</button>' +
        '<button class="btn btn-tertiary btn-md" data-action="backup-import" type="button">백업 파일 불러오기</button>' +
        '<input id="backup-file" class="backup-file" type="file" accept="application/json,.json" aria-label="MATE:ON 백업 파일 선택">' +
        '</div>' +
        '<div class="field-group" style="margin-top:12px"><label class="field-label" for="bk-pw">백업 비밀번호 (선택)</label>' +
        '<input id="bk-pw" class="input" type="password" maxlength="40" autocomplete="new-password" placeholder="입력하면 백업 파일을 암호화해요">' +
        '<p class="caption text-muted">암호화된 백업을 불러올 때도 여기에 비밀번호를 입력하고 파일을 골라주세요.</p></div>' +
        '<p class="caption text-muted">복원하면 현재 기기의 MATE:ON 데이터가 백업 파일 내용으로 바뀌어요.</p>' +
        '</div>' +
        '<div class="sec-head" style="margin-top:20px"><h3>' +
        esc(T('set.security')) +
        '</h3></div>' +
        '<div class="card">' +
        (S.lock
          ? '<p class="body-sm text-muted">앱을 열 때 PIN을 물어봐요.</p><div class="cta-row"><button class="btn btn-tertiary btn-md" data-action="lock-off" type="button">잠금 해제하기</button>' +
            (bioAvailable()
              ? S.lock.cred
                ? '<button class="btn btn-tertiary btn-md" data-action="bio-del" type="button">생체 인증 해제</button>'
                : '<button class="btn btn-secondary btn-md" data-action="bio-add" type="button">🔓 지문/얼굴 인증 등록</button>'
              : '') +
            '</div>'
          : '<p class="body-sm text-muted">다른 사람이 이 기기를 열어볼 수 있다면 PIN을 설정해 두세요. 가계부·관계 기록이 잠겨요.</p>' +
            '<div class="custom-rule"><input id="lock-pin-new" class="input" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" placeholder="PIN 4~8자리" aria-label="새 PIN">' +
            '<button class="btn btn-secondary btn-md" data-action="lock-set" type="button">설정</button></div>') +
        (!S.me && !S.demo
          ? '<div class="cta-row" style="margin-top:12px"><button class="btn btn-tertiary btn-md" data-action="demo-start" type="button">🎭 데모 데이터로 둘러보기</button></div>'
          : '') +
        '</div>' +
        '<div class="sec-head" style="margin-top:20px"><h3>' +
        esc(T('set.data')) +
        '</h3></div>' +
        '<div class="set-group">' +
        rows +
        '</div>' +
        trashCardHTML() +
        snapCardHTML() +
        (function () {
          var errs = load('mateon.errors') || [];
          if (!errs.length) return '';
          return (
            '<div class="sec-head" style="margin-top:20px"><h3>' +
            esc(T('set.errors')) +
            '</h3><span class="sec-sub">이 기기에만 보관돼요</span></div>' +
            '<div class="card"><p class="body-sm text-muted">최근 오류 ' +
            errs.length +
            '개 — 문의할 때 붙여넣으면 도움이 돼요.</p>' +
            '<div class="cta-row"><button class="btn btn-tertiary btn-md" data-action="err-copy" type="button">오류 기록 복사</button>' +
            '<button class="btn btn-tertiary btn-md" data-action="err-clear" type="button">지우기</button></div></div>'
          );
        })() +
        '<div style="text-align:center;margin-top:16px">' +
        '<button class="btn-danger-text" data-action="reset-all" type="button">' +
        (S.resetArm ? '한 번 더 누르면 모든 데이터가 삭제됩니다' : '모든 데이터 삭제') +
        '</button></div>' +
        '<div class="sec-head" style="margin-top:20px"><h3>이번 버전 새 기능</h3></div>' +
        '<div class="card"><ul class="changelog">' +
        '<li>유통기한 관리·러브 쿠폰·결정 룰렛·빌려준 돈</li>' +
        '<li>집안일 인증샷·체크인 답장·월간 리포트·입주 D-day</li>' +
        '<li>앱 잠금·암호화 백업·데모 모드·전역 검색</li>' +
        '<li>시스템 테마·홈 카드 편집·달력 스와이프·합의서 인쇄</li>' +
        '<li>폰트 자체호스팅·앱 배지·알림 바로가기·공유 수신</li>' +
        '</ul></div>' +
        (function () {
          var v = load('mateon.vitals');
          if (!v || (!v.lcp && !v.cls)) return '';
          return '<p class="caption text-muted" style="margin-top:8px">성능(이 기기): LCP ' + (v.lcp || 0) + 'ms · CLS ' + (v.cls || 0) + '</p>';
        })() +
        '<div class="sec-head" style="margin-top:20px"><h3>' +
        esc(T('set.about')) +
        '</h3></div>' +
        '<div class="set-group">' +
        '<button class="set-link" data-action="privacy" type="button">개인정보처리방침' +
        chev +
        '</button>' +
        '<button class="set-link" data-action="terms" type="button">서비스 이용약관' +
        chev +
        '</button>' +
        '<button class="set-link" data-action="tutorial" type="button">앱 소개 다시 보기' +
        chev +
        '</button>' +
        '<button class="set-link" data-action="app-tour" type="button">기능 둘러보기' +
        chev +
        '</button>' +
        (window.MateNative ? '<button class="set-link" data-action="app-update" type="button">앱 업데이트 확인' + chev + '</button>' : '') +
        (window.MateNative ? '<button class="set-link" data-action="app-rollback" type="button">이전 버전으로 되돌리기' + chev + '</button>' : '') +
        '</div>' +
        '<p class="caption text-muted" style="text-align:center;margin-top:24px">MATE:ON v' +
        esc(appConfig().version) +
        ' · ' +
        esc(appConfig().appId) +
        '</p>'
    );
  }

  /* ================= View: 개인정보처리방침 / 이용약관 (MVP) ================= */
  function docShell(title, eyebrow, dateStr, body) {
    shell(
      '' +
        '<div class="survey-top"><button class="back-btn" data-action="settings" type="button" aria-label="설정으로">' +
        '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button>' +
        '<span class="progress-num">' +
        esc(eyebrow) +
        '</span></div>' +
        '<h2 class="view-title">' +
        esc(title) +
        '</h2>' +
        '<div class="card doc-body" style="margin-top:16px"><p class="doc-date">' +
        esc(dateStr) +
        '</p>' +
        body +
        '</div>'
    );
  }

  function vPrivacy() {
    MV.vPrivacy();
  }

  function vTerms() {
    MV.vTerms();
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
      window.MateNative.share(title, text, url).catch(function () {
        showToast('공유가 완료되지 않았어요');
      });
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
      } catch (e) {
        /* fallthrough */
      }
    }
    if (navigator.share) {
      navigator.share({ title: title, text: text, url: url }).catch(function () {});
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
    var el = E_LEVELS[eLevel(r.eAvg)],
      rl = R_LEVELS[rLevel(r.rAvg)];
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
        } finally {
          node.remove();
        }
      } catch (e) {
        /* DOM 렌더 실패 시 캔버스 경로로 폴백 */
      }
    }
    var art = new Image();
    try {
      await new Promise(function (resolve, reject) {
        art.onload = resolve;
        art.onerror = reject;
        art.src = 'assets/character-sheet.png';
      });
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    } catch (e) {
      showToast('캐릭터 이미지를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요');
      return;
    }
    var cv = MateCard.resultCard({
      art: art,
      code: c.code,
      name: c.name,
      quote: c.quote,
      ePct: pct(r.eAvg),
      rPct: pct(r.rAvg),
      eLabel: eLevel(r.eAvg) + ' ' + el.label,
      rLabel: rLevel(r.rAvg) + ' ' + rl.label,
    });
    exportCard(cv, 'mateon-' + c.code + '-result.png');
  }

  /* 공유용 결과 카드를 DOM으로 만든다 (modern-screenshot → PNG, 540x675 @2x = 1080x1350) */
  function buildResultCardDom(r, c, el, rl) {
    var node = document.createElement('div');
    node.className = 'share-card-dom';
    node.innerHTML =
      '<div class="sc-brand"><img src="assets/logo-symbol.svg" alt="" width="26" height="26"><span>MATE:ON</span></div>' +
      '<div class="sc-art">' +
      characterArt(c, false, true) +
      '</div>' +
      '<div class="sc-code">' +
      esc(c.code) +
      '</div>' +
      '<h2 class="sc-name">' +
      esc(c.name) +
      '</h2>' +
      '<p class="sc-quote">' +
      esc(c.quote) +
      '</p>' +
      '<div class="sc-bars">' +
      '<div class="sc-bar"><span>교류 활성도 ' +
      eLevel(r.eAvg) +
      ' ' +
      esc(el.label) +
      '</span><i><b style="width:' +
      pct(r.eAvg) +
      '%"></b></i></div>' +
      '<div class="sc-bar"><span>자극 민감도 ' +
      rLevel(r.rAvg) +
      ' ' +
      esc(rl.label) +
      '</span><i><b class="blue" style="width:' +
      pct(r.rAvg) +
      '%"></b></i></div>' +
      '</div>' +
      '<p class="sc-foot">' +
      esc(r.name || '나') +
      '의 동거 캐릭터 · ' +
      esc(webBaseURL().replace(/^https?:\/\//, '')) +
      '</p>';
    return node;
  }

  function exportDataUrl(dataUrl, filename) {
    if (window.MateNative) {
      window.MateNative.shareFile(filename, dataUrl.split(',')[1]).catch(function () {
        showToast('이미지 공유가 완료되지 않았어요');
      });
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
    var dateStr =
      ag && rules.join('\n') === ag.rules.join('\n') ? ag.date : today.getFullYear() + '년 ' + (today.getMonth() + 1) + '월 ' + today.getDate() + '일';
    var cv = MateCard.agreementCard({
      names: (S.me.name || '나') + ' · ' + (S.partner.name || '상대'),
      date: dateStr,
      rules: rules,
    });
    exportCard(cv, 'mateon-agreement.png');
  }

  function exportCard(canvas, filename) {
    if (window.MateNative) {
      window.MateNative.shareFile(filename, canvas.toDataURL('image/png').split(',')[1]).catch(function () {
        showToast('이미지 공유가 완료되지 않았어요');
      });
    } else {
      MateCard.download(canvas, filename);
      showToast('이미지 다운로드를 시작했어요');
    }
  }

  function downloadICS() {
    var d = new Date();
    d.setMonth(d.getMonth() + 1);
    function p(n) {
      return (n < 10 ? '0' : '') + n;
    }
    var ymd = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    var ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//MATEON//KO',
      'BEGIN:VEVENT',
      'UID:mateon-' + Date.now() + '@mateon',
      'DTSTART;VALUE=DATE:' + ymd,
      'SUMMARY:우리집 생활규칙 점검일 (MATE:ON)',
      'DESCRIPTION:한 달 전 함께 정한 생활규칙을 점검해요. 잘 지켜진 것, 바꾸고 싶은 것을 나눠보세요.',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    if (window.MateNative) {
      window.MateNative.shareFile('mateon-rule-check.ics', ics, true).catch(function () {
        showToast('캘린더 파일 공유가 완료되지 않았어요');
      });
      return;
    }
    var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mateon-rule-check.ics';
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 1000);
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
      s.onload = function () {
        window.Tesseract ? resolve(window.Tesseract) : reject(new Error('tesseract missing'));
      };
      s.onerror = function () {
        tessLoading = null;
        reject(new Error('load failed'));
      };
      document.head.appendChild(s);
    });
    return tessLoading;
  }

  var ocrBusy = false;
  function scanReceipt(file) {
    if (ocrBusy) {
      showToast('영수증을 읽는 중이에요');
      return;
    }
    if (!file || !/^image\//.test(file.type || '')) {
      showToast('이미지 파일을 선택해 주세요');
      return;
    }
    ocrBusy = true;
    showToast('영수증을 읽고 있어요. 처음엔 조금 걸릴 수 있어요');
    var prepared = (
      ML.preprocessReceiptImage ||
      function (f) {
        return Promise.resolve(f);
      }
    )(file);
    Promise.all([loadTesseract(), prepared])
      .then(function (r) {
        var T = r[0],
          image = r[1];
        return T.createWorker(['kor', 'eng'], 1, {
          workerPath: 'assets/ocr/worker.min.js',
          corePath: 'assets/ocr/tesseract-core-lstm.wasm.js',
          langPath: 'assets/ocr',
          gzip: true,
        }).then(function (worker) {
          return [worker, image];
        });
      })
      .then(function (pair) {
        var worker = pair[0],
          image = pair[1];
        return worker.recognize(image).then(
          function (res) {
            return worker.terminate().then(function () {
              return res;
            });
          },
          function (err) {
            return worker.terminate().then(function () {
              throw err;
            });
          }
        );
      })
      .then(function (res) {
        var text = (res && res.data && res.data.text) || '';
        var found = parseReceiptText(text);
        var memoEl = document.getElementById('exp-memo'),
          amtEl = document.getElementById('exp-amt');
        if (found.amount && amtEl) {
          amtEl.value = found.amount;
          amtEl.classList.remove('input-error');
        }
        if (found.store && memoEl && !memoEl.value.trim()) memoEl.value = found.store;
        /* 스캔한 영수증을 다음 지출 기록에 첨부 — IndexedDB 저장 */
        S.pendingReceipt = file;
        var attach = S.pendingReceipt && currentRoute() === 'settle';
        showToast(found.amount ? '금액 ' + fmtWon(found.amount) + '을 읽었어요. 확인 후 기록해 주세요' : '금액을 못 찾았어요. 직접 입력해 주세요');
        if (attach && !document.querySelector('.rcpt-hint')) {
          var hint = document.createElement('p');
          hint.className = 'field-hint rcpt-hint';
          hint.style.marginTop = '8px';
          hint.textContent = '🧾 방금 스캔한 영수증이 이 지출에 첨부돼요';
          var card = amtEl && amtEl.closest('.card');
          if (card) card.appendChild(hint);
        }
      })
      .catch(function () {
        showToast('영수증을 읽지 못했어요. 직접 입력해 주세요');
      })
      .then(function () {
        ocrBusy = false;
      });
  }

  /* ================= 동기화 어댑터 (옵트인) =================
     설정에서 엔드포인트·방 코드를 등록하면, 같은 방 코드를 쓰는 메이트끼리
     슬롯 a/b 문서로 결과·합의서·생활 데이터를 주고받는다.
     백엔드는 GET/PUT JSON 만 지원하면 되는 최소 계약이며
     배포용 Cloudflare Worker 템플릿을 scripts/ 아래에 둔다. */
  function syncOn() {
    return !!(S.syncCfg && S.syncCfg.endpoint && S.syncCfg.room);
  }
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
    {
      prefix: 'e',
      key: 'mateon.expenses',
      prop: 'expenses',
      id: function (x) {
        return x.id;
      },
      sort: function (a, b) {
        return a.ts - b.ts;
      },
    },
    {
      prefix: 'g',
      key: 'mateon.shopping',
      prop: 'shopping',
      id: function (x) {
        return x.id;
      },
      sort: function (a, b) {
        return a.ts - b.ts;
      },
    },
    {
      prefix: 'v',
      key: 'mateon.events',
      prop: 'events',
      id: function (x) {
        return x.id;
      },
      sort: function (a, b) {
        return a.date < b.date ? -1 : 1;
      },
    },
    {
      prefix: 't',
      key: 'mateon.settled',
      prop: 'settled',
      id: function (x) {
        return x.ts;
      },
      sort: function (a, b) {
        return a.ts - b.ts;
      },
    },
    {
      prefix: 'c',
      key: 'mateon.checkins',
      prop: 'checkins',
      id: function (x) {
        return x.week;
      },
      sort: function (a, b) {
        return a.week < b.week ? -1 : 1;
      },
    },
  ];
  var SYNC_WHOLE_KEYS = [
    'mateon.chores',
    'mateon.choreLog',
    'mateon.agreement',
    'mateon.checklist',
    'mateon.customChecklist',
    'mateon.talks',
    'mateon.customRules',
    'mateon.lovemap',
    'mateon.fixedExpenses',
    'mateon.budgets',
    'mateon.anniv',
    'mateon.missions',
    'mateon.pantry',
    'mateon.coupons',
    'mateon.debts',
    'mateon.ciReplies',
    'mateon.moveDate',
    'mateon.homeName',
    'mateon.goal',
    'mateon.care',
    'mateon.memos',
    'mateon.settlePaid',
    'mateon.loveLang',
    'mateon.ciQuestions',
    'mateon.fxDismiss',
    'mateon.lmCustom',
  ];
  var tbStore = null;
  function tb() {
    if (!window.TinyBase || !TinyBase.createMergeableStore) return null;
    if (tbStore) return tbStore;
    tbStore = TinyBase.createMergeableStore();
    var saved = load('mateon.tb');
    if (saved) {
      try {
        tbStore.setMergeableContent(saved);
      } catch (e) {
        tbStore = TinyBase.createMergeableStore();
      }
    }
    return tbStore;
  }
  function tbItemPrefix(rid) {
    var p = rid.split(':')[0];
    return SYNC_ITEM_TABLES.some(function (t) {
      return t.prefix === p;
    })
      ? p
      : null;
  }
  /* 로컬 데이터를 MergeableStore 행으로 반영 (삭제는 툼스톤으로 전파) */
  function tbIngest() {
    var s = tb();
    if (!s) return false;
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
      if (v === null || v === undefined) {
        if (s.getCell('kv', 'w:' + k, 'd') !== undefined) s.delCell('kv', 'w:' + k, 'd', true);
      } else s.setCell('kv', 'w:' + k, 'd', JSON.stringify(v));
    });
    if (S.me && S.syncCfg && S.syncCfg.slot) s.setCell('kv', 'me:' + S.syncCfg.slot, 'd', JSON.stringify(S.me));
    save('mateon.tb', s.getMergeableContent());
    return true;
  }
  function tbApply() {
    var s = tb();
    if (!s) return false;
    var changed = false;
    var mySlot = S.syncCfg && S.syncCfg.slot === 'a' ? 'a' : 'b';
    var remoteMe = s.getCell('kv', 'me:' + (mySlot === 'a' ? 'b' : 'a'), 'd');
    if (typeof remoteMe === 'string') {
      try {
        var p = JSON.parse(remoteMe);
        if (validStoredResult(p) && (!S.partner || p.ts > (S.partner.ts || 0))) {
          S.partner = p;
          save('mateon.partner', p);
          changed = true;
        }
      } catch (e) {}
    }
    var mergedN = 0;
    SYNC_WHOLE_KEYS.forEach(function (k) {
      var c = s.getCell('kv', 'w:' + k, 'd');
      if (c === undefined) return;
      var parsed;
      try {
        parsed = JSON.parse(c);
      } catch (e) {
        return;
      }
      if (!validBackupValue(k, parsed)) return;
      if (JSON.stringify(load(k)) === c) return;
      S[k.slice(7)] = parsed;
      save(k, parsed);
      changed = true;
      mergedN++;
    });
    SYNC_ITEM_TABLES.forEach(function (t) {
      var arr = [];
      s.getRowIds('kv').forEach(function (rid) {
        if (rid.indexOf(t.prefix + ':') !== 0) return;
        var d = s.getCell('kv', rid, 'd');
        if (typeof d !== 'string') return;
        try {
          arr.push(JSON.parse(d));
        } catch (e) {}
      });
      arr.sort(t.sort);
      if (!validBackupValue(t.key, arr)) return;
      if (JSON.stringify(S[t.prop] || []) === JSON.stringify(arr)) return;
      S[t.prop] = arr;
      save(t.key, arr);
      changed = true;
      mergedN++;
    });
    if (mergedN) {
      if (!S.syncStat || typeof S.syncStat.ts !== 'number') S.syncStat = { ts: 0, ok: true };
      S.syncStat.merged = (S.syncStat.merged || 0) + mergedN;
      save('mateon.syncStat', S.syncStat);
    }
    return changed;
  }
  function mergeRemoteContent(content) {
    var s = tb();
    if (!s) return false;
    var remote = TinyBase.createMergeableStore();
    try {
      remote.setMergeableContent(content);
    } catch (e) {
      return false;
    }
    s.merge(remote);
    save('mateon.tb', s.getMergeableContent());
    return tbApply();
  }
  function syncPayload() {
    return {
      me: S.me,
      partner: null,
      agreement: S.agreement,
      expenses: S.expenses,
      settled: S.settled,
      chores: S.chores,
      events: S.events,
      checkins: S.checkins,
      shopping: S.shopping,
      lovemap: S.lovemap,
      fixedExpenses: S.fixedExpenses,
      budgets: S.budgets,
      anniv: S.anniv,
      missions: S.missions,
      ts: Date.now(),
      pantry: S.pantry,
      coupons: S.coupons,
      debts: S.debts,
      ciReplies: S.ciReplies,
      moveDate: S.moveDate,
      homeName: S.homeName,
      goal: S.goal,
      care: S.care,
      memos: S.memos,
      settlePaid: S.settlePaid,
      loveLang: S.loveLang,
    };
  }
  var syncTimer = null;
  function scheduleSyncPush() {
    noteActivity();
    if (!syncOn()) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(syncPush, 2500);
  }
  /* ---- 인앱 리뷰 — 의미 있는 액션을 세고, 설치 3일+·12회+ 후 1회 프롬프트 ---- */
  function noteActivity() {
    if (!S.rate) S.rate = { first: Date.now(), count: 0 };
    S.rate.count++;
    if (S.rate.count % 10 === 0) save('mateon.rate', S.rate);
  }
  function rateReady() {
    if (!S.rate || S.rate.state === 'done' || S.rate.state === 'never') return false;
    if (S.rate.count < 12 || Date.now() - S.rate.first < 3 * 86400000) return false;
    if (S.rate.lastAsk && Date.now() - S.rate.lastAsk < 7 * 86400000) return false;
    return true;
  }
  function syncMark(ok) {
    S.syncStat = { ts: Date.now(), ok: !!ok };
    save('mateon.syncStat', S.syncStat);
    if (S.route === 'settings') render();
  }
  function syncPush() {
    if (!syncOn() || !S.me) return;
    var body;
    if (tbIngest()) body = JSON.stringify({ v: 2, tb: tb().getMergeableContent() });
    else body = JSON.stringify(syncPayload());
    fetch(syncURL(S.syncCfg.slot), { method: 'PUT', headers: syncHeaders(), body: body })
      .then(function (res) {
        syncMark(res && res.ok);
      })
      .catch(function () {
        syncMark(false);
      });
  }
  function syncPull() {
    if (!syncOn()) return Promise.resolve(false);
    var other = S.syncCfg.slot === 'a' ? 'b' : 'a';
    return fetch(syncURL(other), { headers: syncHeaders() })
      .then(function (res) {
        if (!res.ok) syncMark(false);
        return res.ok ? res.json() : null;
      })
      .then(function (data) {
        if (!data || typeof data !== 'object') return false;
        syncMark(true);
        if (data.tb && window.TinyBase) return mergeRemoteContent(data.tb);
        var changed = false;
        if (data.me && validStoredResult(data.me)) {
          if (!S.partner || data.me.ts > (S.partner.ts || 0)) {
            S.partner = data.me;
            save('mateon.partner', S.partner);
            changed = true;
          }
        }
        var mergedN = 0;
        var cKeys = [],
          cPre = {};
        var KEY_LABELS = {
          expenses: '지출',
          settled: '정산 기록',
          chores: '집안일',
          events: '일정',
          checkins: '체크인',
          agreement: '합의서',
          shopping: '쇼핑',
          goal: '공동 목표',
          care: '돌봄',
          memos: '공유 메모',
          debts: '빌려준 돈',
          anniv: '기념일',
          budgets: '예산',
        };
        [
          'expenses',
          'settled',
          'chores',
          'events',
          'checkins',
          'agreement',
          'shopping',
          'lovemap',
          'fixedExpenses',
          'budgets',
          'anniv',
          'missions',
          'pantry',
          'coupons',
          'debts',
          'ciReplies',
          'moveDate',
          'homeName',
          'goal',
          'care',
          'memos',
          'settlePaid',
          'loveLang',
        ].forEach(function (k) {
          var key = 'mateon.' + k;
          if (data[k] != null && validBackupValue(key, data[k])) {
            var cur = S[k];
            if (JSON.stringify(cur) !== JSON.stringify(data[k])) {
              /* 로컬에도 값이 있고 내용이 다르면 충돌 후보로 기록 */
              if (cur != null && KEY_LABELS[k]) {
                cKeys.push({ k: k, label: KEY_LABELS[k], local: syncItemCount(cur), remote: syncItemCount(data[k]) });
                cPre[k] = cur;
              }
              S[k] = data[k];
              save(key, data[k]);
              changed = true;
              mergedN++;
            }
          }
        });
        if (cKeys.length) syncConflict = { ts: Date.now(), keys: cKeys, pre: cPre };
        if (mergedN) {
          if (!S.syncStat || typeof S.syncStat.ts !== 'number') S.syncStat = { ts: 0, ok: true };
          S.syncStat.merged = (S.syncStat.merged || 0) + mergedN;
          save('mateon.syncStat', S.syncStat);
          var mk = cKeys.length
            ? cKeys
                .map(function (c) {
                  return c.label;
                })
                .slice(0, 2)
                .join('·')
            : '생활 데이터';
          pushNotif('🔄', '메이트가 ' + mk + '를 업데이트했어요', 'space');
        }
        return changed;
      })
      .catch(function () {
        syncMark(false);
        return false;
      });
  }
  function syncStatLine() {
    var st = S.syncStat;
    if (!st || !st.ts) return '아직 동기화한 기록이 없어요.';
    var mins = Math.max(0, Math.round((Date.now() - st.ts) / 60000));
    var ago = mins < 1 ? '방금' : mins < 60 ? mins + '분 전' : mins < 1440 ? Math.floor(mins / 60) + '시간 전' : Math.floor(mins / 1440) + '일 전';
    return '마지막 동기화 ' + ago + ' · ' + (st.ok ? '성공' : '실패 — 다시 시도해 보세요') + (st.merged ? ' · 지금까지 ' + st.merged + '개 항목 병합' : '');
  }
  function syncCardHTML() {
    var cfg = S.syncCfg || {};
    var on = syncOn();
    return (
      '<p class="body-sm text-muted" style="margin-bottom:10px">같은 방 코드를 쓰는 메이트와 결과·생활 데이터를 주고받아요. 호스팅된 동기화 서버가 필요해요.</p>' +
      '<div class="field-group"><label class="field-label" for="sync-end">서버 주소</label>' +
      '<input id="sync-end" class="input" type="url" maxlength="200" placeholder="https://your-worker.workers.dev" value="' +
      esc(cfg.endpoint || '') +
      '"></div>' +
      '<div class="field-group"><label class="field-label" for="sync-room">방 코드 (메이트와 같은 값)</label>' +
      '<input id="sync-room" class="input" maxlength="40" placeholder="예: dawon-haneul-2026" value="' +
      esc(cfg.room || '') +
      '" autocomplete="off"></div>' +
      '<div class="field-group"><label class="field-label" for="sync-token">접근 토큰 (서버에서 발급, 선택)</label>' +
      '<input id="sync-token" class="input" type="password" maxlength="200" placeholder="Bearer 토큰" value="' +
      esc(cfg.token || '') +
      '" autocomplete="off">' +
      (window.MateNative && window.MateNative.secureSet
        ? '<p class="caption text-muted" style="margin-top:6px">토큰은 기기의 암호화 저장소에 보관돼요</p>'
        : '') +
      '</div>' +
      '<div class="field-group"><span class="field-label">이 기기의 슬롯</span><div class="chip-row">' +
      '<button class="chip' +
      ((cfg.slot || 'a') === 'a' ? ' selected' : '') +
      '" data-action="sync-slot" data-v="a" type="button">슬롯 A</button>' +
      '<button class="chip' +
      (cfg.slot === 'b' ? ' selected' : '') +
      '" data-action="sync-slot" data-v="b" type="button">슬롯 B</button>' +
      '</div><p class="caption text-muted" style="margin-top:6px">둘이 같은 슬롯을 쓰면 서로 덮어써요. 보통 먼저 연 사람이 A.</p></div>' +
      '<div class="cta-col">' +
      '<button class="btn btn-secondary btn-md" data-action="sync-save" type="button">' +
      (on ? '동기화 설정 저장' : '동기화 켜기') +
      '</button>' +
      (on
        ? '<button class="btn btn-tertiary btn-md" data-action="sync-now" type="button">지금 주고받기</button>' +
          '<button class="btn btn-tertiary btn-md" data-action="sync-off" type="button">동기화 끄기</button>'
        : '') +
      '</div>' +
      (on
        ? '<p class="caption sync-stat ' +
          (S.syncStat && S.syncStat.ok === false ? 'sync-bad' : 'text-muted') +
          '" style="margin-top:8px">' +
          esc(syncStatLine()) +
          (syncTimer ? ' · 저장 대기 중…' : '') +
          '</p>'
        : '') +
      (on && S.syncMeta && (S.syncMeta.push || S.syncMeta.pull)
        ? '<p class="caption text-muted" style="margin-top:4px">보냄 ' +
          (S.syncMeta.push ? fmtDate(S.syncMeta.push) : '—') +
          ' · 받음 ' +
          (S.syncMeta.pull ? fmtDate(S.syncMeta.pull) : '—') +
          '</p>'
        : '') +
      (on ? '<p class="caption text-muted" style="margin-top:8px">방 코드를 아는 사람만 접근할 수 있어요. 민감한 데이터는 공유하지 마세요.</p>' : '') +
      conflictBannerHTML()
    );
  }

  /* ================= 갈등 가이드 타이머 ================= */
  function startCgCountdown() {
    if (cgTimerId) clearInterval(cgTimerId);
    cgTimerId = setInterval(function () {
      var el = document.getElementById('cg-timer');
      if (!el || !S.cgStart) {
        clearInterval(cgTimerId);
        cgTimerId = null;
        return;
      }
      var left = Math.ceil((S.cgStart + 30 * 60000 - Date.now()) / 60000);
      if (left <= 0) {
        clearInterval(cgTimerId);
        cgTimerId = null;
        el.textContent = '0';
        showToast('각자 정리 시간이 끝났어요. 이제 차분히 이야기해 보세요');
        render();
        return;
      }
      el.textContent = String(left);
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
    return (
      '<div class="tutorial-overlay" role="dialog" aria-modal="true" aria-label="MATE:ON 소개">' +
      '<div class="tutorial-card"><p class="app-overline">MATE:ON</p>' +
      slides
        .map(function (s, i) {
          return (
            '<div class="tut-slide"><span class="tut-icon">' +
            mobileIcon(s.icon) +
            '</span><div><strong>' +
            s.title +
            '</strong><p>' +
            s.desc +
            '</p></div></div>'
          );
        })
        .join('') +
      '<button class="mobile-primary" data-action="tutorial-close" type="button">시작하기</button>' +
      '<p class="caption text-muted" style="margin-top:10px;text-align:center">설정에서 언제든 다시 볼 수 있어요</p></div></div>'
    );
  }
  /* ---- 앱 잠금: PIN 해시(js/secure.js 위임) + 잠금 화면 ---- */
  function pinHash(pin, salt) {
    return MXC.pinHash(pin, salt);
  }
  function lockScreenHTML() {
    if (!S.locked) return '';
    return (
      '<div class="lock-screen" role="dialog" aria-modal="true" aria-label="앱 잠금 해제">' +
      '<div class="lock-card"><span class="lock-ic" aria-hidden="true">🔒</span><h2>잠겨 있어요</h2>' +
      '<p class="body-sm text-muted">PIN을 입력하면 열 수 있어요</p>' +
      /* 재시도 제한 안내 — S.lock.until이 미래면 잠금 */
      (S.lock && S.lock.until && S.lock.until > Date.now()
        ? '<p class="field-hint" style="color:#c2455a;margin-bottom:10px">시도가 많았어요 — ' +
          Math.ceil((S.lock.until - Date.now()) / 60000) +
          '분 뒤에 다시 시도해 주세요</p>'
        : '') +
      '<label class="sr-only" for="lock-pin">PIN</label>' +
      '<input id="lock-pin" class="input lock-input" type="password" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="••••"' +
      (S.lock && S.lock.until && S.lock.until > Date.now() ? ' disabled' : '') +
      '>' +
      '<button class="btn btn-primary btn-lg" data-action="lock-unlock" type="button" style="width:100%"' +
      (S.lock && S.lock.until && S.lock.until > Date.now() ? ' disabled' : '') +
      '>열기</button>' +
      (S.lock && S.lock.cred && bioAvailable()
        ? '<button class="btn btn-tertiary btn-md" data-action="bio-unlock" type="button" style="width:100%;margin-top:8px">🔓 생체 인증으로 열기</button>'
        : '') +
      '</div></div>'
    );
  }
  /* ---- 전역 검색 — 지출·쇼핑·일정·대화·체크리스트를 한 곳에서 찾는다 ---- */
  function searchAll(q) {
    var rows = [];
    if (!q || q.length < 1) return rows;
    var low = q.toLowerCase();
    S.expenses.forEach(function (x) {
      if ((x.memo || '').toLowerCase().indexOf(low) >= 0 || (x.cat || '').indexOf(low) >= 0)
        rows.push({ route: 'settle', icon: '💸', label: x.memo || '지출', sub: ML.fmtWon(x.amount) + (x.date ? ' · ' + x.date : '') });
    });
    S.shopping.forEach(function (x) {
      if (x.name.toLowerCase().indexOf(low) >= 0) rows.push({ route: 'shopping', icon: x.done ? '☑' : '□', label: x.name, sub: '같이 살 것 · ' + x.cat });
    });
    S.events.forEach(function (e) {
      if (e.title.toLowerCase().indexOf(low) >= 0 || (e.memo || '').toLowerCase().indexOf(low) >= 0)
        rows.push({ route: 'calendar', icon: '📅', label: e.title, sub: e.date + (e.time ? ' ' + e.time : '') });
    });
    S.anniv.forEach(function (a) {
      if (a.title.toLowerCase().indexOf(low) >= 0) rows.push({ route: 'calendar', icon: '🎉', label: a.title, sub: '기념일 · ' + a.date });
    });
    S.pantry.forEach(function (p) {
      if (p.name.toLowerCase().indexOf(low) >= 0) rows.push({ route: 'shopping', icon: '🥫', label: p.name, sub: '유통기한 ' + p.exp + ' · ' + p.loc });
    });
    CHECKLIST.forEach(function (g) {
      g.items.forEach(function (t) {
        if (t.toLowerCase().indexOf(low) >= 0) rows.push({ route: 'checklist', icon: '✅', label: t, sub: '입주 체크리스트 · ' + g.cat });
      });
    });
    HOME_TALKS.forEach(function (t, i) {
      if (t[0].indexOf(low) >= 0 || t[1].toLowerCase().indexOf(low) >= 0)
        rows.push({ route: 'home', icon: '💬', label: t[1].slice(0, 40), sub: '오늘의 대화 · ' + t[0] });
    });
    return rows.slice(0, 30);
  }
  function searchResultsHTML(q) {
    var rows = searchAll(q);
    if (!q) return '<p class="gs-hint">지출 메모, 살 것, 일정, 체크리스트를 찾아요</p>';
    if (!rows.length) return '<p class="gs-hint">"' + esc(q) + '"에 맞는 결과가 없어요</p>';
    return rows
      .map(function (r) {
        return (
          '<button class="gs-row" type="button" data-action="gs-go" data-v="' +
          r.route +
          '"><span class="gs-ic">' +
          r.icon +
          '</span><span class="gs-tx"><strong>' +
          esc(r.label) +
          '</strong><small>' +
          esc(r.sub) +
          '</small></span>' +
          mobileIcon('arrow') +
          '</button>'
        );
      })
      .join('');
  }
  function searchOverlayHTML() {
    if (!S.searchOpen) return '';
    return (
      '<div class="gs-overlay" role="dialog" aria-modal="true" aria-label="전역 검색">' +
      '<div class="gs-card"><div class="gs-head"><input id="gs-q" class="input" maxlength="40" placeholder="검색어를 입력하세요" autocomplete="off" aria-label="검색어">' +
      '<button class="icon-button" data-action="search-close" type="button" aria-label="검색 닫기">' +
      mobileIcon('close') +
      '</button></div>' +
      '<div id="gs-results" class="gs-results">' +
      searchResultsHTML('') +
      '</div></div></div>'
    );
  }

  /* ---- 알림 센터 (앱 내 알림 기록 — 놓친 리마인드/상대 활동 확인) ---- */
  function unreadNotifs() {
    var c = 0;
    (S.notifs || []).forEach(function (n) {
      if (n.ts > (S.notifReadTs || 0)) c++;
    });
    return c;
  }
  function pushNotif(icon, text, route) {
    /* 중복 방지 — 같은 텍스트가 최근 24시간 내 있으면 스킵 */
    var recent = (S.notifs || []).some(function (n) {
      return n.text === text && n.ts > Date.now() - 86400000;
    });
    if (recent) return;
    S.notifs = S.notifs || [];
    S.notifs.unshift({ id: 'n' + Date.now().toString(36) + Math.floor(Math.random() * 99), icon: icon, text: text, ts: Date.now(), route: route || '' });
    if (S.notifs.length > 50) S.notifs = S.notifs.slice(0, 50);
    save('mateon.notifs', S.notifs);
  }
  function notifOverlayHTML() {
    if (!S.notifOpen) return '';
    var items = (S.notifs || []).slice(0, 30);
    var rows = items.length
      ? items
          .map(function (n) {
            var isNew = n.ts > (S.notifReadTs || 0);
            return (
              '<button class="notif-row' +
              (isNew ? ' is-new' : '') +
              '" data-action="' +
              (n.route ? 'notif-go' : 'notif-read') +
              '" data-v="' +
              esc(n.id) +
              '" type="button">' +
              '<span class="notif-ico">' +
              esc(n.icon) +
              '</span>' +
              '<span class="notif-body"><span class="notif-text">' +
              esc(n.text) +
              '</span>' +
              '<span class="notif-ts">' +
              esc(fmtDateTime(n.ts)) +
              '</span></span>' +
              (isNew ? '<i class="notif-new-dot" aria-hidden="true"></i>' : '') +
              '</button>'
            );
          })
          .join('')
      : '<p class="notif-empty">알림이 없어요<br><small>리마인드·상대 활동·배지 소식이 여기 모여요</small></p>';
    return (
      '<div class="gs-overlay notif-overlay" role="dialog" aria-modal="true" aria-label="알림 센터">' +
      '<div class="gs-card"><div class="gs-head"><b class="gs-title">🔔 알림</b>' +
      (items.length ? '<button class="btn btn-tertiary btn-sm" data-action="notif-clear" type="button">모두 지우기</button>' : '') +
      '<button class="icon-button" data-action="notif-close" type="button" aria-label="알림 닫기">' +
      mobileIcon('close') +
      '</button></div>' +
      '<div class="gs-results notif-list">' +
      rows +
      '</div></div></div>'
    );
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
      showToast('투어 기능을 불러오지 못했어요');
      return;
    }
    var defs = [
      { sel: '.app-greeting', title: '오늘의 미션', desc: '진단 진행 상황과 다음 할 일이 여기 모여 있어요.' },
      { sel: '.connection-strip', title: '메이트 연결', desc: '초대 링크·QR로 서로의 결과를 연결해요.' },
      { sel: '.conversation-card', title: '오늘의 대화', desc: '매일 바뀌는 주제로 생각을 나눠보세요.' },
      { sel: '.app-list', title: '생활 도구', desc: '정산·쇼핑·역할 분담·일정·체크인까지, 함께 쓰는 도구 모음이에요.' },
      { sel: '.bottom-nav', title: '빠른 이동', desc: '홈·우리 공간·유형 찾기·설정을 아래에서 오갈 수 있어요.' },
    ];
    var steps = defs
      .filter(function (d) {
        return document.querySelector(d.sel);
      })
      .map(function (d) {
        return { element: d.sel, popover: { title: d.title, description: d.desc } };
      });
    if (!steps.length) {
      showToast('둘러볼 화면이 없어요. 홈에서 시작해 보세요');
      return;
    }
    var drv = window.driver.js.driver({
      showProgress: true,
      progressText: '{{current}} / {{total}}',
      nextBtnText: '다음',
      prevBtnText: '이전',
      doneBtnText: '완료',
      steps: steps,
      overlayOpacity: 0.62,
      popoverClass: 'mateon-driver-pop',
    });
    drv.drive();
  }

  /* ================= Actions ================= */
  function resetSurvey() {
    S.q = 0;
    S.answers = [];
    S.qDir = 'next';
    clearDraft();
  }

  function finishSurvey() {
    clearDraft();
    var res = scoreAnswers(S.answers);
    var out = {
      name: S.profile.name || (S.flow === 'partner' ? '상대' : '나'),
      relation: S.profile.relation,
      stage: S.profile.stage,
      eAvg: res.eAvg,
      rAvg: res.rAvg,
      charId: res.charId,
      char2Id: res.char2Id,
      conf: res.conf,
      domains: res.domains,
      ts: Date.now(),
    };
    // 진단 이력 (재진단 비교용, 최대 5개)
    S.history.push({ ts: out.ts, charId: out.charId, eAvg: out.eAvg, rAvg: out.rAvg, name: out.name });
    if (S.history.length > 5) S.history = S.history.slice(-5);
    save('mateon.history', S.history);

    if (S.flow === 'partner') {
      if (S.invite) {
        // 초대 링크로 들어온 사람이 이 기기의 주인 — 본인을 me로 저장
        S.me = out;
        save('mateon.me', out);
        S.partner = S.invite;
        save('mateon.partner', S.invite);
        S.invite = null;
        S.flow = 'me';
      } else {
        // 같은 기기에서 상대가 이어서 진단 — 상대를 partner로 저장
        S.partner = out;
        save('mateon.partner', out);
        S.flow = 'partner';
      }
      resetRulesForNewPartner();
      go('result');
    } else {
      S.me = out;
      save('mateon.me', out);
      resetRulesForNewPartner();
      go('result');
    }
  }

  function resultFromCode(code, name) {
    var c = CHARACTERS.find(function (x) {
      return x.code === code;
    });
    if (!c) return null;
    var e = +code[1],
      r = +code[3];
    var domains = {};
    DOMAINS.forEach(function (d) {
      domains[d.id] = { e: e, r: r };
    });
    return {
      name: name || '상대',
      relation: '',
      stage: '',
      eAvg: e,
      rAvg: r,
      charId: c.id,
      char2Id: c.id,
      conf: '직접 입력',
      domains: domains,
      ts: Date.now(),
    };
  }

  function farthestSample() {
    var myChar = charById(S.me.charId);
    var mb = codeBits(myChar.code);
    var best = CHARACTERS[0],
      bestD = -1;
    CHARACTERS.forEach(function (c) {
      var d = hamming(mb, codeBits(c.code));
      if (d > bestD) {
        bestD = d;
        best = c;
      }
    });
    return {
      name: '샘플 상대',
      relation: '룸메이트',
      stage: '고려 중',
      eAvg: +best.code[1],
      rAvg: +best.code[3],
      charId: best.id,
      char2Id: best.id,
      conf: '보통',
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

    if (act === 'home') {
      S.flow = 'me';
      S.invite = null;
      go('home');
    } else if (act === 'back') {
      handleBack();
    } else if (act === 'theme') {
      /* 헤더 토글은 명시적 light/dark 전환 — 시스템 모드에서는 명시 모드로 바뀐다 */
      var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      setTheme(next);
      showToast(next === 'dark' ? '다크 테마로 전환했어요' : '라이트 테마로 전환했어요');
    } else if (act === 'theme-mode') {
      setTheme(el.dataset.v);
      render();
      showToast(el.dataset.v === 'system' ? '시스템 테마를 따라가요' : el.dataset.v === 'dark' ? '항상 다크로 표시해요' : '항상 라이트로 표시해요');
    } else if (act === 'start') {
      S.flow = 'me';
      resetSurvey();
      S.profile = { name: '', relation: '', stage: '' };
      if (S.invite) S.invite = null;
      go('onboarding');
    } else if (act === 'space') {
      go('space');
    } else if (act === 'talk-open') {
      openTalk(el.dataset.talk === undefined ? talkIndex : +el.dataset.talk);
    } else if (act === 'next-talk') {
      var talkY = window.scrollY || 0;
      talkIndex = (talkIndex + 1) % HOME_TALKS.length;
      render();
      window.scrollTo(0, talkY);
      var talkFocus = document.querySelectorAll('[data-action="next-talk"]')[0];
      if (talkFocus) talkFocus.focus({ preventScroll: true });
    } else if (act === 'demo') {
      S.viewPair = { me: SAMPLE_RESULTS.me, partner: SAMPLE_RESULTS.partner };
      go('report');
    } else if (act === 'rel') {
      S.profile.relation = el.dataset.v;
      render();
    } else if (act === 'stage') {
      S.profile.stage = el.dataset.v;
      render();
    } else if (act === 'survey') {
      if (!S.profile.name.trim()) {
        var inp = document.getElementById('pf-name');
        if (inp) {
          markBad(inp);
        }
        showToast('이름 또는 닉네임을 입력해 주세요');
        return;
      }
      resetSurvey();
      go('survey');
    } else if (act === 'answer') {
      var idx = +el.dataset.idx;
      var q = QUESTIONS[S.q];
      var ex = S.answers.find(function (a) {
        return a.qid === q.id;
      });
      if (ex) ex.code = q.options[idx].code;
      else S.answers.push({ qid: q.id, code: q.options[idx].code });
      document.querySelectorAll('.opt-card').forEach(function (b) {
        b.classList.remove('selected');
      });
      el.classList.add('selected');
      if (S.advancing) {
        saveDraft();
        return;
      } // 전환 대기 중 답변 변경만 허용
      S.advancing = true;
      saveDraft();
      var answeredFlow = S.flow,
        answeredList = S.answers,
        answeredQ = S.q;
      setTimeout(function () {
        S.advancing = false;
        if (currentRoute() !== 'survey' || S.flow !== answeredFlow || S.answers !== answeredList || S.q !== answeredQ) return;
        if (S.q < QUESTIONS.length - 1) {
          S.q++;
          S.qDir = 'next';
          saveDraft();
          render();
        } else finishSurvey();
      }, 220);
    } else if (act === 'prev') {
      if (S.q > 0) {
        S.q--;
        S.qDir = 'prev';
        saveDraft();
        render();
      }
    } else if (act === 'result') {
      S.flow = 'me';
      go('result');
    } else if (act === 'retry') {
      resetSurvey();
      S.flow = 'me';
      S.profile = { name: S.me ? S.me.name : '', relation: S.me ? S.me.relation : '', stage: S.me ? S.me.stage : '' };
      go('onboarding');
    } else if (act === 'share') {
      var r = S.flow === 'partner' ? S.partner : S.me;
      var c = charById(r.charId);
      shareSmart('MATE:ON 진단 결과', resultShareText(r, c), inviteURL(r));
    } else if (act === 'invite') {
      go('invite');
    } else if (act === 'copylink') {
      copyText(inviteURL(S.me), '초대 링크가 복사됐어요');
    } else if (act === 'preview-partner') {
      var linkField = document.getElementById('partner-link');
      S.connectionInput = linkField ? linkField.value.trim() : '';
      var dec = resultFromLink(S.connectionInput);
      S.pendingPartner = dec && dec.r ? dec.r : null;
      if (dec && dec.expired) {
        render();
        showToast('만료된 링크예요. 상대에게 새 링크를 요청해 주세요');
        return;
      }
      if (!S.pendingPartner) {
        render();
        showToast('유효한 MATE:ON 초대 링크를 붙여넣어 주세요');
        return;
      }
      render();
    } else if (act === 'cancel-partner') {
      S.pendingPartner = null;
      S.connectionInput = '';
      render();
    } else if (act === 'confirm-partner') {
      if (!S.me || !S.pendingPartner) return;
      var wasUpdate = !!S.partner;
      try {
        localStorage.setItem('mateon.partner', JSON.stringify(S.pendingPartner));
      } catch (err) {
        showToast('저장하지 못했어요. 기기 저장 공간을 확인해 주세요');
        return;
      }
      S.partner = S.pendingPartner;
      S.pendingPartner = null;
      S.connectionInput = '';
      S.flow = 'me';
      S.viewPair = null;
      resetRulesForNewPartner();
      go('report');
      showToast(wasUpdate ? '메이트의 최신 결과로 업데이트했어요' : '메이트의 실제 결과와 연결했어요');
      scheduleSyncPush();
    } else if (act === 'partner-survey') {
      S.flow = 'partner';
      resetSurvey();
      S.profile = { name: '', relation: S.me.relation, stage: S.me.stage };
      go('onboarding');
    } else if (act === 'sample') {
      S.partner = farthestSample();
      save('mateon.partner', S.partner);
      resetRulesForNewPartner();
      go('report');
      showToast('샘플 상대와 비교한 미리보기예요 · 추천 규칙을 다시 계산했어요');
    } else if (act === 'report') {
      go('report');
    } else if (act === 'rule') {
      var t = el.dataset.v;
      if (!S.rulesReady) S.checkedRules = agreementRules().slice();
      S.rulesReady = true;
      var i = S.checkedRules.indexOf(t);
      if (i >= 0) S.checkedRules.splice(i, 1);
      else S.checkedRules.push(t);
      S.signs = { me: false, partner: false };
      render();
    } else if (act === 'agreement') {
      go('agreement');
    } else if (act === 'agree-tpl') {
      var agTpl = AGREE_TEMPLATES.find(function (t) {
        return t.id === el.dataset.v;
      });
      if (!agTpl) return;
      S.checkedRules = agTpl.rules.slice();
      S.rulesReady = true;
      S.signs = { me: false, partner: false };
      showToast('템플릿을 불러왔어요 — 리포트에서 규칙을 더 고를 수도 있어요');
      render();
    } else if (act === 'restore-agree') {
      var savedAg = savedAgreementForPair();
      if (!savedAg) return;
      S.checkedRules = savedAg.rules.slice();
      S.rulesReady = true;
      S.signs = { me: true, partner: true };
      showToast('저장된 합의서로 되돌렸어요');
      render();
    } else if (act === 'sign') {
      var who = el.dataset.who;
      S.signs[who] = !S.signs[who];
      render();
    } else if (act === 'save-agree') {
      var today = new Date();
      var todayLabel = today.getFullYear() + '년 ' + (today.getMonth() + 1) + '월 ' + today.getDate() + '일';
      var prevAgreement = savedAgreementForPair();
      var changed = !!(prevAgreement && !sameTextList(S.checkedRules, prevAgreement.rules));
      if (!S.checkedRules.length) {
        showToast('합의서에 담을 규칙을 한 개 이상 선택해 주세요');
        return;
      }
      S.agreement = {
        rules: S.checkedRules.slice(),
        me: S.me.name,
        partner: S.partner.name,
        meCharId: S.me.charId,
        partnerCharId: S.partner.charId,
        date: prevAgreement ? prevAgreement.date : todayLabel,
        updated: prevAgreement && changed ? todayLabel : prevAgreement ? prevAgreement.updated : null,
        rev: prevAgreement ? (prevAgreement.rev || 1) + (changed ? 1 : 0) : 1,
        ts: today.getTime(),
      };
      save('mateon.agreement', S.agreement);
      showToast(changed ? '합의서 v' + S.agreement.rev + '으로 업데이트했어요' : '우리집 합의서가 저장됐어요');
      render();
    } else if (act === 'copy-agree') {
      copyText(agreementText(), '합의서가 복사됐어요');
    }

    /* ---- 신규 기능 ---- */
    else if (act === 'types') {
      go('types');
    } else if (act === 'type') {
      S.typeId = +el.dataset.id;
      go('type-detail');
    } else if (act === 'checklist') {
      go('checklist');
    } else if (act === 'settle') {
      go('settle');
    } else if (act === 'chores') {
      go('chores');
    } else if (act === 'calendar') {
      go('calendar');
    } else if (act === 'checkin') {
      go('checkin');
    } else if (act === 'conflict') {
      go('conflict');
    } else if (act === 'check') {
      var checkY = window.scrollY || 0;
      var key = el.dataset.v;
      S.checklist[key] = !S.checklist[key];
      save('mateon.checklist', S.checklist);
      render();
      window.scrollTo(0, checkY);
    } else if (act === 'lifecheck') {
      S.lifeQ = 0;
      S.lifeAnswers = [];
      go('lifecheck');
    } else if (act === 'life-answer') {
      var li = +el.dataset.idx;
      var lq = LIFE_QUESTIONS[S.lifeQ];
      var lex = S.lifeAnswers.find(function (a) {
        return a.qid === lq.id;
      });
      if (lex) {
        lex.optIdx = li;
        lex.level = lq.options[li].level;
      } else S.lifeAnswers.push({ qid: lq.id, optIdx: li, level: lq.options[li].level });
      document.querySelectorAll('.life-opt').forEach(function (b) {
        b.classList.remove('selected');
      });
      el.classList.add('selected');
      setTimeout(function () {
        if (S.lifeQ < LIFE_QUESTIONS.length - 1) {
          S.lifeQ++;
          render();
        } else finishLifeCheck();
      }, 220);
    } else if (act === 'life-prev') {
      if (S.lifeQ > 0) {
        S.lifeQ--;
        render();
      }
    } else if (act === 'saveimg') {
      saveResultImage();
    } else if (act === 'agree-img') {
      saveAgreeImage();
    } else if (act === 'agree-ics') {
      downloadICS();
    } else if (act === 'share-home') {
      shareSmart('MATE:ON', '함께 살 준비, 서로를 아는 것부터. 동거 성향 진단 해봐!', baseURL());
    } else if (act === 'kakao') {
      shareKakao();
    } else if (act === 'add-rule') {
      var cin = document.getElementById('custom-rule-in');
      var v = cin ? cin.value.trim() : '';
      if (!v) {
        if (cin) cin.focus();
        showToast('규칙 내용을 입력해 주세요');
        return;
      }
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
    } else if (act === 'copy-pair') {
      copyText(pairURL(), '리포트 링크가 복사됐어요');
    } else if (act === 'pair-start') {
      S.viewPair = null;
      S.flow = 'me';
      resetSurvey();
      S.profile = { name: '', relation: '', stage: '' };
      go('onboarding');
    } else if (act === 'code-connect') {
      var kin = document.getElementById('code-connect-in');
      var kv = kin ? kin.value.trim().toUpperCase() : '';
      var res = /^E[1-4]R[1-4]$/.test(kv) ? resultFromCode(kv) : null;
      if (!res) {
        if (kin) {
          markBad(kin);
        }
        showToast('E1~E4와 R1~R4 조합으로 입력해 주세요 (예: E3R2)');
        return;
      }
      S.partner = res;
      save('mateon.partner', res);
      resetRulesForNewPartner();
      go('report');
      showToast('유형 코드로 연결했어요 · 추천 규칙을 다시 계산했어요');
    } else if (act === 'resume-survey') {
      if (restoreDraft(load('mateon.activeDraft') || 'me')) go('survey');
      else showToast('이어갈 진단이 없어요. 새 진단을 시작해 주세요');
    } else if (act === 'share-name') {
      S.shareName = S.shareName === false;
      save('mateon.shareName', S.shareName);
      showToast(S.shareName === false ? '닉네임 없이 링크를 만들어요' : '닉네임을 포함해 링크를 만들어요');
      render();
    } else if (act === 'unlink') {
      S.partner = null;
      remove('mateon.partner');
      S.checkedRules = [];
      S.rulesReady = false;
      S.signs = { me: false, partner: false };
      showToast('상대 연결을 해제했어요');
      render();
    } else if (act === 'settings') {
      go('settings');
    } else if (act === 'privacy') {
      go('privacy');
    } else if (act === 'terms') {
      go('terms');
    } else if (act === 'backup-export') {
      exportBackup();
    } else if (act === 'backup-import') {
      var backupInput = document.getElementById('backup-file');
      if (backupInput) backupInput.click();
    } else if (act === 'del-data') {
      var dk = el.dataset.v;
      if (S.delArm !== dk) {
        S.delArm = dk;
        render();
        return;
      }
      S.delArm = null;
      remove(dk);
      if (dk === 'mateon.me') {
        S.me = null;
      }
      if (dk === 'mateon.partner') {
        S.partner = null;
        S.checkedRules = [];
        S.rulesReady = false;
        S.signs = { me: false, partner: false };
      }
      if (dk === 'mateon.agreement') {
        S.agreement = null;
        S.checkedRules = [];
        S.rulesReady = false;
        S.signs = { me: false, partner: false };
      }
      if (dk === 'mateon.history') {
        S.history = [];
      }
      if (dk === 'mateon.talks') {
        /* read fresh on render */
      }
      if (dk === 'mateon.checklist') {
        S.checklist = {};
      }
      if (dk === 'mateon.customRules') {
        S.customRules = [];
      }
      if (dk === 'mateon.shareName') {
        S.shareName = true;
      }
      if (dk === 'mateon.expenses') {
        S.expenses = [];
      }
      if (dk === 'mateon.settled') {
        S.settled = [];
      }
      if (dk === 'mateon.fixedExpenses') {
        S.fixedExpenses = [];
      }
      if (dk === 'mateon.chores') {
        S.chores = null;
      }
      if (dk === 'mateon.choreLog') {
        S.choreLog = {};
      }
      if (dk === 'mateon.events') {
        S.events = [];
      }
      if (dk === 'mateon.checkins') {
        S.checkins = [];
      }
      if (dk === 'mateon.customChecklist') {
        S.customChecklist = [];
      }
      if (dk === 'mateon.conflictLog') {
        S.conflictLog = [];
      }
      if (dk === 'mateon.reminders') {
        S.reminders = { checkin: true, agreement: true, chore: true, day: 0 };
        syncNativeReminders();
      }
      if (dk === 'mateon.inviteDays') {
        S.inviteDays = 7;
      }
      if (dk === 'mateon.fontSize') {
        S.fontSize = 'normal';
        applyFontSize();
      }
      if (dk === 'mateon.seen') {
        S.seen = false;
      }
      if (dk === 'mateon.sync') {
        S.syncCfg = null;
      }
      showToast('삭제했어요');
      render();
    }
    /* ---- 생활비 정산 ---- */
    else if (act === 'exp-payer' || act === 'exp-cat' || act === 'exp-split') {
      /* 칩 리렌더가 입력 중인 내용을 지우지 않도록 폼 값을 보존한다 */
      var m0 = document.getElementById('exp-memo'),
        a0 = document.getElementById('exp-amt'),
        s0 = document.getElementById('exp-share'),
        d0 = document.getElementById('exp-date');
      if (m0) S.expMemo = m0.value;
      if (a0) S.expAmt = a0.value;
      if (s0) S.expShare = s0.value;
      if (d0) S.expDate = d0.value;
      if (act === 'exp-payer') S.expPayer = el.dataset.v;
      else if (act === 'exp-cat') {
        S.expCat = el.dataset.v;
        save('mateon.lastExpCat', S.expCat);
      } else S.splitMode = el.dataset.v;
      render();
    } else if (act === 'exp-payer-filter') {
      S.expPayerFilter = el.dataset.v;
      S.expShowN = 15;
      render();
    } else if (act === 'exp-q-clear') {
      S.expQuery = '';
      S.expShowN = 15;
      render();
      var q0 = document.getElementById('exp-q');
      if (q0) q0.focus();
    } else if (act === 'exp-more') {
      S.expShowN = (S.expShowN || 15) + 30;
      render();
    } else if (act === 'fx-edit') {
      var fxe = S.fixedExpenses.find(function (f) {
        return f.id === el.dataset.v;
      });
      if (!fxe) return;
      S.expEditFx = fxe.id;
      S.expEditId = null;
      S.expMemo = fxe.memo || '';
      S.expAmt = String(fxe.amount);
      S.expPayer = fxe.payer;
      S.expCat = fxe.cat || '기타';
      var fxSh = typeof fxe.share === 'number' ? fxe.share : 0.5;
      if (fxSh === 0.5) {
        S.splitMode = 'equal';
        S.expShare = '';
      } else {
        S.splitMode = 'percent';
        S.expShare = String(Math.round(fxSh * 100));
      }
      render();
    } else if (act === 'exp-month') {
      if (el.dataset.v === 'all') {
        S.settleMonth = 'all';
        render();
        return;
      }
      var base = (S.settleMonth && S.settleMonth !== 'all' ? S.settleMonth : dateStr(Date.now()).slice(0, 7)).split('-').map(Number);
      var dShift = new Date(base[0], base[1] - 1 + +el.dataset.v, 1);
      S.settleMonth = dShift.getFullYear() + '-' + p2(dShift.getMonth() + 1);
      render();
    } else if (act === 'exp-ocr') {
      S.rcptFor = null;
      var rec = document.getElementById('exp-receipt');
      if (rec) rec.click();
    } else if (act === 'exp-rcpt-add') {
      /* 목록에서 특정 지출에 바로 연결 — OCR 대신 사진 첨부만 */
      S.rcptFor = el.dataset.v;
      var recAdd = document.getElementById('exp-receipt');
      if (recAdd) recAdd.click();
    } else if (act === 'fx-suggest-add') {
      var sugKey = el.dataset.v || '';
      var sug = fxSuggestions().find(function (g) {
        return g.key === sugKey;
      });
      if (!sug) {
        showToast('이미 등록됐거나 제안이 없어요');
        return;
      }
      S.fixedExpenses.push({ id: uid(), memo: sug.memo, amount: sug.amount, payer: sug.payer || 'me', cat: sug.cat || '기타', day: sug.day });
      save('mateon.fixedExpenses', S.fixedExpenses);
      applyFixedExpenses();
      showToast('고정비로 등록했어요 — 매월 ' + sug.day + '일에 기록돼요');
      render();
      scheduleSyncPush();
    } else if (act === 'fx-suggest-x') {
      S.fxDismiss.push(String(el.dataset.v || '').slice(0, 80));
      save('mateon.fxDismiss', S.fxDismiss);
      render();
      scheduleSyncPush();
    } else if (act === 'exp-add') {
      var memoEl = document.getElementById('exp-memo'),
        amtEl = document.getElementById('exp-amt');
      var memo = memoEl ? memoEl.value.trim() : '';
      var amt = amtEl ? Math.round(+String(amtEl.value).replace(/[^\d.]/g, '') || 0) : 0;
      if (!memo) {
        if (memoEl) {
          markBad(memoEl);
        }
        showToast('어디에 썼는지 적어주세요');
        return;
      }
      if (!amt || amt <= 0 || amt > 100000000) {
        if (amtEl) {
          markBad(amtEl);
        }
        showToast('금액을 확인해 주세요');
        return;
      }
      var tagsEl = document.getElementById('exp-tags');
      var tags = tagsEl
        ? tagsEl.value
            .replace(/#/g, '')
            .split(/[\s,]+/)
            .map(function (t) {
              return t.trim().slice(0, 12);
            })
            .filter(Boolean)
            .slice(0, 5)
        : [];
      var share = 0.5;
      if (S.expIncome) {
        /* 수입은 분할 없이 단독 기록 */
        if (S.expEditId) {
          var incRec = S.expenses.find(function (x) {
            return x.id === S.expEditId;
          });
          if (incRec) {
            incRec.memo = memo;
            incRec.amount = amt;
            incRec.payer = S.expPayer;
            incRec.income = 1;
            incRec.cat = '수입';
            delete incRec.share;
            delete incRec.fx;
            if (tags.length) incRec.tags = tags;
            else delete incRec.tags;
            var dtEl0 = document.getElementById('exp-date');
            var dv0 = dtEl0 && /^\d{4}-\d{2}-\d{2}$/.test(dtEl0.value) ? dtEl0.value : dateStr(Date.now());
            incRec.ts = new Date(dv0 + 'T12:00:00').getTime();
            S.expEditId = null;
            S.expMemo = '';
            S.expAmt = '';
            S.expTags = '';
            save('mateon.expenses', S.expenses);
            showToast('수입을 수정했어요');
            render();
            scheduleSyncPush();
            return;
          }
        }
        var incNew = { id: uid(), ts: Date.now(), memo: memo, amount: amt, payer: S.expPayer, cat: '수입', income: 1 };
        var dtEl = document.getElementById('exp-date');
        var dv = dtEl && /^\d{4}-\d{2}-\d{2}$/.test(dtEl.value) ? dtEl.value : dateStr(Date.now());
        if (dv > dateStr(Date.now())) dv = dateStr(Date.now());
        incNew.ts = new Date(dv + 'T12:00:00').getTime();
        if (tags.length) incNew.tags = tags;
        S.expenses.push(incNew);
        if (S.expenses.length > 500) S.expenses = S.expenses.slice(-500);
        S.expMemo = '';
        S.expAmt = '';
        S.expTags = '';
        save('mateon.expenses', S.expenses);
        showToast('수입을 기록했어요');
        render();
        scheduleSyncPush();
        return;
      }
      if (S.splitMode !== 'equal') {
        var shareEl = document.getElementById('exp-share');
        var sv = shareEl ? +String(shareEl.value).replace(/[^\d.]/g, '') : NaN;
        if (S.splitMode === 'percent') {
          if (!Number.isFinite(sv) || sv < 0 || sv > 100) {
            if (shareEl) {
              markBad(shareEl);
            }
            showToast('부담 비율을 0~100 사이로 적어주세요');
            return;
          }
          share = sv / 100;
        } else if (S.splitMode === 'exact') {
          if (!Number.isFinite(sv) || sv < 0 || sv > amt) {
            if (shareEl) {
              markBad(shareEl);
            }
            showToast('내 부담금은 0~총액 사이로 적어주세요');
            return;
          }
          share = sv / amt;
        }
      }
      /* 고정비 수정 모드: fixedExpenses만 갱신하고 끝낸다 */
      var fxEditRec = S.expEditFx
        ? S.fixedExpenses.find(function (f) {
            return f.id === S.expEditFx;
          })
        : null;
      if (fxEditRec) {
        fxEditRec.memo = memo;
        fxEditRec.amount = amt;
        fxEditRec.payer = S.expPayer;
        fxEditRec.cat = S.expCat;
        if (share !== 0.5) fxEditRec.share = Math.round(share * 1000) / 1000;
        else delete fxEditRec.share;
        var fxDayEl = document.getElementById('exp-day');
        var newDay = Math.round(fxDayEl ? +fxDayEl.value : 0);
        if (Number.isInteger(newDay) && newDay >= 1 && newDay <= 28) fxEditRec.day = newDay;
        S.expEditFx = null;
        S.expMemo = '';
        S.expAmt = '';
        S.expShare = '';
        save('mateon.fixedExpenses', S.fixedExpenses);
        showToast('고정비를 수정했어요');
        render();
        scheduleSyncPush();
        return;
      }
      var dateEl = document.getElementById('exp-date');
      var dateV = dateEl && /^\d{4}-\d{2}-\d{2}$/.test(dateEl.value) ? dateEl.value : dateStr(Date.now());
      if (dateV > dateStr(Date.now())) dateV = dateStr(Date.now());
      var expTs = new Date(dateV + 'T12:00:00').getTime();
      var editRec = S.expEditId
        ? S.expenses.find(function (x) {
            return x.id === S.expEditId;
          })
        : null;
      if (editRec) {
        editRec.memo = memo;
        editRec.amount = amt;
        editRec.payer = S.expPayer;
        editRec.cat = S.expCat;
        editRec.ts = expTs;
        if (share !== 0.5) editRec.share = Math.round(share * 1000) / 1000;
        else delete editRec.share;
        if (tags.length) editRec.tags = tags;
        else delete editRec.tags;
        delete editRec.income;
        S.expEditId = null;
        S.expMemo = '';
        S.expAmt = '';
        S.expShare = '';
        S.expTags = '';
        save('mateon.expenses', S.expenses);
        showToast('지출을 수정했어요');
        render();
        scheduleSyncPush();
        return;
      }
      var rec2 = { id: uid(), ts: expTs, memo: memo, amount: amt, payer: S.expPayer, cat: S.expCat };
      if (share !== 0.5) rec2.share = Math.round(share * 1000) / 1000;
      if (tags.length) rec2.tags = tags;
      var recurEl = document.getElementById('exp-recur');
      if (recurEl && recurEl.checked) {
        /* 이번 달 기록은 고정비 자동생성분과 같은 fx 태그를 달아 중복 방지 */
        var dayEl = document.getElementById('exp-day');
        var fxDay = Math.round(dayEl ? +dayEl.value : 0);
        if (!Number.isInteger(fxDay) || fxDay < 1 || fxDay > 28) fxDay = Math.min(new Date().getDate(), 28);
        var ym0 = dateStr(Date.now()).slice(0, 7);
        var fx0 = { id: uid(), memo: memo, amount: amt, payer: S.expPayer, cat: S.expCat, share: rec2.share, day: fxDay };
        S.fixedExpenses.push(fx0);
        if (S.fixedExpenses.length > 50) S.fixedExpenses = S.fixedExpenses.slice(-50);
        rec2.id = ML.fixedExpId(fx0.id, ym0);
        rec2.fx = fx0.id + ':' + ym0;
        save('mateon.fixedExpenses', S.fixedExpenses);
      }
      S.expenses.push(rec2);
      if (S.expenses.length > 500) S.expenses = S.expenses.slice(-500);
      if (S.pendingReceipt) {
        var rcptBlob = S.pendingReceipt;
        S.pendingReceipt = null;
        rec2.rcpt = 1;
        rcptPut(rec2.id, rcptBlob).catch(function () {});
      }
      S.expMemo = '';
      S.expAmt = '';
      S.expShare = '';
      S.expTags = '';
      save('mateon.expenses', S.expenses);
      save('mateon.lastSplit', { mode: S.splitMode, share: share });
      showToast(rec2.fx ? '지출을 기록하고 고정비로 등록했어요' : '지출을 기록했어요');
      render();
      scheduleSyncPush();
    } else if (act === 'exp-kind') {
      S.expIncome = el.dataset.v === '1';
      render();
    } else if (act === 'exp-tag') {
      S.expTag = el.dataset.v || null;
      S.expShowN = 15;
      render();
    } else if (act === 'settle-part') {
      var pAmtEl = document.getElementById('part-amt');
      var pAmt = pAmtEl ? Math.round(+String(pAmtEl.value).replace(/[^\d.]/g, '') || 0) : 0;
      if (!pAmt || pAmt <= 0 || pAmt > 100000000) {
        if (pAmtEl) {
          markBad(pAmtEl);
        }
        showToast('금액을 확인해 주세요');
        return;
      }
      S.settlePaid.push({ dir: el.dataset.v === 'y2m' ? 'y2m' : 'm2y', amt: pAmt, ts: Date.now() });
      if (S.settlePaid.length > 200) S.settlePaid = S.settlePaid.slice(-200);
      save('mateon.settlePaid', S.settlePaid);
      showToast('부분 정산 ' + fmtWon(pAmt) + '을 기록했어요');
      render();
      scheduleSyncPush();
    } else if (act === 'settle-part-del') {
      var pts = +el.dataset.v;
      S.settlePaid = S.settlePaid.filter(function (p) {
        return p.ts !== pts;
      });
      save('mateon.settlePaid', S.settlePaid);
      render();
      scheduleSyncPush();
    } else if (act === 'goal-set') {
      var gName = document.getElementById('goal-name'),
        gTgt = document.getElementById('goal-target');
      var gN = gName ? gName.value.trim().slice(0, 20) : '';
      var gT = gTgt ? Math.round(+String(gTgt.value).replace(/[^\d.]/g, '') || 0) : 0;
      if (!gN) {
        if (gName) {
          markBad(gName);
        }
        showToast('목표 이름을 적어주세요');
        return;
      }
      if (!gT || gT <= 0) {
        if (gTgt) {
          markBad(gTgt);
        }
        showToast('목표 금액을 확인해 주세요');
        return;
      }
      S.goal = { name: gN, target: Math.min(gT, 1000000000), saves: [] };
      save('mateon.goal', S.goal);
      showToast('목표를 만들었어요 🎯');
      render();
      scheduleSyncPush();
    } else if (act === 'goal-add') {
      if (!S.goal) return;
      var gAmtEl = document.getElementById('goal-amt');
      var gAmt = gAmtEl ? Math.round(+String(gAmtEl.value).replace(/[^\d.]/g, '') || 0) : 0;
      if (!gAmt || gAmt <= 0) {
        if (gAmtEl) {
          markBad(gAmtEl);
        }
        showToast('금액을 확인해 주세요');
        return;
      }
      S.goal.saves.push({ amt: Math.min(gAmt, 100000000), ts: Date.now() });
      if (S.goal.saves.length > 500) S.goal.saves = S.goal.saves.slice(-500);
      save('mateon.goal', S.goal);
      var gSum = S.goal.saves.reduce(function (a, s) {
        return a + s.amt;
      }, 0);
      showToast(gSum >= S.goal.target ? '목표 달성! 축하해요 🎉' : fmtWon(gAmt) + '을 저축했어요');
      buzz(80);
      render();
      scheduleSyncPush();
    } else if (act === 'goal-del') {
      if (S.delArm2 !== 'goal-del:x') {
        S.delArm2 = 'goal-del:x';
        render();
        return;
      }
      S.delArm2 = null;
      S.goal = null;
      save('mateon.goal', null);
      render();
      scheduleSyncPush();
    } else if (act === 'exp-edit') {
      var er = S.expenses.find(function (x) {
        return x.id === el.dataset.v;
      });
      if (!er) return;
      S.expEditId = er.id;
      S.expEditFx = null;
      S.expMemo = er.memo || '';
      S.expAmt = String(er.amount);
      S.expDate = dateStr(er.ts);
      S.expPayer = er.payer;
      S.expCat = er.cat || '기타';
      S.expIncome = !!er.income;
      S.expTags = (er.tags || []).join(' ');
      var sh = expenseShare(er);
      if (sh === 0.5) {
        S.splitMode = 'equal';
        S.expShare = '';
      } else {
        S.splitMode = 'percent';
        S.expShare = String(Math.round(sh * 100));
      }
      render();
      var memoIn = document.getElementById('exp-memo');
      if (memoIn) {
        memoIn.focus();
      }
    } else if (act === 'exp-edit-cancel') {
      S.expEditId = null;
      S.expEditFx = null;
      S.expMemo = '';
      S.expAmt = '';
      S.expShare = '';
      S.rcptFor = null;
      render();
    } else if (act === 'exp-rcpt-cancel') {
      S.pendingReceipt = null;
      S.rcptFor = null;
      showToast('영수증 첨부를 취소했어요');
      render();
    } else if (act === 'exp-filter') {
      S.expFilter = el.dataset.v;
      S.expShowN = 15;
      render();
    } else if (act === 'exp-rcpt') {
      showReceipt(el.dataset.v);
    } else if (act === 'exp-csv') {
      var viewAllCsv = S.settleMonth === 'all';
      var csvList = viewAllCsv
        ? S.expenses
        : S.expenses.filter(function (x) {
            return dateStr(x.ts).slice(0, 7) === S.settleMonth;
          });
      if (!csvList.length) {
        showToast('보낼 지출이 없어요');
        return;
      }
      var csvText = ML.expensesToCSV(csvList, payerName);
      var csvName = 'mateon-expenses-' + (viewAllCsv ? 'all' : S.settleMonth) + '.csv';
      if (window.MateNative) {
        window.MateNative.shareFile(csvName, csvText, true).catch(function () {
          showToast('CSV 공유가 완료되지 않았어요');
        });
        return;
      }
      var csvBlob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
      var csvA = document.createElement('a');
      csvA.href = URL.createObjectURL(csvBlob);
      csvA.download = csvName;
      csvA.click();
      setTimeout(function () {
        URL.revokeObjectURL(csvA.href);
      }, 1000);
      showToast('지출 CSV를 내려받았어요');
    } else if (act === 'budget-set') {
      var nb = {};
      document.querySelectorAll('.budget-in').forEach(function (inp) {
        var v = Math.round(+String(inp.value).replace(/[^\d.]/g, '') || 0);
        if (v > 0 && v <= 100000000) nb[inp.dataset.cat] = v;
      });
      S.budgets = nb;
      save('mateon.budgets', nb);
      showToast(Object.keys(nb).length ? '월 예산을 저장했어요' : '예산을 모두 지웠어요');
      render();
      scheduleSyncPush();
    } else if (act === 'fx-del') {
      var fid = el.dataset.v;
      if (S.delArm2 !== 'fx-del:' + fid) {
        S.delArm2 = 'fx-del:' + fid;
        render();
        return;
      }
      S.delArm2 = null;
      S.fixedExpenses = S.fixedExpenses.filter(function (f) {
        return f.id !== fid;
      });
      save('mateon.fixedExpenses', S.fixedExpenses);
      render();
      scheduleSyncPush();
    } else if (act === 'exp-del') {
      var eid = el.dataset.v;
      if (S.delArm2 !== 'exp-del:' + eid) {
        S.delArm2 = 'exp-del:' + eid;
        render();
        return;
      }
      S.delArm2 = null;
      var delRec = S.expenses.find(function (x) {
        return x.id === eid;
      });
      S.expenses = S.expenses.filter(function (x) {
        return x.id !== eid;
      });
      if (delRec) toTrash('exp', (delRec.memo || '지출') + ' ' + fmtWon(delRec.amount), delRec);
      save('mateon.expenses', S.expenses);
      /* 되돌리기: 6초 안에 실행 취소 가능 */
      if (delRec) {
        S.expUndo = { rec: delRec, until: Date.now() + 6000 };
        showToast('삭제했어요', {
          action: {
            label: '되돌리기',
            fn: function () {
              if (S.expUndo && S.expUndo.rec === delRec) {
                S.expenses.push(delRec);
                S.expUndo = null;
                save('mateon.expenses', S.expenses);
                render();
                scheduleSyncPush();
              }
            },
          },
        });
      }
      render();
      scheduleSyncPush();
    } else if (act === 'exp-copy') {
      var meP = 0,
        youP = 0;
      S.expenses.forEach(function (x) {
        if (x.payer === 'me') meP += x.amount;
        else youP += x.amount;
      });
      var net = settleNet();
      var range = '';
      if (S.expenses.length) {
        var tsAsc = S.expenses.slice().sort(function (a, b) {
          return a.ts - b.ts;
        });
        range = ML.dateLabel(tsAsc[0].ts) + ' ~ ' + ML.dateLabel(tsAsc[tsAsc.length - 1].ts);
      }
      var lines = ['[MATE:ON 생활비 정산]', '기간: ' + range, payerName('me') + ' 지출 ' + fmtWon(meP) + ' / ' + payerName('you') + ' 지출 ' + fmtWon(youP)];
      lines.push(
        net === 0
          ? '정산: 딱 맞게 나눴어요'
          : '정산: ' + (net > 0 ? payerName('you') + ' → ' + payerName('me') : payerName('me') + ' → ' + payerName('you')) + ' ' + fmtWon(Math.abs(net))
      );
      lines.push('---');
      S.expenses
        .slice()
        .sort(function (a, b) {
          return a.ts - b.ts;
        })
        .forEach(function (x) {
          var sh = expenseShare(x);
          var tag = sh === 0.5 ? '' : ' [' + Math.round(sh * 100) + ':' + Math.round((1 - sh) * 100) + ']';
          lines.push(dateStr(x.ts).slice(5) + ' ' + x.memo + ' ' + fmtWon(x.amount) + ' (' + payerName(x.payer) + ')' + tag);
        });
      copyText(lines.join('\n'), '정산 내역을 복사했어요');
    } else if (act === 'exp-settle') {
      if (!S.expenses.length) return;
      var paidN = S.settlePaid.reduce(function (a, p) {
        return a + (p.dir === 'y2m' ? p.amt : -p.amt);
      }, 0);
      var netAmt = settleNet() - paidN;
      S.settled.push({ ts: Date.now(), label: dateStr(Date.now()) + ' 정산 (' + S.expenses.length + '건)', net: netAmt });
      if (S.settled.length > 200) S.settled = S.settled.slice(-200);
      S.expenses = [];
      S.settlePaid = [];
      save('mateon.settlePaid', S.settlePaid);
      save('mateon.settled', S.settled);
      save('mateon.expenses', S.expenses);
      showToast(netAmt === 0 ? '정산을 마감했어요' : '정산할 금액 ' + fmtWon(Math.abs(netAmt)) + ' · 기록을 마감했어요');
      render();
      scheduleSyncPush();
    }
    /* ---- 같이 살 것 ---- */
    else if (act === 'shop-cat') {
      S.shopCat = el.dataset.v;
      render();
    } else if (act === 'shop-add' || act === 'shop-preset' || act === 'shop-restock') {
      var sin = document.getElementById('shop-in');
      var sqtyEl = document.getElementById('shop-qty');
      var sname = act === 'shop-add' ? (sin ? sin.value.trim() : '') : el.dataset.v;
      var sqty = sqtyEl ? Math.round(+sqtyEl.value || 1) : 1;
      if (!Number.isInteger(sqty) || sqty < 1 || sqty > 99) sqty = 1;
      if (!sname) {
        if (sin) {
          markBad(sin);
        }
        showToast('살 것을 적어주세요');
        return;
      }
      if (sname.length > 30) sname = sname.slice(0, 30);
      if (S.shopping.length >= 200) {
        showToast('목록이 가득 찼어요. 산 것을 먼저 지워주세요');
        return;
      }
      var existOpen = S.shopping.find(function (x) {
        return x.name === sname && !x.done;
      });
      if (existOpen) {
        /* 이미 있으면 수량만 합산 + 분류는 최근 선택으로 갱신 */
        existOpen.qty = (existOpen.qty || 1) + (act === 'shop-add' ? sqty : 1);
        if (S.shopCat) existOpen.cat = S.shopCat;
        save('mateon.shopping', S.shopping);
        showToast('수량을 더했어요');
        render();
        scheduleSyncPush();
        return;
      }
      S.shopping.push({ id: uid(), name: sname, cat: S.shopCat, done: false, ts: Date.now(), qty: sqty });
      save('mateon.shopping', S.shopping);
      showToast('"' + sname + '"을(를) 추가했어요');
      render();
      scheduleSyncPush();
    } else if (act === 'shop-copy') {
      var openItems = S.shopping.filter(function (x) {
        return !x.done;
      });
      if (!openItems.length) {
        showToast('남은 항목이 없어요');
        return;
      }
      var shopText =
        '[같이 살 것 ' +
        ML.dateLabel(Date.now()) +
        ']\n' +
        openItems
          .map(function (x) {
            return '□ ' + x.name + (x.qty > 1 ? ' ×' + x.qty : '') + ' (' + x.cat + ')';
          })
          .join('\n');
      copyText(shopText, '장보기 목록을 복사했어요');
    } else if (act === 'shop-done') {
      var sid = el.dataset.v;
      S.shopping.forEach(function (x) {
        if (x.id === sid) {
          x.done = !x.done;
          x.ts = Date.now();
          if (x.done) {
            var h = S.shopHist.find(function (y) {
              return y.name === x.name;
            });
            if (h) {
              h.ts = Date.now();
              h.cnt = (h.cnt || 1) + 1;
            } else S.shopHist.push({ name: x.name, ts: Date.now(), cnt: 1 });
            if (S.shopHist.length > 300) S.shopHist = S.shopHist.slice(-300);
            save('mateon.shopHist', S.shopHist);
          }
        }
      });
      save('mateon.shopping', S.shopping);
      render();
      scheduleSyncPush();
    } else if (act === 'shop-del') {
      var sid2 = el.dataset.v;
      if (S.delArm2 !== 'shop-del:' + sid2) {
        S.delArm2 = 'shop-del:' + sid2;
        render();
        return;
      }
      S.delArm2 = null;
      var shopDel = S.shopping.find(function (x) {
        return x.id === sid2;
      });
      if (shopDel) toTrash('shop', shopDel.name, shopDel);
      S.shopping = S.shopping.filter(function (x) {
        return x.id !== sid2;
      });
      save('mateon.shopping', S.shopping);
      render();
      scheduleSyncPush();
    } else if (act === 'shop-clear') {
      if (S.delArm2 !== 'shop-clear') {
        S.delArm2 = 'shop-clear';
        showToast('한 번 더 누르면 산 것을 모두 지워요');
        return;
      }
      S.delArm2 = null;
      /* 지우기 전에 구매 이력에 쌓아 재구매 제안에 쓴다 */
      S.shopping.forEach(function (x) {
        if (!x.done) return;
        var h = S.shopHist.find(function (y) {
          return y.name === x.name;
        });
        if (h) {
          h.ts = Date.now();
          h.cnt = (h.cnt || 1) + 1;
        } else S.shopHist.push({ name: x.name, ts: Date.now(), cnt: 1 });
      });
      if (S.shopHist.length > 300) S.shopHist = S.shopHist.slice(-300);
      save('mateon.shopHist', S.shopHist);
      S.shopping = S.shopping.filter(function (x) {
        return !x.done;
      });
      save('mateon.shopping', S.shopping);
      render();
      scheduleSyncPush();
    }
    /* ---- 유통기한 관리 ---- */
    else if (act === 'pantry-loc') {
      S.pantryLoc = el.dataset.v;
      render();
    } else if (act === 'pantry-add') {
      var pName = document.getElementById('pantry-name'),
        pExp = document.getElementById('pantry-exp');
      var pn = pName ? pName.value.trim().slice(0, 30) : '';
      var pe = pExp && /^\d{4}-\d{2}-\d{2}$/.test(pExp.value) ? pExp.value : '';
      if (!pn) {
        if (pName) {
          markBad(pName);
        }
        showToast('식품 이름을 적어주세요');
        return;
      }
      if (!pe) {
        if (pExp) {
          markBad(pExp);
        }
        showToast('유통기한을 골라주세요');
        return;
      }
      if (S.pantry.length >= 200) {
        showToast('유통기한 목록이 가득 찼어요');
        return;
      }
      if (
        S.pantry.some(function (x) {
          return x.name === pn && x.exp === pe;
        })
      ) {
        showToast('이미 등록한 항목이에요');
        return;
      }
      S.pantry.push({ id: uid(), name: pn, exp: pe, loc: S.pantryLoc || '냉장', ts: Date.now() });
      save('mateon.pantry', S.pantry);
      render();
      scheduleSyncPush();
      showToast(
        pe <= dateStr(Date.now() + 3 * 86400000) ? '기한이 얼마 안 남았어요. 먼저 드세요!' : '유통기한을 등록했어요',
        pe <= dateStr(Date.now() + 3 * 86400000) ? { type: 'warn' } : undefined
      );
    } else if (act === 'pantry-eat') {
      var pid = el.dataset.v;
      S.pantry = S.pantry.filter(function (x) {
        return x.id !== pid;
      });
      save('mateon.pantry', S.pantry);
      render();
      scheduleSyncPush();
    } else if (act === 'pantry-del') {
      var pdid = el.dataset.v;
      if (S.delArm2 !== 'pantry-del:' + pdid) {
        S.delArm2 = 'pantry-del:' + pdid;
        render();
        return;
      }
      S.delArm2 = null;
      S.pantry = S.pantry.filter(function (x) {
        return x.id !== pdid;
      });
      save('mateon.pantry', S.pantry);
      render();
      scheduleSyncPush();
    }
    /* ---- 러브 쿠폰 ---- */
    else if (act === 'coupon-issue') {
      if (
        S.coupons.filter(function (c) {
          return !c.usedTs;
        }).length >= 20
      ) {
        showToast('미사용 쿠폰이 20장을 넘었어요. 먼저 써주세요');
        return;
      }
      S.coupons.push({ id: uid(), title: el.dataset.v, ts: Date.now(), by: 'me' });
      save('mateon.coupons', S.coupons);
      render();
      scheduleSyncPush();
      buzz(30);
      showToast('🎟 ' + el.dataset.v + '을 발급했어요', { type: 'good' });
    } else if (act === 'coupon-custom') {
      S.couponCustom = true;
      render();
    } else if (act === 'coupon-custom-add') {
      var ccIn = document.getElementById('coupon-custom-in');
      var ccT = ccIn ? ccIn.value.trim().slice(0, 20) : '';
      if (!ccT) {
        if (ccIn) {
          markBad(ccIn);
        }
        showToast('쿠폰 이름을 적어주세요');
        return;
      }
      S.coupons.push({ id: uid(), title: ccT, ts: Date.now(), by: 'me' });
      S.couponCustom = false;
      save('mateon.coupons', S.coupons);
      render();
      scheduleSyncPush();
      buzz(30);
      showToast('🎟 ' + ccT + '을 발급했어요', { type: 'good' });
    } else if (act === 'coupon-use') {
      /* 사용 요청 → 상대 확인 후 사용 완료 (남용 방지) */
      var cuId = el.dataset.v;
      S.coupons.forEach(function (c) {
        if (c.id === cuId) c.pendTs = Date.now();
      });
      save('mateon.coupons', S.coupons);
      render();
      scheduleSyncPush();
      pushNotif('💝', '쿠폰 사용을 요청했어요 — 메이트 확인 대기', 'space');
      showToast('사용 요청했어요 — 메이트가 확인하면 완료돼요');
    } else if (act === 'coupon-ok') {
      var coId = el.dataset.v;
      S.coupons.forEach(function (c) {
        if (c.id === coId) {
          c.usedTs = Date.now();
          delete c.pendTs;
        }
      });
      save('mateon.coupons', S.coupons);
      render();
      scheduleSyncPush();
      pushNotif('💝', '쿠폰 사용을 확인했어요', 'space');
      buzz(40);
      showToast('쿠폰을 사용했어요 💝', { type: 'good' });
    } else if (act === 'coupon-no') {
      var cxId = el.dataset.v;
      S.coupons.forEach(function (c) {
        if (c.id === cxId) delete c.pendTs;
      });
      save('mateon.coupons', S.coupons);
      render();
      scheduleSyncPush();
      showToast('사용 요청을 취소했어요');
    } else if (act === 'coupon-del') {
      var cdId = el.dataset.v;
      if (S.delArm2 !== 'coupon-del:' + cdId) {
        S.delArm2 = 'coupon-del:' + cdId;
        render();
        return;
      }
      S.delArm2 = null;
      S.coupons = S.coupons.filter(function (c) {
        return c.id !== cdId;
      });
      save('mateon.coupons', S.coupons);
      render();
      scheduleSyncPush();
    }
    /* ---- 펫·식물 돌봄 ---- */
    else if (act === 'care-kind') {
      S.careKind = el.dataset.v;
      render();
    } else if (act === 'care-preset') {
      var cp = (CARE_PRESETS[S.careKind || 'pet'] || []).find(function (p) {
        return p.name === el.dataset.v;
      });
      if (!cp) return;
      if (S.care.length >= 30) {
        showToast('돌봄 항목은 30개까지예요');
        return;
      }
      if (
        S.care.some(function (c) {
          return c.name === cp.name;
        })
      ) {
        showToast('이미 등록한 항목이에요');
        return;
      }
      S.care.push({ id: uid(), kind: S.careKind || 'pet', name: cp.name, days: cp.days, last: Date.now() });
      save('mateon.care', S.care);
      render();
      scheduleSyncPush();
      showToast(cp.name + ' 돌봄을 시작했어요');
    } else if (act === 'care-add') {
      var cNm = document.getElementById('care-name'),
        cDs = document.getElementById('care-days');
      var cn2 = cNm ? cNm.value.trim().slice(0, 20) : '';
      var cd2 = cDs ? Math.round(+cDs.value) : 0;
      if (!cn2) {
        if (cNm) {
          markBad(cNm);
        }
        showToast('이름을 적어주세요');
        return;
      }
      if (!Number.isInteger(cd2) || cd2 < 1 || cd2 > 365) {
        if (cDs) {
          markBad(cDs);
        }
        showToast('주기는 1~365일이에요');
        return;
      }
      if (S.care.length >= 30) {
        showToast('돌봄 항목은 30개까지예요');
        return;
      }
      S.care.push({ id: uid(), kind: S.careKind || 'pet', name: cn2, days: cd2, last: Date.now() });
      save('mateon.care', S.care);
      render();
      scheduleSyncPush();
      showToast(cn2 + ' — ' + cd2 + '일마다 알려드릴게요');
    } else if (act === 'care-done') {
      var cDoneId = el.dataset.v;
      S.care.forEach(function (c) {
        if (c.id === cDoneId) c.last = Date.now();
      });
      save('mateon.care', S.care);
      render();
      scheduleSyncPush();
      buzz(30);
      showToast('돌봄 완료! 다음 차례를 다시 셌어요', { type: 'good' });
    } else if (act === 'care-del') {
      var cDelId = el.dataset.v;
      if (S.delArm2 !== 'care-del:' + cDelId) {
        S.delArm2 = 'care-del:' + cDelId;
        render();
        return;
      }
      S.delArm2 = null;
      S.care = S.care.filter(function (c) {
        return c.id !== cDelId;
      });
      save('mateon.care', S.care);
      render();
      scheduleSyncPush();
    }
    /* ---- 우리집 정보 메모 ---- */
    else if (act === 'memo-add') {
      var mT = document.getElementById('memo-title'),
        mX = document.getElementById('memo-text');
      var mti = mT ? mT.value.trim().slice(0, 20) : '';
      var mtx = mX ? mX.value.trim().slice(0, 200) : '';
      if (!mti) {
        if (mT) {
          markBad(mT);
        }
        showToast('제목을 적어주세요');
        return;
      }
      if (!mtx) {
        if (mX) {
          markBad(mX);
        }
        showToast('내용을 적어주세요');
        return;
      }
      if (S.memos.length >= 50) {
        showToast('메모는 50개까지예요');
        return;
      }
      var mTag = MEMO_TAGS.indexOf(S.memoTag) !== -1 ? S.memoTag : '일반';
      S.memos.push({ id: uid(), title: mti, text: mtx, tag: mTag, ts: Date.now() });
      save('mateon.memos', S.memos);
      render();
      scheduleSyncPush();
      showToast('우리집 정보를 저장했어요');
    } else if (act === 'memo-pin') {
      var mPin = S.memos.find(function (m) {
        return m.id === el.dataset.v;
      });
      if (!mPin) return;
      if (mPin.pin) delete mPin.pin;
      else mPin.pin = true;
      save('mateon.memos', S.memos);
      render();
      scheduleSyncPush();
    } else if (act === 'memo-tag') {
      S.memoTag = MEMO_TAGS.indexOf(el.dataset.v) !== -1 ? el.dataset.v : '일반';
      render();
    } else if (act === 'memo-filter') {
      S.memoFilter = el.dataset.v || '';
      render();
    } else if (act === 'memo-copy') {
      var mHit = S.memos.find(function (m) {
        return m.id === el.dataset.v;
      });
      if (mHit) copyText(mHit.title + ': ' + mHit.text, '복사했어요');
    } else if (act === 'memo-del') {
      var mDelId = el.dataset.v;
      if (S.delArm2 !== 'memo-del:' + mDelId) {
        S.delArm2 = 'memo-del:' + mDelId;
        render();
        return;
      }
      S.delArm2 = null;
      S.memos = S.memos.filter(function (m) {
        return m.id !== mDelId;
      });
      save('mateon.memos', S.memos);
      render();
      scheduleSyncPush();
    }
    /* ---- 애정 언어 미니퀴즈 ---- */
    else if (act === 'll-ans') {
      S.llQuiz = true;
      var llq = LOVE_LANG_Q[S.llStep || 0];
      if (!llq) {
        S.llStep = 0;
        render();
        return;
      }
      S.llScore = S.llScore || {};
      S.llScore[llq[el.dataset.v === 'a' ? 'a' : 'b'][1]] = (S.llScore[llq[el.dataset.v === 'a' ? 'a' : 'b'][1]] || 0) + 1;
      S.llStep = (S.llStep || 0) + 1;
      if (S.llStep >= LOVE_LANG_Q.length) {
        var best =
          Object.keys(S.llScore).sort(function (x, y) {
            return S.llScore[y] - S.llScore[x];
          })[0] || 'time';
        S.loveLang = { type: best, ts: Date.now() };
        save('mateon.loveLang', S.loveLang);
        S.llQuiz = false;
        S.llStep = 0;
        S.llScore = null;
        showToast('내 애정 언어는 "' + LOVE_LANGS[best] + '"예요 💝', { type: 'good' });
        render();
        scheduleSyncPush();
      } else render();
    } else if (act === 'll-retake') {
      S.llQuiz = true;
      S.llStep = 0;
      S.llScore = null;
      render();
    } else if (act === 'year-copy') {
      var yy = new Date().getFullYear();
      var yF = new Date(yy, 0, 1).getTime();
      var yE = S.expenses.filter(function (x) {
        return x.ts >= yF && !x.income;
      });
      var yC = S.checkins.filter(function (c) {
        return c.ts >= yF;
      }).length;
      var yCh = 0;
      Object.keys(S.choreLog).forEach(function (k) {
        Object.keys(S.choreLog[k]).forEach(function (id) {
          if (S.choreLog[k][id].ts >= yF) yCh++;
        });
      });
      copyText(
        '[MATE:ON ' +
          yy +
          '년 회고]\n함께 쓴 돈 ' +
          ML.fmtWon(
            yE.reduce(function (a, x) {
              return a + x.amount;
            }, 0)
          ) +
          '\n체크인 ' +
          yC +
          '회 · 집안일 ' +
          yCh +
          '회 완료\n배지 ' +
          S.badges.length +
          '개 획득',
        yy + '년 회고를 복사했어요'
      );
    } else if (act === 'album-open') {
      openAlbum();
    }
    /* ---- 결정 룰렛 ---- */
    else if (act === 'roulette-add') {
      var rIn = document.getElementById('roulette-in');
      var rT = rIn ? rIn.value.trim().slice(0, 20) : '';
      if (!rT) {
        if (rIn) {
          markBad(rIn);
        }
        showToast('후보를 적어주세요');
        return;
      }
      if (S.roulette.opts.indexOf(rT) >= 0) {
        showToast('이미 있는 후보예요');
        return;
      }
      if (S.roulette.opts.length >= 20) {
        showToast('후보는 20개까지예요');
        return;
      }
      S.roulette.opts.push(rT);
      save('mateon.roulette', S.roulette);
      render();
      var rIn2 = document.getElementById('roulette-in');
      if (rIn2) rIn2.focus();
    } else if (act === 'roulette-del-opt') {
      S.roulette.opts.splice(+el.dataset.v, 1);
      save('mateon.roulette', S.roulette);
      render();
    } else if (act === 'roulette-spin') {
      var opts2 = S.roulette.opts;
      if (opts2.length < 2) return;
      var pick = opts2[Math.floor(Math.random() * opts2.length)];
      S.roulette.last = pick;
      S.roulette.lastKind = 'spin';
      save('mateon.roulette', S.roulette);
      render();
      buzz([20, 40, 60]);
      showToast('🎯 ' + pick + '(으)로 결정!');
    } else if (act === 'roulette-coin') {
      var face = Math.random() < 0.5 ? '앞면' : '뒷면';
      S.roulette.last = face;
      S.roulette.lastKind = 'coin';
      save('mateon.roulette', S.roulette);
      render();
      buzz(30);
      showToast('🪙 ' + face + '이 나왔어요');
    }
    /* ---- 빌려준 돈 ---- */
    else if (act === 'debt-dir') {
      S.debtDir = el.dataset.v;
      render();
    } else if (act === 'debt-add') {
      var dMemo = document.getElementById('debt-memo'),
        dAmt = document.getElementById('debt-amt');
      var dm = dMemo ? dMemo.value.trim().slice(0, 30) : '';
      var da = dAmt ? Math.round(+String(dAmt.value).replace(/[^\d.]/g, '') || 0) : 0;
      if (!da || da <= 0 || da > 100000000) {
        if (dAmt) {
          markBad(dAmt);
        }
        showToast('금액을 확인해 주세요');
        return;
      }
      if (
        S.debts.filter(function (d) {
          return !d.repaidTs;
        }).length >= 50
      ) {
        showToast('기록이 너무 많아요. 갚은 건 정리해 주세요');
        return;
      }
      S.debts.push({ id: uid(), dir: S.debtDir === 'borrowed' ? 'borrowed' : 'lent', amount: da, memo: dm, ts: Date.now() });
      save('mateon.debts', S.debts);
      render();
      scheduleSyncPush();
      showToast('기록했어요');
    } else if (act === 'debt-done') {
      var dId = el.dataset.v;
      S.debts.forEach(function (d) {
        if (d.id === dId) d.repaidTs = Date.now();
      });
      save('mateon.debts', S.debts);
      render();
      scheduleSyncPush();
      showToast('갚은 걸로 처리했어요', { type: 'good' });
    } else if (act === 'debt-del') {
      var ddId = el.dataset.v;
      if (S.delArm2 !== 'debt-del:' + ddId) {
        S.delArm2 = 'debt-del:' + ddId;
        render();
        return;
      }
      S.delArm2 = null;
      S.debts = S.debts.filter(function (d) {
        return d.id !== ddId;
      });
      save('mateon.debts', S.debts);
      render();
      scheduleSyncPush();
    }
    /* 분할 비율 퀵 칩 — 소비자가 한쪽뿐인 지출을 한 탭에 */
    else if (act === 'exp-share-qc') {
      var qc = document.getElementById('exp-share');
      if (qc) qc.value = el.dataset.v;
      S.expShare = el.dataset.v;
    } else if (act === 'ci-reply-add') {
      var rpIn = document.getElementById('ci-reply-in');
      var rpT = rpIn ? rpIn.value.trim().slice(0, 100) : '';
      if (!rpT) {
        if (rpIn) {
          markBad(rpIn);
        }
        showToast('답장을 적어주세요');
        return;
      }
      var wk3 = isoWeekKey();
      (S.ciReplies[wk3] = S.ciReplies[wk3] || []).push({ text: rpT, ts: Date.now() });
      if (S.ciReplies[wk3].length > 20) S.ciReplies[wk3] = S.ciReplies[wk3].slice(-20);
      save('mateon.ciReplies', S.ciReplies);
      render();
      scheduleSyncPush();
      showToast('답장을 남겼어요 💌', { type: 'good' });
    } else if (act === 'ci-reply-del') {
      var rpParts = el.dataset.v.split(':');
      var rpw = rpParts[0],
        rpi = +rpParts[1];
      if (S.delArm2 !== 'ci-reply-del:' + el.dataset.v) {
        S.delArm2 = 'ci-reply-del:' + el.dataset.v;
        render();
        return;
      }
      S.delArm2 = null;
      if (S.ciReplies[rpw]) {
        S.ciReplies[rpw].splice(rpi, 1);
        if (!S.ciReplies[rpw].length) delete S.ciReplies[rpw];
      }
      save('mateon.ciReplies', S.ciReplies);
      render();
      scheduleSyncPush();
    }
    /* ---- 앱 잠금 ---- */
    else if (act === 'lock-set') {
      var lpIn = document.getElementById('lock-pin-new');
      var lp = lpIn ? lpIn.value.trim() : '';
      if (!/^\d{4,8}$/.test(lp)) {
        if (lpIn) {
          markBad(lpIn);
        }
        showToast('PIN은 숫자 4~8자리로 해주세요');
        return;
      }
      var salt = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      pinHash(lp, salt).then(function (hash) {
        S.lock = { hash: hash, salt: salt };
        save('mateon.lock', S.lock);
        render();
        showToast('잠금을 설정했어요. 앱을 열 때 PIN을 물어봐요', { type: 'good' });
      });
    } else if (act === 'lock-off') {
      if (S.delArm2 !== 'lock-off') {
        S.delArm2 = 'lock-off';
        showToast('한 번 더 누르면 잠금을 해제해요');
        return;
      }
      S.delArm2 = null;
      S.lock = null;
      S.locked = false;
      save('mateon.lock', null);
      render();
      showToast('잠금을 해제했어요');
    } else if (act === 'bio-add') {
      if (S.lock && bioAvailable()) bioRegister();
    } else if (act === 'bio-del') {
      if (S.lock) {
        delete S.lock.cred;
        save('mateon.lock', S.lock);
        render();
        showToast('생체 인증을 해제했어요');
      }
    } else if (act === 'bio-unlock') {
      bioUnlock();
    } else if (act === 'conflict-open') {
      openConflict();
    } else if (act === 'err-copy') {
      var errs = load('mateon.errors') || [];
      copyText(
        errs
          .map(function (x) {
            return new Date(x.ts).toISOString() + ' ' + x.msg;
          })
          .join('\n'),
        '오류 기록을 복사했어요'
      );
    } else if (act === 'err-clear') {
      remove('mateon.errors');
      render();
      showToast('오류 기록을 지웠어요');
    }
    /* ---- 휴지통 ---- */
    else if (act === 'trash-restore') {
      var tr = S.trash.find(function (t) {
        return t.id === el.dataset.v;
      });
      if (!tr) return;
      var MAP = { exp: 'expenses', ev: 'events', shop: 'shopping' };
      var arr = MAP[tr.k] ? S[MAP[tr.k]] : null;
      if (
        arr &&
        !arr.some(function (x) {
          return x.id === tr.item.id;
        })
      ) {
        arr.push(tr.item);
        save('mateon.' + MAP[tr.k], arr);
      }
      S.trash = S.trash.filter(function (t) {
        return t.id !== tr.id;
      });
      save('mateon.trash', S.trash);
      render();
      scheduleSyncPush();
      showToast('복원했어요', { type: 'good' });
    } else if (act === 'trash-del') {
      var tid = el.dataset.v;
      if (S.delArm2 !== 'trash-del:' + tid) {
        S.delArm2 = 'trash-del:' + tid;
        render();
        return;
      }
      S.delArm2 = null;
      var trd = S.trash.find(function (t) {
        return t.id === tid;
      });
      if (trd && trd.k === 'exp' && trd.item && trd.item.rcpt) rcptDel(trd.item.id);
      S.trash = S.trash.filter(function (t) {
        return t.id !== tid;
      });
      save('mateon.trash', S.trash);
      render();
    } else if (act === 'trash-empty') {
      if (S.delArm2 !== 'trash-empty') {
        S.delArm2 = 'trash-empty';
        render();
        return;
      }
      S.delArm2 = null;
      S.trash.forEach(function (t) {
        if (t.k === 'exp' && t.item && t.item.rcpt) rcptDel(t.item.id);
      });
      S.trash = [];
      save('mateon.trash', S.trash);
      render();
      showToast('휴지통을 비웠어요');
    }
    /* ---- 자동 스냅샷 복원 ---- */
    else if (act === 'snap-restore') {
      var sts = Number(el.dataset.v);
      if (S.delArm2 !== 'snap-restore:' + sts) {
        S.delArm2 = 'snap-restore:' + sts;
        showToast('한 번 더 누르면 그 시점으로 되돌아가요');
        return;
      }
      S.delArm2 = null;
      var snap = S.snapshots.find(function (s2) {
        return s2.ts === sts;
      });
      if (!snap || !snap.data) return;
      if (applyBackupData(snap.data)) {
        render();
        showToast('스냅샷을 복원했어요', { type: 'good' });
      } else showToast('스냅샷 데이터가 올바르지 않아요');
    } else if (act === 'lock-unlock') {
      var luIn = document.getElementById('lock-pin');
      var lu = luIn ? luIn.value.trim() : '';
      if (!lu || !S.lock) return;
      /* 5회 연속 실패 시 지수 백오프 — 30초·1분·2분… 최대 15분 */
      if (S.lock.until && S.lock.until > Date.now()) {
        showToast(Math.ceil((S.lock.until - Date.now()) / 60000) + '분 뒤에 다시 시도해 주세요');
        return;
      }
      pinHash(lu, S.lock.salt).then(function (hash) {
        if (hash === S.lock.hash) {
          S.locked = false;
          S.lock.tries = 0;
          delete S.lock.until;
          save('mateon.lock', S.lock);
          render();
        } else {
          S.lock.tries = (S.lock.tries || 0) + 1;
          if (S.lock.tries >= 5) {
            var back = Math.min(15 * 60, 30 * Math.pow(2, S.lock.tries - 5)) * 1000;
            S.lock.until = Date.now() + back;
            save('mateon.lock', S.lock);
            showToast(Math.ceil(back / 60000) + '분 동안 잠겼어요');
            render();
            return;
          }
          save('mateon.lock', S.lock);
          if (luIn) {
            markBad(luIn);
          }
          showToast('PIN이 달라요 (' + S.lock.tries + '/5)');
        }
      });
    }
    /* ---- 데모 모드 ---- */
    else if (act === 'demo-start') {
      demoStart();
    } else if (act === 'demo-end') {
      demoEnd();
    }
    /* ---- 전역 검색 ---- */
    else if (act === 'search-open') {
      S.searchOpen = true;
      render();
      var gq = document.getElementById('gs-q');
      if (gq) gq.focus();
    } else if (act === 'search-close') {
      S.searchOpen = false;
      render();
    }
    /* ---- 알림 센터 ---- */
    else if (act === 'notif-open') {
      S.notifOpen = true;
      render();
    } else if (act === 'notif-close') {
      S.notifOpen = false;
      S.notifReadTs = Date.now();
      save('mateon.notifRead', S.notifReadTs);
      render();
    } else if (act === 'notif-clear') {
      S.notifs = [];
      save('mateon.notifs', S.notifs);
      S.notifReadTs = Date.now();
      save('mateon.notifRead', S.notifReadTs);
      render();
    } else if (act === 'notif-go' || act === 'notif-read') {
      var nf = (S.notifs || []).find(function (n) {
        return n.id === el.dataset.v;
      });
      S.notifOpen = false;
      S.notifReadTs = Date.now();
      save('mateon.notifRead', S.notifReadTs);
      if (nf && nf.route) {
        go(nf.route);
        return;
      }
      render();
    }
    /* ---- 인앱 리뷰 프롬프트 ---- */
    else if (act === 'rate-yes') {
      S.rate.state = 'done';
      S.rate.lastAsk = Date.now();
      save('mateon.rate', S.rate);
      var storeUrl =
        window.MateNative && window.MateNative.isNative
          ? 'market://details?id=io.github.gyeongbin38.mateon'
          : 'https://play.google.com/store/apps/details?id=io.github.gyeongbin38.mateon';
      try {
        window.open(storeUrl, '_system');
      } catch (e) {
        window.open(storeUrl, '_blank');
      }
      showToast('고마워요! 💛', { type: 'good' });
      render();
    } else if (act === 'rate-nope') {
      S.rate.fbOpen = true;
      render();
      setTimeout(function () {
        var fb = document.getElementById('rate-fb');
        if (fb) fb.focus();
      }, 50);
    } else if (act === 'rate-fb-send') {
      var fbIn = /** @type {HTMLInputElement} */ (document.getElementById('rate-fb'));
      var fbTxt = fbIn && fbIn.value.trim();
      if (fbTxt) {
        var fbErrs = load('mateon.errors') || [];
        fbErrs.unshift({ ts: Date.now(), msg: '피드백: ' + fbTxt.slice(0, 200) });
        save('mateon.errors', fbErrs.slice(0, 20));
        showToast('의견 고마워요 — 다음 업데이트에 반영할게요', { type: 'good' });
      }
      S.rate.state = 'done';
      S.rate.fbOpen = false;
      S.rate.lastAsk = Date.now();
      save('mateon.rate', S.rate);
      render();
    } else if (act === 'rate-later') {
      S.rate.state = 'later';
      S.rate.lastAsk = Date.now();
      save('mateon.rate', S.rate);
      render();
    } else if (act === 'rate-never') {
      S.rate.state = 'never';
      S.rate.lastAsk = Date.now();
      save('mateon.rate', S.rate);
      render();
    } else if (act === 'gs-go') {
      S.searchOpen = false;
      if (el.dataset.v === 'settle' && S.expQuery === undefined) S.expQuery = '';
      go(el.dataset.v);
    } else if (act === 'print') {
      if (window.print) window.print();
    }
    /* ---- 홈 위젯 편집 ---- */
    else if (act === 'widget-move' || act === 'widget-toggle') {
      var wl = widgetOrder().slice();
      if (act === 'widget-move') {
        var wv = el.dataset.v.split(':');
        var wi2 = +wv[0],
          wd = +wv[1];
        var wj = wi2 + wd;
        if (wj < 0 || wj >= wl.length) return;
        var tmp = wl[wi2];
        wl[wi2] = wl[wj];
        wl[wj] = tmp;
      } else {
        var wt = +el.dataset.v;
        wl[wt] = wl[wt].indexOf('off:') === 0 ? wl[wt].slice(4) : 'off:' + wl[wt];
      }
      S.homeWidgets = wl;
      save('mateon.homeWidgets', wl);
      render();
      scheduleSyncPush();
    }
    /* ---- 러브맵 퀴즈 ---- */
    else if (act === 'lm-know' || act === 'lm-dont' || act === 'lm-skip') {
      var lm = S.lovemap;
      lm.wrong = lm.wrong || [];
      if (S.lmReview && lm.wrong.length) {
        /* 복습 모드: wrong 큐를 소비한다 */
        if (act === 'lm-know') {
          lm.known++;
          lm.asked++;
          lm.wrong.shift();
        } else if (act === 'lm-dont') {
          lm.asked++;
          var w0 = lm.wrong.shift();
          lm.wrong.push(w0);
        } else lm.wrong.push(lm.wrong.shift());
        if (!lm.wrong.length) {
          S.lmReview = false;
          showToast('복습 완료! 이제 다 알아요', { type: 'good' });
          buzz(40);
        }
      } else {
        lm.asked++;
        if (act === 'lm-know') {
          lm.known++;
          var wi = lm.wrong.indexOf(lm.idx);
          if (wi >= 0) lm.wrong.splice(wi, 1);
        } else if (act === 'lm-dont' && lm.wrong.indexOf(lm.idx) < 0) lm.wrong.push(lm.idx);
        lm.askedIdx = lm.askedIdx || [];
        lm.askedIdx.push(lm.idx);
        var lmTotal = lmPool().length;
        if (lm.asked >= lmTotal) {
          lm.idx = 0;
          lm.rounds = (lm.rounds || 0) + 1;
          var acc = Math.round((lm.known / lm.asked) * 100);
          lm.best = Math.max(lm.best || 0, acc);
        } else {
          do {
            lm.idx = (lm.idx + 1) % lmTotal;
          } while (lm.askedIdx.indexOf(lm.idx) !== -1);
        }
        if (act === 'lm-know') showToast('서로를 잘 알고 있네요!');
      }
      lovemapSave();
      render();
    } else if (act === 'lmq-add') {
      var lqIn = document.getElementById('lmq-in');
      var lqText = lqIn ? lqIn.value.trim() : '';
      if (!lqText) {
        if (lqIn) {
          markBad(lqIn);
        }
        showToast('질문을 적어주세요');
        return;
      }
      if (S.lmCustom.length >= 30) {
        showToast('직접 질문은 30개까지예요');
        return;
      }
      S.lmCustom.push(lqText.slice(0, 80));
      save('mateon.lmCustom', S.lmCustom);
      showToast('우리 질문을 풀에 넣었어요');
      render();
      scheduleSyncPush();
    } else if (act === 'lmq-del') {
      var lqi = +el.dataset.v;
      if (S.delArm2 !== 'lmq-del:' + lqi) {
        S.delArm2 = 'lmq-del:' + lqi;
        render();
        return;
      }
      S.delArm2 = null;
      /* 통합 풀에서의 인덱스 — 나간 인덱스는 askedIdx/wrong에서도 정리 */
      var poolIdx = LOVE_MAP_QUESTIONS.length + lqi;
      S.lmCustom.splice(lqi, 1);
      save('mateon.lmCustom', S.lmCustom);
      var lm2 = S.lovemap;
      lm2.askedIdx = (lm2.askedIdx || []).filter(function (i) {
        return i !== poolIdx;
      });
      lm2.wrong = (lm2.wrong || []).filter(function (i) {
        return i !== poolIdx;
      });
      lovemapSave();
      render();
      scheduleSyncPush();
    } else if (act === 'lm-review') {
      S.lmReview = true;
      render();
    } else if (act === 'lm-review-off') {
      S.lmReview = false;
      render();
    } else if (act === 'lm-reset') {
      S.lovemap = { idx: 0, known: 0, asked: 0, askedIdx: [], wrong: [] };
      S.lmReview = false;
      lovemapSave();
      render();
      showToast('러브맵을 처음부터 다시 시작해요');
    } else if (act === 'fab-menu') {
      S.fabOpen = !S.fabOpen;
      render();
    } else if (act === 'app-install') {
      var p = S.installPrompt;
      if (p && p.prompt) {
        p.prompt();
        S.installPrompt = null;
        render();
      } else showToast('브라우저 메뉴에서 "홈 화면에 추가"를 눌러주세요');
    } else if (act === 'mission-add') {
      var min = document.getElementById('mission-in');
      var mtext = min ? min.value.trim().slice(0, 30) : '';
      if (!mtext) {
        if (min) {
          markBad(min);
        }
        showToast('미션 내용을 적어주세요');
        return;
      }
      if (S.missions.list.length >= 5) {
        showToast('미션은 한 주에 5개까지예요');
        return;
      }
      if (
        S.missions.list.some(function (m) {
          return m.text === mtext;
        })
      ) {
        showToast('이미 있는 미션이에요');
        return;
      }
      S.missions.list.push({ id: 'mc-' + uid(), text: mtext, cat: '직접', done: false });
      save('mateon.missions', S.missions);
      render();
      showToast('우리만의 미션을 추가했어요');
      scheduleSyncPush();
    } else if (act === 'mission-done') {
      var mid = el.dataset.v;
      var allDone = false;
      S.missions.list.forEach(function (m) {
        if (m.id === mid) m.done = !m.done;
      });
      allDone =
        S.missions.list.length > 0 &&
        S.missions.list.every(function (m) {
          return m.done;
        });
      save('mateon.missions', S.missions);
      render();
      scheduleSyncPush();
      var midHit = S.missions.list.find(function (m) {
        return m.id === mid;
      });
      if (midHit && midHit.done) buzz(30);
      if (allDone) {
        showToast('🎉 이번 주 미션 전부 완료!', { type: 'good' });
        pushNotif('🎉', '이번 주 미션을 전부 완료했어요', 'space');
      } else if (midHit && midHit.done) showToast('미션 완료!');
    }
    /* ---- 역할 분담 ---- */
    else if (act === 'chore-add') {
      var cInEl = document.getElementById('chore-in');
      var cname = cInEl ? cInEl.value.trim() : '';
      if (!cname) {
        if (cInEl) {
          markBad(cInEl);
        }
        showToast('집안일 이름을 적어주세요');
        return;
      }
      if (cname.length > 16) cname = cname.slice(0, 16);
      var ch = choreState();
      if (ch.items.length >= 30) {
        showToast('집안일은 최대 30개까지 추가할 수 있어요');
        return;
      }
      if (
        ch.items.some(function (it) {
          return it.name === cname;
        })
      ) {
        showToast('이미 있는 항목이에요');
        return;
      }
      var newCh = { id: uid(), name: cname };
      if ((S.choreDays || []).length && S.choreDays.length < 7) newCh.days = S.choreDays.slice().sort();
      ch.items.push(newCh);
      ch.rot.push(ch.items.length % 2);
      S.choreDays = [];
      saveChores();
      showToast(newCh.days ? '요일을 정해서 추가했어요' : '집안일을 추가했어요');
      render();
      scheduleSyncPush();
    } else if (act === 'chore-day-pick') {
      var dpick = +el.dataset.v;
      S.choreDays = S.choreDays || [];
      var dpi = S.choreDays.indexOf(dpick);
      if (dpi >= 0) S.choreDays.splice(dpi, 1);
      else S.choreDays.push(dpick);
      render();
    } else if (act === 'chore-days') {
      var cdid = el.dataset.v;
      var chd = choreState();
      chd.items.forEach(function (it) {
        if (it.id === cdid) delete it.days;
      });
      saveChores();
      showToast('매일 하는 일로 바꿨어요');
      render();
      scheduleSyncPush();
    } else if (act === 'chore-preset') {
      var ch2 = choreState();
      var pname = el.dataset.v;
      if (
        ch2.items.length >= 30 ||
        ch2.items.some(function (it) {
          return it.name === pname;
        })
      )
        return;
      ch2.items.push({ id: uid(), name: pname });
      ch2.rot.push(ch2.items.length % 2);
      saveChores();
      render();
      scheduleSyncPush();
    } else if (act === 'chore-del') {
      var cid = el.dataset.v;
      if (S.delArm2 !== 'chore-del:' + cid) {
        S.delArm2 = 'chore-del:' + cid;
        render();
        return;
      }
      S.delArm2 = null;
      var ch3 = choreState();
      var cIdx = ch3.items.findIndex(function (it) {
        return it.id === cid;
      });
      if (cIdx >= 0) {
        ch3.items.splice(cIdx, 1);
        ch3.rot.splice(cIdx, 1);
      }
      saveChores();
      render();
      scheduleSyncPush();
    } else if (act === 'chore-freq') {
      var cfid = el.dataset.v;
      var chf = choreState();
      chf.items.forEach(function (it) {
        if (it.id === cfid) it.freq = it.freq === 'bw' ? 'w' : 'bw';
      });
      saveChores();
      render();
      scheduleSyncPush();
    } else if (act === 'chore-proof') {
      /* 인증샷 첨부 — 완료한 집안일에 사진을 붙인다 (IndexedDB, 백업 제외) */
      var pf = document.getElementById('chore-proof-file');
      if (!pf) return;
      S.proofTarget = el.dataset.v;
      pf.click();
    } else if (act === 'chore-proof-view') {
      showReceipt('proof:' + isoWeekKey() + ':' + el.dataset.v);
    } else if (act === 'chore-done') {
      var chid = el.dataset.v;
      var wk = isoWeekKey();
      if (!S.choreLog[wk]) S.choreLog[wk] = {};
      var cur = S.choreLog[wk][chid];
      if (cur) {
        delete S.choreLog[wk][chid];
      } else {
        S.choreLog[wk][chid] = { ts: Date.now(), by: 'me' };
        buzz(20);
        showToast('잘했어요! 완료로 기록했어요', { type: 'good' });
      }
      save('mateon.choreLog', S.choreLog);
      render();
    }
    /* ---- 우리 일정 ---- */
    else if (act === 'ev-who') {
      S.evWho = el.dataset.v;
      render();
    } else if (act === 'cal-day') {
      S.calDay = el.dataset.v;
      render();
    } else if (act === 'cal-view') {
      S.calView = el.dataset.v === 'w' ? 'w' : 'm';
      render();
    } else if (act === 'cal-week') {
      var woff = (parseInt(el.dataset.v, 10) || 0) * 7;
      var wcur = new Date((S.calDay || dateStr(Date.now())) + 'T12:00:00');
      wcur.setDate(wcur.getDate() + woff);
      S.calDay = dateStr(wcur.getTime());
      S.calMonth = S.calDay.slice(0, 7);
      render();
    } else if (act === 'cal-today') {
      var t0 = dateStr(Date.now());
      S.calMonth = t0.slice(0, 7);
      S.calDay = t0;
      render();
    } else if (act === 'cal-add-day') {
      /* 선택한 날짜로 폼을 채우고 폼으로 스크롤 */
      render();
      var fd = document.getElementById('ev-date'),
        ft = document.getElementById('ev-title');
      if (fd) fd.value = S.calDay;
      if (ft) {
        ft.focus();
        ft.scrollIntoView({ block: 'center' });
      }
    } else if (act === 'ev-edit') {
      var eer = S.events.find(function (e) {
        return e.id === el.dataset.v;
      });
      if (!eer) return;
      S.evEditId = eer.id;
      S.evWho = eer.who || 'both';
      render();
      var et0 = document.getElementById('ev-title');
      if (et0) {
        et0.focus();
        et0.scrollIntoView({ block: 'center' });
      }
    } else if (act === 'ev-tpl') {
      var tpl = EV_TEMPLATES[+el.dataset.v];
      if (!tpl) return;
      S.evDraft = { title: tpl.title, memo: tpl.memo, rem: tpl.rem };
      S.evEditId = null;
      render();
      var edt = document.getElementById('ev-date');
      if (edt) {
        edt.focus();
        edt.scrollIntoView({ block: 'center' });
      }
    } else if (act === 'ev-edit-cancel') {
      S.evEditId = null;
      S.evDraft = null;
      render();
    } else if (act === 'ev-add') {
      var edEl = document.getElementById('ev-date'),
        etEl = document.getElementById('ev-title'),
        emEl = document.getElementById('ev-memo'),
        erEl = document.getElementById('ev-rpt');
      var tmEl = document.getElementById('ev-time'),
        unEl = document.getElementById('ev-until');
      var edate = edEl ? edEl.value : '';
      var etitle = etEl ? etEl.value.trim() : '';
      var ememo = emEl ? emEl.value.trim() : '';
      var erpt = erEl && erEl.checked ? 'w' : null;
      var etime = tmEl && /^\d{2}:\d{2}$/.test(tmEl.value) ? tmEl.value : null;
      var euntil = unEl && /^\d{4}-\d{2}-\d{2}$/.test(unEl.value) && unEl.value >= edate ? unEl.value : null;
      var remEl = document.getElementById('ev-rem');
      var erem = remEl ? +remEl.value || 0 : 0;
      if ([0, 60, 180, 1440, 4320].indexOf(erem) < 0) erem = 0;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(edate)) {
        if (edEl) {
          markBad(edEl);
        }
        showToast('날짜를 선택해 주세요');
        return;
      }
      if (!etitle) {
        if (etEl) {
          markBad(etEl);
        }
        showToast('일정 제목을 적어주세요');
        return;
      }
      var evEditRec = S.evEditId
        ? S.events.find(function (e) {
            return e.id === S.evEditId;
          })
        : null;
      if (evEditRec) {
        evEditRec.date = edate;
        evEditRec.title = etitle.slice(0, 30);
        evEditRec.memo = ememo.slice(0, 60);
        evEditRec.who = S.evWho;
        if (etime) evEditRec.time = etime;
        else delete evEditRec.time;
        if (erpt) evEditRec.rpt = 'w';
        else delete evEditRec.rpt;
        if (euntil) evEditRec.until = euntil;
        else delete evEditRec.until;
        if (erem) evEditRec.rem = erem;
        else delete evEditRec.rem;
        S.evEditId = null;
        save('mateon.events', S.events);
        showToast('일정을 수정했어요');
        render();
        scheduleSyncPush();
        syncEventReminders();
        return;
      }
      if (S.events.length >= 300) {
        showToast('일정은 최대 300개까지 등록할 수 있어요');
        return;
      }
      var newEv = { id: uid(), date: edate, title: etitle.slice(0, 30), memo: ememo.slice(0, 60), who: S.evWho };
      if (etime) newEv.time = etime;
      if (erpt) newEv.rpt = 'w';
      if (euntil) newEv.until = euntil;
      if (erem) newEv.rem = erem;
      S.events.push(newEv);
      save('mateon.events', S.events);
      S.evDraft = null;
      showToast(erpt ? '매주 반복 일정을 추가했어요' : erem ? '일정과 알림을 설정했어요' : '일정을 추가했어요');
      render();
      scheduleSyncPush();
      syncEventReminders();
    } else if (act === 'cal-month') {
      var off = parseInt(el.dataset.v, 10) || 0;
      var cm = (S.calMonth || dateStr(Date.now()).slice(0, 7)).split('-').map(Number);
      var nd = new Date(cm[0], cm[1] - 1 + off, 1);
      S.calMonth = nd.getFullYear() + '-' + p2(nd.getMonth() + 1);
      render();
    } else if (act === 'anniv-add') {
      var atEl = document.getElementById('anniv-title'),
        adEl = document.getElementById('anniv-date');
      var atitle = atEl ? atEl.value.trim() : '';
      var adate = adEl ? adEl.value : '';
      if (!atitle) {
        if (atEl) {
          markBad(atEl);
        }
        showToast('기념일 이름을 적어주세요');
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(adate)) {
        showToast('기념일 날짜를 선택해 주세요');
        return;
      }
      if (S.anniv.length >= 30) {
        showToast('기념일은 최대 30개까지 등록할 수 있어요');
        return;
      }
      S.anniv.push({ id: uid(), title: atitle.slice(0, 20), date: adate });
      save('mateon.anniv', S.anniv);
      showToast('기념일을 등록했어요');
      render();
      scheduleSyncPush();
    } else if (act === 'anniv-del') {
      var aid = el.dataset.v;
      if (S.delArm2 !== 'anniv-del:' + aid) {
        S.delArm2 = 'anniv-del:' + aid;
        render();
        return;
      }
      S.delArm2 = null;
      S.anniv = S.anniv.filter(function (a2) {
        return a2.id !== aid;
      });
      save('mateon.anniv', S.anniv);
      render();
      scheduleSyncPush();
    } else if (act === 'ev-del') {
      var evid = el.dataset.v;
      if (S.delArm2 !== 'ev-del:' + evid) {
        S.delArm2 = 'ev-del:' + evid;
        render();
        return;
      }
      S.delArm2 = null;
      var evDel = S.events.find(function (e2) {
        return e2.id === evid;
      });
      if (evDel) toTrash('ev', (evDel.title || '일정') + ' ' + (evDel.date || ''), evDel);
      S.events = S.events.filter(function (e2) {
        return e2.id !== evid;
      });
      save('mateon.events', S.events);
      syncEventReminders();
      if (evDel) {
        showToast('일정을 삭제했어요', {
          action: {
            label: '되돌리기',
            fn: function () {
              S.events.push(evDel);
              save('mateon.events', S.events);
              render();
              scheduleSyncPush();
            },
          },
        });
      }
      render();
      scheduleSyncPush();
    } else if (act === 'anniv-ics') {
      var anv = S.anniv.find(function (x) {
        return x.id === el.dataset.v;
      });
      if (!anv) return;
      var aics = ML.buildICS({ id: 'anniv-' + anv.id, date: anv.date, title: anv.title + ' (기념일)' }, { yearly: true });
      var ablob = new Blob([aics], { type: 'text/calendar;charset=utf-8' });
      var aa = document.createElement('a');
      aa.href = URL.createObjectURL(ablob);
      aa.download = 'mateon-anniv.ics';
      aa.click();
      setTimeout(function () {
        URL.revokeObjectURL(aa.href);
      }, 1000);
      showToast('기념일 캘린더 파일을 내려받았어요');
    } else if (act === 'ev-ics') {
      var ev = S.events.find(function (x) {
        return x.id === el.dataset.v;
      });
      if (!ev) return;
      var ics = ML.buildICS({ id: 'ev-' + ev.id, date: ev.date, title: ev.title + ' (MATE:ON)', memo: ev.memo, rpt: ev.rpt });
      var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'mateon-event.ics';
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(a.href);
      }, 1000);
      showToast('캘린더 파일이 다운로드됐어요');
    }
    /* ---- 주간 체크인 ---- */
    else if (act === 'ci-mood') {
      var wkk = isoWeekKey();
      var ciCur = thisCheckin();
      if (!ciCur) {
        ciCur = { week: wkk, mood: 0, kept: [], fix: '', ts: Date.now() };
        S.checkins.push(ciCur);
      }
      ciCur.mood = +el.dataset.v;
      ciCur.ts = Date.now();
      if (S.checkins.length > 60) S.checkins = S.checkins.slice(-60);
      save('mateon.checkins', S.checkins);
      render();
    } else if (act === 'ci-kept') {
      var wkk2 = isoWeekKey();
      var cur2 = thisCheckin();
      if (!cur2) {
        cur2 = { week: wkk2, mood: 0, kept: [], fix: '', ts: Date.now() };
        S.checkins.push(cur2);
      }
      var ki = +el.dataset.v;
      var pos = cur2.kept.indexOf(ki);
      if (pos >= 0) cur2.kept.splice(pos, 1);
      else cur2.kept.push(ki);
      save('mateon.checkins', S.checkins);
      render();
    } else if (act === 'ci-save') {
      var cur3 = thisCheckin();
      var fixEl = document.getElementById('ci-fix');
      var fixVal = fixEl ? fixEl.value.trim().slice(0, 80) : '';
      var thxEl = document.getElementById('ci-thanks');
      var thxVal = thxEl ? thxEl.value.trim().slice(0, 60) : '';
      if (!cur3) {
        showToast('이번 주 기분을 먼저 골라주세요');
        return;
      }
      if (!cur3.mood) {
        showToast('이번 주 기분을 먼저 골라주세요');
        return;
      }
      cur3.fix = fixVal;
      cur3.thanks = thxVal;
      cur3.ts = Date.now();
      /* 커스텀 질문 답변 — 빈 답은 저장하지 않는다 */
      var custom = {};
      document.querySelectorAll('.ciq-in').forEach(function (inp) {
        var v = inp.value.trim().slice(0, 80);
        if (v && inp.dataset.q) custom[inp.dataset.q] = v;
      });
      if (Object.keys(custom).length) cur3.custom = custom;
      else delete cur3.custom;
      save('mateon.checkins', S.checkins);
      showToast('이번 주 체크인을 저장했어요');
      render();
      scheduleSyncPush();
    } else if (act === 'ciq-add') {
      var cqIn = document.getElementById('ciq-in');
      var cqText = cqIn ? cqIn.value.trim() : '';
      if (!cqText) {
        if (cqIn) {
          markBad(cqIn);
        }
        showToast('질문을 적어주세요');
        return;
      }
      if (S.ciQuestions.length >= 10) {
        showToast('질문은 최대 10개까지 만들 수 있어요');
        return;
      }
      S.ciQuestions.push({ id: uid(), q: cqText.slice(0, 40) });
      save('mateon.ciQuestions', S.ciQuestions);
      showToast('질문을 추가했어요');
      render();
      scheduleSyncPush();
    } else if (act === 'ciq-del') {
      var qid = el.dataset.v;
      if (S.delArm2 !== 'ciq-del:' + qid) {
        S.delArm2 = 'ciq-del:' + qid;
        render();
        return;
      }
      S.delArm2 = null;
      S.ciQuestions = S.ciQuestions.filter(function (cq) {
        return cq.id !== qid;
      });
      save('mateon.ciQuestions', S.ciQuestions);
      render();
      scheduleSyncPush();
    }
    /* ---- 갈등 가이드 ---- */
    else if (act === 'cg-domain') {
      S.cgDomain = el.dataset.v;
      render();
    } else if (act === 'cg-next') {
      S.cgStep = Math.min(3, S.cgStep + 1);
      S.cgStart = null;
      render();
    } else if (act === 'cg-timer') {
      S.cgStart = Date.now();
      render();
      startCgCountdown();
    } else if (act === 'cg-reset-timer') {
      S.cgStart = Date.now();
      render();
      startCgCountdown();
    } else if (act === 'cg-restart') {
      S.cgStep = 0;
      S.cgStart = null;
      if (cgTimerId) {
        clearInterval(cgTimerId);
        cgTimerId = null;
      }
      render();
    } else if (act === 'cglog-del') {
      var logIdx = +el.dataset.v;
      if (S.delArm2 !== 'cglog-del:' + logIdx) {
        S.delArm2 = 'cglog-del:' + logIdx;
        render();
        return;
      }
      S.delArm2 = null;
      S.conflictLog.splice(logIdx, 1);
      save('mateon.conflictLog', S.conflictLog);
      render();
      showToast('기록을 지웠어요');
    } else if (act === 'cg-save' || act === 'cg-save-rule') {
      var noteEl = document.getElementById('cg-note');
      var note = noteEl ? noteEl.value.trim().slice(0, 80) : '';
      if (!note) {
        if (noteEl) {
          markBad(noteEl);
        }
        showToast('약속 내용을 적어주세요');
        return;
      }
      S.conflictLog.push({ ts: Date.now(), note: note, domain: S.cgDomain });
      if (S.conflictLog.length > 100) S.conflictLog = S.conflictLog.slice(-100);
      save('mateon.conflictLog', S.conflictLog);
      if (act === 'cg-save-rule' && note.length <= 60) {
        if (S.customRules.indexOf(note) < 0) {
          S.customRules.push(note);
          save('mateon.customRules', S.customRules);
        }
        showToast('합의를 기록하고 생활규칙에도 추가했어요');
      } else showToast('합의를 기록했어요');
      S.cgStep = 0;
      S.cgStart = null;
      if (cgTimerId) {
        clearInterval(cgTimerId);
        cgTimerId = null;
      }
      go('space');
      scheduleSyncPush();
    }
    /* ---- 커스텀 체크리스트 ---- */
    else if (act === 'cl-add') {
      var clin = document.getElementById('cl-custom-in');
      var cltext = clin ? clin.value.trim() : '';
      if (!cltext) {
        if (clin) {
          markBad(clin);
        }
        showToast('항목을 적어주세요');
        return;
      }
      if (S.customChecklist.length >= 50) {
        showToast('직접 추가 항목은 최대 50개까지예요');
        return;
      }
      S.customChecklist.push({ id: uid(), text: cltext.slice(0, 40) });
      save('mateon.customChecklist', S.customChecklist);
      render();
    } else if (act === 'cl-del') {
      var clid = el.dataset.v;
      if (S.delArm2 !== 'cl-del:' + clid) {
        S.delArm2 = 'cl-del:' + clid;
        render();
        return;
      }
      S.delArm2 = null;
      S.customChecklist = S.customChecklist.filter(function (x) {
        return x.id !== clid;
      });
      if (S.checklist['own:' + clid]) {
        delete S.checklist['own:' + clid];
        save('mateon.checklist', S.checklist);
      }
      save('mateon.customChecklist', S.customChecklist);
      render();
    } else if (act === 'move-date-set') {
      var mdIn = document.getElementById('move-date-in');
      var mdV = mdIn && /^\d{4}-\d{2}-\d{2}$/.test(mdIn.value) ? mdIn.value : '';
      if (!mdV) {
        if (mdIn) {
          markBad(mdIn);
        }
        showToast('입주일을 골라주세요');
        return;
      }
      S.moveDate = mdV;
      save('mateon.moveDate', S.moveDate);
      render();
      scheduleSyncPush();
      showToast('입주일을 저장했어요. 카테고리별 권장 시기가 표시돼요', { type: 'good' });
    } else if (act === 'move-date-clear') {
      S.moveDate = null;
      save('mateon.moveDate', null);
      render();
      scheduleSyncPush();
    }
    /* ---- 알림·화면 ---- */
    else if (act === 'rem-checkin') {
      S.reminders.checkin = !S.reminders.checkin;
      save('mateon.reminders', S.reminders);
      syncNativeReminders();
      showToast(S.reminders.checkin ? '주간 체크인 알림을 켰어요' : '주간 체크인 알림을 껐어요');
      render();
    } else if (act === 'rem-agree') {
      S.reminders.agreement = !S.reminders.agreement;
      save('mateon.reminders', S.reminders);
      syncNativeReminders();
      showToast(S.reminders.agreement ? '합의 점검일 알림을 켰어요' : '합의 점검일 알림을 껐어요');
      render();
    } else if (act === 'rem-chore') {
      S.reminders.chore = !S.reminders.chore;
      save('mateon.reminders', S.reminders);
      syncNativeReminders();
      showToast(S.reminders.chore ? '주말 집안일 알림을 켰어요' : '주말 집안일 알림을 껐어요');
      render();
    } else if (act === 'rem-day') {
      S.reminders.day = +el.dataset.v;
      save('mateon.reminders', S.reminders);
      syncNativeReminders();
      render();
    } else if (act === 'home-name') {
      var hnEl = document.getElementById('home-name');
      S.homeName = hnEl ? hnEl.value.trim().slice(0, 12) : '';
      save('mateon.homeName', S.homeName);
      render();
      showToast(S.homeName ? '우리 공간 이름을 바꿨어요' : '기본 이름으로 돌아왔어요');
    } else if (act === 'font-size') {
      S.fontSize = el.dataset.v === 'large' ? 'large' : 'normal';
      save('mateon.fontSize', S.fontSize);
      applyFontSize();
      render();
    } else if (act === 'tutorial') {
      S.seen = false;
      render();
      showToast('앱 소개를 다시 보여드릴게요');
    } else if (act === 'tutorial-close') {
      S.seen = true;
      save('mateon.seen', true);
      render();
    }
    /* ---- 동기화 ---- */
    else if (act === 'sync-slot') {
      if (!S.syncCfg) S.syncCfg = { endpoint: '', room: '', slot: 'a', token: '' };
      S.syncCfg.slot = el.dataset.v;
      render();
    } else if (act === 'sync-save') {
      var endEl = document.getElementById('sync-end'),
        roomEl = document.getElementById('sync-room'),
        tokEl = document.getElementById('sync-token');
      var endV = endEl ? endEl.value.trim() : '';
      var roomV = roomEl ? roomEl.value.trim() : '';
      var tokV = tokEl ? tokEl.value.trim() : '';
      if (!/^https:\/\//.test(endV)) {
        if (endEl) {
          markBad(endEl);
        }
        showToast('https:// 로 시작하는 서버 주소를 입력해 주세요');
        return;
      }
      if (!/^[A-Za-z0-9\-_]{3,40}$/.test(roomV)) {
        if (roomEl) {
          markBad(roomEl);
        }
        showToast('방 코드는 영문·숫자·-·_ 3~40자로 정해주세요');
        return;
      }
      if (!S.syncCfg) S.syncCfg = { endpoint: '', room: '', slot: 'a', token: '' };
      S.syncCfg.endpoint = endV;
      S.syncCfg.room = roomV;
      S.syncCfg.token = tokV;
      if (!S.syncCfg.slot) S.syncCfg.slot = 'a';
      /* 네이티브면 토큰은 Keystore/Keychain에만 두고 로컬스토리지에는 남기지 않는다 */
      if (window.MateNative && window.MateNative.secureSet && tokV) {
        var cfgNoTok = { endpoint: endV, room: roomV, slot: S.syncCfg.slot };
        save('mateon.sync', cfgNoTok);
        window.MateNative.secureSet('sync-token', tokV).catch(function () {});
      } else {
        save('mateon.sync', S.syncCfg);
      }
      showToast('동기화를 켰어요');
      render();
      syncPush();
      syncPull().then(function (changed) {
        if (changed) {
          showToast('메이트의 최신 데이터를 가져왔어요');
          render();
        }
      });
    } else if (act === 'sync-now') {
      showToast('동기화 중이에요…');
      syncPush();
      syncPull().then(function (changed) {
        if (changed) {
          showToast('메이트의 최신 데이터를 가져왔어요');
          render();
        } else showToast('가져올 새 데이터가 없어요');
      });
    } else if (act === 'sync-off') {
      S.syncCfg = null;
      remove('mateon.sync');
      if (window.MateNative && window.MateNative.secureRemove) window.MateNative.secureRemove('sync-token');
      showToast('동기화를 껐어요');
      render();
    }
    /* ---- 초대 유효기간 ---- */
    else if (act === 'invite-days') {
      S.inviteDays = +el.dataset.v === 1 ? 1 : +el.dataset.v === 30 ? 30 : 7;
      save('mateon.inviteDays', S.inviteDays);
      render();
    } else if (act === 'share-invite') {
      shareSmart('MATE:ON 메이트 초대', 'MATE:ON에서 동거 성향을 비교해 봐요!', inviteURL(S.me));
    } else if (act === 'app-tour') {
      go('home');
      setTimeout(startTour, 350);
    } else if (act === 'app-update') {
      if (window.MateNative && window.MateNative.checkUpdate) {
        showToast('업데이트를 확인해요…');
        window.MateNative.checkUpdate().then(function (msg) {
          if (msg) showToast(msg);
        });
      } else showToast('웹 버전은 새로고침하면 최신 상태예요');
    } else if (act === 'app-rollback') {
      if (window.MateNative && window.MateNative.rollbackUpdate) {
        showToast('이전 버전으로 되돌려요…');
        window.MateNative.rollbackUpdate().then(function (msg) {
          if (msg) showToast(msg);
        });
      } else showToast('웹 버전은 새로고침하면 최신 상태예요');
    } else if (act === 'reset-all') {
      if (!S.resetArm) {
        S.resetArm = true;
        render();
        return;
      }
      S.resetArm = false;
      DATA_ITEMS.forEach(function (it) {
        remove(it.k);
      });
      S.me = null;
      S.partner = null;
      S.agreement = null;
      S.history = [];
      S.checklist = {};
      S.customRules = [];
      S.checkedRules = [];
      S.rulesReady = false;
      S.signs = { me: false, partner: false };
      S.shareName = true;
      S.answers = [];
      S.q = 0;
      S.invite = null;
      S.pendingPartner = null;
      S.connectionInput = '';
      S.expenses = [];
      S.settled = [];
      S.fixedExpenses = [];
      S.chores = null;
      S.choreLog = {};
      S.events = [];
      S.checkins = [];
      S.customChecklist = [];
      S.conflictLog = [];
      S.shopping = [];
      S.lovemap = { idx: 0, known: 0, asked: 0 };
      tbStore = null;
      S.budgets = {};
      S.anniv = [];
      S.missions = { week: '', list: [] };
      S.lastBackup = 0;
      S.syncStat = null;
      S.talkFavs = [];
      S.reminders = { checkin: true, agreement: true, chore: true, day: 0 };
      S.homeName = '';
      S.inviteDays = 7;
      S.fontSize = 'normal';
      applyFontSize();
      S.seen = true;
      S.syncCfg = null;
      S.delArm2 = null;
      S.cgStep = 0;
      S.cgDomain = 'D';
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
      if (route === 'survey' && e.key === 'ArrowLeft') {
        if (S.q > 0) {
          S.q--;
          S.qDir = 'prev';
          saveDraft();
          render();
        }
      }
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
    /* 입력 시작하면 오류 표시 해제 */
    if (e.target.classList && e.target.classList.contains('input-error')) {
      e.target.classList.remove('input-error');
      e.target.removeAttribute('aria-invalid');
    }
    /* 폼 드래프트 — 라우트를 나가도 입력값이 유지되도록 상태에 반영 */
    if (e.target.id === 'exp-amt') S.expAmt = e.target.value;
    if (e.target.id === 'exp-memo') S.expMemo = e.target.value;
    if (e.target.id === 'pf-name') S.profile.name = e.target.value;
    if (e.target.id === 'exp-q') {
      /* 지출 검색: 키 입력마다 목록만 다시 그리고 포커스·커서를 복원한다 */
      S.expQuery = e.target.value;
      var caret = e.target.selectionStart;
      render();
      var again = document.getElementById('exp-q');
      if (again) {
        again.focus();
        try {
          again.setSelectionRange(caret, caret);
        } catch (err) {}
      }
    }
    if (e.target.id === 'gs-q') {
      /* 전역 검색 — 리렌더 없이 결과만 갱신해 입력 포커스를 유지한다 */
      var gres = document.getElementById('gs-results');
      if (gres) gres.innerHTML = searchResultsHTML(e.target.value.trim());
    }
    if (e.target.id === 'exp-amt') {
      /* 금액 입력 시 읽기 쉬운 한국어 금액 힌트 */
      var hint = document.getElementById('exp-amt-hint');
      if (hint) {
        var av = Math.round(+String(e.target.value).replace(/[^\d.]/g, '') || 0);
        hint.textContent = av > 0 ? ML.fmtWonShort(av) + ' (' + av.toLocaleString('ko-KR') + '원)' : '';
      }
    }
    if (e.target.id === 'partner-link') {
      S.connectionInput = e.target.value;
      S.pendingPartner = null;
      var confirm = document.querySelectorAll('[data-action="confirm-partner"]')[0];
      if (confirm) confirm.disabled = true;
    }
  });

  app.addEventListener('change', function (e) {
    if (e.target.id === 'chore-proof-file') {
      var pf2 = e.target.files && e.target.files[0];
      var pTarget = S.proofTarget;
      S.proofTarget = null;
      e.target.value = '';
      if (pf2 && pTarget) {
        var wk2 = isoWeekKey();
        var log2 = S.choreLog[wk2] || (S.choreLog[wk2] = {});
        var ent = log2[pTarget];
        if (ent) {
          rcptPut('proof:' + wk2 + ':' + pTarget, pf2)
            .then(function () {
              if (typeof ent === 'object') {
                ent.img = 1;
                save('mateon.choreLog', S.choreLog);
              } else {
                log2[pTarget] = { ts: Date.now(), by: 'me', img: 1 };
                save('mateon.choreLog', S.choreLog);
              }
              showToast('인증샷을 올렸어요');
              render();
              scheduleSyncPush();
            })
            .catch(function () {
              showToast('사진 저장에 실패했어요');
            });
        }
      }
      return;
    }
    if (e.target.id === 'exp-receipt') {
      var rf = e.target.files && e.target.files[0];
      var rcptTarget = S.rcptFor;
      S.rcptFor = null;
      e.target.value = '';
      if (rf) {
        if (rcptTarget) attachReceiptToExpense(rcptTarget, rf);
        else scanReceipt(rf);
      }
      return;
    }
    if (e.target.id !== 'backup-file') return;
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    readBackupFile(file);
  });

  /* ================= Router ================= */
  function go(route) {
    S.fabOpen = false;
    if (currentRoute() === route) {
      render();
      return;
    }
    location.hash = '#/' + route;
  }

  function handleBack() {
    if (talkDialog && talkDialog.open) {
      talkDialog.close();
      return true;
    }
    var route = currentRoute();
    if (route === 'home') return false;
    if (route === 'survey' && S.q > 0) {
      S.q--;
      S.qDir = 'prev';
      saveDraft();
      render();
      return true;
    }
    var parents = {
      survey: 'onboarding',
      'type-detail': 'types',
      checklist: 'space',
      agreement: 'report',
      privacy: 'settings',
      terms: 'settings',
      lifecheck: 'result',
      settle: 'space',
      shopping: 'space',
      lovemap: 'space',
      chores: 'space',
      calendar: 'space',
      checkin: 'space',
      conflict: 'space',
    };
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
          S.invite = webInvite;
          S.flow = 'partner';
          S.q = 0;
          S.answers = [];
          S.profile = { name: '', relation: '', stage: '' };
          go('onboarding');
          return true;
        }
        if (webPair.length === 2) {
          var wa = decodeResult(webPair[0] || ''),
            wb = decodeResult(webPair[1] || '');
          if (wa && wb) {
            S.invite = null;
            S.viewPair = { me: wa, partner: wb };
            go('report');
            return true;
          }
        }
        if (!url.search && !url.hash) {
          go('home');
          return true;
        }
        return false;
      }
      if (url.protocol !== scheme && url.protocol !== 'mateon:') return false;
      if (url.hostname === 'home') {
        go('home');
        return true;
      }
      var data = url.searchParams.get('data') || '';
      if (url.hostname === 'invite') {
        var invite = decodeResult(data);
        if (!invite) throw new Error('Invalid invite');
        S.invite = invite;
        S.flow = 'partner';
        S.q = 0;
        S.answers = [];
        S.profile = { name: '', relation: '', stage: '' };
        go('onboarding');
        return true;
      }
      if (url.hostname === 'pair') {
        var pair = data.split('.');
        var a = decodeResult(pair[0] || ''),
          b = decodeResult(pair[1] || '');
        if (pair.length !== 2 || !a || !b) throw new Error('Invalid pair');
        S.invite = null;
        S.viewPair = { me: a, partner: b };
        go('report');
        return true;
      }
    } catch (e) {
      showToast('초대 링크를 확인해 주세요');
    }
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

  /* 네이티브 홈 위젯 데이터 — D-day·다가오는 일정·미션 진행률 */
  var _widgetTs = 0;
  function syncWidget() {
    /* 같은 데이터로 5초 내 재호출 방지 */
    var now = Date.now();
    if (now - _widgetTs < 5000) return;
    _widgetTs = now;
    try {
      var dday = '—',
        sub = '우리 공간을 열어 보세요';
      var todayS = dateStr(Date.now());
      var near = null;
      (S.anniv || []).forEach(function (a) {
        var n = nextOccurrence(a, todayS);
        if (n && (!near || n < near)) near = n;
      });
      if (S.moveDate && S.moveDate >= todayS && (!near || S.moveDate < near)) near = S.moveDate;
      if (near) {
        var dd = Math.round((new Date(near + 'T00:00:00').getTime() - new Date(todayS + 'T00:00:00').getTime()) / 86400000);
        dday = dd === 0 ? 'D-day' : dd > 0 ? 'D-' + dd : 'D+' + -dd;
      }
      var nxt = (S.events || [])
        .filter(function (e) {
          return e.date >= todayS;
        })
        .sort(function (a, b) {
          return a.date + (a.time || '') < b.date + (b.time || '') ? -1 : 1;
        })[0];
      if (nxt) sub = nxt.date.slice(5).replace('-', '.') + ' ' + nxt.title;
      var mn = '';
      if (S.missions && S.missions.list && S.missions.list.length) {
        var md = S.missions.list.filter(function (m) {
          return m.done;
        }).length;
        mn = '미션 ' + md + '/' + S.missions.list.length;
      }
      window.MateNative.updateWidget({ title: S.homeName || 'MATE:ON', dday: dday, sub: sub, mission: mn });
    } catch (e) {}
  }

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
    if (route !== 'settings') {
      S.delArm = null;
      S.resetArm = false;
    }
    document.title = T('doc.' + route) !== 'doc.' + route ? T('doc.' + route) : ROUTE_TITLES[route] || 'MATE:ON';
    /* 네이티브 아이콘 배지 — 미완료 할 일 수 */
    if (window.MateNative && window.MateNative.setBadge) {
      try {
        var badgeN = 0;
        if (S.me && S.partner && !thisCheckin()) badgeN++;
        if (S.chores) {
          var bwLog = S.choreLog[isoWeekKey()] || {};
          S.chores.items.forEach(function (it, i) {
            if (choreOwner(i, Date.now()) === 'me' && !bwLog[it.id]) badgeN++;
          });
        }
        badgeN += S.shopping.filter(function (x) {
          return !x.done;
        }).length;
        window.MateNative.setBadge(badgeN);
      } catch (e) {}
    }
    /* 네이티브 홈 위젯 — D-day·미션 현황 갱신 */
    if (window.MateNative && window.MateNative.updateWidget) syncWidget();
    switch (route) {
      case 'onboarding':
        vOnboarding();
        break;
      case 'survey':
        vSurvey();
        break;
      case 'result':
        vResult();
        break;
      case 'invite':
        vInvite();
        break;
      case 'report':
        vReport();
        break;
      case 'agreement':
        vAgreement();
        break;
      case 'types':
        vTypes();
        break;
      case 'type-detail':
        vTypeDetail();
        break;
      case 'lifecheck':
        vLifeCheck();
        break;
      case 'space':
        vSpace();
        break;
      case 'checklist':
        vChecklist();
        break;
      case 'settle':
        vSettle();
        break;
      case 'shopping':
        vShopping();
        break;
      case 'lovemap':
        vLovemap();
        break;
      case 'chores':
        vChores();
        break;
      case 'calendar':
        vCalendar();
        break;
      case 'checkin':
        vCheckin();
        break;
      case 'conflict':
        vConflict();
        break;
      case 'settings':
        vSettings();
        break;
      case 'privacy':
        vPrivacy();
        break;
      case 'terms':
        vTerms();
        break;
      default:
        vHome();
    }
  }

  window.addEventListener('hashchange', render);
  window.addEventListener('online', render);
  window.addEventListener('offline', render);
  render();
  maybeTutorial();

  /* ---- 스와이프 뒤로가기: 왼쪽 가장자리에서 오른쪽으로 밀기 ---- */
  (function initSwipeBack() {
    var startX = 0,
      startY = 0,
      tracking = false;
    document.addEventListener(
      'touchstart',
      function (e) {
        if (!e.touches || !e.touches.length) return;
        var t = e.touches[0];
        tracking = t.clientX <= 28;
        startX = t.clientX;
        startY = t.clientY;
      },
      { passive: true }
    );
    document.addEventListener(
      'touchend',
      function (e) {
        if (!tracking) return;
        tracking = false;
        var t = e.changedTouches && e.changedTouches[0];
        if (!t) return;
        var dx = t.clientX - startX,
          dy = Math.abs(t.clientY - startY);
        if (dx > 72 && dy < 60) handleBack();
      },
      { passive: true }
    );
  })();

  /* ---- 풀투리프레시: 최상단에서 아래로 당기면 새로고침 + 동기화 pull ---- */
  (function initPullRefresh() {
    if (typeof document === 'undefined' || !document.addEventListener) return;
    var startY = null,
      pulling = false,
      ind = null;
    function ensureInd() {
      if (!ind && document.createElement && document.body) {
        ind = document.createElement('div');
        ind.className = 'ptr-ind';
        ind.setAttribute('role', 'status');
        ind.textContent = '당겨서 새로고침';
        document.body.appendChild(ind);
      }
      return ind;
    }
    document.addEventListener(
      'touchstart',
      function (e) {
        if (!e.touches || e.touches.length !== 1) {
          startY = null;
          return;
        }
        startY = (window.scrollY || 0) <= 0 ? e.touches[0].clientY : null;
        pulling = false;
      },
      { passive: true }
    );
    document.addEventListener(
      'touchmove',
      function (e) {
        if (startY === null || !e.touches || !e.touches.length) return;
        var dy = e.touches[0].clientY - startY;
        if (dy > 40 && (window.scrollY || 0) <= 0) {
          pulling = true;
          var el = ensureInd();
          if (el) {
            el.classList.add('show');
            el.textContent = dy > 80 ? '놓으면 새로고침' : '당겨서 새로고침';
          }
        }
      },
      { passive: true }
    );
    document.addEventListener(
      'touchend',
      function () {
        if (pulling) {
          pulling = false;
          var el = ensureInd();
          if (el) {
            el.textContent = '새로고침 중…';
            setTimeout(function () {
              el.classList.remove('show');
            }, 500);
          }
          buzz(12);
          render();
          if (syncOn()) syncPull();
        }
        startY = null;
      },
      { passive: true }
    );
  })();

  /* ================= 스플래시 (총 ~1초: 선명해지기 620ms + 페이드 320ms) ================= */
  (function dismissSplash() {
    var sp = document.getElementById('splash');
    if (!sp) return;
    setTimeout(function () {
      sp.classList.add('bye');
    }, 680);
    setTimeout(function () {
      if (sp.parentNode) sp.parentNode.removeChild(sp);
    }, 1200);
  })();

  syncNativeReminders();

  /* ---- 데이터/동기화 부트 작업 ---- */
  /* 시작 시 자동 pull + 앱 포커스 시 pull */
  if (syncOn()) syncPull();
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && syncOn()) syncPull();
    });
    window.addEventListener('focus', function () {
      if (syncOn()) syncPull();
    });
  }
  /* 멀티탭 동기화 — 다른 탭의 localStorage 변경을 반영 */
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('storage', function (e) {
      if (!e.key || e.key.indexOf('mateon.') !== 0) return;
      hydrateStateFromStorage();
      render();
    });
  }
  /* 고아 영수증 정리 — 지출이 삭제된 사진을 IndexedDB에서 제거 */
  (function cleanOrphanReceipts() {
    if (!window.indexedDB) return;
    rcptDB()
      .then(function (db) {
        var tx = db.transaction('receipts', 'readwrite');
        var store = tx.objectStore('receipts');
        var keep = {};
        S.expenses.forEach(function (x) {
          if (x.rcpt) keep[x.id] = true;
        });
        var rq = store.getAllKeys();
        rq.onsuccess = function () {
          (rq.result || []).forEach(function (k) {
            if (!keep[k]) store.delete(k);
          });
        };
      })
      .catch(function () {});
  })();
  /* 오래된 기록 정리 — 집안일 로그 26주, 정산 이력 200개, 갈등 기록 100개 유지 */
  (function retentionSweep() {
    var changed = false;
    var wks = Object.keys(S.choreLog);
    if (wks.length > 26) {
      wks.sort();
      wks.slice(0, wks.length - 26).forEach(function (w) {
        delete S.choreLog[w];
      });
      save('mateon.choreLog', S.choreLog);
      changed = true;
    }
    if (S.settled.length > 200) {
      S.settled = S.settled.slice(-200);
      save('mateon.settled', S.settled);
      changed = true;
    }
    if (S.conflictLog.length > 100) {
      S.conflictLog = S.conflictLog.slice(-100);
      save('mateon.conflictLog', S.conflictLog);
      changed = true;
    }
    if (changed) scheduleSyncPush();
  })();
  /* 손상 데이터 정리 — 검증에 실패하는 키를 .corrupt로 백업 후 제거 */
  (function purgeCorrupt() {
    DATA_ITEMS.forEach(function (it) {
      var raw = rawGet(it.k);
      if (raw === null || it.k === 'ds-theme') return;
      var ok = true;
      try {
        ok = validBackupValue(it.k, JSON.parse(raw));
      } catch (e) {
        ok = false;
      }
      if (!ok) {
        try {
          localStorage.setItem(it.k + '.corrupt', raw);
          localStorage.removeItem(it.k);
        } catch (e) {}
      }
    });
  })();
  /* 저장 공간 사용량 — 설정 화면에 표시 */
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    navigator.storage
      .estimate()
      .then(function (e) {
        if (e && e.quota) {
          S.quotaInfo = { used: e.usage || 0, quota: e.quota, pct: Math.round(((e.usage || 0) / e.quota) * 100) };
          if (currentRoute() === 'settings') render();
        }
      })
      .catch(function () {});
  }
  /* ---- PWA ---- */
  /* 설치 배너 — beforeinstallprompt를 받으면 홈에 배너 표시 */
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      S.installPrompt = e;
      if (currentRoute() === 'home' || currentRoute() === '') render();
    });
    window.addEventListener('appinstalled', function () {
      S.installPrompt = null;
      showToast('MATE:ON이 설치됐어요');
      render();
    });
    /* 서비스 워커 새 버전 — 대기 중이면 배너로 알림 */
    window.addEventListener('load', function () {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .getRegistration()
          .then(function (reg) {
            if (!reg) return;
            reg.addEventListener('updatefound', function () {
              var nw = reg.installing;
              if (!nw) return;
              nw.addEventListener('statechange', function () {
                if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                  showToast('새 버전이 준비됐어요', {
                    duration: 8000,
                    action: {
                      label: '새로고침',
                      fn: function () {
                        location.reload();
                      },
                    },
                  });
                }
              });
            });
          })
          .catch(function () {});
      }
    });
    /* 전역 오류 수집 — 최근 20개를 기기에만 보관, 설정에서 복사 가능 */
    function logError(msg) {
      try {
        var errs = load('mateon.errors') || [];
        errs.push({ msg: String(msg).slice(0, 300), ts: Date.now() });
        if (errs.length > 20) errs = errs.slice(-20);
        save('mateon.errors', errs);
      } catch (x) {}
    }
    window.addEventListener('error', function (e) {
      try {
        console.error('[mateon]', e.message);
      } catch (x) {}
      logError((e.message || 'error') + (e.filename ? ' @ ' + e.filename.split('/').pop() + ':' + (e.lineno || 0) : ''));
    });
    window.addEventListener('unhandledrejection', function (e) {
      logError('promise: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)).slice(0, 250));
    });
    /* web-vitals — LCP/CLS를 로컬에만 기록 (외부 전송 없음) */
    try {
      if (typeof PerformanceObserver !== 'undefined') {
        var vitals = load('mateon.vitals') || {};
        new PerformanceObserver(function (list) {
          list.getEntries().forEach(function (en) {
            vitals.lcp = Math.round(en.startTime);
            save('mateon.vitals', vitals);
          });
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        var clsSum = 0;
        new PerformanceObserver(function (list) {
          list.getEntries().forEach(function (en) {
            var ls = /** @type {any} */ (en);
            if (!ls.hadRecentInput) {
              clsSum += ls.value;
              vitals.cls = +clsSum.toFixed(3);
            }
          });
          save('mateon.vitals', vitals);
        }).observe({ type: 'layout-shift', buffered: true });
      }
    } catch (e) {}
    /* share_target으로 받은 텍스트 — 오늘의 대화에 미리 담기 */
    try {
      var q = new URLSearchParams(location.search || '');
      var shared = q.get('shared_text') || q.get('shared_title') || '';
      if (shared) S.sharedText = shared.slice(0, 400);
    } catch (e) {}
  }
  /* 네이티브: 보안 저장소의 동기화 토큰을 런타임 설정에 주입 */
  if (window.MateNative && window.MateNative.secureGet && S.syncCfg && !S.syncCfg.token) {
    window.MateNative.secureGet('sync-token')
      .then(function (tok) {
        if (tok && S.syncCfg) S.syncCfg.token = tok;
      })
      .catch(function () {});
  }

  /* ================= PWA Service Worker ================= */
  if (!window.MateNative && 'serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(function () {});
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
    /* 네이티브 공유 수신 — 받은 텍스트를 대화 시트에 프리필 */
    acceptSharedText: function (text) {
      if (!text) return;
      S.sharedText = String(text).slice(0, 400);
      go('home');
      setTimeout(function () {
        openTalk(talkIndex);
      }, 60);
    },
    /* 네이티브 공유 수신 — 이미지 파일을 IndexedDB에 저장하고 사진 모아보기에 등록 */
    acceptSharedImage: function (path) {
      if (!path || !window.MateNative) return;
      var url = window.MateNative.fileUrl ? window.MateNative.fileUrl(path) : 'file://' + path;
      fetch(url)
        .then(function (r) {
          return r.blob();
        })
        .then(function (blob) {
          if (!blob || !blob.size || blob.size > 12 * 1024 * 1024) throw new Error('size');
          var id = 'ph' + Date.now().toString(36);
          return rcptPut('photo:' + id, blob).then(function () {
            S.photos = S.photos || [];
            S.photos.unshift({ id: id, ts: Date.now(), label: '공유받은 사진' });
            if (S.photos.length > 100) S.photos = S.photos.slice(0, 100);
            save('mateon.photos', S.photos);
            pushNotif('🖼️', '공유받은 사진을 앨범에 저장했어요', 'space');
            showToast('사진을 앨범에 저장했어요 🖼️', { type: 'good' });
            go('space');
            render();
          });
        })
        .catch(function () {
          showToast('사진을 가져오지 못했어요');
        });
    },
  };
})();
