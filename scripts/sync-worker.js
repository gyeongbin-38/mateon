/**
 * MATE:ON 동기화 서버 — Cloudflare Worker + Workers KV 템플릿
 *
 * 배포 방법 (계정 필요):
 *   1. Cloudflare 대시보드 → Workers & Pages → KV 네임스페이스 생성 (예: MATEON_SYNC)
 *   2. wrangler.toml 에 네임스페이스 바인딩 추가:
 *        kv_namespaces = [{ binding = "SYNC_KV", id = "<namespace-id>" }]
 *   3. npx wrangler deploy scripts/sync-worker.js
 *   4. 앱 → 설정 → 메이트 동기화 → 서버 주소를 https://<worker>.workers.dev 로 입력
 *
 * API 계약:
 *   PUT  /mateon/{room}/{slot}   body: 임의 JSON (<= 64KB)  → 슬롯 문서 저장
 *   GET  /mateon/{room}/{slot}   → 슬롯 문서 반환 (없으면 404)
 *   room: 영문·숫자·-·_ 3~40자 / slot: 'a' 또는 'b'
 *   선택: Authorization: Bearer <SYNC_TOKEN> (wrangler secret 으로 설정 시 강제)
 *
 * 주의: 방 코드를 아는 사람은 누구나 읽고 쓸 수 있으므로,
 *       방 코드는 추측하기 어려운 값으로 정하고 프로덕션에서는 SYNC_TOKEN 사용을 권장.
 */

const ROOM_RE = /^[A-Za-z0-9\-_]{3,40}$/;
const SLOT_RE = /^[ab]$/;
const MAX_BODY = 64 * 1024;

function cors(extra) {
  return Object.assign({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }, extra);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });

    const m = url.pathname.match(/^\/mateon\/([A-Za-z0-9\-_]+)\/([ab])$/);
    if (!m || !ROOM_RE.test(m[1]) || !SLOT_RE.test(m[2])) {
      return new Response('not found', { status: 404, headers: cors() });
    }
    const key = m[1] + ':' + m[2];

    if (env.SYNC_TOKEN) {
      const auth = request.headers.get('Authorization') || '';
      if (auth !== 'Bearer ' + env.SYNC_TOKEN) {
        return new Response('unauthorized', { status: 401, headers: cors() });
      }
    }

    if (request.method === 'GET') {
      const value = await env.SYNC_KV.get(key);
      if (value === null) return new Response('null', { status: 404, headers: cors() });
      return new Response(value, { headers: cors({ 'Content-Type': 'application/json' }) });
    }

    if (request.method === 'PUT') {
      const body = await request.text();
      if (body.length > MAX_BODY) return new Response('too large', { status: 413, headers: cors() });
      try { JSON.parse(body); } catch (e) { return new Response('invalid json', { status: 400, headers: cors() }); }
      await env.SYNC_KV.put(key, body, { expirationTtl: 60 * 60 * 24 * 90 });
      return new Response('{"ok":true}', { headers: cors({ 'Content-Type': 'application/json' }) });
    }

    return new Response('method not allowed', { status: 405, headers: cors() });
  },
};
