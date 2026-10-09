const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const assets = path.join(__dirname, '..', 'assets');
const targets = ['character-sheet.png', 'character-sheet-cutout-v2.png'];
(async () => {
  for (const name of targets) {
    const src = path.join(assets, name);
    const out = src.replace(/\.png$/, '.webp');
    await sharp(src).webp({ quality: 88, alphaQuality: 95, effort: 6 }).toFile(out);
    const a = fs.statSync(src).size,
      b = fs.statSync(out).size;
    console.log(name, '→', path.basename(out), `${(a / 1e6).toFixed(2)}MB → ${(b / 1e6).toFixed(2)}MB`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
