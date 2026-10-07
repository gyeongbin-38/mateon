const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const strict = process.argv.includes('--strict');
const release = require(path.join(root, 'release.config.json'));
const failures = [];
const warnings = [];

function fail(message) { failures.push(message); }
function warn(message) { strict ? failures.push(message) : warnings.push(message); }
function check(name, condition, detail) {
  if (!condition) fail(name + (detail ? ': ' + detail : ''));
}
function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}
function exists(relative) {
  return fs.existsSync(path.join(root, relative));
}
function json(relative) {
  return JSON.parse(read(relative));
}
function placeholder(value) {
  return !value || /TODO|CHANGE_ME|example\.com|localhost|127\.0\.0\.1/i.test(String(value));
}

const pkg = json('package.json');
const capacitor = json('capacitor.config.json');
const configSrc = read('js/config.js');
const indexSrc = read('index.html');
const mateonSrc = read('js/mateon.js');
const swSrc = read('sw.js');
const gradle = read('android/app/build.gradle');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const strings = read('android/app/src/main/res/values/strings.xml');
const iosProject = read('ios/App/App.xcodeproj/project.pbxproj');
const iosInfo = read('ios/App/App/Info.plist');

check('package version', pkg.version === release.version, `${pkg.version} != ${release.version}`);
check('Capacitor app ID', capacitor.appId === release.appId);
check('Capacitor app name', capacitor.appName === release.appName);
check('Capacitor webDir', capacitor.webDir === 'dist');
check('runtime config app ID', configSrc.includes(`appId: '${release.appId}'`));
check('runtime config version', configSrc.includes(`version: '${release.version}'`));
check('runtime config web URL', configSrc.includes(`webBaseUrl: '${release.webBaseUrl}'`));
check('runtime config scheme', configSrc.includes(`customScheme: '${release.customScheme}'`));
check('web base URL', /^https:\/\//.test(release.webBaseUrl), release.webBaseUrl);
check('privacy URL', /^https:\/\//.test(release.privacyPolicyUrl), release.privacyPolicyUrl);

check('index runtime config script', indexSrc.includes(`js/config.js?v=${release.assetVersion}`));
const assetQueries = Array.from(indexSrc.matchAll(/\?v=([^"'\s>]+)/g), match => match[1]);
check('index asset version', assetQueries.length >= 7 && assetQueries.every(version => version === release.assetVersion), assetQueries.join(', '));
check('service worker version', swSrc.includes(`const VERSION = '${release.assetVersion}'`));
check('service worker runtime config cache', swSrc.includes('js/config.js'));
check('public HTTPS invite links', mateonSrc.includes(`publicBaseURL() + '?invite='`));
check('legacy invite generation removed', !mateonSrc.includes(`return 'mateon://invite?data='`));
check('HTTPS app-link handler', mateonSrc.includes(`searchParams.get('invite')`) && mateonSrc.includes(`searchParams.get('pair')`));

check('Android namespace', gradle.includes(`namespace = "${release.appId}"`));
check('Android applicationId', gradle.includes(`applicationId "${release.appId}"`));
check('Android versionName', gradle.includes(`versionName "${release.version}"`));
check('Android versionCode', gradle.includes(`versionCode ${release.androidVersionCode}`));
check('Android custom scheme string', strings.includes(`<string name="custom_url_scheme">${release.customScheme}</string>`));
check('Android deep-link scheme', manifest.includes(`android:scheme="${release.customScheme}"`));
check('Android cleartext disabled', manifest.includes('android:usesCleartextTraffic="false"'));
check('Android dangerous permissions', !/(RECORD_AUDIO|CAMERA|READ_CONTACTS|ACCESS_FINE_LOCATION|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE)/.test(manifest));

check('iOS bundle ID', iosProject.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${release.appId};`));
check('iOS marketing version', iosProject.includes(`MARKETING_VERSION = ${release.version};`));
check('iOS build number', iosProject.includes(`CURRENT_PROJECT_VERSION = ${release.iosBuildNumber};`));
check('iOS URL scheme', iosInfo.includes(`<string>${release.customScheme}</string>`));
check('iOS development region', /<key>CFBundleDevelopmentRegion<\/key>\s*<string>ko<\/string>/.test(iosInfo));
check('iOS encryption declaration', iosInfo.includes('<key>ITSAppUsesNonExemptEncryption</key>'));

for (const file of ['assets/icon-192.png', 'assets/icon-512.png', 'assets/og-image.png', 'assets/app-icon.svg', 'manifest.webmanifest']) {
  check(`release asset ${file}`, exists(file));
}

check('dist index', exists('dist/index.html'), 'run npm run build first');
check('dist runtime config', exists('dist/js/config.js'), 'run npm run build first');
check('dist native bridge', exists('dist/js/native.js'), 'run npm run build first');
if (exists('dist/index.html')) {
  const distIndex = read('dist/index.html');
  check('dist native bridge script', distIndex.includes('js/native.js'));
  check('dist offline scripts', !distIndex.includes('cdn.jsdelivr.net/npm/kakao'));
}

check('store metadata file', exists(release.storeMetadata));
if (exists(release.storeMetadata)) {
  const store = json(release.storeMetadata);
  check('Android store title', store.android && store.android.title === release.appName);
  check('Android short description', !!(store.android && store.android.shortDescription));
  check('iOS store name', store.ios && store.ios.name === release.appName);
  check('iOS store subtitle', !!(store.ios && store.ios.subtitle));
  check('store privacy URL', store.privacyPolicyUrl === release.privacyPolicyUrl);
  check('store support URL', /^https:\/\//.test(store.supportUrl || ''));
  check('store marketing URL', /^https:\/\//.test(store.marketingUrl || ''));
  if (placeholder(store.supportEmail)) warn('store support email must be set before submission');
}

if (release.appId === 'app.mateon.mobile') {
  warn('release appId still uses the development identifier');
}
if (!release.appLinks || release.appLinks.enabled !== true) {
  warn('verified App Links/Universal Links are not enabled; HTTPS links will fall back to the web app');
}
if (!process.env.MATEON_UPLOAD_KEYSTORE) {
  warn('MATEON_UPLOAD_KEYSTORE is not set; Android release builds need an upload keystore');
}
for (const secret of ['MATEON_UPLOAD_STORE_PASSWORD', 'MATEON_UPLOAD_KEY_PASSWORD']) {
  if (process.env.MATEON_UPLOAD_KEYSTORE && !process.env[secret]) warn(`${secret} is required when the upload keystore is set`);
}
if (!process.env.APPLE_TEAM_ID && !process.env.DEVELOPMENT_TEAM) {
  warn('APPLE_TEAM_ID/DEVELOPMENT_TEAM is not set; iOS archive signing must be configured in Xcode or CI');
}

if (warnings.length) {
  console.log('Release warnings:');
  warnings.forEach(message => console.log('  - ' + message));
}
if (failures.length) {
  console.error('Release check failed:');
  failures.forEach(message => console.error('  - ' + message));
  process.exitCode = 1;
} else {
  console.log('Release check passed' + (strict ? ' (strict)' : ''));
}
