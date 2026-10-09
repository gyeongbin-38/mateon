# MATE:ON 0.3.0 — 사용자용 릴리즈 노트

## 한국어 (Play 스토어 "새로운 기능" / 앱 내 안내용, 500자 이내 초안)

> 함께 사는 생활이 더 편해졌어요.
>
> • 전역 검색 — 초성(ㅅㄱㅈ)으로도 지출·일정·쇼핑을 찾아요
> • 알림 센터 — 활동·리마인드·동기화 소식을 탭으로 나눠봐요
> • 항목을 꾹 누르면 — 수정·삭제·캘린더 내보내기 메뉴가 떠요
> • 일정을 캘린더 앱으로 — ICS 파일을 바로 공유해요
> • 날짜 빠른 선택 — 오늘·내일·주말 칩으로 한 번에 입력해요
> • 앱이 가벼워졌어요 — 필요한 기능만 불러와 더 빨리 열려요
>
> 피드백은 언제든 리뷰로 알려 주세요. 두 분의 생활을 응원합니다!

## English (Play listing "What's new" en-US)

> Living together just got smoother.
>
> • Global search — find expenses, events & shopping by consonants too
> • Notification center — activity, reminders & sync in tabs
> • Long-press any item — edit, delete or export to your calendar
> • Share events as .ics — straight to your calendar app
> • Quick date chips — today, tomorrow, this weekend in one tap
> • Faster startup — the app loads only what you need
>
> Tell us what you think in a review — we're rooting for you two!

## 변경 요약 (개발용, 커밋 기준)

- UX: 초성 검색, 알림 탭(전체/활동/리마인드/동기화), 롱프레스·우클릭 컨텍스트 메뉴, 날짜 퀵칩, ICS 네이티브 공유
- 접근성: 포커스 트랩, Esc 닫기 통일, `?` 단축키 도움말, `/`·`n` 전역 단축키, axe WCAG 2.2 AA 스캔(light/dark 전 라우트 0위반) + CI 배선
- 성능: driver·modern-screenshot 지연 로딩(tesseract와 동일 패턴), IndexedDB 첫 사용 시 오픈, 셸 렌더 시그니처 스킵
- 품질: `tsconfig.strict.json`(strictNullChecks — 리프 모듈), `js/appviews.js`로 유형 도감·상세 추가 분리
- 색상: 브랜드·위험·머트 토큰을 WCAG AA 대비(≥4.5:1) 기준으로 조정
