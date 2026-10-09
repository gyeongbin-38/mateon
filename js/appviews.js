/* MateViews — 정적·프로필 뷰 렌더러 (mateon.js에서 분리)
   window.MateViews.bind({S, esc, shell, docShell})로 앱 상태와 헬퍼를 주입한 뒤 호출한다.
   의존 전역: data.js 상수(RELATIONS, STAGES) */
window.MateViews = (function () {
  var X;
  function bind(deps) {
    X = deps;
  }
  function esc(s) {
    return X.esc(s);
  }

  /* ---- 온보딩: 이름·관계·준비 단계 ---- */
  function vOnboarding() {
    var S = X.S;
    var inviteBanner = '';
    if (S.flow === 'partner' && S.invite) {
      inviteBanner =
        '<div class="invite-banner"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span><strong>' +
        esc(S.invite.name) +
        '님</strong>이 당신을 초대했어요. 진단하면 둘의 생활을 맞춰볼 수 있어요.</span></div>';
    } else if (S.flow === 'partner' && S.me) {
      inviteBanner =
        '<div class="invite-banner"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span><strong>' +
        esc(S.me.name) +
        '님의 상대</strong>로 진단해요. 이 기기에서 바로 이어서 할 수 있어요.</span></div>';
    }

    X.shell(
      '' +
        '<p class="eyebrow caption">' +
        (S.flow === 'partner' ? 'Partner' : 'Step 1') +
        '</p>' +
        '<h2 class="view-title">' +
        (S.flow === 'partner' ? '이번에는 우리 둘의 생활을 맞춰볼까요?' : '같이 살면 나는 어떤 사람일까요?') +
        '</h2>' +
        '<p class="view-desc body-md">결과를 부를 이름과 두 분의 관계만 알려주세요.</p>' +
        '<div class="view-stack">' +
        inviteBanner +
        '<div class="card">' +
        '<div class="field-group">' +
        '<label class="field-label" for="pf-name">이름 또는 닉네임</label>' +
        '<input id="pf-name" class="input" type="text" name="nickname" maxlength="12" placeholder="예: 다원" autocomplete="nickname" spellcheck="false" value="' +
        esc(S.profile.name) +
        '">' +
        '</div>' +
        '<div class="field-group">' +
        '<span class="field-label">상대와의 관계</span>' +
        '<div class="chip-row" id="rel-chips">' +
        RELATIONS.map(function (r) {
          return (
            '<button class="chip' +
            (S.profile.relation === r ? ' selected' : '') +
            '" data-action="rel" data-v="' +
            esc(r) +
            '" type="button">' +
            esc(r) +
            '</button>'
          );
        }).join('') +
        '</div></div>' +
        '<div class="field-group" style="margin-bottom:0">' +
        '<span class="field-label">동거 준비 단계</span>' +
        '<div class="chip-row" id="stage-chips">' +
        STAGES.map(function (s) {
          return (
            '<button class="chip' +
            (S.profile.stage === s ? ' selected' : '') +
            '" data-action="stage" data-v="' +
            esc(s) +
            '" type="button">' +
            esc(s) +
            '</button>'
          );
        }).join('') +
        '</div></div>' +
        '</div>' +
        '<div class="cta-col">' +
        '<button class="btn btn-primary btn-lg" data-action="survey" type="button">진단 시작하기</button>' +
        '<button class="btn btn-tertiary btn-md" data-action="home" type="button">처음으로</button>' +
        '</div>' +
        '</div>'
    );
  }

  /* ---- 개인정보처리방침 ---- */
  function vPrivacy() {
    X.docShell(
      '개인정보처리방침',
      'Privacy',
      '시행일: 2026년 9월 24일 · 버전 0.1 (MVP)',
      '<h4>수집하는 정보</h4>' +
        '<p>MATE:ON은 회원가입 없이 사용할 수 있으며, 다음 정보를 이용자가 직접 입력하거나 진단 과정에서 생성합니다.</p>' +
        '<p>· 닉네임, 관계 유형, 동거 준비 단계<br>· 20문항 성향 진단 응답과 유형 결과<br>· 실무 성향 체크 응답, 직접 추가한 생활규칙, 합의서와 서명 상태, 입주 체크리스트</p>' +
        '<h4>저장 위치</h4>' +
        '<p>모든 정보는 이용자의 기기 브라우저(localStorage)에만 저장됩니다. 별도의 서버로 전송하거나 수집하지 않으며, 운영자가 이용자의 응답 내용을 열람할 수 없습니다.</p>' +
        '<h4>초대 링크와 공유</h4>' +
        '<p>초대 링크에는 닉네임(끄기 가능), 관계 유형, 유형 코드와 성향 수치가 URL 형태로 포함됩니다. 문항별 응답 내용은 포함되지 않습니다. 링크를 가진 사람은 누구나 그 결과를 볼 수 있으므로, 공유 대상을 신중하게 정해 주세요.</p>' +
        '<h4>정보의 이동과 삭제</h4>' +
        '<p>설정 → 백업에서 이 기기의 데이터를 JSON 파일로보내고 다시 불러올 수 있습니다. 백업 파일에는 이용자의 진단·합의서·기록이 포함되므로 보관과 공유에 주의해 주세요.</p>' +
        '<p>설정 → 데이터 관리에서 각 항목을 삭제하거나 모든 데이터를 한 번에 삭제할 수 있습니다. 브라우저의 사이트 데이터 삭제 기능으로도 같은 효과를 낼 수 있습니다.</p>' +
        '<h4>쿠키·분석 도구</h4>' +
        '<p>현재 버전은 광고, 분석, 추적 도구를 사용하지 않습니다.</p>' +
        '<h4>문의</h4>' +
        '<p>개인정보 관련 문의는 서비스 내 안내를 참고해 주세요. 이 방침은 MVP 단계의 안내문으로, 서비스가 확장되면 함께 업데이트됩니다.</p>'
    );
  }

  /* ---- 서비스 이용약관 ---- */
  function vTerms() {
    X.docShell(
      '서비스 이용약관',
      'Terms',
      '시행일: 2026년 9월 24일 · 버전 0.1 (MVP)',
      '<h4>서비스의 성격</h4>' +
        '<p>MATE:ON은 함께 사는 사람들이 서로의 생활 성향을 이해하고 대화할 수 있도록 돕는 참고 도구입니다. 제공되는 진단, 유형, 궁합 리포트, 갈등 예측은 의학적·심리학적·법률적 판단이 아니며, 관계의 적합성을 평가하거나 단정하지 않습니다.</p>' +
        '<h4>우리집 합의서</h4>' +
        '<p>합의서는 생활 규칙을 함께 정리하기 위한 문서 도구이며 법적 효력이 없습니다. 임대차 계약이나 법적 권리·의무는 관련 법령과 전문가 상담을 따르세요.</p>' +
        '<h4>이용자의 책임</h4>' +
        '<p>이용자는 자신의 응답과 결과를 스스로 해석하며, 초대 링크 등 공유 기능 사용 시 공유 범위를 확인할 책임이 있습니다. 타인의 동의 없이 그 사람의 결과를 공유하지 말아 주세요.</p>' +
        '<h4>저장 데이터</h4>' +
        '<p>이용자의 데이터는 기기 브라우저에 저장되며, 기기 변경·브라우저 데이터 삭제 시 복구되지 않을 수 있습니다. 백업 파일의 보관과 복원은 이용자가 직접 관리합니다.</p>' +
        '<h4>서비스 변경</h4>' +
        '<p>현재 버전은 MVP로, 기능과 화면은 예고 없이 변경·중단될 수 있습니다.</p>'
    );
  }

  /* ---- 유형 도감 ---- */
  function vTypes() {
    var S = X.S;
    var myC = S.me ? X.charById(S.me.charId) : null;
    var cells = CHARACTERS.map(function (c, i) {
      var cls = 'type-card';
      if (S.me && S.me.charId === c.id) cls += ' mine';
      else if (S.partner && S.partner.charId === c.id) cls += ' partner';
      var dist = '';
      if (myC) {
        var d = X.codeDist(myC, c);
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
        X.characterArt(c, true) +
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

    X.shell(
      '' +
        '<p class="eyebrow caption">Type Book</p>' +
        '<h2 class="view-title">' +
        esc(X.T('view.types.title')) +
        '</h2>' +
        '<p class="view-desc body-md">' +
        esc(X.T('view.types.desc')) +
        '</p>' +
        (legend ? '<div class="hero-meta" style="justify-content:flex-start;margin-top:16px">' + legend + '</div>' : '') +
        '<div style="margin-top:20px">' +
        X.matrixHTML(S.me ? S.me.charId : null, S.partner ? S.partner.charId : null, S.me ? S.me.name : null, S.partner ? S.partner.name : null) +
        '</div>' +
        '<div class="type-grid" style="margin-top:24px">' +
        cells +
        '</div>' +
        '<div class="cta-col"><button class="btn btn-tertiary btn-md" data-action="home" type="button">홈으로</button></div>'
    );
  }

  /* ---- 유형 상세 ---- */
  function vTypeDetail() {
    var S = X.S;
    var c = X.charById(S.typeId);
    if (!c) {
      X.go('types');
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

    X.shell(
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
        X.characterArt(c, false) +
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

  return { bind: bind, vOnboarding: vOnboarding, vPrivacy: vPrivacy, vTerms: vTerms, vTypes: vTypes, vTypeDetail: vTypeDetail };
})();
