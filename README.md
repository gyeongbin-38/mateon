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
npm run android:release # 서명 설정 후 Play 제출용 AAB 생성
npm run release:check # 테스트 + 빌드 + 엄격한 배포 설정 검사
```

- Node.js 22 이상.
- Android: JDK 21, Android Studio 2025.2.1 이상, Android SDK Platform 36. SDK 경로는 `ANDROID_HOME` 또는 Android Studio가 작성하는 `android/local.properties`로 지정합니다.
- iOS: macOS, Xcode 26 이상. Xcode에서 개발 팀과 서명을 설정한 후 실행합니다.
- 성공한 Android debug 빌드 결과: `android/app/build/outputs/apk/debug/app-debug.apk`.
- 성공한 Android release 빌드 결과: `android/app/build/outputs/bundle/release/app-release.aab`.
- 앱 ID는 `io.github.gyeongbin38.mateon`입니다. GitHub Pages 도메인 소유권에 근거한 식별자이며, 스토어 제출 후에는 변경할 수 없습니다.
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
5. 합의서 저장 → 재방문 시 현재 메이트와 일치하면 규칙·동의 상태 복원 → 규칙 변경 시 저장본과 비교·버전 업데이트.
6. 설정에서 MATE:ON 로컬 데이터를 JSON 백업 파일로 내보내고 다시 복원.
7. 생활 도구: 생활비 정산(균등/비율/정확금액 분할 + 영수증 OCR·사진 첨부 + 카테고리별 월별 요약·이전 달 이동 + 고정비 기록일 지정·자동 반복 + 지출 수정/삭제·검색·카테고리 필터·카테고리별 월 예산 + CSV보내기), 같이 살 것(공유 쇼핑), 공동 일정(캘린더 월 뷰·매주 반복·기념일 등록→홈 D-day 배너), 역할 분담, 주간 체크인(기분 추이 차트·주간 공동 미션), 갈등 대화 가이드. 홈에는 미정산 잔액·기념일 D-day·30일 백업 리마인더 배너가, 우리 공간에는 최근 활동 피드가 표시됩니다.
8. 러브맵 퀴즈(서로를 얼마나 아는지·회차·최고 정답률), 대화 주제 20개 + 후속 질문, driver.js 기능 둘러보기 투어.

## 네이티브 연동

- Android 뒤로가기: 바텀시트 닫기 → 상세 화면의 상위 화면 → 홈에서 앱 최소화.
- 네이티브 공유창: 결과·초대 링크, PNG 결과 카드·합의서, ICS 일정 파일, JSON 백업 파일.
- 네이티브 클립보드 및 주요 버튼의 햅틱 피드백.
- 공유 링크는 HTTPS `webBaseUrl`을 기본으로 합니다. 앱 링크가 연결되면 앱으로 열리고, 아니면 웹 초대/리포트 화면으로 이어집니다.
- 설치된 앱에서는 `mateon://invite?data=...`, `mateon://pair?data=...` 사용자 정의 스킴도 하위호환으로 처리합니다.
- Android intent filter / iOS URL scheme 등록, 시작 시 링크와 실행 중 링크 처리.
- Android 밀도별 아이콘·adaptive icon·시작 이미지, iOS 아이콘·시작 이미지.
- 앱 빌드에서는 CDN 폰트를 제외하고 시스템 폰트를 사용하며, 서비스 워커는 등록하지 않습니다.
- OTA 웹 번들 업데이트(@capgo/capacitor-updater, 수동 모드): `npm run ota`로 `ota/` zip + `latest.json`을 만들어 `webBaseUrl`에 올리면 설정 > "앱 업데이트 확인"으로 적용합니다. 스토어 재심사 없이 JS/CSS 수정이 배포됩니다.
- 런처 앱 숏컷(@capawesome/capacitor-app-shortcuts): 주간 체크인·생활 도구·생활비 정산 바로가기.
- 동기화 토큰 등 민감 값은 capacitor-secure-storage-plugin으로 Android Keystore/iOS Keychain에 보관합니다.

현재 공개 웹 링크는 `https://gyeongbin-38.github.io/mateon/`입니다. GitHub 프로젝트 Pages 경로는 도메인 루트의 `.well-known` 파일을 제공할 수 없어, 검증된 Android App Links와 iOS Universal Links는 별도 도메인이 필요합니다. 도메인이 없는 동안 HTTPS 링크는 웹 fallback으로 동작하고 설치된 앱에서는 `mateon://` 링크가 계속 동작합니다. 링크의 결과는 암호화되지 않은 스냅샷이며 자동 갱신되지 않습니다.

## 실제 앱 배포 준비

배포 기준 값은 `release.config.json`에 모아 둡니다. `scripts/release-check.js`가 앱 ID, 버전, 자산 버전, 런타임 링크, Android/iOS 설정과 스토어 메타데이터를 비교합니다.

