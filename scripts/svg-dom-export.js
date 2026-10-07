/*
 * DEPRECATED: approximate serializer retained for reference only.
 * Use npm run export:svg for browser-painted, font-outline SVG exports.
 * Browser-side DOM to editable SVG serializer for the MATE:ON prototype.
 * The host script evaluates this file in the local app and receives base64 SVG.
 * Text stays in SVG <text>/<tspan> nodes, shapes stay SVG geometry, and SVG
 * illustrations/icons are inlined as vector children.
 */
window.__captureSvgPage = async function (forceFull) {
  var shell = document.querySelector('.app-shell');
  if (!shell) throw new Error('The MATE:ON app shell was not found.');

  var rootRect = shell.getBoundingClientRect();
  var screenWidth = Math.round(rootRect.width);
  var isFull = forceFull === true || new URLSearchParams(location.search).get('svg') === 'full';
  var documentHeight = Math.max(
    shell.scrollHeight,
    document.documentElement.scrollHeight,
    document.body.scrollHeight
  );
  var screenHeight = isFull ? Math.ceil(documentHeight) : window.innerHeight;
  var title = document.querySelector('.app-screen-title')?.textContent?.trim()
    || document.querySelector('.mobile-title')?.textContent?.trim()
    || document.title;
  var svgNS = 'http://www.w3.org/2000/svg';
  var xmlNS = 'http://www.w3.org/XML/1998/namespace';
  var defs = [];
  var parts = [];
  var serial = 0;
  var escapedTitle = escapeXml(title || 'MATE:ON');

  function escapeXml(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c];
    });
  }

  function attr(value) { return escapeXml(value); }

  function px(value) {
    var n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }

  function colorVisible(color) {
    if (!color || color === 'transparent') return false;
    var m = color.match(/rgba?\([^)]*[,\s/]\s*([\d.]+)\s*\)$/i);
    if (m && color.indexOf('rgba') === 0 && +m[1] === 0) return false;
    return true;
  }

  function coordRect(el) {
    var r = el.getBoundingClientRect();
    var st = getComputedStyle(el);
    var x = r.left - rootRect.left;
    var y = r.top + (isFull ? window.scrollY : 0);
    if (isFull && el.classList && el.classList.contains('bottom-nav')) y = screenHeight - r.height;
    return { x: x, y: y, w: r.width, h: r.height, r: r, st: st };
  }

  function boxShadowFilter(shadow) {
    if (!shadow || shadow === 'none') return '';
    var colorMatch = shadow.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/i);
    var nums = (shadow.match(/-?\d*\.?\d+px/g) || []).map(px);
    if (!colorMatch || nums.length < 2) return '';
    var color = colorMatch[0];
    var opacityMatch = color.match(/rgba\([^)]*,\s*([\d.]+)\s*\)/i);
    var opacity = opacityMatch ? +opacityMatch[1] : 0.16;
    var id = 'f' + (++serial);
    var blur = Math.max(0, nums[2] || 0) / 2;
    defs.push('<filter id="' + id + '" x="-35%" y="-35%" width="170%" height="190%"><feDropShadow dx="' + (nums[0] || 0) + '" dy="' + (nums[1] || 0) + '" stdDeviation="' + blur + '" flood-color="' + attr(color) + '" flood-opacity="' + opacity + '"/></filter>');
    return id;
  }

  function gradientFill(image) {
    if (!image || image === 'none' || image.indexOf('gradient(') < 0) return '';
    var colors = image.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/ig) || [];
    if (colors.length < 2) return '';
    var id = 'g' + (++serial);
    var stops = colors.map(function (c, i) {
      var pct = Math.round(i * 100 / (colors.length - 1));
      return '<stop offset="' + pct + '%" stop-color="' + attr(c) + '"/>';
    }).join('');
    var tag = image.indexOf('radial-gradient') >= 0 ? 'radialGradient' : 'linearGradient';
    var direction = tag === 'radialGradient' ? ' cx="50%" cy="50%" r="72%"' : ' x1="0%" y1="0%" x2="100%" y2="100%"';
    defs.push('<' + tag + ' id="' + id + '"' + direction + '>' + stops + '</' + tag + '>');
    return 'url(#' + id + ')';
  }

  function roundedRadius(style) {
    var values = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius]
      .map(function (v) { return Math.max(0, px(v)); });
    return Math.min.apply(null, values);
  }

  function shapeMarkup(el, box) {
    if (box.w < 0.5 || box.h < 0.5) return '';
    var st = box.st;
    var bg = st.backgroundColor;
    var grad = gradientFill(st.backgroundImage);
    var fill = grad || (colorVisible(bg) ? bg : 'none');
    var borderWidth = Math.max(px(st.borderTopWidth), px(st.borderRightWidth), px(st.borderBottomWidth), px(st.borderLeftWidth));
    var borderColor = st.borderTopColor;
    var stroke = borderWidth > 0 && st.borderTopStyle !== 'none' && colorVisible(borderColor) ? borderColor : 'none';
    var shadow = boxShadowFilter(st.boxShadow);
    if (fill === 'none' && stroke === 'none' && !shadow) return '';
    var rx = roundedRadius(st);
    var styleOpacity = parseFloat(st.opacity);
    var opacity = Number.isFinite(styleOpacity) ? styleOpacity : 1;
    return '<rect x="' + box.x.toFixed(2) + '" y="' + box.y.toFixed(2) + '" width="' + box.w.toFixed(2) + '" height="' + box.h.toFixed(2) + '" rx="' + rx.toFixed(2) + '" fill="' + attr(fill) + '" stroke="' + attr(stroke) + '" stroke-width="' + borderWidth.toFixed(2) + '" opacity="' + opacity + '"' + (shadow ? ' filter="url(#' + shadow + ')"' : '') + '/>';
  }

  function textStyle(parent) {
    var st = getComputedStyle(parent);
    var fs = Math.max(1, px(st.fontSize));
    return {
      fill: colorVisible(st.color) ? st.color : '#222222',
      fontSize: fs,
      fontFamily: st.fontFamily || 'Arial, sans-serif',
      fontWeight: st.fontWeight || '400',
      fontStyle: st.fontStyle || 'normal',
      letterSpacing: st.letterSpacing === 'normal' ? '0px' : st.letterSpacing,
      textDecoration: st.textDecorationLine && st.textDecorationLine !== 'none' ? st.textDecorationLine : '',
      textTransform: st.textTransform || 'none',
      opacity: st.opacity || '1'
    };
  }

  function textMarkup(node, parent) {
    var raw = node.nodeValue || '';
    if (!raw.trim() && !/[\u00a0\u200b]/.test(raw)) return '';
    var st = textStyle(parent);
    var chars = Array.from(raw);
    var lines = new Map();
    var offset = 0;
    var parentEl = parent;
    var baseColor = st.fill;
    if (st.textTransform === 'uppercase') raw = raw.toLocaleUpperCase();
    else if (st.textTransform === 'lowercase') raw = raw.toLocaleLowerCase();
    chars = Array.from(raw);
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      var length = ch.length;
      var range = document.createRange();
      try {
        range.setStart(node, offset);
        range.setEnd(node, offset + length);
      } catch (_) { offset += length; continue; }
      var r = range.getBoundingClientRect();
      var x = r.left - rootRect.left;
      var yTop = r.top + (isFull ? window.scrollY : 0);
      var lineKey = Math.round(yTop * 2) / 2;
      if (ch === '\n' || ch === '\r') {
        lineKey = 'break-' + i;
      } else {
        if (!lines.has(lineKey)) lines.set(lineKey, { top: yTop, chars: [], x: x });
        lines.get(lineKey).chars.push({ c: ch, x: x });
      }
      offset += length;
    }
    var out = '';
    lines.forEach(function (line) {
      if (!line.chars.length) return;
      var top = line.top;
      var baseline = top + st.fontSize * 0.84;
      var t = '<text fill="' + attr(baseColor) + '" font-size="' + st.fontSize + '" font-family="' + attr(st.fontFamily) + '" font-weight="' + attr(st.fontWeight) + '" font-style="' + attr(st.fontStyle) + '" letter-spacing="' + attr(st.letterSpacing) + '" xml:space="preserve" opacity="' + attr(st.opacity) + '"';
      if (st.textDecoration) t += ' text-decoration="' + attr(st.textDecoration) + '"';
      t += '>';
      line.chars.forEach(function (item) {
        t += '<tspan x="' + item.x.toFixed(2) + '" y="' + baseline.toFixed(2) + '">' + escapeXml(item.c) + '</tspan>';
      });
      t += '</text>';
      out += t;
    });
    return out;
  }

  function makeClip(box, radius) {
    if (radius <= 0.5) return '';
    var id = 'c' + (++serial);
    defs.push('<clipPath id="' + id + '"><rect x="' + box.x.toFixed(2) + '" y="' + box.y.toFixed(2) + '" width="' + box.w.toFixed(2) + '" height="' + box.h.toFixed(2) + '" rx="' + radius.toFixed(2) + '"/></clipPath>');
    return id;
  }

  function svgFromImageRoot(svgText, box, color) {
    try {
      var doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
      var root = doc.documentElement;
      if (!root || root.nodeName.toLowerCase() !== 'svg') return '';
      var viewBox = root.getAttribute('viewBox') || ('0 0 ' + (px(root.getAttribute('width')) || box.w) + ' ' + (px(root.getAttribute('height')) || box.h));
      var content = Array.from(root.childNodes).map(function (n) { return new XMLSerializer().serializeToString(n); }).join('');
      return '<svg xmlns="' + svgNS + '" x="' + box.x.toFixed(2) + '" y="' + box.y.toFixed(2) + '" width="' + box.w.toFixed(2) + '" height="' + box.h.toFixed(2) + '" viewBox="' + attr(viewBox) + '" preserveAspectRatio="xMidYMid meet" color="' + attr(color) + '">' + content + '</svg>';
    } catch (_) { return ''; }
  }

  async function imageMarkup(el, box) {
    var src = el.currentSrc || el.src || '';
    if (!src || box.w < 0.5 || box.h < 0.5) return '';
    var st = box.st;
    var clip = makeClip(box, roundedRadius(st));
    var clipAttr = clip ? ' clip-path="url(#' + clip + ')"' : '';
    try {
      var response = await fetch(src, { credentials: 'same-origin' });
      var blob = await response.blob();
      var type = blob.type || (src.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream');
      if (type.indexOf('svg') >= 0 || src.toLowerCase().split('?')[0].endsWith('.svg')) {
        var svgText = await blob.text();
        var nested = svgFromImageRoot(svgText, box, st.color);
        if (nested) return '<g' + clipAttr + '>' + nested + '</g>';
      }
      var data = await new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      var fit = st.objectFit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet';
      return '<image x="' + box.x.toFixed(2) + '" y="' + box.y.toFixed(2) + '" width="' + box.w.toFixed(2) + '" height="' + box.h.toFixed(2) + '" href="' + attr(data) + '" preserveAspectRatio="' + fit + '"' + clipAttr + '/>';
    } catch (_) {
      return '';
    }
  }

  function inlineSvgMarkup(el, box) {
    var clone = el.cloneNode(true);
    clone.setAttribute('xmlns', svgNS);
    clone.setAttribute('x', box.x.toFixed(2));
    clone.setAttribute('y', box.y.toFixed(2));
    clone.setAttribute('width', Math.max(0, box.w).toFixed(2));
    clone.setAttribute('height', Math.max(0, box.h).toFixed(2));
    clone.setAttribute('color', box.st.color || '#222');
    return new XMLSerializer().serializeToString(clone);
  }

  function inputTextMarkup(el, box) {
    var value = el.value || el.getAttribute('placeholder') || '';
    if (!value) return '';
    var parentStyle = textStyle(el);
    var st = box.st;
    var color = el.value ? parentStyle.fill : (st.color || '#8b8d93');
    var x = box.x + px(st.paddingLeft) + 1;
    var fs = parentStyle.fontSize;
    var h = box.h;
    var y = box.y + Math.max(fs, (h - fs) / 2 + fs * 0.84);
    return '<text x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" fill="' + attr(color) + '" font-size="' + fs + '" font-family="' + attr(parentStyle.fontFamily) + '" font-weight="' + attr(parentStyle.fontWeight) + '" xml:space="preserve">' + escapeXml(value) + '</text>';
  }

  async function visit(el) {
    if (!el || el.nodeType !== 1) return;
    var tag = el.tagName.toLowerCase();
    if (['script', 'style', 'link', 'meta', 'noscript', 'template'].indexOf(tag) >= 0) return;
    if (el.id === 'splash') return;
    if (el.getAttribute('aria-hidden') === 'true') return;
    var st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) return;
    var box = coordRect(el);
    if (box.w <= 0 || box.h <= 0) return;
    if (tag === 'dialog' && el.open) {
      var backdrop = getComputedStyle(el, '::backdrop').backgroundColor;
      if (colorVisible(backdrop)) parts.push('<rect x="0" y="0" width="' + screenWidth + '" height="' + window.innerHeight + '" fill="' + attr(backdrop) + '"/>');
    }
    parts.push(shapeMarkup(el, box));

    if (tag === 'svg') {
      parts.push(inlineSvgMarkup(el, box));
      return;
    }
    if (tag === 'img') {
      parts.push(await imageMarkup(el, box));
      return;
    }
    if (tag === 'input' || tag === 'textarea') {
      parts.push(inputTextMarkup(el, box));
    }
    for (var i = 0; i < el.childNodes.length; i++) {
      var child = el.childNodes[i];
      if (child.nodeType === 3) parts.push(textMarkup(child, el));
      else if (child.nodeType === 1) await visit(child);
    }
  }

  var bodyChildren = Array.from(document.body.children);
  for (var i = 0; i < bodyChildren.length; i++) await visit(bodyChildren[i]);

  var pageBg = getComputedStyle(shell).backgroundColor;
  if (!colorVisible(pageBg)) pageBg = getComputedStyle(document.body).backgroundColor;
  if (!colorVisible(pageBg)) pageBg = '#ffffff';
  var output = '<svg xmlns="' + svgNS + '" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + screenWidth + '" height="' + screenHeight + '" viewBox="0 0 ' + screenWidth + ' ' + screenHeight + '"><title>' + escapedTitle + '</title><defs>' + defs.join('') + '</defs><rect width="100%" height="100%" fill="' + attr(pageBg) + '"/>' + parts.join('') + '</svg>';
  return btoa(unescape(encodeURIComponent(output)));
};
