const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
function copyTree(source, target) {
  fs.mkdirSync(target,{recursive:true});
  for(const entry of fs.readdirSync(source,{withFileTypes:true})) {
    const from=path.join(source,entry.name), to=path.join(target,entry.name);
    if(entry.isDirectory()) copyTree(from,to);
    else fs.writeFileSync(to,fs.readFileSync(from));
  }
}
async function main() {
  fs.mkdirSync(output, {recursive:true});
  for(const dir of ['css','assets']) copyTree(path.join(root,dir),path.join(output,dir));
  fs.mkdirSync(path.join(output,'js'),{recursive:true});
  for(const file of ['data.js','card.js','mateon.js']) fs.copyFileSync(path.join(root,'js',file),path.join(output,'js',file));
  let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  // Native assets are bundled; no CDN/font request is needed to launch offline.
  html=html.replace(/^.*<link[^>]*https:\/\/cdn\.jsdelivr\.net[^>]*>.*$/gm,'')
    .replace('<script src="js/data.js">','<script src="js/native.js"></script>\n  <script src="js/data.js">');
  fs.writeFileSync(path.join(output,'index.html'),html);
  for(const file of ['manifest.webmanifest','brand.html']) fs.copyFileSync(path.join(root,file),path.join(output,file));
  await build({entryPoints:[path.join(root,'native/bridge.js')],outfile:path.join(output,'js/native.js'),bundle:true,format:'iife',platform:'browser',target:['safari15','chrome100'],minify:true});
  console.log('Native app assets built to dist/');
}
main().catch(err=>{console.error(err);process.exitCode=1;});
