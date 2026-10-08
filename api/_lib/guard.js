// Shared request guard for the Pea API: method + device checks and rate limits.
//
// Why this exists: the endpoints spend money (Anthropic, OpenAI) on every call
// and the app has no accounts, so without limits anyone who finds the URL can
// run up the bill. Three layers, all counted per UTC day unless noted:
//
//   1. per device   — the app sends a random install ID in `x-pea-device`
//   2. per IP       — catches a client that rotates device IDs
//   3. global       — a hard ceiling on total calls, whatever the source
//
// Counters live in Upstash Redis when its REST credentials are present
// (UPSTASH_REDIS_REST_URL/TOKEN, or the KV_REST_API_* names Vercel's
// marketplace integration injects). Without them the guard falls back to
// in-memory counters, which only hold per warm function instance — fine for a
// handful of testers, not a real ceiling. Provider spend caps are the backstop.

const DAY_SECONDS = 24 * 60 * 60;

const LIMITS = {
  classify:   { device: 60, ip: 180 },
  draft:      { device: 20, ip: 60 },
  transcribe: { device: 40, ip: 120 },
};

const BURST_PER_MINUTE = 20; // per IP, across all endpoints

function globalDailyLimit() {
  const n = Number(process.env.PEA_GLOBAL_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : 2000;
}

function redisConfig() {
  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

// ── Counter stores ────────────────────────────────────────────────────────

const memory = new Map(); // key → { count, expiresAt }

function memoryIncr(key, ttlSeconds, now) {
  const hit = memory.get(key);
  if (!hit || hit.expiresAt <= now) {
    if (memory.size > 5000) {
      for (const [k, v] of memory) if (v.expiresAt <= now) memory.delete(k);
    }
    memory.set(key, { count: 1, expiresAt: now + ttlSeconds * 1000 });
    return 1;
  }
  hit.count += 1;
  return hit.count;
}

// Increments every key in one round-trip. Returns null if Redis is unreachable
// so the caller can fall back rather than fail the request.
async function redisIncrAll(cfg, entries) {
  const commands = [];
  for (const e of entries) {
    commands.push(['INCR', e.key]);
    commands.push(['EXPIRE', e.key, String(e.ttl), 'NX']);
  }
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(commands),
    });
    if (!res.ok) return null;
    const out = await res.json();
    return entries.map((_, i) => Number(out[i * 2]?.result));
  } catch {
    return null;
  }
}

// ── Request helpers ───────────────────────────────────────────────────────

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd || '').split(',')[0].trim();
  return first || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function deviceId(req) {
  const raw = req.headers['x-pea-device'];
  const id = Array.isArray(raw) ? raw[0] : raw;
  return typeof id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(id) ? id : null;
}

function utcDay(now) {
  return new Date(now).toISOString().slice(0, 10);
}

// Runs the checks for one request. On rejection it writes the response and
// returns false; the handler should return immediately.
async function guard(req, res, kind) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return false;
  }

  const device = deviceId(req);
  if (!device) {
    res.status(400).json({ error: 'Missing device' });
    return false;
  }

  const limits = LIMITS[kind];
  const now = Date.now();
  const day = utcDay(now);
  const ip  = clientIp(req);
  const minute = Math.floor(now / 60_000);

  const entries = [
    { key: `pea:${day}:global`,           ttl: DAY_SECONDS, max: globalDailyLimit(), reason: 'busy'  },
    { key: `pea:${day}:${kind}:d:${device}`, ttl: DAY_SECONDS, max: limits.device,   reason: 'daily' },
    { key: `pea:${day}:${kind}:ip:${ip}`,    ttl: DAY_SECONDS, max: limits.ip,       reason: 'daily' },
    { key: `pea:burst:${minute}:${ip}`,   ttl: 120,         max: BURST_PER_MINUTE,   reason: 'burst' },
  ];

  const cfg = redisConfig();
  let counts = cfg ? await redisIncrAll(cfg, entries) : null;
  if (!counts) counts = entries.map(e => memoryIncr(e.key, e.ttl, now));

  for (let i = 0; i < entries.length; i++) {
    if (counts[i] > entries[i].max) {
      res.setHeader('Retry-After', entries[i].reason === 'burst' ? '60' : '3600');
      res.status(429).json({ error: 'Rate limited', reason: entries[i].reason });
      return false;
    }
  }
  return true;
}

module.exports = { guard, LIMITS, BURST_PER_MINUTE, _resetMemory: () => memory.clear() };
