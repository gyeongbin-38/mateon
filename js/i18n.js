/* ============================================================
   MATE:ON i18n 골격 — UI 문자열 테이블.
   window.MateI18n.t('키') 로 접근. 현재 ko만 제공,
   향후 en 테이블 추가 후 navigator.language 분기로 확장한다.
   ============================================================ */
(function () {
  'use strict';

  var ko = {
    'nav.home': '홈',
    'nav.space': '우리 공간',
    'nav.types': '유형 찾기',
    'nav.settings': '마이',
    'toast.saved': '저장했어요',
    'offline.banner': '오프라인이에요. 데이터는 이 기기에 안전하게 저장돼요',
  };
  var en = {
    'nav.home': 'Home',
    'nav.space': 'Our Space',
    'nav.types': 'Types',
    'nav.settings': 'My',
    'toast.saved': 'Saved',
    'offline.banner': "You're offline. Data stays safe on this device",
  };

  var tables = { ko: ko, en: en };
  var lang = 'ko';
  try {
    var nav = (typeof navigator !== 'undefined' && navigator.language) || 'ko';
    if (nav.slice(0, 2) === 'en') lang = 'en';
  } catch (e) { }

  window.MateI18n = {
    lang: lang,
    t: function (key) {
      var table = tables[lang] || ko;
      return table[key] !== undefined ? table[key] : (ko[key] !== undefined ? ko[key] : key);
    },
  };
})();