```sh
node scripts/release-check.js          # 구조 검사, 미설정 값은 경고
npm run release:check                  # 테스트 + 빌드 + 엄격 검사
```

스토어 제출 전에 반드시 채울 값:

1. 최종 `appId`: 스토어에 등록할 영구 식별자. `release.config.json`, `capacitor.config.json`, Android Gradle/Strings, iOS 프로젝트와 런타임 설정을 함께 맞춥니다.
2. 지원 이메일: `release/store-metadata.json`의 `supportEmail`을 실제 운영 메일로 교체합니다.
3. HTTPS 앱 링크 도메인: 도메인 루트에서 `/.well-known/assetlinks.json`과 `/.well-known/apple-app-site-association`을 제공해야 합니다. 템플릿은 `release/` 폴더에 있으며, 도메인 루트에서 앱을 서비스하면 iOS `paths`를 `/*`로 바꿉니다.
4. Android 업로드 키: Play 업로드 서명 키를 로컬/CI 비밀값으로만 주입합니다.
5. iOS 개발 팀: Apple Developer Team과 Xcode 자동 서명 또는 CI 코드사이닝을 설정합니다.

Android 업로드 키는 다음처럼 생성하고 저장소에는 커밋하지 않습니다.

```powershell
keytool -genkeypair -v -keystore mateon-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias mateon-upload
$env:MATEON_UPLOAD_KEYSTORE="C:\secure\mateon-upload.jks"
$env:MATEON_UPLOAD_STORE_PASSWORD="..."
$env:MATEON_UPLOAD_KEY_ALIAS="mateon-upload"
$env:MATEON_UPLOAD_KEY_PASSWORD="..."
npm run android:release
```

빌드 스크립트는 저장소 밖 env 파일(기본 `C:\tools\mateon-sign.env`, `MATEON_SIGN_ENV`로 변경 가능)의 `MATEON_UPLOAD_*` 값도 읽습니다. 이 PC의 업로드 키는 `C:\tools\mateon-upload.jks`에 있으며 env 파일 방식으로 자동 주입됩니다.

생성 결과는 `android/app/build/outputs/bundle/release/app-release.aab`(서명됨)입니다. AAB는 APK와 달리 JAR 서명(`META-INF/*.SF`+`*.RSA`)을 쓰므로 `npm run verify:aab` 또는 `jarsigner -verify`로 확인합니다. Play Console에서는 업로드 키의 SHA-256 인증서 지문을 `assetlinks.json`에 넣고, Play 앱 서명을 사용하면 Play Console이 표시하는 최종 지문도 함께 등록해야 합니다.

iOS는 macOS/Xcode에서 `npm run ios`로 연 뒤 Signing & Capabilities에서 Team, Bundle ID, Version/Build를 맞추고 Archive → Distribute App으로 App Store Connect에 업로드합니다. `release/store-metadata.json`의 스토어 문구와 개인정보 답변을 검토한 뒤 스크린샷·지원 URL·문의 이메일·연령 등급을 함께 제출합니다.

`release:check --strict`는 아직 미설정 값이 있으면 실패하도록 의도되어 있습니다. 지금 남은 차단 항목은 운영 이메일, 검증 앱 링크 도메인, Android 업로드 키, iOS 팀 설정입니다.

## 검증 결과와 제한

