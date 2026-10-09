# MATE:ON 출시 런북

로컬에서 자동화할 수 없는 외부 계정·기기 의존 작업의 실행 절차 모음.
각 항목 완료 후 `npm run release:check`와 `npm run play:sim`으로 준비 상태를 재확인한다.

## 1. 지원 이메일 (필수, 유일한 스토어 블로커)

`store-metadata.json`의 `supportEmail`이 현재 `TODO_RELEASE_CONTACT_EMAIL`이다.

1. 스토어에 공개할 이메일을 결정한다 (개인 Gmail도 가능하지만 별도 주소 권장).
2. `release/store-metadata.json` → `"supportEmail": "실제주소@도메인"`.
3. `npm run play:sim` 재실행 → 44/44 확인.
4. iOS App Store Connect의 "App Review Information — Contact"에도 같은 주소 사용.

## 2. Android App Links (assetlinks.json)

`release/assetlinks.template.json`의 `SHA256_PLACEHOLDER`를 실제 지문으로 채우고 도메인에 호스팅한다.

1. 업로드 키 지문 확인 (로컬 keystore):

   ```
   keytool -list -v -keystore C:\tools\mateon-upload.jks -alias mateon-upload
   ```

   → `SHA256: AA:BB:...` 값을 복사.
   **Play 앱 서명 사용 시** Play Console → 설정 → 앱 무결성의 "앱 서명 키 인증서" SHA-256도 추가해야 한다 (업로드 키와 앱 서명 키는 다름).

2. `release/assetlinks.template.json`을 복사해 `<web>/.well-known/assetlinks.json`에 배치하고
   `sha256_cert_fingerprints` 배열에 업로드 키 + 앱 서명 키 지문을 모두 넣는다.

3. 호스팅 확인:

   ```
   curl https://gyeongbin-38.github.io/mateon/.well-known/assetlinks.json
   ```

   GitHub Pages는 `.well-known`을 그대로 서빙한다 (`_config.yml`에 `include: [".well-known"]` 필요할 수 있음 — Jekyll 빌드 사용 시).

4. `release/app-links-intent-filter.xml`이 이미 `android/app/src/main/AndroidManifest.xml`에 반영됐는지 확인하고,
   앱에서 `https://gyeongbin-38.github.io/mateon/?invite=...` 링크가 브라우저가 아닌 앱으로 열리는지 실기기 테스트.

## 3. iOS Universal Links (apple-app-site-association)

`release/apple-app-site-association.template.json`의 `TEAMID`를 채운다.

1. Apple Developer → Membership → Team ID 확인.
2. `<web>/.well-known/apple-app-site-association`으로 배치 (확장자 없음, `application/json` 응답, 리다이렉트 없이 200).
3. Xcode → Signing & Capabilities → Associated Domains에
   `applinks:gyeongbin-38.github.io` 추가.
4. 실기기에서 Notes에 링크를 붙여넣고 길게 눌러 "MATE:ON에서 열기"가 뜨는지 확인.

## 4. iOS 빌드·제출 (macOS 필요 — 이 PC에서는 불가)

이 저장소는 `ios/` Capacitor 프로젝트만 포함하며, 아카이브·서명·업로드는 macOS + Xcode에서 해야 한다.

사전 조건: macOS, Xcode 15+, CocoaPods, Apple Developer 계정 ($99/년).

1. `npm run build && npx cap sync ios`
2. `ios/App/App.xcodeproj`를 Xcode로 열기 (`npm run ios`로 자동 오픈 가능).
3. Signing & Capabilities:
   - `DEVELOPMENT_TEAM`에 본인 Team ID 설정
   - Bundle ID `io.github.gyeongbin38.mateon` 확인
   - Automatically manage signing 체크
