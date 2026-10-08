/* ESLint flat config — 브라우저 ES5/ES2018 바닐라 JS */
const globals = require('globals');

/* js/data.js · js/card.js · vendor 가 노출하는 전역 심볼 */
const appGlobals = {
  MATEON_CONFIG: 'readonly',
  QUESTIONS: 'readonly', CHARACTERS: 'readonly', DOMAINS: 'readonly',
  SAMPLE_RESULTS: 'readonly', TALK_STARTERS: 'readonly',
  LIFE_QUESTIONS: 'readonly', LOVE_MAP_QUESTIONS: 'readonly',
  E_LEVELS: 'readonly', R_LEVELS: 'readonly',
  AREA_INSIGHTS: 'readonly', CONFLICT_SCENARIOS: 'readonly',
  RULE_LIBRARY: 'readonly', BASE_RULES: 'readonly', CHECKLIST: 'readonly',
  EXPENSE_CATS: 'readonly', CAT_EMOJI: 'readonly', SHOP_EMOJI: 'readonly',
  SHOP_CATS: 'readonly', SHOP_PRESETS: 'readonly', CHORE_PRESETS: 'readonly',
  MISSION_PRESETS: 'readonly', CHECKIN_MOODS: 'readonly',
  CONFLICT_DOMAINS: 'readonly', CONFLICT_STEP_TIPS: 'readonly',
  COUPON_PRESETS: 'readonly', ROULETTE_PRESETS: 'readonly', PANTRY_LOCS: 'readonly',
  LOVE_MAP_CATS: 'readonly', LIFE_INSIGHTS: 'readonly',
  MateLife: 'readonly', MateSecure: 'readonly', MateNative: 'readonly',
  MateCard: 'readonly', MateScreenshot: 'readonly',
  Tesseract: 'readonly', QRCode: 'readonly', qrcode: 'readonly',
  TinyBase: 'readonly', tinybase: 'readonly', createMergeableStore: 'readonly',
  modernScreenshot: 'readonly', Driver: 'readonly', driver: 'readonly',
  Capacitor: 'readonly',
};

module.exports = [
  { ignores: ['node_modules/**', 'dist/**', 'android/**', 'ios/**', 'js/vendor/**', 'ota/**', 'tmp-*.js', 'release/**', '.devin/**'] },
  {
    files: ['js/mateon.js', 'js/secure.js', 'js/lifetools.js', 'sw.js', 'js/config.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.serviceworker, ...appGlobals },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'eqeqeq': ['warn', 'smart'],
    },
  },
  {
    /* data.js/card.js — 자신이 선언하는 전역을 정의하는 파일 (재선언 충돌 방지) */
    files: ['js/data.js', 'js/card.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: { ...globals.browser, MateCard: 'readonly', MateScreenshot: 'readonly' },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^[A-Z_]+$' }],
      'no-dupe-keys': 'error',
      'eqeqeq': ['warn', 'smart'],
    },
  },
  {
    files: ['native/bridge.js'],
    languageOptions: {
      ecmaVersion: 2022, sourceType: 'module',
      globals: { ...globals.browser, Capacitor: 'readonly' },
    },
    rules: { 'no-undef': 'error', 'no-unused-vars': 'warn' },
  },
  {
    files: ['scripts/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }] },
  },
  {
    files: ['test-*.js', 'scripts/*.js', 'server.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }] },
  },
  {
    /* Cloudflare Worker 템플릿 — ES 모듈 (scripts/*.js 보다 뒤에 둬야 적용됨) */
    files: ['scripts/sync-worker.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.serviceworker, ...globals.node } },
    rules: { 'no-unused-vars': 'warn' },
  },
];
