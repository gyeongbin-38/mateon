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

  function fmtDate(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate();
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
      return out.charId ? out : null;
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
    return location.origin + location.pathname + '?pair=' + encodeResult(S.me) + '.' + encodeResult(S.partner) + '#/report';
  }

  /* ================= Logo SVG ================= */
  function logoSVG(size) {
    return '' +
      '<svg class="logo-mark" width="' + (size || 40) + '" height="' + ((size || 40) * 0.8) + '" viewBox="0 0 128 104" fill="none" aria-hidden="true">' +
      '<circle cx="40" cy="16" r="10" fill="#FF6B7A"/>' +
      '<circle cx="88" cy="16" r="10" fill="#6B9EFF"/>' +
      '<path d="M36 96 V62 Q36 50 45 45 L62 35" stroke="#FF6B7A" stroke-width="17" stroke-linecap="round"/>' +
      '<path d="M92 96 V62 Q92 50 83 45 L66 35" stroke="#6B9EFF" stroke-width="17" stroke-linecap="round"/>' +
      '<g class="logo-window"><rect x="55" y="64" width="8" height="8" rx="1.5"/><rect x="67" y="64" width="8" height="8" rx="1.5"/><rect x="55" y="78" width="8" height="8" rx="1.5"/><rect x="67" y="78" width="8" height="8" rx="1.5"/></g>' +
      '</svg>';
  }

  function headerHTML() {
    return '' +
      '<header class="app-header"><div class="app-header-inner">' +
      '<button class="logo" data-action="home" type="button" aria-label="MATE:ON 홈">' +
      logoSVG(40) +
      '<span class="wordmark">MATE<span class="wm-on">:ON</span></span>' +
      '</button>' +
      '<button class="btn btn-tertiary btn-sm" data-action="theme" type="button" aria-label="테마 전환">' +
      '<svg class="icon-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>' +
      '<svg class="icon-moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' +
      '</button>' +
      '</div></header>';
  }

  function footerHTML() {
    return '<footer class="app-footer"><p class="caption">서로의 다름이, 더 좋은 일상이 되는 곳. MATE:ON</p></footer>';
  }

  function shell(content) {
    app.innerHTML = '<div class="app-shell">' + headerHTML() +
      '<main class="app-main">' + content + '</main>' + footerHTML() + '</div>';
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
  function vHome() {
    var resume = '';
    if (S.me) {
      var c = charById(S.me.charId);
      resume = '' +
        '<div class="card resume-card">' +
        '<span class="avatar">' + esc((S.me.name || '나')[0]) + '</span>' +
        '<div class="resume-info">' +
        '<strong class="body-sm">' + esc(S.me.name || '나') + '님의 결과가 있어요</strong>' +
        '<p class="caption text-muted">' + esc(c.name) + ' (' + c.code + ')</p>' +
        '</div>' +
        '<button class="btn btn-secondary btn-sm" data-action="result" type="button">결과 보기</button>' +
        '</div>';
    }
    var partner = '';
    if (S.partner) {
      var pc = charById(S.partner.charId);
      partner = '' +
        '<div class="card resume-card">' +
        '<span class="avatar avatar-secondary">' + esc((S.partner.name || '상')[0]) + '</span>' +
        '<div class="resume-info">' +
        '<strong class="body-sm">' + esc(S.partner.name || '상대') + '님과 연결됨</strong>' +
        '<p class="caption text-muted">' + esc(pc.name) + ' (' + pc.code + ')</p>' +
        '</div>' +
        '<button class="btn btn-primary btn-sm" data-action="report" type="button">리포트</button>' +
        '</div>';
    }

    shell('' +
      '<section class="hero-home">' +
      logoSVG(120) +
      '<h1 class="hero-slogan">함께 살 준비,<br>서로를 아는 것부터.</h1>' +
      '<p class="hero-sub body-md">MATE:ON은 함께 살기 전, 서로의 생활방식을 미리 이해하고<br>맞춰보는 동거 성향 진단 서비스입니다.</p>' +
      '<div class="hero-cta">' +
      '<button class="btn btn-primary btn-lg" data-action="start" type="button">진단 시작하기</button>' +
      '<button class="btn btn-tertiary btn-md" data-action="demo" type="button">데모로 먼저 보기</button>' +
      '</div>' +
      '<div class="hero-meta">' +
      '<span class="badge badge-neutral">20문항 · 약 3분</span>' +
      '<span class="badge badge-neutral">16개 동거 캐릭터</span>' +
      '<span class="badge badge-neutral">우리 둘 궁합 리포트</span>' +
      '</div>' +
      resume + partner +
      (S.answers.length > 0 && S.answers.length < QUESTIONS.length
        ? '<div class="card resume-card">' +
          '<div class="resume-info"><strong class="body-sm">진단이 진행 중이에요</strong>' +
          '<p class="caption text-muted">' + S.answers.length + ' / ' + QUESTIONS.length + ' 문항 완료</p></div>' +
          '<button class="btn btn-secondary btn-sm" data-action="resume-survey" type="button">이어하기</button></div>'
        : '') +
      '<div class="steps">' +
      '<div class="card step-card"><span class="step-num">1</span><div><strong class="body-sm">나의 생활 성향 진단</strong><p class="body-sm text-muted">실제 동거 상황을 담은 20개 문항으로 나의 유형을 발견해요.</p></div></div>' +
      '<div class="card step-card"><span class="step-num">2</span><div><strong class="body-sm">상대 초대 &amp; 결과 비교</strong><p class="body-sm text-muted">링크로 상대를 초대해 같은 점보다 다른 점을 먼저 확인해요.</p></div></div>' +
      '<div class="card step-card"><span class="step-num">3</span><div><strong class="body-sm">갈등 예측 &amp; 우리집 합의서</strong><p class="body-sm text-muted">예상 갈등을 미리 보고, 우리 둘만의 생활규칙을 만들어요.</p></div></div>' +
      '</div>' +
      '<div class="quick-nav">' +
      '<button class="quick-link" data-action="types" type="button">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>' +
      '16유형 도감</button>' +
      '<button class="quick-link" data-action="checklist" type="button">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>' +
      '입주 체크리스트</button>' +
      '<button class="quick-link" data-action="share-home" type="button">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>' +
      '친구에게 공유</button>' +
      '</div>' +
      '</section>');
  }

  /* ================= View: 온보딩 ================= */
  var RELATIONS = ['연인', '배우자 예정', '친구', '지인', '처음 만난 룸메이트'];
  var STAGES = ['고려 중', '집 탐색 중', '계약 완료', '입주 직전', '이미 동거 중'];

  function vOnboarding() {
    var inviteBanner = '';
    if (S.flow === 'partner' && S.invite) {
      inviteBanner = '<div class="invite-banner"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span><strong>' + esc(S.invite.name) + '님</strong>이 당신을 초대했어요. 진단하면 둘의 생활을 맞춰볼 수 있어요.</span></div>';
    } else if (S.flow === 'partner' && S.me) {
      inviteBanner = '<div class="invite-banner"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span><strong>' + esc(S.me.name) + '님의 상대</strong>로 진단해요. 이 기기에서 바로 이어서 할 수 있어요.</span></div>';
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
      '<input id="pf-name" class="input" type="text" maxlength="12" placeholder="예: 다원" value="' + esc(S.profile.name) + '">' +
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
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>' +
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
    return base + '?invite=' + encodeResult(rr);
  }

  function vResult() {
    var r = S.flow === 'partner' ? S.partner : S.me;
    if (!r) { go('home'); return; }
    var c = charById(r.charId);
    var c2 = charById(r.char2Id);
    var isMine = S.flow === 'me';
    var noteIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>';

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
      '<div class="custom-rule"><input id="code-connect-in" class="input" maxlength="4" placeholder="E3R2" style="text-transform:uppercase">' +
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
          '<div class="conflict-prev"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px"><path d="M20 6 9 17l-5-5"/></svg><span><strong>예방법</strong> · ' + esc(sc.prevention) + '</span></div>' +
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
          '<span class="rule-check"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>' +
          '<span>' + esc(r.text) + '</span>' +
          (rec ? '<span class="badge badge-brand rule-area">추천</span>' : '<span class="rule-area">' + esc(r.area) + '</span>') +
          '</button>';
      }).join('') +
      S.customRules.map(function (t) {
        var checked = S.checkedRules.indexOf(t) >= 0;
        return '<button class="rule-item' + (checked ? ' checked' : '') + '" data-action="rule" data-v="' + esc(t) + '" type="button" aria-pressed="' + checked + '">' +
          '<span class="rule-check"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>' +
          '<span>' + esc(t) + '</span><span class="badge badge-info rule-area">직접 추가</span></button>';
      }).join('') +
      '</div>' +
      '<div class="custom-rule"><input id="custom-rule-in" class="input" maxlength="60" placeholder="우리만의 규칙 직접 추가 (예: 화요일 저녁은 각자 자유시간)">' +
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
      return '<div class="agree-rule"><svg class="check-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span>' + esc(t) + '</span></div>';
    }).join('');

    var savedNote = ag ? '<div class="note-box good" style="margin-top:16px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg><span>' + esc(ag.date) + '에 저장된 합의서가 있어요. (' + ag.rules.length + '개 규칙)</span></div>' : '';

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
    var noteIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>';

    shell('' +
      '<div class="survey-top"><button class="back-btn" data-action="types" type="button" aria-label="도감으로">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button>' +
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
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button>' +
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
            '<span class="rule-check"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>' +
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

  /* ================= 공유 / 이미지 / ICS ================= */
  function baseURL() {
    return location.href.split('?')[0].split('#')[0];
  }

  // 카카오 JS 키가 설정되면 카카오톡 공유 사용, 아니면 Web Share → 복사 순 fallback
  var KAKAO_APP_KEY = '';
  function shareSmart(title, text, url) {
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
    MateCard.download(cv, 'mateon-' + c.code + '-result.png');
    showToast('결과 카드 이미지가 저장됐어요');
  }

  function saveAgreeImage() {
    var rules = S.checkedRules.length ? S.checkedRules : BASE_RULES.map(function (r) { return r.text; });
    var today = new Date();
    var cv = MateCard.agreementCard({
      names: (S.me.name || '나') + ' · ' + (S.partner.name || '상대'),
      date: today.getFullYear() + '년 ' + (today.getMonth() + 1) + '월 ' + today.getDate() + '일',
      rules: rules,
    });
    MateCard.download(cv, 'mateon-agreement.png');
    showToast('합의서 이미지가 저장됐어요');
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

    if (act === 'home') { S.flow = 'me'; go('home'); }
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
    else if (act === 'demo') {
      S.me = SAMPLE_RESULTS.me; S.partner = SAMPLE_RESULTS.partner;
      save('mateon.me', S.me); save('mateon.partner', S.partner);
      resetRulesForNewPartner();
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
      var key = el.dataset.v;
      S.checklist[key] = !S.checklist[key];
      save('mateon.checklist', S.checklist);
      render();
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
    location.hash = '#/' + route;
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
      case 'checklist': vChecklist(); break;
      default: vHome();
    }
  }

  window.addEventListener('hashchange', render);
  render();

  /* ================= PWA Service Worker ================= */
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { });
    });
  }

  /* ================= 테스트 훅 ================= */
  window.__mateon = {
    encodeResult: encodeResult,
    decodeResult: decodeResult,
    resultFromCode: resultFromCode,
    pairURL: pairURL,
    codeDist: codeDist,
  };
})();
