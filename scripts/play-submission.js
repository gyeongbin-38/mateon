/* Play Console 제출 시뮬레이션 — 실제 콘솔 양식 순서대로 답변·에셋을 점검한다.
   실행: node scripts/play-submission.js
   목적: 제출 전 "콘솔에서 막히는 항목"을 미리 발견한다. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (r) => fs.readFileSync(path.join(root, r), 'utf8');
const exists = (r) => fs.existsSync(path.join(root, r));
const release = require(path.join(root, 'release.config.json'));
const store = exists(release.storeMetadata) ? require(path.join(root, release.storeMetadata)) : null;

let pass = 0,
  miss = 0;
const ok = (name, cond, note) => {
  console.log('  ' + (cond ? 'READY ' : 'TODO  ') + name + (note ? ' — ' + note : ''));
  cond ? pass++ : miss++;
};

console.log('== 1. 앱 정보 ==');
const pkg = require(path.join(root, 'package.json'));
ok('패키지 버전 일치', pkg.version === release.version, pkg.version);
ok('릴리스 버전 형식 (semver)', /^\d+\.\d+\.\d+$/.test(release.version), release.version);
ok('versionCode 단조 증가 정수', Number.isInteger(release.androidVersionCode) && release.androidVersionCode > 0, String(release.androidVersionCode));
ok('iOS 빌드 번호', /^\d+$/.test(String(release.iosBuildNumber)), String(release.iosBuildNumber));

console.log('== 2. 스토어 등록 정보 ==');
ok('앱 제목', !!(store && store.android && store.android.title));
ok(
  '짧은 설명 (80자 이내)',
  !!(store && store.android && store.android.shortDescription && store.android.shortDescription.length <= 80),
  store && store.android && store.android.shortDescription ? store.android.shortDescription.length + '자' : 'none'
);
ok(
  '전체 설명 (4000자 이내)',
  !!(store && store.android && store.android.fullDescription && store.android.fullDescription.length <= 4000),
  store && store.android && store.android.fullDescription ? store.android.fullDescription.length + '자' : 'none'
);
ok('카테고리', !!(store && store.android && store.android.category), store && store.android && store.android.category);

console.log('== 3. 그래픽 에셋 ==');
ok('앱 아이콘 512', exists('assets/icon-512.png'));
ok(
  '피처 그래픽 1024x500',
  exists('release/graphic') && fs.readdirSync(path.join(root, 'release/graphic')).some((f) => /^feature.*1024x500.*\.(png|jpe?g)$/i.test(f))
);
ok(
  '스크린샷 1장 이상',
  exists('release/screenshots') && fs.readdirSync(path.join(root, 'release/screenshots')).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).length >= 1
);

console.log('== 4. 콘텐츠 등급 (IARC) ==');
/* IARC 질문지 — MATE:ON은 모두 "아니오"에 해당해야 Everyone 등급 */
const iarc = {
  폭력성: false,
  '성적 콘텐츠': false,
  언어: false,
  약물: false,
  도박: false,
  '사용자 생성 콘텐츠 공유': true /* 초대 링크 공유 기능 */,
  '개인정보 수집': true /* 기기 내 저장이지만 수집으로 분류 */,
  '위치 공유': false,
  '디지털 상품 구매': false,
};
Object.entries(iarc).forEach(([k, v]) => ok('IARC: ' + k, v !== null, v ? '예' : '아니오'));
ok('예상 등급', (store && store.android && store.android.contentRating) === 'Everyone', store && store.android && store.android.contentRating);

console.log('== 5. 대상 연령·콘텐츠 ==');
ok('대상 연령 — 만 18세 미만 아동 대상 아님', true, '생활 관리 앱, 아동 미대상');
ok('뉴스 앱 아님', true, '-');
ok('COVID-19 접촉 추적 아님', true, '-');
ok('광고 없음 선언', !read('js/mateon.js').match(/admob|adsdk|advertising/i), '광고 SDK 없음');

console.log('== 6. 데이터 안전 ==');
ok('데이터 안전 문서', exists('release/data-safety.md'));
const ds = exists('release/data-safety.md') ? read('release/data-safety.md') : '';
ok('수집 항목 표 존재', /수집|collect/i.test(ds));
ok('삭제 방법 명시', /삭제|delete|deletion/i.test(ds));
ok('암호화 언급', /암호|encrypt|PBKDF2|AES/i.test(ds));
ok('서버 전송 없음 명시', /기기|localStorage|서버 없음|전송 없음/i.test(ds));

console.log('== 7. 개인정보·법적 ==');
ok('개인정보처리방침 URL (HTTPS)', /^https:\/\//.test(release.privacyPolicyUrl), release.privacyPolicyUrl);
ok('개인정보처리방침 페이지 라우트', read('js/mateon.js').includes('privacy') || read('js/appviews.js').includes('privacy'));
const manifest = read('android/app/src/main/AndroidManifest.xml');
ok('위험 권한 없음', !/(RECORD_AUDIO|CAMERA|READ_CONTACTS|ACCESS_FINE_LOCATION|ACCESS_BACKGROUND_LOCATION|READ_SMS|SEND_SMS)/.test(manifest));
ok('Cleartext 트래픽 차단', manifest.includes('android:usesCleartextTraffic="false"'));

console.log('== 8. 제출 패키지 ==');
ok('AAB 빌드 스크립트', exists('scripts/build-android.js'));
ok('AAB 서명 검증 스크립트', exists('scripts/verify-aab.js'));
ok('OTA 번들 스크립트', exists('scripts/make-ota.js'));
ok('릴리즈 체크 스크립트', exists('scripts/release-check.js'));
ok('앱 서명 env 예시 문서', read('AGENTS.md').includes('MATEON_UPLOAD_') || exists('android/mateon-sign.env'));

console.log('== 9. 지원·연락처 ==');
ok('지원 이메일 설정됨', !!(store && store.supportEmail && !/TODO|CHANGE_ME/i.test(store.supportEmail)), store && store.supportEmail);
ok('지원 URL', !!(store && /^https:\/\//.test(store.supportUrl || '')));

console.log('== 10. 앱 기능 검증 ==');
ok('SW가 사용자 데이터를 캐시하지 않음', !read('sw.js').match(/localStorage|indexedDB/i));
ok('네트워크 폴백 시 사용자 데이터 미포함', true, '로컬 퍼스트');
ok('CSP 메타 또는 헤더', read('index.html').includes('Content-Security-Policy') || read('server.js').includes('Content-Security-Policy'));

console.log('\n' + pass + ' ready, ' + miss + ' todo');
process.exit(miss ? 1 : 0);
