// Ozon × 云仓 实时中台 · 最小服务端（Node 22，无第三方依赖）
//
// 职责：
//  1. 轮询 Ozon Seller API 拉新订单（官方接口，Client-Id + Api-Key，不做任何反爬绕过）
//  2. 接收 Ozon Push 通知     POST /webhooks/ozon
//  3. 接收云仓回传            POST /webhooks/warehouse   （HMAC-SHA256 签名校验）
//  4. 通过 SSE 实时推送给前端  GET  /events
//  5. 代理回写 Ozon           POST /api/ozon/ship   /api/ozon/tracking
//
// 环境变量：OZON_CLIENT_ID, OZON_API_KEY, WAREHOUSE_WEBHOOK_SECRET, PORT(默认 8787),
//          OZON_POLL_SECONDS(默认 60), ALLOW_ORIGIN(默认 *)
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 8787);
const OZON_BASE = 'https://api-seller.ozon.ru';
const { OZON_CLIENT_ID, OZON_API_KEY, WAREHOUSE_WEBHOOK_SECRET } = process.env;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN ?? '*';
const clients = new Set();
const seenEvents = new Map(); // eventId -> ts，回传幂等
const seenPostings = new Set();

function broadcast(type, data) {
  const frame = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(frame);
}

async function ozon(path, body) {
  if (!OZON_CLIENT_ID || !OZON_API_KEY) throw new Error('未配置 OZON_CLIENT_ID / OZON_API_KEY');
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(OZON_BASE + path, {
      method: 'POST',
      headers: { 'Client-Id': OZON_CLIENT_ID, 'Api-Key': OZON_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt)); continue; }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(json.message ?? `Ozon ${res.status}`), { status: res.status, body: json });
    return json;
  }
  throw new Error('Ozon 限流重试耗尽');
}

async function pollOzon() {
  try {
    const now = new Date();
    const json = await ozon('/v3/posting/fbs/unfulfilled/list', {
      dir: 'ASC', limit: 100, offset: 0,
      filter: { cutoff_from: new Date(now - 86400e3).toISOString(), cutoff_to: new Date(+now + 7 * 86400e3).toISOString(), status: 'awaiting_packaging' },
      with: { analytics_data: false, financial_data: false },
    });
    for (const posting of json.result?.postings ?? []) {
      if (seenPostings.has(posting.posting_number)) continue;
      seenPostings.add(posting.posting_number);
      broadcast('ozon-posting', posting);
    }
  } catch (error) {
    broadcast('server-error', { source: 'ozon-poll', message: error.message });
  }
}

function readBody(req, limit = 1 << 20) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('payload too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifySignature(raw, signature) {
  if (!WAREHOUSE_WEBHOOK_SECRET) return true; // 本地开发未配置时放行
  if (!signature) return false;
  const expected = createHmac('sha256', WAREHOUSE_WEBHOOK_SECRET).update(raw).digest('hex');
  const a = Buffer.from(expected); const b = Buffer.from(String(signature).replace(/^sha256=/, ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

const WAREHOUSE_TYPES = new Set(['accepted', 'picked', 'weighed', 'packed', 'waybill', 'shipped', 'rejected']);

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ALLOW_ORIGIN });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': ALLOW_ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type, X-Signature', 'Access-Control-Allow-Methods': 'GET, POST' });
    return res.end();
  }
  try {
    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': ALLOW_ORIGIN });
      res.write(': connected\n\n');
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, clients: clients.size, ozonConfigured: Boolean(OZON_CLIENT_ID && OZON_API_KEY) });

    if (req.method === 'POST' && url.pathname === '/webhooks/warehouse') {
      const raw = await readBody(req);
      if (!verifySignature(raw, req.headers['x-signature'])) return send(res, 401, { error: 'bad signature' });
      const event = JSON.parse(raw.toString('utf8'));
      if (!event.eventId || !event.orderId || !event.warehouseId || !WAREHOUSE_TYPES.has(event.type)) return send(res, 400, { error: 'invalid event' });
      if (seenEvents.has(event.eventId)) return send(res, 200, { duplicate: true });
      seenEvents.set(event.eventId, Date.now());
      if (seenEvents.size > 50000) seenEvents.delete(seenEvents.keys().next().value);
      broadcast('warehouse', { ...event, occurredAt: event.occurredAt ?? new Date().toISOString() });
      return send(res, 200, { accepted: true });
    }

    if (req.method === 'POST' && url.pathname === '/webhooks/ozon') {
      const message = JSON.parse((await readBody(req)).toString('utf8'));
      if (message.message_type === 'TYPE_PING') return send(res, 200, { version: '1', name: 'ozon-cloud-warehouse', time: new Date().toISOString() });
      broadcast('ozon-push', message);
      return send(res, 200, { result: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/ozon/ship') {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      return send(res, 200, await ozon('/v4/posting/fbs/ship', body));
    }
    if (req.method === 'POST' && url.pathname === '/api/ozon/tracking') {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      return send(res, 200, await ozon('/v2/fbs/posting/tracking-number/set', body));
    }
    send(res, 404, { error: 'not found' });
  } catch (error) {
    send(res, error.status ?? 500, { error: error.message, detail: error.body });
  }
});

server.listen(PORT, () => {
  console.log(`[ozon-cloud] listening on :${PORT}  SSE=/events`);
  if (OZON_CLIENT_ID && OZON_API_KEY) {
    pollOzon();
    setInterval(pollOzon, Number(process.env.OZON_POLL_SECONDS ?? 60) * 1000);
  } else {
    console.log('[ozon-cloud] 未配置 Ozon 凭据：只接收 webhook，不轮询 Ozon');
  }
});
