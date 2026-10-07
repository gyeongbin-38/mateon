const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const root = path.resolve(__dirname, '..');
/* 서명 env는 저장소 밖 파일에서도 읽는다 (key=value 한 줄씩, # 주석).
   이 셸은 `set`이 자식 프로세스로 전파되지 않아 파일 방식이 확실하다. */
const envFile = process.env.MATEON_SIGN_ENV || 'C:\\tools\\mateon-sign.env';
const fileEnv = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) fileEnv[m[1]] = m[2];
  }
}
const env = {
  ...fileEnv,
  ...process.env,
  JAVA_HOME: 'C:\\tools\\jdk-21',
  ANDROID_HOME: 'C:\\tools\\android-sdk',
  ANDROID_SDK_ROOT: 'C:\\tools\\android-sdk',
  PATH: 'C:\\tools\\jdk-21\\bin;C:\\tools\\android-sdk\\platform-tools;C:\\tools\\android-sdk\\build-tools\\36.0.0;' + process.env.PATH,
};
const task = process.argv[2] || 'assembleDebug';
const child = spawn('cmd.exe', ['/d', '/s', '/c', '.\\gradlew.bat ' + task], {
  cwd: path.join(root, 'android'),
  env,
  stdio: 'inherit',
});
child.on('exit', code => process.exit(code || 0));