- `node test-score.js`: 채점 테스트 통과.
- `node test-smoke.js`: 344개 검증 통과. 진단·초대·리포트·합의서·생활도구(분할·OCR 파서·쇼핑·러브맵·월별 요약·고정비·활동 피드·지출 수정/검색/예산·기념일 D-day·캘린더 월/주간 뷰·주간 반복·주간 미션·집안일 알림·목표 저축·수입/태그·부분 정산·요일 집안일·일정 알림·팬트리·돌봄·공유 메모·배지·애정 언어·연간 회고·휴지통·자동 스냅샷·동기화 충돌·PIN 잠금), 저장 데이터 보존, HTTPS/사용자 정의 앱 링크 검증·뒤로가기, JSON 백업 복원(미리보기·부분 복원), 초대 링크 v3 난독화·만료, TinyBase 머지·삭제 툼스톤, 오프라인 배너 포함.
- `node test-lifetools.js`: 34개 순수 함수 검증 통과. 날짜·상대시간·금액 포맷, ISO 주 스트릭, 월별 추이·예산 단계·고정비 다음 발생일, ICS(RRULE·UNTIL·시간), 기념일 마일스톤·일별 일정 계산, 주간 미션 결정적 선택.
- `npm run e2e`: Playwright 실브라우저 64개 검증 통과. 설문→초대 링크 왕복→리포트→합의서, 생활도구 전 화면, 정산 분할·고정비·월 이동·지출 수정/검색/예산, 기념일·주간 반복·달력 그리드, 주간 미션·집안일 알림, 만료 초대, 백업 미리보기·부분 복원, driver.js 투어, 다크 테마, 오프라인 동작, 목표 저축·수입·태그·부분 정산, 요일 집안일·주간 뷰·일정 알림·팬트리, 공유 메모·돌봄·애정 언어·휴지통 복원, 태블릿 레이아웃.
- `npm run size`: 번들 크기 예산 검사(js 560KB·css 220KB·html 20KB·벤더 1.2MB 이하).
- E2E 브라우저는 `npx playwright install chromium`이 필요하며 `PLAYWRIGHT_BROWSERS_PATH`가 비어 있으면 `C:\tools\ms-playwright`를 사용합니다.
- `npm run verify:aab`: 서명된 `app-release.aab` (~14.5MB) 검증 통과 — JAR 서명 `META-INF/MATEON-U.SF`+`.RSA`, `jarsigner -verify` 확인 완료. 업로드 키 SHA-256: `00:96:CF:6B:…:83:7A:A3` (전체 지문은 `keytool -list -v`).
- `node scripts/release-check.js`: 구조 검증 통과. strict 모드는 지원 이메일, 앱 링크 도메인, Android 서명, iOS 팀 설정이 없어 차단됩니다.
- `npm run sync`: Android/iOS 리소스 빌드·플러그인 동기화 성공.
- 브라우저: 320px/390px 모바일 화면, 1440px 앱 폭 미리보기, 대화 바텀시트 입력·저장·재조회, 가로 넘침 및 콘솔 오류 확인.
- `npm audit`: 알려진 취약점 0개. CLI는 8.4.3으로 고정했습니다.
- Android debug APK 빌드 성공: `android/app/build/outputs/apk/debug/app-debug.apk` (8.3MB). 이 PC는 시스템 Java가 8이라 포터블 JDK 21(`C:\tools\jdk-21`)과 Android SDK(`C:\tools\android-sdk`)를 별도 설치해 `node scripts/build-android-apk.js`로 빌드합니다. 프로젝트 경로에 한글이 있어 `android/gradle.properties`의 `android.overridePathCheck=true`로 허용했습니다. 라이선스 해시는 `C:\tools\android-sdk\licenses\`에 기록돼 있습니다.
- iOS: Windows 환경이므로 Xcode 컴파일·시뮬레이터·실기기 테스트 미실행.
- 네이티브 공유·햅틱·시스템 뒤로가기·OS 딥링크 수신은 구현 완료, 실제 기기 검증은 남아 있습니다. JS 딥링크 해석과 라우팅은 테스트했습니다.

계정, 서버 DB, 인증된 상대 서명은 포함하지 않은 로컬 MVP입니다. 설정의 JSON 백업은 사용자가 직접 보관·복원하는 수동 이전 수단이며, 기존 웹 미리보기의 기록과 설치형 앱 기록은 자동 이전되지 않습니다. 선택적 기기 간 동기화는 설정에서 엔드포인트·방 코드·슬롯을 지정하면 최소 KV 계약(`GET`/`PUT /mateon/{room}/{slot}`)으로 동작합니다. 본문은 TinyBase MergeableStore 스냅샷(`{v:2, tb:...}`)이며 항목 단위 CRDT 머지(HLC, 삭제 툼스톤 포함)를 지원하고, TinyBase가 없는 환경에서는 이전 단일 문서 형식(v1)으로 폴백합니다. 배포 가능한 백엔드 템플릿은 `scripts/sync-worker.js`(Cloudflare Worker)이며, 운영 시 인증·레이트 리밋·보관 주기를 추가해야 합니다.

화면 캡처: `artifacts/app-home-mobile.png`, `app-conversation-sheet.png`, `app-our-space.png`, `app-desktop-preview.png`.

## 실제 화면 기준 SVG 내보내기

Chrome과 Python을 설치한 환경에서 `npm ci`, `python -m pip install -r scripts/requirements-svg.txt` 후 `npm run export:svg`를 실행합니다. 기본 대상은 공개 배포 앱이며 `MATEON_SOURCE_URL` 환경변수로 변경할 수 있습니다.

- Chromium 화면 렌더 → PDF → SVG로 생성해 CSS, 아이콘, 폰트 외형을 보존합니다.
- 27개 화면과 전체 보드: `artifacts/svg-pages`, ZIP: `artifacts/mateon-svg-pages.zip`.
- 원본 화면과 SVG 비교: `artifacts/mateon-svg-comparison.html`.
- 글자는 편집 가능한 벡터 윤곽선이며 일반 텍스트 레이어는 아닙니다. 원문과 글꼴 정보는 `artifacts/svg-fidelity/*.text.json`에 보관합니다. 일부 그림자는 부분 이미지로 포함됩니다.
- PDF 변환 도구 [PyMuPDF](https://github.com/pymupdf/PyMuPDF)는 AGPL-3.0 또는 상용 라이선스이며 앱 런타임에 포함하지 않습니다.
