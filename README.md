# MATE:ON 설치형 앱 MVP

기존 진단 로직을 유지하는 Capacitor Android/iOS 앱입니다. 화면과 로직을 `dist/`에 빌드하고 네이티브 앱 안에 포함합니다. 개발 서버 URL을 표시하는 설정은 사용하지 않습니다.

## 실행

```sh
npm ci
npm run dev          # 브라우저에서 모바일 화면 미리보기: http://localhost:3000
npm run sync         # 앱 리소스 빌드 + Android/iOS 프로젝트 동기화
npm run android      # Android Studio에서 프로젝트 열기
npm run ios          # macOS에서 Xcode 프로젝트 열기
npm run android:debug # Android debug APK 생성
```

- Node.js 22 이상.
- Android: JDK 21, Android Studio 2025.2.1 이상, Android SDK Platform 36. SDK 경로는 `ANDROID_HOME` 또는 Android Studio가 작성하는 `android/local.properties`로 지정합니다.
- iOS: macOS, Xcode 26 이상. Xcode에서 개발 팀과 서명을 설정한 후 실행합니다.
- 성공한 Android 빌드 결과: `android/app/build/outputs/apk/debug/app-debug.apk`.
- 앱 ID는 개발용 `app.mateon.mobile`입니다. 스토어 출시 전 실제 소유할 식별자를 확정해야 합니다.
- 아이콘 재생성: `node scripts/native-assets.js` → `npm run sync`.

## 모바일 앱 UX

디자인 스킬: [skills.sh mobile-design](https://skills.sh/manutej/luxor-claude-marketplace/mobile-design)
설치 위치: `~/.codex/skills/mobile-design/SKILL.md`

적용한 원칙:
- 하나의 주요 행동을 강조하는 오늘의 첫걸음 카드.
- 홈 / 우리 공간 / 유형 찾기 / 마이의 지속적인 하단 탭.
- 모바일 단일 열, 48px 이상 터치 영역, 54px 주요 버튼, 시스템 안전 영역.
- 바텀시트로 대화 작성, 포커스 복원, 저장 후 같은 스크롤 위치 유지.
- 데스크톱에서도 앱 폭으로 미리보기. 사이드바·웹 푸터 제거.

구현 흐름:
1. 20문항 진단 → 개인 결과 → 메이트 초대 / 같은 기기 진단.
2. 궁합 리포트 → 생활규칙 → 합의서.
3. 오늘의 대화 작성 → 현재 기기에 저장 → 우리 공간에서 조회·수정.
4. 입주 체크리스트 및 진행률.

## 네이티브 연동

- Android 뒤로가기: 바텀시트 닫기 → 상세 화면의 상위 화면 → 홈에서 앱 최소화.
- 네이티브 공유창: 결과·초대 링크, PNG 결과 카드·합의서, ICS 일정 파일.
- 네이티브 클립보드 및 주요 버튼의 햅틱 피드백.
- 초대: `mateon://invite?data=...`, 리포트: `mateon://pair?data=...`.
- Android intent filter / iOS URL scheme 등록, 시작 시 링크와 실행 중 링크 처리.
- Android 밀도별 아이콘·adaptive icon·시작 이미지, iOS 아이콘·시작 이미지.
- 앱 빌드에서는 CDN 폰트를 제외하고 시스템 폰트를 사용하며, 서비스 워커는 등록하지 않습니다.

초대 링크는 **MATE:ON이 설치된 상대**를 대상으로 합니다. 링크를 전달하는 앱이 사용자 정의 스킴을 지원해야 합니다. 운영용 HTTPS 초대 링크, 미설치자 안내 페이지, 앱스토어 연결은 아직 구성하지 않았습니다. 링크의 결과는 암호화되지 않은 스냅샷이며 자동 갱신되지 않습니다.

## 검증 결과와 제한

- `node test-score.js`: 채점 테스트 통과.
- `node test-smoke.js`: 113개 검증 통과. 진단·초대·리포트·합의서, 저장 데이터 보존, 앱 딥링크 검증·뒤로가기, 대화 출력 이스케이프 포함.
- `npm run sync`: Android/iOS 리소스 빌드·플러그인 동기화 성공.
- 브라우저: 320px/390px 모바일 화면, 1440px 앱 폭 미리보기, 대화 바텀시트 입력·저장·재조회, 가로 넘침 및 콘솔 오류 확인.
- `npm audit`: 알려진 취약점 0개. CLI는 8.4.3으로 고정했습니다.
- Android APK 빌드 시도: 현재 PC의 Java 8 환경에서 Gradle Android 플러그인 구성 단계 실패. JDK 21 및 Android SDK 설정 후 재실행 필요. **APK는 아직 생성하지 못했습니다.**
- iOS: Windows 환경이므로 Xcode 컴파일·시뮬레이터·실기기 테스트 미실행.
- 네이티브 공유·햅틱·시스템 뒤로가기·OS 딥링크 수신은 구현 완료, 실제 기기 검증은 남아 있습니다. JS 딥링크 해석과 라우팅은 테스트했습니다.

계정, 서버 DB, 실시간 기기 간 동기화, 인증된 상대 서명은 포함하지 않은 로컬 MVP입니다. 기존 웹 미리보기의 기록과 설치형 앱 기록은 자동 이전되지 않습니다.

화면 캡처: `artifacts/app-home-mobile.png`, `app-conversation-sheet.png`, `app-our-space.png`, `app-desktop-preview.png`.