4. `appId`/`CFBundleVersion`은 `release.config.json`의 `iosBuildNumber`와 동기화됨 — `node scripts/bump-version.js`가 pbxproj의 `CURRENT_PROJECT_VERSION`도 갱신한다.
5. Product → Archive → Distribute App → App Store Connect 업로드.
6. App Store Connect에서 앱 생성 → 스크린샷(6.7"/6.5"/5.5"), 설명(`store-metadata.json`의 ios 섹션), 프라이버시 라벨(Data Not Collected) 입력.
7. 대안: Codemagic/GitHub Actions `macos-latest` 러너에서 fastlane으로 빌드 자동화.

## 5. 동기화 서버 배포 (Cloudflare Workers)

`scripts/sync-worker.js`는 저장만 하는 슬롯 백엔드 템플릿이다 (`GET/PUT /mateon/{room}/{slot}`).

1. `npm i -g wrangler && wrangler login`
2. KV 네임스페이스 생성: `wrangler kv:namespace create MATEON_SYNC`
   → 출력된 `id`를 `wrangler.toml`에 넣는다:

   ```toml
   name = "mateon-sync"
   main = "scripts/sync-worker.js"
   compatibility_date = "2026-01-01"
   [[kv_namespaces]]
   binding = "MATEON_SYNC"
   id = "<생성된 id>"
   ```

3. `wrangler deploy` → `https://mateon-sync.<계정>.workers.dev` URL 확정.
4. 앱에 URL 연결: `js/config.js`의 `MATEON_CONFIG`에 `syncBase` 값을 추가하거나,
   설정 → 동기화에서 방 코드+서버 URL을 직접 입력하는 기존 UI를 사용한다.
5. 검증: 브라우저 두 개(or 기기 두 대)로 같은 방 코드에 접속해 지출 추가 → 상대 화면에 반영되는지 확인.
6. 비용: Workers 무료 티어(일 10만 요청)·KV 무료 티어(일 10만 읽기)로 MVP 충분.

## 6. Play Console 내부 테스트 트랙

1. `npm run android:release`로 서명된 AAB 생성 → `npm run verify:aab` 통과 확인.
2. Play Console → 앱 만들기 (`MATE:ON`, ko 기본 언어).
3. 테스트 → 내부 테스트 → 새 버전 만들기 → AAB 업로드.
4. 테스터 목록: Google 그룹 또는 이메일 추가 → 테스터 초대 링크 발급.
5. **내부 테스트는 심사 없이 바로 배포된다** — 실기기 설치·스토어 목록 렌더링을 여기서 먼저 검증.
6. 스토어 등록정보 작성(`store-listing.md` 참고) 후 "프로덕션으로 승격"은 내부 검증 완료 후에만.

## 7. 실기기 검증 체크리스트

### Android (이 PC에서 빌드 가능)

- [ ] `node scripts/build-android-apk.js` → `app-debug.apk`를 기기에 설치 (`adb install` 또는 파일 전송)
- [ ] 부팅 후 홈 렌더, 스플래시 1초 후 해제
- [ ] 설정 → 알림 토글 ON → 집안일/일정 알림이 예약 시간에 도착
- [ ] 홈 화면 위젯 추가 → D-day/다음 일정 표시
- [ ] 앱 잠금(PIN) 설정 → 재실행 시 잠금 화면, 5회 실패 시 백오프
- [ ] 지출 추가 → 알림 센터에 활동 기록, 초성 검색(`ㅅㄱㅈ`) 동작
- [ ] 일정 항목 길게 누르기 → 컨텍스트 메뉴(수정/삭제/ICS)
- [ ] ICS 내보내기 → 캘린더 앱 선택 시트 표시
- [ ] 백업 보내기 → 파일 공유 → 다른 기기에서 불러오기

### OTA 업데이트 실측

- [ ] `npm run ota` → `ota/latest.json`이 배포 URL에서 접근 가능
- [ ] 앱 설정 → 업데이트 확인 → 새 번들 다운로드→적용→재시작
- [ ] `notifyAppReady` 미호출 시 이전 번들로 자동 롤백됨을 확인 (테스트 번들에 의도적 에러 주입으로 검증)
- [ ] 설정 → "이전 버전으로 되돌리기" 버튼 → 수동 롤백 동작

### iOS 시뮬레이터 (macOS 필요)

- [ ] `npx cap open ios` → 시뮬레이터에서 Run
- [ ] 홈·정산·캘린더·설정 렌더, safe-area 노치 대응
- [ ] 공유 시트 → 이미지 저장이 앱 앨범으로 수신
- [ ] Universal Link (섹션 3 완료 후) Notes 앱에서 앱 열림 확인

### 두 기기 동기화 (섹션 5 완료 후)

- [ ] 기기 A·B 모두 같은 방 코드 + 동기화 URL 설정
- [ ] A에서 지출 추가 → B에 반영 (HLC LWW)
- [ ] B에서 같은 항목 삭제 → A에 삭제 반영, 재동기화 후에도 부활하지 않음 (툼스톤)
- [ ] 한 기기 오프라인 → 변경 → 온라인 복귀 → 양방향 머지

## 8. 스토어 에셋

- 스크린샷 ko: `npm run shots` → `release/screenshots/`
- 스크린샷 en: `npm run shots:en` → `release/screenshots-en/`
- 피처 그래픽: `npm run graphic` → `release/graphic/feature-1024x500.png`
- 제출 전 시뮬레이션: `npm run play:sim` (44개 항목 준비 상태)
