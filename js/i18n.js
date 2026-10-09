/* ============================================================
   MATE:ON i18n 골격 — UI 문자열 테이블.
   window.MateI18n.t('키') 로 접근. ko/en 제공,
   navigator.language 분기로 자동 선택된다.
   ============================================================ */
(function () {
  'use strict';

  var ko = {
    'nav.home': '홈',
    'nav.space': '우리 공간',
    'nav.types': '유형 찾기',
    'nav.settings': '마이',
    'nav.aria': '하단 메뉴',
    'toast.saved': '저장했어요',
    'offline.banner': '오프라인이에요. 데이터는 이 기기에 안전하게 저장돼요',
    'view.settle.title': '생활비 정산',
    'view.settle.desc': '함께 쓴 돈을 기록하고, 누가 얼마를 낼지 계산해요',
    'view.shopping.title': '같이 살 것',
    'view.shopping.desc': '장볼 때 필요한 것을 함께 적어두는 목록',
    'view.chores.title': '역할 분담',
    'view.chores.desc': '집안일 담당을 정하고, 매주 자동으로 바꿔요',
    'view.calendar.title': '우리 일정',
    'view.calendar.desc': '이사일, 정산일, 점검일 같은 중요한 날을 함께 기록해요',
    'view.checkin.title': '이번 주 체크인',
    'view.checkin.desc': '일주일에 한 번, 우리 생활이 어땠는지 가볍게 돌아봐요',
    'common.add': '추가',
    'common.del': '삭제',
    'common.save': '저장',
    'common.cancel': '취소',
    'common.done': '완료',
    'common.copy': '복사',
    'common.today': '오늘',
  };
  var en = {
    'nav.home': 'Home',
    'nav.space': 'Our Space',
    'nav.types': 'Types',
    'nav.settings': 'My',
    'nav.aria': 'Bottom navigation',
    'toast.saved': 'Saved',
    'offline.banner': "You're offline. Data stays safe on this device",
    'view.settle.title': 'Shared Expenses',
    'view.settle.desc': 'Log what you spend together and see who owes what',
    'view.shopping.title': 'Shopping List',
    'view.shopping.desc': 'A shared list for things to buy together',
    'view.chores.title': 'Chore Split',
    'view.chores.desc': 'Assign chores and rotate them every week',
    'view.calendar.title': 'Our Schedule',
    'view.calendar.desc': 'Keep move-in days, bill days and checkups together',
    'view.checkin.title': 'Weekly Check-in',
    'view.checkin.desc': 'Once a week, look back on how we lived together',
    'common.add': 'Add',
    'common.del': 'Delete',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.done': 'Done',
    'common.copy': 'Copy',
    'common.today': 'Today',
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
