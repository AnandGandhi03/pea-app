// Tests for the serverless API: the request guard (rate limits) and the
// classify / transcribe handlers, with upstream providers mocked.


/* eslint-disable @typescript-eslint/no-require-imports -- the handlers are CommonJS */
const guardModule = require('../_lib/guard');
const classify    = require('../classify');
const transcribe  = require('../transcribe');

interface MockRes {
  statusCode: number;
  body:       any;
  headers:    Record<string, string>;
  status:     (code: number) => MockRes;
  json:       (body: any) => MockRes;
  setHeader:  (k: string, v: string) => void;
}

function mockRes(): MockRes {
  const res: MockRes = {
    statusCode: 0,
    body:       undefined,
    headers:    {},
    status(code) { res.statusCode = code; return res; },
    json(body)   { res.body = body; return res; },
    setHeader(k, v) { res.headers[k] = v; },
  };
  return res;
}

function mockReq(body: any, opts: { device?: string | null; ip?: string; method?: string } = {}) {
  const headers: Record<string, string> = { 'x-forwarded-for': opts.ip ?? '203.0.113.5' };
  if (opts.device !== null) headers['x-pea-device'] = opts.device ?? 'device-abc12345';
  return { method: opts.method ?? 'POST', headers, body };
}

function anthropicReply(text: string) {
  return { ok: true, status: 200, json: async () => ({ content: [{ text }] }), text: async () => '' };
}

const fetchMock = jest.fn();

beforeEach(() => {
  guardModule._resetMemory();
  fetchMock.mockReset();
  (globalThis as any).fetch = fetchMock;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.PEA_GLOBAL_DAILY_LIMIT;
  delete process.env.PEA_MODEL;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('guard', () => {
  it('rejects non-POST requests', async () => {
    const res = mockRes();
    expect(await guardModule.guard(mockReq({}, { method: 'GET' }), res, 'classify')).toBe(false);
    expect(res.statusCode).toBe(405);
  });

  it('rejects requests without a valid device ID', async () => {
    for (const device of [null, 'short', 'has spaces in it!!']) {
      const res = mockRes();
      expect(await guardModule.guard(mockReq({}, { device }), res, 'classify')).toBe(false);
      expect(res.statusCode).toBe(400);
    }
  });

  it('enforces the per-device daily limit', async () => {
    const limit = guardModule.LIMITS.draft.device;
    for (let i = 0; i < limit; i++) {
      // Vary the IP so only the device counter is in play.
      const ok = await guardModule.guard(mockReq({}, { ip: `198.51.100.${i}` }), mockRes(), 'draft');
      expect(ok).toBe(true);
    }
    const res = mockRes();
    expect(await guardModule.guard(mockReq({}, { ip: '198.51.100.250' }), res, 'draft')).toBe(false);
    expect(res.statusCode).toBe(429);
    expect(res.body.reason).toBe('daily');
    expect(res.headers['Retry-After']).toBeDefined();
  });

  it('enforces the per-IP burst limit across rotating device IDs', async () => {
    for (let i = 0; i < guardModule.BURST_PER_MINUTE; i++) {
      expect(await guardModule.guard(mockReq({}, { device: `device-rot-${1000 + i}` }), mockRes(), 'classify')).toBe(true);
    }
    const res = mockRes();
    expect(await guardModule.guard(mockReq({}, { device: 'device-rot-9999' }), res, 'classify')).toBe(false);
    expect(res.body.reason).toBe('burst');
  });

  it('enforces the global daily ceiling', async () => {
    process.env.PEA_GLOBAL_DAILY_LIMIT = '3';
    for (let i = 0; i < 3; i++) {
      expect(await guardModule.guard(mockReq({}, { device: `device-glob-${i}000`, ip: `192.0.2.${i}` }), mockRes(), 'classify')).toBe(true);
    }
    const res = mockRes();
    expect(await guardModule.guard(mockReq({}, { device: 'device-glob-9000', ip: '192.0.2.99' }), res, 'classify')).toBe(false);
    expect(res.body.reason).toBe('busy');
  });

  it('uses Redis counters when configured', async () => {
    process.env.UPSTASH_REDIS_REST_URL   = 'https://example.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    // 4 counters × (INCR, EXPIRE); report the device counter as over its limit.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ result: 1 }, { result: 1 }, { result: 999 }, { result: 0 }, { result: 1 }, { result: 1 }, { result: 1 }, { result: 1 }],
    });
    const res = mockRes();
    expect(await guardModule.guard(mockReq({}), res, 'classify')).toBe(false);
    expect(res.statusCode).toBe(429);
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.upstash.io/pipeline');
  });

  it('falls back to in-memory counters when Redis is unreachable', async () => {
    process.env.UPSTASH_REDIS_REST_URL   = 'https://example.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    fetchMock.mockRejectedValueOnce(new Error('network'));
    expect(await guardModule.guard(mockReq({}), mockRes(), 'classify')).toBe(true);
  });
});

