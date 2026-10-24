/* 단계별 입주 준비와 같은 기기에서 두 사람이 확인하는 생활 규칙 흐름. */
window.MatePrep = (function () {
  /** @type {any} */
  var X;
  var proposer = 'me';
  function bind(deps) {
    X = deps;
  }
  function esc(value) {
    return X.esc(value);
  }
  function button(action, label, kind, extra) {
    return '<button type="button" class="btn btn-' + (kind || 'primary') + ' btn-md" data-action="' + action + '" ' + (extra || '') + '>' + label + '</button>';
  }
  function steps(labels, active) {
    return (
      '<ol class="flow-steps" aria-label="진행 단계">' +
      labels
        .map(function (s, i) {
          return '<li' + (i === active ? ' aria-current="step"' : '') + '><span>' + (i + 1) + '</span>' + s + '</li>';
        })
        .join('') +
      '</ol>'
    );
  }
  function choice(action, key, text, selected, hint) {
    return (
      '<button type="button" class="rule-item' +
      (selected ? ' checked' : '') +
      '" data-action="' +
      action +
      '" data-v="' +
      esc(key) +
      '" aria-pressed="' +
      !!selected +
      '"><span class="rule-check" aria-hidden="true">' +
      (selected ? '✓' : '') +
      '</span><span>' +
      esc(text) +
      (hint ? '<small>' + esc(hint) + '</small>' : '') +
      '</span></button>'
    );
  }
  function entries() {
    var result = [];
    CHECKLIST.forEach(function (g) {
      g.items.forEach(function (text, i) {
        result.push({ key: g.cat + ':' + i, cat: g.cat, text: text });
      });
    });
    X.S.customChecklist.forEach(function (x) {
      result.push({ key: 'own:' + x.id, cat: '직접 추가한 항목', text: x.text });
    });
    return result;
  }
  function plan() {
    return (
      X.load('mateon.checklistPlan') || {
        selected: entries().map(function (e) {
          return e.key;
        }),
        stage: 'select',
        step: 0,
        savedAt: 0,
      }
    );
  }
  function selectedEntries(p) {
    return entries().filter(function (e) {
      return p.selected.indexOf(e.key) >= 0;
    });
  }
  function checklistStats() {
    var p = plan(),
      all = selectedEntries(p);
    return {
      total: all.length,
      done: all.filter(function (e) {
        return !!X.S.checklist[e.key];
      }).length,
    };
  }
  function customForm() {
    return (
      '<section class="card"><h3 class="card-title">우리집 준비 항목 추가</h3><label class="field-label" for="cl-custom-in">필요한 준비</label><div class="custom-rule"><input id="cl-custom-in" class="input" maxlength="40" autocomplete="off" placeholder="예: 반려동물 안전문 준비">' +
      button('cl-add', '추가', 'secondary') +
      '</div></section>'
    );
  }
  function vChecklist() {
    var p = plan(),
      all = selectedEntries(p),
      stats = checklistStats();
    var intro = steps(['항목 선택', '파트별 체크', '계획 저장'], p.stage === 'select' ? 0 : p.stage === 'done' ? 2 : 1);
    if (p.stage === 'done') {
      X.shell(
        intro +
          '<section class="card flow-success"><span class="flow-success-mark" aria-hidden="true">✓</span><h2>입주 준비 계획을 저장했어요</h2><p>선택한 ' +
          stats.total +
          '개 중 ' +
          stats.done +
          '개를 준비했어요.</p><p>' +
          (stats.total === stats.done ? '선택한 준비를 모두 마쳤어요.' : '남은 ' + (stats.total - stats.done) + '개는 준비할 때마다 이어서 체크할 수 있어요.') +
          '</p></section><div class="cta-col">' +
          button('prep-resume', '준비 현황 이어보기') +
          button('prep-select', '필요한 항목 다시 고르기', 'secondary') +
          button('space', '우리 공간으로', 'tertiary') +
          '</div>'
      );
      return;
    }
    var body = '';
    if (p.stage === 'select') {
      body =
        '<section class="page-intro"><h2>우리집에 필요한 준비만 골라요</h2><p>기본 항목 중 필요한 것을 선택하고, 직접 추가할 수도 있어요. 선택과 준비 완료는 별도로 기록됩니다.</p></section><p class="flow-count" role="status">선택한 항목 ' +
        all.length +
        '개</p>';
      CHECKLIST.concat([{ cat: '직접 추가한 항목', items: [] }]).forEach(function (g) {
        var rows = entries().filter(function (e) {
          return e.cat === g.cat;
        });
        if (!rows.length) return;
        body +=
          '<section class="card prep-group"><h3>' +
          esc(g.cat) +
          '</h3>' +
          rows
            .map(function (e) {
              return choice('prep-toggle', e.key, e.text, p.selected.indexOf(e.key) >= 0);
            })
            .join('') +
          '</section>';
      });
      body += customForm();
      body +=
        '<div class="flow-actions">' +
        button('prep-draft', '임시저장', 'secondary') +
        button('prep-start', '선택한 항목으로 시작', 'primary', !all.length ? 'disabled' : '') +
        '</div>';
    } else {
      var cats = [];
      all.forEach(function (e) {
        if (cats.indexOf(e.cat) < 0) cats.push(e.cat);
      });
      if (!cats.length) {
        p.stage = 'select';
        X.save('mateon.checklistPlan', p);
        vChecklist();
        return;
      }
      p.step = Math.max(0, Math.min(p.step, cats.length - 1));
      var cat = cats[p.step],
        last = p.step === cats.length - 1;
      body =
        '<section class="page-intro"><span class="app-overline">파트 ' +
        (p.step + 1) +
        ' / ' +
        cats.length +
        '</span><h2>' +
        esc(cat) +
        '</h2><p>실제로 준비를 마친 항목을 체크해 주세요. 입력 내용은 자동 저장돼요.</p></section>';
      body +=
        '<div class="check-progress"><div class="progress"><div class="progress-fill" style="width:' +
        (stats.total ? Math.round((stats.done / stats.total) * 100) : 0) +
        '%"></div></div><span class="progress-num">' +
        stats.done +
        ' / ' +
        stats.total +
        '</span></div>';
      body +=
        '<section class="card prep-group">' +
        all
          .filter(function (e) {
            return e.cat === cat;
          })
          .map(function (e) {
            return choice('check', e.key, e.text, X.S.checklist[e.key]);
          })
          .join('') +
        '</section>';
      body +=
        '<label class="field-label" for="move-date-in">입주 예정일 (선택)</label><div class="custom-rule"><input id="move-date-in" class="input" type="date" value="' +
        esc(X.S.moveDate || '') +
        '">' +
        button('move-date-set', '저장', 'secondary') +
        '</div>';
      body +=
        '<div class="flow-actions">' +
        button('prep-draft', '임시저장', 'secondary') +
        button(last ? 'prep-finish' : 'prep-next', last ? '완료' : '다음 파트') +
        '</div><div class="flow-secondary">' +
        (p.step ? button('prep-prev', '이전 파트', 'tertiary') : '') +
        button('prep-select', '필요한 항목 변경', 'tertiary') +
        '</div>';
      if (last) body += '<p class="flow-note">완료는 계획 저장을 뜻해요. 아직 준비하지 않은 항목은 그대로 남습니다.</p>';
    }
    X.shell(intro + body);
  }
  function pairKey() {
    return JSON.stringify([X.S.me && X.S.me.name, X.S.me && X.S.me.charId, X.S.partner && X.S.partner.name, X.S.partner && X.S.partner.charId]);
  }
  function ruleDraft() {
    var d = X.load('mateon.ruleDraft');
    if (d && d.pair === pairKey()) return d;
    var ag = X.savedAgreement();
    return {
      pair: pairKey(),
      rows: (ag ? ag.rules : []).map(function (t) {
        return { text: t, final: t, me: true, partner: true, okMe: true, okPartner: true };
      }),
    };
  }
  function saveRules(d) {
    X.S.checkedRules = d.rows
      .filter(function (r) {
        return r.me || r.partner;
      })
      .map(function (r) {
        return r.final;
      });
    X.S.rulesReady = true;
    X.S.signs = { me: false, partner: false };
    X.save('mateon.ruleDraft', d);
  }
  function rulesApproved() {
    var ag = X.savedAgreement(),
      rules = X.agreementRules();
    if (ag && JSON.stringify(ag.rules) === JSON.stringify(rules)) return true;
    var d = ruleDraft(),
      rows = d.rows.filter(function (r) {
        return r.me || r.partner;
      });
    return (
      !!rows.length &&
      JSON.stringify(
        rows.map(function (r) {
          return r.final;
        })
      ) === JSON.stringify(rules) &&
      rows.every(function (r) {
        return r.okMe && r.okPartner;
      })
    );
  }
  function restoreRules() {
    var d = X.load('mateon.ruleDraft');
    var ag = X.savedAgreement();
    if (
      ag &&
      d &&
      JSON.stringify(ag.rules) ===
        JSON.stringify(
          d.rows
            .filter(function (r) {
              return r.me || r.partner;
            })
            .map(function (r) {
              return r.final;
            })
        )
    )
      return;
    if (!X.S.rulesReady && d && d.pair === pairKey()) {
      X.S.checkedRules = d.rows
        .filter(function (r) {
          return r.me || r.partner;
        })
        .map(function (r) {
          return r.final;
        });
      X.S.rulesReady = true;
      X.S.signs = { me: false, partner: false };
    }
  }
  function vRules(review) {
    if (!X.S.me || !X.S.partner) {
      X.shell(
        '<section class="page-intro"><h2>함께 정할 메이트를 연결해 주세요</h2><p>두 사람의 진단을 연결하면 각자의 규칙을 제안하고 합의할 수 있어요.</p></section>' +
          button(X.S.me ? 'invite' : 'start', X.S.me ? '메이트 연결하기' : '내 진단 시작하기')
      );
      return;
    }
    var d = ruleDraft(),
      body = steps(['각자 제안', '조항 조율', '동의·서명'], review ? 1 : 0);
    restoreRules();
    body += '<p class="flow-note">같은 기기를 번갈아 사용하며 본인의 이름으로 제안·확인해 주세요. 상대의 동의가 자동으로 처리되지는 않아요.</p>';
    if (!review) {
      body +=
        '<section class="page-intro"><h2>각자 지키고 싶은 규칙을 골라요</h2><p>이름을 선택해 각자의 의견을 남기세요. 두 사람의 제안은 다음 단계에서 함께 조율해요.</p></section>';
      body +=
        '<div class="flow-tabs" role="group" aria-label="규칙 제안자">' +
        ['me', 'partner']
          .map(function (who) {
            return button(
              'proposal-person',
              esc(X.payerName(who)) + '의 제안',
              proposer === who ? 'primary' : 'secondary',
              'data-v="' + who + '" aria-pressed="' + (proposer === who) + '"'
            );
          })
          .join('') +
        '</div>';
      var candidates = [];
      BASE_RULES.concat(RULE_LIBRARY).forEach(function (r) {
        if (candidates.indexOf(r.text) < 0) candidates.push(r.text);
      });
      X.S.customRules
        .concat(
          d.rows.map(function (r) {
            return r.text;
          })
        )
        .forEach(function (t) {
          if (candidates.indexOf(t) < 0) candidates.push(t);
        });
      body +=
        '<section class="card prep-group">' +
        candidates
          .map(function (t) {
            var row = d.rows.find(function (r) {
              return r.text === t;
            });
            return choice(
              'proposal-toggle',
              t,
              t,
              row && row[proposer],
              row && row[proposer === 'me' ? 'partner' : 'me'] ? X.payerName(proposer === 'me' ? 'partner' : 'me') + '님도 제안했어요' : ''
            );
          })
          .join('') +
        '</section>';
      body +=
        '<section class="card"><label class="field-label" for="proposal-text">직접 규칙 제안하기</label><div class="custom-rule"><input id="proposal-text" class="input" maxlength="60" autocomplete="off" placeholder="예: 밤 11시 이후 이어폰 사용">' +
        button('proposal-add', '제안 추가', 'secondary') +
        '</div></section>';
      var count = d.rows.filter(function (r) {
        return r.me || r.partner;
      }).length;
      body +=
        '<div class="flow-actions">' +
        button('rules-draft', '임시저장', 'secondary') +
        button('rules-review', count + '개 조항 조율하기', 'primary', !count ? 'disabled' : '') +
        '</div>';
    } else {
      var rows = d.rows.filter(function (r) {
        return r.me || r.partner;
      });
      body +=
        '<section class="page-intro"><h2>같이 지킬 문장으로 맞춰요</h2><p>제안자를 확인하고 문장을 수정할 수 있어요. 수정하면 두 사람 모두 다시 확인해야 해요.</p></section>';
      body += rows
        .map(function (r, i) {
          return (
            '<section class="card rule-review"><span class="app-overline">조항 ' +
            (i + 1) +
            ' · ' +
            esc([r.me ? X.payerName('me') : '', r.partner ? X.payerName('partner') : ''].filter(Boolean).join('·')) +
            ' 제안</span><label class="field-label" for="rule-final-' +
            i +
            '">함께 지킬 규칙</label><div class="custom-rule"><textarea class="input" rows="2" id="rule-final-' +
            i +
            '" maxlength="60">' +
            esc(r.final) +
            '</textarea>' +
            button('proposal-edit', '수정 반영', 'secondary', 'data-v="' + esc(r.text) + '" data-index="' + i + '"') +
            '</div><div class="flow-tabs">' +
            ['me', 'partner']
              .map(function (who) {
                var on = r[who === 'me' ? 'okMe' : 'okPartner'];
                return button(
                  'proposal-approve',
                  esc(X.payerName(who)) + (on ? ' · 확인함' : ' · 확인하기'),
                  on ? 'primary' : 'secondary',
                  'data-v="' + esc(r.text) + '" data-who="' + who + '" aria-pressed="' + !!on + '"'
                );
              })
              .join('') +
            '</div></section>'
          );
        })
        .join('');
      var approved =
        rows.length &&
        rows.every(function (r) {
          return r.okMe && r.okPartner;
        });
      body +=
        '<p class="flow-count" role="status">두 사람 확인 완료 ' +
        rows.filter(function (r) {
          return r.okMe && r.okPartner;
        }).length +
        ' / ' +
        rows.length +
        '개</p><div class="flow-actions">' +
        button('rules', '규칙 다시 선택', 'secondary') +
        button('agreement', '최종 동의·서명', 'primary', !approved ? 'disabled' : '') +
        '</div>';
    }
    X.shell(body);
  }
  function vAgreementComplete() {
    var ag = X.savedAgreement();
    if (!ag) {
      X.go('agreement');
      return;
    }
    X.shell(
      steps(['각자 제안', '조항 조율', '동의·서명'], 2) +
        '<section class="card flow-success"><span class="flow-success-mark" aria-hidden="true">✓</span><h2>' +
        ag.rules.length +
        '개 조항 합의 완료</h2><p>' +
        esc(ag.me) +
        '님과 ' +
        esc(ag.partner) +
        '님이 같은 기기에서 확인하고 서명한 생활 규칙이에요.</p><p>' +
        esc(ag.date) +
        ' · 합의서 v' +
        (ag.rev || 1) +
        '</p></section><section class="card"><h3>함께 지킬 약속</h3><ol class="agreed-list">' +
        ag.rules
          .map(function (t) {
            return '<li>' + esc(t) + '</li>';
          })
          .join('') +
        '</ol></section><div class="cta-col">' +
        button('agreement', '저장한 합의서 보기') +
        button('space', '우리 공간으로', 'secondary') +
        '</div>'
    );
  }
  function handle(action, el) {
    if (action.indexOf('prep-') === 0) {
      var p = plan();
      if (action === 'prep-toggle') {
        var at = p.selected.indexOf(el.dataset.v);
        if (at < 0) p.selected.push(el.dataset.v);
        else p.selected.splice(at, 1);
      } else if (action === 'prep-start' || action === 'prep-resume') {
        if (!selectedEntries(p).length) return true;
        p.stage = 'steps';
      } else if (action === 'prep-select') p.stage = 'select';
      else if (action === 'prep-next') {
        p.step++;
        window.scrollTo(0, 0);
      } else if (action === 'prep-prev') {
        p.step = Math.max(0, p.step - 1);
        window.scrollTo(0, 0);
      } else if (action === 'prep-finish') p.stage = 'done';
      p.savedAt = Date.now();
      X.save('mateon.checklistPlan', p);
      if (action === 'prep-draft') {
        X.go('space');
        X.toast('체크리스트를 임시저장했어요');
      } else {
        X.render();
        if (action !== 'prep-toggle') window.scrollTo(0, 0);
      }
      return true;
    }
    if (action === 'rules' || action === 'rules-review') {
      var next = ruleDraft();
      if (el.dataset.seed === 'recommendations')
        X.S.checkedRules.forEach(function (t) {
          var r = next.rows.find(function (x) {
            return x.final === t;
          });
          if (!r) next.rows.push({ text: t, final: t, me: true, partner: false, okMe: false, okPartner: false });
        });
      saveRules(next);
      X.go(action);
      return true;
    }
    if (action === 'rules-draft') {
      saveRules(ruleDraft());
      X.go('space');
      X.toast('규칙 제안을 임시저장했어요');
      return true;
    }
    if (action.indexOf('proposal-') !== 0) return false;
    var d = ruleDraft(),
      text = el.dataset.v,
      row = d.rows.find(function (r) {
        return r.text === text;
      });
    if (action === 'proposal-person') proposer = text === 'partner' ? 'partner' : 'me';
    else if (action === 'proposal-add') {
      var field = document.getElementById('proposal-text');
      var input = field ? field.value.trim() : '';
      if (!input || input.length > 60) {
        X.toast('규칙을 1~60자로 입력해 주세요');
        return true;
      }
      if (d.rows.length >= 60) {
        X.toast('규칙은 최대 60개까지 제안할 수 있어요');
        return true;
      }
      row = d.rows.find(function (r) {
        return r.text === input;
      });
      if (!row) {
        row = { text: input, final: input, me: false, partner: false, okMe: false, okPartner: false };
        d.rows.push(row);
      }
      row[proposer] = true;
    } else if (action === 'proposal-toggle') {
      if (!row) {
        row = { text: text, final: text, me: false, partner: false, okMe: false, okPartner: false };
        d.rows.push(row);
      }
      row[proposer] = !row[proposer];
      row.okMe = false;
      row.okPartner = false;
    } else if (row && action === 'proposal-edit') {
      var edit = document.getElementById('rule-final-' + el.dataset.index);
      var final = edit ? edit.value.trim() : '';
      if (!final || final.length > 60) {
        X.toast('규칙을 1~60자로 입력해 주세요');
        return true;
      }
      if (row.final !== final) {
        row.final = final;
        row.okMe = false;
        row.okPartner = false;
      }
    } else if (row && action === 'proposal-approve') {
      var rowIndex = d.rows
        .filter(function (r) {
          return r.me || r.partner;
        })
        .indexOf(row);
      var pendingEdit = document.getElementById('rule-final-' + rowIndex);
      if (pendingEdit && pendingEdit.value.trim() !== row.final) {
        X.toast('바꾼 문장은 먼저 수정 반영을 눌러 주세요');
        return true;
      }
      var whoKey = el.dataset.who === 'partner' ? 'okPartner' : 'okMe';
      row[whoKey] = !row[whoKey];
    }
    saveRules(d);
    X.render();
    return true;
  }
  function addedChecklist(id) {
    var p = plan();
    if (p.selected.indexOf('own:' + id) < 0) p.selected.push('own:' + id);
    X.save('mateon.checklistPlan', p);
  }
  function validDraft(key, v) {
    if (key === 'mateon.checklistPlan')
      return !!(
        v &&
        Array.isArray(v.selected) &&
        v.selected.length <= 200 &&
        v.selected.every(function (s) {
          return typeof s === 'string' && s.length < 100;
        }) &&
        ['select', 'steps', 'done'].indexOf(v.stage) >= 0 &&
        Number.isInteger(v.step) &&
        v.step >= 0 &&
        v.step < 10
      );
    return !!(
      v &&
      typeof v.pair === 'string' &&
      v.pair.length < 300 &&
      Array.isArray(v.rows) &&
      v.rows.length <= 100 &&
      v.rows.every(function (r) {
        return (
          r &&
          typeof r.text === 'string' &&
          r.text.length <= 60 &&
          typeof r.final === 'string' &&
          r.final.length > 0 &&
          r.final.length <= 60 &&
          ['me', 'partner', 'okMe', 'okPartner'].every(function (k) {
            return typeof r[k] === 'boolean';
          })
        );
      })
    );
  }
  return {
    bind: bind,
    vChecklist: vChecklist,
    checklistStats: checklistStats,
    vRules: vRules,
    vAgreementComplete: vAgreementComplete,
    rulesApproved: rulesApproved,
    restoreRules: restoreRules,
    handle: handle,
    addedChecklist: addedChecklist,
    validDraft: validDraft,
  };
})();
