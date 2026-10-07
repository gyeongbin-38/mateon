/* Bundle npm packages into js/vendor/*.js IIFE files (no bundler in app). */
const { buildSync } = require('esbuild');
const fs = require('fs');
const path = require('path');

const vendorDir = path.join(__dirname, '..', 'js', 'vendor');
const tmpDir = path.join(__dirname, '.vendor-tmp');
fs.mkdirSync(tmpDir, { recursive: true });

const jobs = [
  { name: 'tinybase', entry: `export * from 'tinybase';`, global: 'TinyBase' },
  { name: 'modern-screenshot', entry: `export * from 'modern-screenshot';`, global: 'MateScreenshot' },
];

for (const job of jobs) {
  const entryFile = path.join(tmpDir, job.name + '.js');
  fs.writeFileSync(entryFile, job.entry);
  buildSync({
    entryPoints: [entryFile],
    bundle: true,
    format: 'iife',
    globalName: job.global,
    minify: true,
    outfile: path.join(vendorDir, job.name + '.js'),
  });
  console.log('vendor:', job.name + '.js', '→', 'window.' + job.global);
}

// driver.js ships an official IIFE build; copy it plus its CSS.
const driverPkg = path.join(__dirname, '..', 'node_modules', 'driver.js', 'dist');
fs.copyFileSync(path.join(driverPkg, 'driver.js.iife.js'), path.join(vendorDir, 'driver.js'));
fs.copyFileSync(path.join(driverPkg, 'driver.css'), path.join(vendorDir, 'driver.css'));
console.log('vendor: driver.js + driver.css → window.driver.jsDriver');
