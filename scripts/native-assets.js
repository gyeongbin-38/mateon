const fs=require('node:fs');
const path=require('node:path');
const sharp=require('sharp');
const root=path.resolve(__dirname,'..');
const symbol=fs.readFileSync(path.join(root,'assets/logo-symbol.svg'),'utf8').replace(/^\uFEFF/,'');
const body=symbol.slice(symbol.indexOf('>')+1,symbol.lastIndexOf('</svg>'));
const square=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" fill="#fff7f3"/><g transform="translate(26 33) scale(1.1)">'+body+'</g></svg>');
const foreground=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><g transform="translate(45 49) scale(.8)">'+body+'</g></svg>');
async function main(){
 for(const [density,size] of [['mdpi',48],['hdpi',72],['xhdpi',96],['xxhdpi',144],['xxxhdpi',192]]){
  const dir=path.join(root,'android/app/src/main/res','mipmap-'+density);
  for(const name of ['ic_launcher','ic_launcher_round']) await sharp(square).resize(size,size).png().toFile(path.join(dir,name+'.png'));
  await sharp(foreground).resize(Math.round(size*2.25)).png().toFile(path.join(dir,'ic_launcher_foreground.png'));
 }
 const res=path.join(root,'android/app/src/main/res');
 for(const dir of fs.readdirSync(res).filter(x=>x.startsWith('drawable'))) {
  const file=path.join(res,dir,'splash.png');
  if(fs.existsSync(file)) {
   const {width,height}=await sharp(file).metadata();
   const logo=await sharp(Buffer.from(symbol)).resize(Math.round(Math.min(width,height)*.24)).png().toBuffer();
   await sharp({create:{width,height,channels:3,background:'#faf9f7'}}).composite([{input:logo,gravity:'center'}]).png().toFile(file+'.new.png');
   fs.writeFileSync(file,fs.readFileSync(file+'.new.png'));fs.unlinkSync(file+'.new.png');
  }
 }
 for(const name of ['ic_launcher.xml','ic_launcher_round.xml']) fs.writeFileSync(path.join(res,'mipmap-anydpi-v26',name),'<?xml version="1.0" encoding="utf-8"?><adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/ic_launcher_background"/><foreground android:drawable="@mipmap/ic_launcher_foreground"/></adaptive-icon>');
 fs.writeFileSync(path.join(res,'values/ic_launcher_background.xml'),'<?xml version="1.0" encoding="utf-8"?><resources><color name="ic_launcher_background">#FFF7F3</color></resources>');
 await sharp(square).resize(1024).png().toFile(path.join(root,'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
 const splashDir=path.join(root,'ios/App/App/Assets.xcassets/Splash.imageset');
 if(fs.existsSync(splashDir)) for(const file of fs.readdirSync(splashDir).filter(x=>x.endsWith('.png'))){
  const logo=await sharp(Buffer.from(symbol)).resize(360).png().toBuffer();
  await sharp({create:{width:2732,height:2732,channels:3,background:'#faf9f7'}}).composite([{input:logo,gravity:'center'}]).png().toFile(path.join(splashDir,file));
 }
 console.log('Android/iOS icons and splash assets generated.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
