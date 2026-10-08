/* ============================================================
   MATE:ON secure — WebCrypto 암호화 백업·PIN 해시 유틸.
   js/mateon.js 보다 먼저 로드되며 window.MateSecure로 노출한다.
   ============================================================ */
(function () {
  'use strict';

  function encSubtle() {
    return typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.importKey && typeof TextEncoder !== 'undefined' ? crypto.subtle : null;
  }
  function encKey(pw, saltB) {
    return encSubtle().importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey'])
      .then(function (km) {
        return encSubtle().deriveKey({ name: 'PBKDF2', salt: saltB, iterations: 100000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
  }
  function b64enc(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); }
  function b64dec(s) { var bin = atob(s); var u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }

  /* 암호화 백업: PBKDF2 + AES-GCM (WebCrypto) */
  function encryptBackupText(text, pw) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    return encKey(pw, salt)
      .then(function (k) { return encSubtle().encrypt({ name: 'AES-GCM', iv: iv }, k, new TextEncoder().encode(text)); })
      .then(function (ct) { return JSON.stringify({ app: 'mateon-enc', v: 1, salt: b64enc(salt), iv: b64enc(iv), data: b64enc(ct) }); });
  }
  function decryptBackupText(obj, pw) {
    return encKey(pw, b64dec(obj.salt))
      .then(function (k) { return encSubtle().decrypt({ name: 'AES-GCM', iv: b64dec(obj.iv) }, k, b64dec(obj.data)); })
      .then(function (pt) { return new TextDecoder().decode(pt); });
  }

  /* PIN 해시 — SHA-256(WebCrypto) 또는 구형 환경 FNV-1a 폴백 */
  function pinHash(pin, salt) {
    var msg = salt + ':' + pin;
    if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest && typeof TextEncoder !== 'undefined') {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      });
    }
    var h1 = 0x811c9dc5, h2 = 0x811c9dc5, i;
    for (i = 0; i < msg.length; i++) h1 = Math.imul(h1 ^ msg.charCodeAt(i), 0x01000193) >>> 0;
    for (i = msg.length - 1; i >= 0; i--) h2 = Math.imul(h2 ^ msg.charCodeAt(i), 0x01000193) >>> 0;
    var hx = ('0000000' + h1.toString(16)).slice(-8) + ('0000000' + h2.toString(16)).slice(-8);
    return Promise.resolve((hx + hx + hx + hx).slice(0, 64));
  }

  window.MateSecure = {
    encSubtle: encSubtle, b64enc: b64enc, b64dec: b64dec,
    encryptBackupText: encryptBackupText, decryptBackupText: decryptBackupText,
    pinHash: pinHash,
  };
})();
