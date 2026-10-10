# MATE:ON 프로젝트 노트

동거 준비 성향 진단 + 생활 합의 앱. 브라우저 우선 SPA, `localStorage` 로컬-퍼스트 저장, Capacitor 네이티브 셸, PWA 서비스 워커.

## 명령

| 작업        | 명령                                                                                                                                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 개발 서버   | `npm run dev` (server.js)                                                                                                                                                                             |
| 테스트      | `npm test` = test-score + test-smoke (344개 DOM 스텁) + test-lifetools (34개 순수함수) + test-sw + test-qr                                                                                            |
| E2E         | `npm run e2e` — Playwright 실브라우저 66개 (브라우저 캐시 `C:\tools\ms-playwright`), `npm run e2e:webkit` — WebKit 동일 스위트                                                                        |
| 린트        | `npm run lint` — ESLint flat config (`eslint.config.js`, 오류 0 유지)                                                                                                                                 |
| 타입 검사   | `npm run typecheck` — `tsc --noEmit --checkJs` (`tsconfig.json`, `js/globals.d.ts` 전역 선언); `npm run typecheck:strict` — `tsconfig.strict.json` strictNullChecks **전체 js/\*.js** (0 errors 유지) |
| 접근성      | `npm run a11y` — `scripts/a11y-scan.mjs` axe WCAG 2.2 AA, light/dark 7라우트 (Playwright 브라우저 필요)                                                                                               |
| 포맷        | `npm run format` / `format:check` — Prettier (`.prettierrc.json`, 2칸·세미콜론·작은따옴표)                                                                                                            |
| CI          | `.github/workflows/ci.yml` — push/PR 시 lint + typecheck + format + build + test + size + e2e(chromium+webkit)                                                                                        |
| 번들 크기   | `npm run size` — js/css/html/벤더 예산 체크 (release-check에 포함)                                                                                                                                    |
| 빌드        | `npm run build` → `dist/` (esbuild가 `native/bridge.js` → `dist/js/native.js` 번들)                                                                                                                   |
| SW 검증     | `node test-sw.js`                                                                                                                                                                                     |
| 출시 검증   | `npm run release:check` (strict; 외부 계정 의존 항목은 실패 예정)                                                                                                                                     |
| OTA 번들    | `npm run ota` → `ota/mateon-<assetVersion>.zip` + `latest.json`                                                                                                                                       |
| Play 시뮬   | `npm run play:sim` — `scripts/play-submission.js` 콘솔 제출 양식 순서로 준비도 점검 (44개 항목)                                                                                                       |
| 스크린샷    | `npm run shots` / `npm run shots:en` — ko/en 스토어 스크린샷 → `release/screenshots(-en)/`                                                                                                            |
| 출시 런북   | `release/README.md` — 지원 이메일·App Links·iOS 빌드·sync-worker 배포·내부 테스트·실기기 검증 체크리스트                                                                                              |
| WebP 재생성 | `node scripts/make-webp.js` (sharp 필요)                                                                                                                                                              |
| 벤더 재생성 | `node scripts/vendor-libs.js` — esbuild로 `js/vendor/` 재생성 (driver, modern-screenshot, tinybase, tesseract, qrcode)                                                                                |

## 배포 버전 동기화 규칙

`release.config.json`의 `assetVersion` · `sw.js`의 `VERSION` · `index.html`의 `?v=` 쿼리가 모두 같아야 release-check 통과. `node scripts/bump-version.js YYYYMMDD-NN`이 4개 파일을 일괄 갱신하고 `androidVersionCode`/`iosBuildNumber`를 +1 해 `android/app/build.gradle`까지 동기화함 — 실제 릴리스 범프 때만 실행.

## 구조

