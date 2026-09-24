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
    flow: 'me',
    q: 0,
    answers: [],
    profile: { name: '', relation: '', stage: '' },
    checkedRules: [],
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
  };

  /* ---- 설문 진행 자동 저장 (새로고침 복구) ---- */
  function saveDraft() {
    save('mateon.draft.' + S.flow, { q: S.q, answers: S.answers, profile: S.profile });
  }
  function clearDraft() {
    remove('mateon.draft.' + S.flow);
  }
  (function loadDraft() {
    var flowKey = S.invite ? 'partner' : 'me';
    var d = load('mateon.draft.' + flowKey);
    if (d && d.answers && d.answers.length) {
      S.flow = flowKey;
      S.q = d.q || 0;
      S.answers = d.answers;
      if (d.profile) S.profile = d.profile;
    }
  })();

  /* ---- 초대 링크 인코딩/디코딩 (v2 압축 배열, v1 객체 하위호환) ---- */
  function encodeResult(r) {
    var arr = [
      r.name, r.relation || '', r.stage || '',
      +r.eAvg.toFixed(2), +r.rAvg.toFixed(2),
      r.charId, r.char2Id, r.conf || '',
      DOMAINS.map(function (d) {
        var dd = r.domains[d.id];
        return [+dd.e.toFixed(2), +dd.r.toFixed(2)];
      }),
      r.life ? r.life.map(function (x) { return x.level; }) : null,
    ];
    var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(arr))));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
    if (m) S.invite = decodeResult(m[1]);
    var p = location.search.match(/[?&]pair=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)/);
    if (p) {
      var a = decodeResult(p[1]), b = decodeResult(p[2]);
      if (a && b) S.viewPair = { me: a, partner: b };
    }
  })();

  function pairURL() {
    if (window.MateNative) return 'mateon://pair?data=' + encodeResult(S.me) + '.' + encodeResult(S.partner);
    return location.origin + location.pathname + '?pair=' + encodeResult(S.me) + '.' + encodeResult(S.partner) + '#/report';
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
    if (nav === 'space') return ['space','checklist','agreement'].indexOf(r) >= 0;
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
    app.innerHTML = '<div class="app-shell' + (currentRoute() === 'home' ? ' is-home' : '') + '">' + headerHTML() +
      '<main class="app-main" id="main">' + content + '</main>' + bottomNavHTML() + '</div>';
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
  var talkIndex = 0;
  var HOME_TALKS = [
    ['생활 리듬', '혼자만의 시간이 필요할 때, 어떻게 알려주면 좋을까요?'],
    ['공간과 청결', '우리 집의 깨끗함은 어느 정도면 충분할까요?'],
    ['생활비', '함께 쓰는 물건의 비용은 어떻게 나누면 편할까요?']
  ];
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
    return {total:total,done:done};
  }
  function vHome() {
    var draft = S.answers.length > 0 && S.answers.length < QUESTIONS.length;
    var action = !S.me ? (draft ? 'resume-survey' : 'start') : (!S.partner ? 'invite' : 'report');
    var title = !S.me ? (draft ? '나를 알아가는 중이에요' : '나는 어떤 메이트일까?') : (!S.partner ? '이제, 서로를 알아볼 차례' : '우리의 다름을 알아봐요');
    var cta = !S.me ? (draft ? '이어서 진단하기' : '나의 동거 성향 알아보기') : (!S.partner ? '메이트 초대하기' : '우리 둘 리포트 보기');
    var count = (S.me?1:0)+(S.me&&S.partner?1:0)+(S.agreement?1:0);
    var saved = load('mateon.talks') || {};
    var stats=checklistStats();
    shell('<div class="mobile-home">'+
      '<section class="app-greeting"><p>'+ (S.me ? esc(S.me.name)+'님, 반가워요' : '함께 살 준비, 서로를 아는 것부터.') +'</p><h1>우리의 일상,<br>조금 더 가까이<span class="coral-dot">.</span></h1></section>'+
      '<section class="connection-strip" aria-label="메이트 연결 상태"><div class="paired-avatars"><span>'+esc(S.me?S.me.name.slice(0,1):'나')+'</span><span>'+ (S.partner ? esc(S.partner.name.slice(0,1)) : mobileIcon('plus')) +'</span></div><div><strong>'+ (S.partner?esc(S.partner.name)+'님과 함께':'아직 메이트를 기다리고 있어요') +'</strong><p>'+ (S.partner?'서로 알아가는 우리만의 공간':'나를 알아본 뒤, 메이트와 연결해요') +'</p></div><button class="icon-button" data-action="'+(S.me?'invite':'start')+'" aria-label="메이트 연결하기" type="button">'+mobileIcon('arrow')+'</button></section>'+
      '<section class="today-mission"><div class="mission-top"><span class="mission-label">오늘의 첫걸음</span><span class="mission-count">'+(count<3?'0'+(count+1):'03')+' <span>/ 03</span></span></div><h2>'+title+'</h2><p>'+(!S.me?'함께 살 때의 내 모습을 발견해요.':(!S.partner?'나와 메이트의 생활방식을 맞춰봐요.':'잘 맞는 부분도, 대화가 필요한 부분도.'))+'</p><div class="mission-illustration"><img src="assets/together-home.svg" width="260" height="246" alt="함께하는 두 메이트의 편안한 일상"></div><div class="mission-footer"><span>'+ (draft ? S.answers.length+' / 20 문항 완료 · 자동 저장됨' : S.me?'나를 알고, 서로를 이해하는 시간':'동거 성향 테스트 · 20문항 · 약 3분')+'</span><button class="mobile-primary home-primary" data-action="'+action+'" type="button">'+cta+mobileIcon('arrow')+'</button></div></section>'+
      '<div class="app-shortcuts"><button type="button" data-action="'+(S.me?'result':'start')+'"><span class="shortcut-icon pink">'+mobileIcon('user')+'</span>나의 성향</button><button type="button" data-action="'+(S.me&&S.partner?'report':'demo')+'"><span class="shortcut-icon blue">'+mobileIcon('heart')+'</span>궁합 리포트</button><button type="button" data-action="checklist"><span class="shortcut-icon mint">'+NAV_ICONS.checklist+'</span>입주 준비</button></div>'+
      '<section class="conversation-section"><div class="mobile-section-head"><h2>오늘의 대화</h2><span>마음을 나누는 1분</span></div><div class="conversation-card"><div class="conversation-top"><span>'+HOME_TALKS[talkIndex][0]+'</span><button class="icon-button" data-action="next-talk" type="button" aria-label="다른 대화 주제">'+mobileIcon('refresh')+'</button></div><h3>'+HOME_TALKS[talkIndex][1]+'</h3><button type="button" class="conversation-open" data-action="talk-open">'+(saved[talkIndex]?'내 답변 다시 보기':'내 생각 남기기')+mobileIcon('arrow')+'</button></div></section>'+
      '<button class="preparation-row" type="button" data-action="space"><span class="preparation-icon">'+NAV_ICONS.home+'</span><span><strong>우리의 입주 준비</strong><small>'+stats.total+'개 중 '+stats.done+'개 완료했어요</small></span><span class="tiny-ring" style="--done:'+Math.round(stats.done/stats.total*100)+'%">'+Math.round(stats.done/stats.total*100)+'%</span>'+mobileIcon('arrow')+'</button>'+
      '</div>');
  }
  function vSpace() {
    var stats=checklistStats(); var notes=load('mateon.talks') || {};
    shell('<section class="space-page"><p class="app-overline">OUR SPACE</p><h1 class="mobile-title">우리 공간</h1><p class="mobile-subtitle">함께 정하고, 하나씩 쌓아가는 일상</p><div class="space-summary"><span>'+NAV_ICONS.home+'</span><h2>우리의 시작을 준비해요</h2><p>입주 준비 '+stats.done+' / '+stats.total+' 완료</p><div class="space-progress"><i style="width:'+(stats.done/stats.total*100)+'%"></i></div></div><div class="app-list"><button type="button" data-action="checklist">'+NAV_ICONS.checklist+'<span><strong>입주 체크리스트</strong><small>계약부터 생활용품까지</small></span>'+mobileIcon('arrow')+'</button><button type="button" data-action="'+(S.me&&S.partner?'report':'demo')+'">'+mobileIcon('heart')+'<span><strong>우리집 생활규칙</strong><small>'+(S.agreement?'저장한 합의서가 있어요':'서로 편안한 기준을 정해요')+'</small></span>'+mobileIcon('arrow')+'</button><button type="button" data-action="'+(S.me?'invite':'start')+'">'+mobileIcon('user')+'<span><strong>메이트 연결</strong><small>'+(S.partner?esc(S.partner.name)+'님과 연결됨':'함께할 메이트 초대하기')+'</small></span>'+mobileIcon('arrow')+'</button></div><div class="mobile-section-head"><h2>나의 대화 기록</h2><span>'+Object.keys(notes).filter(function(k){return HOME_TALKS[k];}).length+'개</span></div>'+ (Object.keys(notes).filter(function(k){return HOME_TALKS[k];}).length ? Object.keys(notes).filter(function(k){return HOME_TALKS[k];}).map(function(k){return '<button class="saved-talk" data-action="talk-open" data-talk="'+k+'" type="button"><span>'+HOME_TALKS[k][0]+'</span><strong>'+esc(HOME_TALKS[k][1])+'</strong><p>'+esc(notes[k].text)+'</p></button>';}).join('') : '<div class="empty-notes">'+mobileIcon('chat')+'<p>아직 남긴 이야기가 없어요.</p><button type="button" data-action="talk-open">첫 생각 남기기</button></div>')+'<p class="device-note">대화 기록은 이 기기에만 저장돼요.</p></section>');
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
    talkDialog.innerHTML='<div class="sheet-handle" aria-hidden="true"></div><div class="sheet-heading"><span>오늘의 대화 · '+HOME_TALKS[talkIndex][0]+'</span><button class="icon-button" type="button" aria-label="닫기" data-sheet-close>'+mobileIcon('close')+'</button></div><h2 id="talk-title">'+HOME_TALKS[talkIndex][1]+'</h2><label for="talk-note">나의 생각</label><textarea id="talk-note" maxlength="500" rows="4" placeholder="정답은 없어요. 편하게 적어보세요.">'+esc(notes[talkIndex]?notes[talkIndex].text:'')+'</textarea><p class="sheet-hint">이 기기에만 저장되며, 메이트에게 자동 전송되지 않아요.</p><button class="mobile-primary" type="button" data-sheet-save>내 생각 저장하기</button>';
    document.body.appendChild(talkDialog);
    talkDialog.addEventListener('close',function(){talkDialog.remove();talkDialog=null;document.body.classList.remove('sheet-open');if(talkOpener&&talkOpener.isConnected)talkOpener.focus();});
    talkDialog.addEventListener('click',function(e){
      if(e.target.closest('[data-sheet-close]')) talkDialog.close();
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
  function resultShareText(r, c) {
    return 'MATE:ON 동거 성향 진단 결과\n' +
      '나의 동거 캐릭터: ' + c.name + ' (' + c.code + ')\n' +
      '교류 활성도 ' + pct(r.eAvg) + '% · 자극 민감도 ' + pct(r.rAvg) + '%\n' +
      c.quote + '\n' +
      '너는 어떤 유형일까? ' + inviteURL(r);
  }

  function inviteURL(r) {
    var base = location.href.split('?')[0].split('#')[0];
    var rr = r;
    if (S.shareName === false) rr = Object.assign({}, r, { name: '동거인' });
    if (window.MateNative) return 'mateon://invite?data=' + encodeResult(rr);
    return base + '?invite=' + encodeResult(rr);
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

    shell('' +
      '<p class="eyebrow caption" style="text-align:center;display:block">' + (isMine ? '나의 동거 캐릭터' : esc(r.name) + '님의 동거 캐릭터') + '</p>' +
      '<div class="card char-hero">' +
      '<span class="char-code">' + c.code + '</span>' +
      '<h2 class="char-name">' + esc(c.name) + '</h2>' +
      '<p class="char-quote">' + esc(c.quote) + '</p>' +
      '<div class="char-meta">' +
      '<span class="badge badge-neutral">확신도 ' + esc(r.conf) + '</span>' +
      (c2 ? '<span class="badge badge-info">비슷한 유형 · ' + esc(c2.name) + '</span>' : '') +
      '</div>' +
      '</div>' +

      '<div class="card" style="margin-top:16px">' +
      '<h4 class="card-title">나의 성향 좌표</h4>' +
      '<div class="gauge-block">' +
      gaugeHTML('생활 교류 활성도 (E)', r.eAvg, false) +
      gaugeHTML('생활 자극 민감도 (R)', r.rAvg, true) +
      '</div>' +
      '<div style="margin-top:20px">' + matrixHTML(r.charId, null, r.name || '나') + '</div>' +
      '<p class="caption text-muted" style="margin-top:16px">수치는 순위나 궁합 점수가 아니라, 20개 응답에서 나타난 성향의 위치예요. 결과는 판정이 아니라 대화를 돕는 참고 도구예요.</p>' +
      '</div>' +

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
      '<h4 class="card-title">나의 갈등 시퀀스</h4>' +
      '<div class="seq">' + seq + '</div>' +
      '</div>' +

      '<div class="card" style="margin-top:16px">' +
      '<h4 class="card-title">내가 예민해지는 순간 Top 3</h4>' +
      '<ol class="trigger-list">' + c.triggers.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol>' +
      '</div>' +

      '<div class="card" style="margin-top:16px">' +
      '<h4 class="card-title">나와 살 때 사용설명서</h4>' +
      '<div class="do-grid">' +
      '<div class="do-col do"><h5>DO</h5><ul>' + c.dos.map(function (t) { return '<li>· ' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="do-col dont"><h5>DON&#39;T</h5><ul>' + c.donts.map(function (t) { return '<li>· ' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
      '</div>' +
      '</div>' +

      '<div class="card" style="margin-top:16px">' +
      '<h4 class="card-title">나를 편하게 만드는 집</h4>' +
      '<div class="comfort-chips">' + c.comfort.map(function (t) { return '<span class="badge badge-brand">' + esc(t) + '</span>'; }).join('') + '</div>' +
      '</div>' +

      lifeHTML + histHTML + ctas + typesLink);
  }

  /* ================= View: 상대 초대 ================= */
  function vInvite() {
    if (!S.me) { go('home'); return; }
    var url = inviteURL(S.me);

    var partnerDone = '';
    if (S.partner) {
      var pc = charById(S.partner.charId);
      partnerDone = '<div class="card resume-card">' +
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
      '<p class="caption text-muted">문항별 응답과 실무 체크 결과는 포함되지 않아요. 링크를 가진 사람은 누구나 결과를 볼 수 있고, 결과는 받은 사람의 기기에만 저장돼요.</p>' +
      '<button class="share-opt' + (shareOn ? ' on' : '') + '" data-action="share-name" type="button" aria-pressed="' + shareOn + '">' +
      '<span class="share-opt-dot"></span>닉네임 포함 ' + (shareOn ? '켜짐' : '꺼짐') + '</button>' +
      '</div>';

    shell('' +
      '<p class="eyebrow caption">Step 2</p>' +
      '<h2 class="view-title">이번에는 우리 둘의 생활을 맞춰볼까요?</h2>' +
      '<p class="view-desc body-md">상대도 진단을 마치면 두 분의 궁합 리포트가 완성돼요.<br>같은 점보다, 다른 점을 먼저 알아볼게요.</p>' +
      '<div class="view-stack">' +
      partnerDone +
      '<div class="card">' +
      '<h4 class="card-title">초대 링크 보내기</h4>' +
      '<p class="body-sm text-muted" style="margin-bottom:12px">내 결과가 담긴 링크예요. 상대가 열어서 진단하면 바로 비교됩니다.</p>' +
      '<div class="invite-link-box"><code>' + esc(url) + '</code></div>' +
      '<div class="cta-col" style="margin-top:16px">' +
      '<button class="btn btn-secondary btn-md" data-action="copylink" type="button">링크 복사하기</button>' +
      '</div>' +
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
    if (!S.checkedRules.length) S.checkedRules = allRules.map(function (r) { return r.text; });

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
    var rules = S.checkedRules.length ? S.checkedRules : BASE_RULES.map(function (r) { return r.text; });
    var today = new Date();
    var dateStr = today.getFullYear() + '년 ' + (today.getMonth() + 1) + '월 ' + today.getDate() + '일';
    var done = S.signs.me && S.signs.partner;
    var ag = S.agreement;

    var ruleRows = rules.map(function (t) {
      return '<div class="agree-rule"><svg aria-hidden="true" class="check-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span>' + esc(t) + '</span></div>';
    }).join('');

    var savedNote = ag ? '<div class="note-box good" style="margin-top:16px"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg><span>' + esc(ag.date) + '에 저장된 합의서가 있어요. (' + ag.rules.length + '개 규칙)</span></div>' : '';

    shell('' +
      '<p class="eyebrow caption">Our Agreement</p>' +
      '<h2 class="view-title">우리집 합의서</h2>' +
      '<p class="view-desc body-md">막연했던 기준을 명확한 약속으로 남겨보세요.<br>각자 서명 칸을 눌러 동의를 표시할 수 있어요.</p>' +
      '<div class="agree-doc" style="margin-top:24px">' +
      '<div class="agree-doc-head">' +
      logoSVG(56) +
      '<h3 class="heading-sm" style="margin-top:8px">우리집 생활 합의서</h3>' +
      '<p class="caption text-muted">' + esc(S.me.name || '나') + ' · ' + esc(S.partner.name || '상대') + ' — ' + dateStr + '</p>' +
      '</div>' +
      ruleRows +
      '<div class="agree-signs">' +
      '<button class="sign-box' + (S.signs.me ? ' signed' : '') + '" data-action="sign" data-who="me" type="button">' + esc(S.me.name || '나') + (S.signs.me ? ' · 동의함' : ' · 서명하기') + '</button>' +
      '<button class="sign-box' + (S.signs.partner ? ' signed' : '') + '" data-action="sign" data-who="partner" type="button">' + esc(S.partner.name || '상대') + (S.signs.partner ? ' · 동의함' : ' · 서명하기') + '</button>' +
      '</div>' +
      '</div>' +
      savedNote +
      '<div class="cta-col">' +
      (done ? '<button class="btn btn-primary btn-lg" data-action="save-agree" type="button">합의서 저장하기</button>' : '<button class="btn btn-primary btn-lg" type="button" disabled>두 분 모두 동의하면 저장할 수 있어요</button>') +
      '<button class="btn btn-secondary btn-md" data-action="agree-img" type="button">합의서 이미지로 저장</button>' +
      '<button class="btn btn-secondary btn-md" data-action="agree-ics" type="button">한 달 뒤 점검일 캘린더 추가</button>' +
      '<button class="btn btn-secondary btn-md" data-action="copy-agree" type="button">합의서 텍스트 복사</button>' +
      '<button class="btn btn-tertiary btn-md" data-action="report" type="button">리포트로 돌아가기</button>' +
      '</div>' +
      '<p class="caption text-muted" style="text-align:center;margin-top:8px">생활 합의를 돕는 문서이며, 법적 효력은 없어요.</p>');
  }

  function agreementText() {
    var rules = S.checkedRules.length ? S.checkedRules : BASE_RULES.map(function (r) { return r.text; });
    var today = new Date();
    var dateStr = today.getFullYear() + '년 ' + (today.getMonth() + 1) + '월 ' + today.getDate() + '일';
    return '우리집 생활 합의서 — ' + (S.me.name || '나') + ' & ' + (S.partner.name || '상대') + ' (' + dateStr + ')\n\n' +
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
        '<span class="tc-code">' + c.code + '</span><span class="tc-name">' + esc(c.name) + '</span>' + dist + '</button>';
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
      '<div class="card char-hero">' +
      '<span class="char-code">' + c.code + '</span>' +
      '<h2 class="char-name">' + esc(c.name) + '</h2>' +
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

    shell('' +
      '<p class="eyebrow caption">Move-in Checklist</p>' +
      '<h2 class="view-title">입주 체크리스트</h2>' +
      '<p class="view-desc body-md">함께 사는 집, 시작 전에 챙길 것들을 정리했어요.<br>체크는 이 기기에만 저장돼요.</p>' +
      '<div class="check-progress">' +
      '<div class="progress"><div class="progress-fill" style="width:' + pctDone + '%"></div></div>' +
      '<span class="progress-num">' + pctDone + '%</span></div>' +
      groups +
      '<div class="cta-col"><button class="btn btn-tertiary btn-md" data-action="home" type="button">홈으로</button></div>');
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
    { k: 'ds-theme', t: '테마 설정' },
  ];

  function vSettings() {
    var shareOn = S.shareName !== false;
    var rows = DATA_ITEMS.map(function (it) {
      var has = !!load(it.k);
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
      '<div class="sec-head" style="margin-top:20px"><h3>데이터 관리</h3></div>' +
      '<div class="set-group">' + rows + '</div>' +
      '<div style="text-align:center;margin-top:16px">' +
      '<button class="btn-danger-text" data-action="reset-all" type="button">' +
      (S.resetArm ? '한 번 더 누르면 모든 데이터가 삭제됩니다' : '모든 데이터 삭제') + '</button></div>' +
      '<div class="sec-head" style="margin-top:20px"><h3>약관 및 정보</h3></div>' +
      '<div class="set-group">' +
      '<button class="set-link" data-action="privacy" type="button">개인정보처리방침' + chev + '</button>' +
      '<button class="set-link" data-action="terms" type="button">서비스 이용약관' + chev + '</button>' +
      '</div>' +
      '<p class="caption text-muted" style="text-align:center;margin-top:24px">MATE:ON · 동거 성향 진단 서비스</p>');
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
      '<h4>정보의 삭제</h4>' +
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
      '<p>이용자의 데이터는 기기 브라우저에 저장되며, 기기 변경·브라우저 데이터 삭제 시 복구되지 않을 수 있습니다.</p>' +
      '<h4>서비스 변경</h4>' +
      '<p>현재 버전은 MVP로, 기능과 화면은 예고 없이 변경·중단될 수 있습니다.</p>');
  }

  /* ================= 공유 / 이미지 / ICS ================= */
  function baseURL() {
    if (window.MateNative) return 'mateon://home';
    return location.href.split('?')[0].split('#')[0];
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
          content: { title: title, description: text, imageUrl: baseURL() + 'assets/og-image.png', link: { webUrl: url, mobileWebUrl: url } },
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

  function saveResultImage() {
    var r = S.flow === 'partner' ? S.partner : S.me;
    if (!r) return;
    var c = charById(r.charId);
    var el = E_LEVELS[eLevel(r.eAvg)], rl = R_LEVELS[rLevel(r.rAvg)];
    var cv = MateCard.resultCard({
      code: c.code, name: c.name, quote: c.quote,
      ePct: pct(r.eAvg), rPct: pct(r.rAvg),
      eLabel: eLevel(r.eAvg) + ' ' + el.label, rLabel: rLevel(r.rAvg) + ' ' + rl.label,
    });
    exportCard(cv, 'mateon-' + c.code + '-result.png');
  }

  function saveAgreeImage() {
    var rules = S.checkedRules.length ? S.checkedRules : BASE_RULES.map(function (r) { return r.text; });
    var today = new Date();
    var cv = MateCard.agreementCard({
      names: (S.me.name || '나') + ' · ' + (S.partner.name || '상대'),
      date: today.getFullYear() + '년 ' + (today.getMonth() + 1) + '월 ' + today.getDate() + '일',
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

  /* ================= Actions ================= */
  function resetSurvey() { S.q = 0; S.answers = []; S.qDir = 'next'; clearDraft(); }

  function finishSurvey() {
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
      clearDraft();
      go('result');
    } else {
      S.me = out; save('mateon.me', out);
      resetRulesForNewPartner();
      clearDraft();
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
      setTimeout(function () {
        S.advancing = false;
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
      var i = S.checkedRules.indexOf(t);
      if (i >= 0) S.checkedRules.splice(i, 1); else S.checkedRules.push(t);
      render();
    }
    else if (act === 'agreement') { go('agreement'); }
    else if (act === 'sign') {
      var who = el.dataset.who;
      S.signs[who] = !S.signs[who];
      render();
    }
    else if (act === 'save-agree') {
      var today = new Date();
      S.agreement = {
        rules: S.checkedRules.slice(),
        me: S.me.name, partner: S.partner.name,
        date: today.getFullYear() + '년 ' + (today.getMonth() + 1) + '월 ' + today.getDate() + '일',
      };
      save('mateon.agreement', S.agreement);
      showToast('우리집 합의서가 저장됐어요');
      render();
    }
    else if (act === 'copy-agree') { copyText(agreementText(), '합의서가 복사됐어요'); }

    /* ---- 신규 기능 ---- */
    else if (act === 'types') { go('types'); }
    else if (act === 'type') { S.typeId = +el.dataset.id; go('type-detail'); }
    else if (act === 'checklist') { go('checklist'); }
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
      if (S.checkedRules.indexOf(v) < 0) S.checkedRules.push(v);
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
    else if (act === 'resume-survey') { go('survey'); }
    else if (act === 'share-name') {
      S.shareName = S.shareName === false;
      save('mateon.shareName', S.shareName);
      showToast(S.shareName === false ? '닉네임 없이 링크를 만들어요' : '닉네임을 포함해 링크를 만들어요');
      render();
    }
    else if (act === 'unlink') {
      S.partner = null; remove('mateon.partner');
      S.checkedRules = []; S.signs = { me: false, partner: false };
      showToast('상대 연결을 해제했어요');
      render();
    }
    else if (act === 'settings') { go('settings'); }
    else if (act === 'privacy') { go('privacy'); }
    else if (act === 'terms') { go('terms'); }
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
      if (dk === 'mateon.partner') { S.partner = null; S.checkedRules = []; S.signs = { me: false, partner: false }; }
      if (dk === 'mateon.agreement') { S.agreement = null; }
      if (dk === 'mateon.history') { S.history = []; }
      if (dk === 'mateon.talks') { /* read fresh on render */ }
      if (dk === 'mateon.checklist') { S.checklist = {}; }
      if (dk === 'mateon.customRules') { S.customRules = []; }
      if (dk === 'mateon.shareName') { S.shareName = true; }
      showToast('삭제했어요');
      render();
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
      S.checklist = {}; S.customRules = []; S.checkedRules = [];
      S.signs = { me: false, partner: false }; S.shareName = true;
      S.answers = []; S.q = 0; S.invite = null;
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
    var parents = { survey:'onboarding', 'type-detail':'types', checklist:'space', agreement:'report', privacy:'settings', terms:'settings', lifecheck:'result' };
    go(parents[route] || 'home');
    return true;
  }

  function acceptNativeLink(value) {
    try {
      var url = new URL(value);
      if (url.protocol !== 'mateon:') return false;
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
    settings: '설정 — MATE:ON',
    privacy: '개인정보처리방침 — MATE:ON',
    terms: '서비스 이용약관 — MATE:ON',
  };

  function render() {
    var route = currentRoute();
    // 초대 링크로 들어온 경우: 진단 전이면 온보딩으로 유도
    if (S.invite && (route === 'home' || route === '')) {
      S.flow = 'partner';
      S.profile = { name: '', relation: '', stage: '' };
      route = 'onboarding';
      history.replaceState(null, '', '#/onboarding');
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
      case 'settings': vSettings(); break;
      case 'privacy': vPrivacy(); break;
      case 'terms': vTerms(); break;
      default: vHome();
    }
  }

  window.addEventListener('hashchange', render);
  render();

  /* ================= 스플래시 (총 ~1초: 선명해지기 620ms + 페이드 320ms) ================= */
  (function dismissSplash() {
    var sp = document.getElementById('splash');
    if (!sp) return;
    setTimeout(function () { sp.classList.add('bye'); }, 680);
    setTimeout(function () { if (sp.parentNode) sp.parentNode.removeChild(sp); }, 1200);
  })();

  /* ================= PWA Service Worker ================= */
  if (!window.MateNative && 'serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { });
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
  };
})();
