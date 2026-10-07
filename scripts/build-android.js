const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

/* 서명 env는 저장소 밖 파일에서도 읽는다 (key=value, # 주석).
   이 셸은 `set`이 자식 프로세스로 전파되지 않아 파일 방식이 확실하다. */
const envFile = process.env.MATEON_SIGN_ENV || 'C:\\tools\\mateon-sign.env';
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
/* 포터블 도구 경로 (C:\tools) — 이미 PATH에 있으면 그대로 사용 */
for (const [key, val] of [['JAVA_HOME', 'C:\\tools\\jdk-21'], ['ANDROID_HOME', 'C:\\tools\\android-sdk'], ['ANDROID_SDK_ROOT', 'C:\\tools\\android-sdk']]) {
  if (!process.env[key] && fs.existsSync(val)) process.env[key] = val;
}

const task = process.argv[2] || 'assembleDebug';
if (!/^[A-Za-z0-9]+$/.test(task)) {
  console.error(`Invalid Gradle task: ${task}`);
  process.exit(1);
}

const isRelease = /Release|bundleRelease/.test(task);
const keystore = process.env.MATEON_UPLOAD_KEYSTORE;
if (isRelease) {
  if (!keystore) {
    console.error('Android release builds require MATEON_UPLOAD_KEYSTORE.');
    console.error('Set MATEON_UPLOAD_KEYSTORE, MATEON_UPLOAD_STORE_PASSWORD, and MATEON_UPLOAD_KEY_PASSWORD.');
    process.exit(1);
  }
  if (!fs.existsSync(keystore)) {
    console.error(`Upload keystore not found: ${keystore}`);
    process.exit(1);
  }
  const missingSecrets = ['MATEON_UPLOAD_STORE_PASSWORD', 'MATEON_UPLOAD_KEY_PASSWORD'].filter(name => !process.env[name]);
  if (missingSecrets.length) {
    console.error(`Missing signing secrets: ${missingSecrets.join(', ')}`);
    process.exit(1);
  }
}

const windows = process.platform === 'win32';
const command = windows ? 'cmd.exe' : './gradlew';
const args = windows
  ? ['/d', '/s', '/c', `.\\gradlew.bat ${task}`]
  : [task];
const result = spawnSync(command, args, { cwd: path.resolve(__dirname, '../android'), stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
