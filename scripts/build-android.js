const { spawnSync }=require('node:child_process');
const path=require('node:path');
const windows=process.platform==='win32';
const command=windows?'powershell.exe':'./gradlew';
const args=windows?['-NoProfile','-NonInteractive','-Command',"& '.\\gradlew.bat' assembleDebug; exit $LASTEXITCODE"]:['assembleDebug'];
const result=spawnSync(command,args,{cwd:path.resolve(__dirname,'../android'),stdio:'inherit'});
if(result.error) console.error(result.error.message);
process.exitCode=result.status ?? 1;
