const { execSync } = require('child_process');
try {
  const out = execSync('node test-smoke.js', { encoding: 'utf8' });
  const fails = out.split('\n').filter(l => l.includes('FAIL') || l.includes('passed'));
  console.log(fails.join('\n'));
} catch (e) {
  const out = (e.stdout || '') + (e.stderr || '');
  const fails = out.split('\n').filter(l => l.includes('FAIL') || l.includes('passed') || l.includes('Error'));
  console.log(fails.slice(-30).join('\n'));
  process.exitCode = 1;
}
