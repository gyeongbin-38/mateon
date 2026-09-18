/* ============================================================
   다원이 디자인 시스템 — Interactions
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;

  /* ---------- Toast ---------- */
  var toast = document.getElementById('toast');
  var toastTimer = null;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('show');
    }, 2200);
  }

  /* ---------- Semantic 토큰 실제값 표시 ---------- */
  function refreshTokenValues() {
    requestAnimationFrame(function () {
      var styles = getComputedStyle(root);
      document.querySelectorAll('[data-var]').forEach(function (el) {
        var value = styles.getPropertyValue(el.dataset.var).trim();
        el.textContent = value.toUpperCase();
      });
    });
  }

  /* ---------- 테마 전환 ---------- */
  var toggle = document.getElementById('themeToggle');

  function setTheme(theme) {
    root.dataset.theme = theme;
    try { localStorage.setItem('ds-theme', theme); } catch (e) { /* ignore */ }
    refreshTokenValues();
  }

  var savedTheme = null;
  try { savedTheme = localStorage.getItem('ds-theme'); } catch (e) { /* ignore */ }

  var prefersDark = window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  setTheme(savedTheme || (prefersDark ? 'dark' : 'light'));

  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      setTheme(next);
      showToast(next === 'dark' ? '다크 테마로 전환했습니다' : '라이트 테마로 전환했습니다');
    });
  }

  /* ---------- 컬러 복사 ---------- */
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast('복사됨 ' + text);
    } catch (e) {
      showToast(text);
    }
    ta.remove();
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () {
        showToast('복사됨 ' + text);
      }).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-copy]');
    if (el) copyText(el.dataset.copy);
  });

  /* ---------- 스크롤스파이 ---------- */
  var navLinks = Array.prototype.slice.call(
    document.querySelectorAll('.site-nav a[href^="#"]')
  );

  if ('IntersectionObserver' in window && navLinks.length) {
    var linkById = {};
    navLinks.forEach(function (a) {
      linkById[a.getAttribute('href').slice(1)] = a;
    });

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          navLinks.forEach(function (a) { a.classList.remove('active'); });
          var link = linkById[entry.target.id];
          if (link) link.classList.add('active');
        }
      });
    }, { rootMargin: '-35% 0px -60% 0px' });

    document.querySelectorAll('main section[id]').forEach(function (section) {
      observer.observe(section);
    });
  }

  /* ---------- 구독 폼 데모 ---------- */
  var form = document.getElementById('subscribeForm');
  var emailInput = document.getElementById('sub-email');

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var value = emailInput.value.trim();
      var valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      if (!valid) {
        emailInput.classList.add('input-error');
        emailInput.setAttribute('aria-invalid', 'true');
        emailInput.focus();
        showToast('올바른 이메일을 입력해 주세요');
        return;
      }
      emailInput.classList.remove('input-error');
      emailInput.removeAttribute('aria-invalid');
      showToast('구독 완료! 환영합니다.');
      form.reset();
    });

    emailInput.addEventListener('input', function () {
      emailInput.classList.remove('input-error');
      emailInput.removeAttribute('aria-invalid');
    });
  }

  /* ---------- 푸터 연도 ---------- */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
