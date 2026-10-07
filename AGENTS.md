# MATE:ON 프로젝트 노트

동거 준비 성향 진단 + 생활 합의 앱. 브라우저 우선 SPA, `localStorage` 로컬-퍼스트 저장, Capacitor 네이티브 셸, PWA 서비스 워커.

## 명령

| 작업 | 명령 |
|------|------|
| 개발 서버 | `npm run dev` (server.js) |
| 테스트 | `npm test` = test-score + test-smoke (262개 DOM 스텁) + test-sw + test-qr |
| E2E | `npm run e2e` — Playwright 실브라우저 22개 (브라우저 캐시 `C:\tools\ms-playwright`) |
| 빌드 | `npm run build` → `dist/` (esbuild가 `native/bridge.js` → `dist/js/native.js` 번들) |
| SW 검증 | `node test-sw.js` |
| 출시 검증 | `npm run release:check` (strict; 외부 계정 의존 항목은 실패 예정) |
| OTA 번들 | `npm run ota` → `ota/mateon-<assetVersion>.zip` + `latest.json` |
| WebP 재생성 | `node scripts/make-webp.js` (sharp 필요) |
| 벤더 재생성 | `node scripts/vendor-libs.js` — esbuild로 `js/vendor/` 재생성 (driver, modern-screenshot, tinybase, tesseract, qrcode) |

## 배포 버전 동기화 규칙

`release.config.json`의 `assetVersion` · `sw.js`의 `VERSION` · `index.html`의 `?v=` 쿼리가 모두 같아야 release-check 통과. 변경 시 셋을 함께 올릴 것.

## 구조

- `js/mateon.js` — 앱 로직 전체 (라우터, 뷰, 상태 `S`, 인코딩, 동기화 어댑터)
- `js/lifetools.js` — `mateon.js`에서 추출한 순수 함수 (분할 정산·정산 계산·ISO 주·영수증 파서). `mateon.js`보다 먼저 로드해야 함
- `js/data.js` — 문항/캐릭터/규칙/갈등 시나리오 상수
- `js/config.js` — 런타임 배포 값 (appId `io.github.gyeongbin38.mateon`, webBaseUrl)
- `native/bridge.js` — Capacitor 브리지 (`window.MateNative`: copy/share/shareFile/syncReminders/checkUpdate/setupShortcuts/secureGet·Set·Remove)
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
