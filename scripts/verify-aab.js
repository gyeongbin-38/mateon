/* Verify an AAB is signed. Gradle signs release AABs with JAR signing
   (META-INF/*.SF + *.RSA at zip root); APKs would use the v2 "APK Sig
   Block 42" before the central directory. Exit 1 when neither is found. */
const fs = require('fs');
const buf = fs.readFileSync(process.argv[2]);
const MAGIC = Buffer.from('APK Sig Block 42');
let eocd = -1;
for (let i = buf.length - 22; i > Math.max(0, buf.length - 66000); i--) {
  if (buf.readUInt32LE(i) === 0x06054b50) {
    eocd = i;
    break;
  }
}
if (eocd < 0) {
  console.log('FAIL: no EOCD');
  process.exit(1);
}
const cdSize = buf.readUInt32LE(eocd + 12);
const cdOffset = buf.readUInt32LE(eocd + 16);
// APK v2+ signature block sits right before the central directory
const slice = buf.subarray(Math.max(0, cdOffset - 32), cdOffset);
const hasV2 = slice.indexOf(MAGIC) >= 0;
// JAR signing entries live at the zip root, listed in the central directory
const found = [];
for (let i = cdOffset; i < cdOffset + cdSize - 46; i++) {
  if (buf.readUInt32LE(i) === 0x02014b50) {
    const nlen = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 46, i + 46 + nlen).toString('utf8');
    if (/META-INF\/.*\.(SF|RSA|DSA|EC)$/i.test(name) || /META-INF\/MANIFEST\.MF$/i.test(name)) found.push(name);
  }
}
const jarSigned = found.some((n) => /\.(RSA|DSA|EC)$/i.test(n));
if (hasV2) console.log('PASS: APK signature block (v2+) found');
if (jarSigned) console.log('PASS: JAR signature found:', found.slice(0, 4).join(', '));
if (!hasV2 && !jarSigned) {
  console.log('FAIL: unsigned — no v2 block, no META-INF signature entries');
  process.exit(1);
}