- `js/mateon.js` — 앱 로직 전체 (라우터, 뷰, 상태 `S`, 인코딩, 동기화 어댑터)
- `js/lifetools.js` — `mateon.js`에서 추출한 순수 함수 (분할 정산·정산 계산·ISO 주·영수증 파서·월별 통계 `monthStats`·고정비 id `fixedExpId`). `mateon.js`보다 먼저 로드해야 함
- `js/secure.js` — `window.MateSecure` WebCrypto 암호화 백업(PBKDF2+AES-GCM)·PIN 해시. `mateon.js`가 위임 호출
- `js/household.js` — `window.MateHouse` 생활 카드 렌더러 (월간 리포트·쿠폰·룰렛·돌봄·메모·배지·연간 회고·앨범·애정언어·목표·빚·팬트리·휴지통·스냅샷). `MH.bind()`로 `mateon.js`의 S/esc/fmtWon 등을 주입. `mateon.js`보다 먼저 로드
- `js/appviews.js` — `window.MateViews` 분리 뷰 (온보딩·개인정보·약관·유형 도감·유형 상세). `MateViews.bind()`로 의존 주입. `mateon.js`보다 먼저 로드
- `js/i18n.js` — `window.MateI18n` 문자열 테이블 골격 (ko/en, 내비 라벨 배선됨)
- `css/pretendard.css` + `fonts/pretendard/` — Pretendard 서브셋 92개 자체호스팅 (외부 CDN 의존 없음)
- `js/data.js` — 문항/캐릭터/규칙/갈등 시나리오 상수
- `js/config.js` — 런타임 배포 값 (appId `io.github.gyeongbin38.mateon`, webBaseUrl)
- `native/bridge.js` — Capacitor 브리지 (`window.MateNative`: copy/share/shareFile/syncReminders/checkUpdate/rollbackUpdate/setupShortcuts/secureGet·Set·Remove/updateWidget). OTA는 `notifyAppReady()`로 부팅 성공을 알리고 실패 시 자동 롤백됨
- `js/vendor/` — esbuild IIFE 벤더 번들 (driver.js → `window.driver.js.driver`, modern-screenshot → `window.MateScreenshot`, tinybase → `TinyBase`, tesseract → `Tesseract`)
- `assets/ocr/` — tesseract 언어/런타임 (~9.7MB, 지연 로딩, SW 프리캐시 제외) | eng/kor traineddata + core wasm + worker.min.js
- `scripts/sync-worker.js` — Cloudflare Worker 동기화 백엔드 템플릿 (GET/PUT `/mateon/{room}/{slot}`)
- `release/` — 스토어 메타데이터·리스팅·app links 템플릿

## 동기화 (TinyBase v2)

- 본문: `{v:2, tb:<MergeableContent>}`, 슬롯별 `GET/PUT /mateon/{room}/{slot}` — 서버는 저장만
- `kv` 테이블: 항목 행 `e:`지출 `g:`쇼핑 `v:`일정 `t:`정산 `c:`체크인, 셀 `w:`문서(합의서·체크리스트·대화·규칙·러브맵), `me:<slot>` 결과
- HLC 셀 단위 LWW + `delRow` 툼스톤 — 상대가 구버전을 재푸시해도 삭제가 부활하지 않음. 단, 삭제를 모르는 새 스토어의 동일 ID 재추가는 HLC가 높아 부활(CRDT 정상 동작)
- TinyBase 부재 시 v1 문서 형식으로 폴백

## 초대 링크 (v3)

`encodeInvite(r, days)` → JSON `{v:3, d:결과배열, e:만료시각, n:nonce}` → UTF-8 XOR 난독화(`INVITE_XOR_SEED`) → `z` 접두사 토큰. 난독화이지 암호화 아님 — 민감 데이터는 pair 링크 대신 진단 재수신 권장.

## Android 빌드 환경 (이 PC)

시스템 Java가 8이라 Gradle 불가 → 포터블 도구를 `C:\tools`에 설치함:

- JDK 21: `C:\tools\jdk-21` (Temurin zip, `+` 없는 이름으로 리네임)
- Android SDK: `C:\tools\android-sdk` (cmdline-tools → `latest` 이름 필수, licenses 해시 파일로 수락)
- 빌드: `node scripts/build-android-apk.js [task]` — env 주입 후 `.\gradlew.bat` spawn
- 산출물: `android/app/build/outputs/apk/debug/app-debug.apk`, `.../bundle/release/app-release.aab`
- 한글 프로젝트 경로 → `android/gradle.properties`에 `android.overridePathCheck=true`

릴리스 서명:

- 업로드 키 `C:\tools\mateon-upload.jks` (alias `mateon-upload`, PKCS12)
- **이 셸은 `set`/env가 자식 프로세스로 전파되지 않는다** → `C:\tools\mateon-sign.env` (key=value, 저장소 밖)에 `MATEON_UPLOAD_*` 4개를 두고 `build-android.js`/`build-android-apk.js`가 직접 읽음. 재사용 데몬이 env를 고정하므로 설정 변경 후 `--stop` 필요
- AAB는 JAR 서명(`META-INF/*.SF/.RSA`) — v2 블록이 없는 게 정상. 검증: `npm run verify:aab` → `PASS: JAR signature` + `jarsigner -verify` (self-signed 경고는 정상)

## 환경 주의 (Windows)

- cmd 한글 경로 출력이 깨지지만 실제 파일은 정상. `findstr`/`tasklist` 필터는 인용 문제로 실패할 수 있어 직접 문자열 비교 권장.
- PowerShell 호출이 명령을 실행하지 않고 에코만 반환할 수 있음 — cmd 사용.
- `set`은 `&&` 뒤까지 값으로 잡을 수 있어 `set "VAR=v"` 형태 사용. `NoDefaultCurrentDirectoryInExePath` 때문에 배치 명령은 `.\` 경로 명시.
- .bat 파일에 한글 리터럴 경로 금지 (코드페이지 깨짐) — 상대 경로나 인자 사용.
- Node 24+: `global.navigator`는 읽기 전용 getter라 `Object.defineProperty` 필요.
- winget 설치가 installer mutex 대기로 멈출 수 있음 — zip 포터블 경로가 확실.
