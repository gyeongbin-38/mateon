/* ============================================================
   MATE:ON — 공유용 이미지 카드 생성 (Canvas)
   결과 카드(1080x1350) / 합의서 카드(1080x1350)
   ============================================================ */
var MateCard = (function () {
  'use strict';

  var FONT = "'Pretendard Variable', Pretendard, -apple-system, 'Segoe UI', 'Malgun Gothic', sans-serif";
  var CORAL = '#FF6B7A', CORAL_D = '#FF4255', BLUE = '#6B9EFF', BLUE_D = '#4283FF';
  var INK = '#1C1C1C', SUB = '#525252', MUTE = '#737373', LINE = '#E6E6E6';

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrapText(ctx, text, maxW) {
    var words = text.split(''), lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var t = cur + words[i];
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = words[i]; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function gradient(ctx, w, h, c1, c2) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function glow(ctx, cx, cy, r, color, alpha) {
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }

  /* 로고 마크 (128x104 뷰박스) */
  function drawLogo(ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.lineCap = 'round';
    ctx.lineWidth = 16;
    ctx.strokeStyle = CORAL;
    ctx.beginPath();
    ctx.moveTo(26, 94); ctx.lineTo(26, 56);
    ctx.quadraticCurveTo(26, 38, 44, 33); ctx.lineTo(60, 27);
    ctx.quadraticCurveTo(66, 29, 68, 37); ctx.lineTo(73, 52);
    ctx.stroke();
    ctx.strokeStyle = BLUE;
    ctx.beginPath();
    ctx.moveTo(102, 94); ctx.lineTo(102, 56);
    ctx.quadraticCurveTo(102, 38, 84, 33); ctx.lineTo(68, 27);
    ctx.quadraticCurveTo(62, 29, 60, 37); ctx.lineTo(55, 52);
    ctx.stroke();
    ctx.fillStyle = CORAL;
    ctx.beginPath(); ctx.arc(38, 15, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = BLUE;
    ctx.beginPath(); ctx.arc(90, 15, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = INK;
    [[54, 64], [66, 64], [54, 78], [66, 78]].forEach(function (p) {
      roundRect(ctx, p[0], p[1], 8, 8, 1.5); ctx.fill();
    });
    ctx.restore();
  }

  function badge(ctx, x, y, text, bg, fg, fs) {
    ctx.font = '700 ' + fs + 'px ' + FONT;
    var w = ctx.measureText(text).width + 36;
    roundRect(ctx, x, y, w, fs + 22, (fs + 22) / 2);
    ctx.fillStyle = bg; ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.fillText(text, x + w / 2, y + fs + 11);
    ctx.textAlign = 'left';
    return w;
  }

  function gauge(ctx, x, y, w, label, pct, color1, color2, lvText) {
    ctx.fillStyle = SUB;
    ctx.font = '600 26px ' + FONT;
    ctx.fillText(label, x, y);
    ctx.fillStyle = color2;
    ctx.font = '700 26px ' + FONT;
    ctx.textAlign = 'right';
    ctx.fillText(lvText, x + w, y);
    ctx.textAlign = 'left';
    var ty = y + 22;
    roundRect(ctx, x, ty, w, 18, 9);
    ctx.fillStyle = 'rgba(28,28,28,0.07)'; ctx.fill();
    if (pct > 0) {
      var gw = Math.max(18, w * pct / 100);
      var g = ctx.createLinearGradient(x, 0, x + gw, 0);
      g.addColorStop(0, color1); g.addColorStop(1, color2);
      roundRect(ctx, x, ty, gw, 18, 9);
      ctx.fillStyle = g; ctx.fill();
    }
  }

  /* ---------- 결과 카드 ---------- */
  function resultCard(o) {
    var W = 1080, H = 1350;
    var c = makeCanvas(W, H), ctx = c.getContext('2d');
    gradient(ctx, W, H, '#FFF5F6', '#F0F5FF');
    glow(ctx, W * 0.5, H * 0.1, W * 0.6, '#FFC2C8', 0.5);
    glow(ctx, W * 0.1, H, W * 0.4, '#C2D7FF', 0.45);

    drawLogo(ctx, W / 2 - 64, 90, 1.0);
    ctx.fillStyle = INK;
    ctx.font = '800 34px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('MATE:ON', W / 2, 240);
    ctx.fillStyle = MUTE;
    ctx.font = '500 24px ' + FONT;
    ctx.fillText('동거 성향 진단 결과', W / 2, 282);

    // 메인 카드
    var cx = 90, cy = 340, cw = W - 180, ch = 620;
    ctx.save();
    ctx.shadowColor = 'rgba(255,66,85,0.18)';
    ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
    roundRect(ctx, cx, cy, cw, ch, 32);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();

    var bw = badge(ctx, W / 2 - 60, cy + 56, o.code, '#FFF0F1', CORAL_D, 26);
    ctx.fillStyle = INK;
    ctx.font = '800 68px ' + FONT;
    ctx.fillText(o.name, W / 2, cy + 220);

    ctx.fillStyle = SUB;
    ctx.font = '500 30px ' + FONT;
    var ql = wrapText(ctx, o.quote, cw - 160);
    ql.forEach(function (line, i) {
      ctx.fillText(line, W / 2, cy + 290 + i * 46);
    });

    var gy = cy + 300 + ql.length * 46 + 40;
    gauge(ctx, cx + 90, gy, cw - 180, '생활 교류 활성도', o.ePct, '#FF99A3', CORAL_D, o.eLabel);
    gauge(ctx, cx + 90, gy + 100, cw - 180, '생활 자극 민감도', o.rPct, '#99BCFF', BLUE_D, o.rLabel);

    ctx.fillStyle = MUTE;
    ctx.font = '500 24px ' + FONT;
    ctx.fillText('16개 동거 캐릭터 중 하나예요', W / 2, cy + ch - 56);

    // 하단
    ctx.fillStyle = SUB;
    ctx.font = '600 28px ' + FONT;
    ctx.fillText('너는 어떤 유형일까?', W / 2, H - 210);
    ctx.fillStyle = MUTE;
    ctx.font = '400 22px ' + FONT;
    ctx.fillText('함께 살 준비, 서로를 아는 것부터.', W / 2, H - 160);
    ctx.fillStyle = CORAL_D;
    ctx.font = '700 24px ' + FONT;
    ctx.fillText('MATE:ON', W / 2, H - 110);
    ctx.textAlign = 'left';
    return c;
  }

  /* ---------- 합의서 카드 ---------- */
  function agreementCard(o) {
    var W = 1080, H = 1350;
    var c = makeCanvas(W, H), ctx = c.getContext('2d');
    gradient(ctx, W, H, '#FFF5F6', '#F0F5FF');

    drawLogo(ctx, W / 2 - 48, 70, 0.75);
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.font = '800 40px ' + FONT;
    ctx.fillText('우리집 생활 합의서', W / 2, 200);
    ctx.fillStyle = MUTE;
    ctx.font = '500 26px ' + FONT;
    ctx.fillText(o.names + '  ·  ' + o.date, W / 2, 248);

    var cx = 90, cy = 300, cw = W - 180;
    ctx.save();
    ctx.shadowColor = 'rgba(28,28,28,0.10)';
    ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
    roundRect(ctx, cx, cy, cw, 820, 24);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();

    var y = cy + 70;
    o.rules.slice(0, 9).forEach(function (t, i) {
      ctx.fillStyle = CORAL;
      ctx.beginPath();
      ctx.arc(cx + 60, y - 10, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.font = '500 28px ' + FONT;
      ctx.textAlign = 'left';
      var lines = wrapText(ctx, t, cw - 140);
      lines.forEach(function (line, li) {
        ctx.fillText(line, cx + 90, y + li * 42);
      });
      y += lines.length * 42 + 34;
    });
    if (o.rules.length > 9) {
      ctx.fillStyle = MUTE;
      ctx.font = '500 26px ' + FONT;
      ctx.fillText('외 ' + (o.rules.length - 9) + '개 규칙', cx + 90, y);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = MUTE;
    ctx.font = '400 22px ' + FONT;
    ctx.fillText('MATE:ON에서 만들었어요. 함께 살 준비, 서로를 아는 것부터.', W / 2, H - 110);
    ctx.textAlign = 'left';
    return c;
  }

  function download(canvas, filename) {
    var a = document.createElement('a');
    a.download = filename;
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  return { resultCard: resultCard, agreementCard: agreementCard, download: download };
})();
