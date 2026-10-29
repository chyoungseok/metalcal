// Metal Calendar 동기화 서버 — Cloudflare Worker + KV (무료 요금제로 충분)
// 이 서버는 기기에서 이미 암호화된 덩어리만 보관합니다. 일정 내용을 읽을 수 없습니다.
// 필요한 설정: KV 네임스페이스를 변수 이름 VAULT 로 연결
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type',
  'Access-Control-Max-Age': '86400'
};
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
async function sha(s) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const m = new URL(req.url).pathname.match(/^\/v\/([a-f0-9]{32})$/);
    if (!m) return json({ ok: true, app: 'metalcal-sync' });
    if (!env.VAULT) return json({ error: 'KV 바인딩(VAULT)이 없습니다' }, 500);
    const id = m[1];
    const tok = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
    if (!/^[a-f0-9]{32}$/.test(tok)) return json({ error: 'auth' }, 401);
    const th = await sha(tok);
    const cur = await env.VAULT.get(id, 'json');
    if (cur && cur.th !== th) return json({ error: 'forbidden' }, 403);

    if (req.method === 'GET') return cur ? json({ rev: cur.rev, iv: cur.iv, data: cur.data }) : json({ error: 'empty' }, 404);
    if (req.method === 'PUT') {
      const b = await req.json().catch(() => null);
      if (!b || typeof b.data !== 'string' || typeof b.iv !== 'string' || b.data.length > 20e6) return json({ error: 'bad request' }, 400);
      const rev = cur ? cur.rev : 0;
      if ((b.rev | 0) !== rev) return json({ error: 'conflict', rev }, 409);
      await env.VAULT.put(id, JSON.stringify({ th, rev: rev + 1, iv: b.iv, data: b.data, at: Date.now() }));
      return json({ rev: rev + 1 });
    }
    return json({ error: 'method' }, 405);
  }
};