describe('classify handler', () => {
  it('returns a validated classification and uses the small model by default', async () => {
    fetchMock.mockResolvedValueOnce(anthropicReply('{"category":"call","cleaned":"Call the pediatrician"}'));
    const res = mockRes();
    await classify(mockReq({ text: 'ring the baby doctor' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ category: 'call', cleaned: 'Call the pediatrician' });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.model).toBe('claude-haiku-4-5-20251001');
  });

  it('rejects an invalid category from the model', async () => {
    fetchMock.mockResolvedValueOnce(anthropicReply('{"category":"nonsense","cleaned":"x"}'));
    const res = mockRes();
    await classify(mockReq({ text: 'something' }), res);
    expect(res.statusCode).toBe(502);
  });

  it('returns 502 when the provider errors', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 529, text: async () => 'overloaded' });
    const res = mockRes();
    await classify(mockReq({ text: 'something' }), res);
    expect(res.statusCode).toBe(502);
  });

  it('reports the provider status and error class, but not the message', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key sk-secret' } }),
    });
    const res = mockRes();
    await classify(mockReq({ text: 'something' }), res);
    expect(res.statusCode).toBe(502);
    expect(res.body.upstream).toEqual({ status: 401, type: 'authentication_error' });
    expect(JSON.stringify(res.body)).not.toContain('sk-secret');
  });

  it('validates input before calling the provider', async () => {
    for (const body of [{}, { text: '   ' }, { text: 'x'.repeat(1001) }]) {
      const res = mockRes();
      await classify(mockReq(body), res);
      expect(res.statusCode).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('writes a draft in draft mode without sending a name', async () => {
    fetchMock.mockResolvedValueOnce(anthropicReply('Hi! Just checking in about Thursday.'));
    const res = mockRes();
    await classify(mockReq({ text: 'follow up with daycare', mode: 'draft', userName: 'Sam' }), res);
    expect(res.body).toEqual({ draft: 'Hi! Just checking in about Thursday.' });
    expect(fetchMock.mock.calls[0][1].body).not.toContain('Sam');
  });

  it('stops calling the provider once the device is over its limit', async () => {
    fetchMock.mockResolvedValue(anthropicReply('ok'));
    const limit = guardModule.LIMITS.draft.device;
    for (let i = 0; i <= limit; i++) {
      await classify(mockReq({ text: 'x', mode: 'draft' }, { ip: `198.51.100.${i}` }), mockRes());
    }
    expect(fetchMock).toHaveBeenCalledTimes(limit);
  });
});

describe('transcribe handler', () => {
  it('returns the transcript', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ text: 'buy oat milk' }) });
    const res = mockRes();
    await transcribe(mockReq({ audioBase64: 'AAAA', mimeType: 'audio/m4a' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ text: 'buy oat milk' });
  });

  it('rejects oversized audio without calling the provider', async () => {
    const res = mockRes();
    await transcribe(mockReq({ audioBase64: 'A'.repeat(2_000_001) }), res);
    expect(res.statusCode).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a bad mime type', async () => {
    const res = mockRes();
    await transcribe(mockReq({ audioBase64: 'AAAA', mimeType: 'text/html' }), res);
    expect(res.statusCode).toBe(400);
  });
});
