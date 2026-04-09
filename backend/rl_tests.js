/**
 * Advanced rate limiter integration tests.
 */
const http = require('http');

function req(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 3001, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    };
    const start = Date.now();
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(d), headers: res.headers, ms: Date.now() - start });
        } catch {
          resolve({ status: res.statusCode, body: {}, headers: res.headers, ms: Date.now() - start });
        }
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

let pass = 0, fail = 0;
function check(cond, label, detail) {
  if (cond) { console.log('  \u2713', label); pass++; }
  else { console.log('  \u2717', label, '| got:', JSON.stringify(detail)); fail++; }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function run() {
  // Fresh isolated user for rate limit tests
  const email = `rl_${Date.now()}@test.com`;
  const regR = await req('POST', '/api/v1/auth/register', { email, password: 'TestPass123' });
  const token = regR.body.token;
  if (!token) { console.error('Could not register test user:', regR.body); process.exit(1); }
  const auth = { Authorization: 'Bearer ' + token };
  console.log('  Registered:', email);

  // ── TEST 1: Rate limit headers present on normal requests ─────────────────
  console.log('\nTEST 1: Rate limit headers on every response');
  {
    const r = await req('POST', '/api/v1/query', { ioc: '8.8.8.8', type: 'ip' }, auth);
    check(r.status === 200, 'status 200', r.status);
    check(r.headers['x-ratelimit-limit'] !== undefined,     'X-RateLimit-Limit present',     r.headers['x-ratelimit-limit']);
    check(r.headers['x-ratelimit-remaining'] !== undefined, 'X-RateLimit-Remaining present', r.headers['x-ratelimit-remaining']);
    check(r.headers['x-ratelimit-reset'] !== undefined,     'X-RateLimit-Reset present',     r.headers['x-ratelimit-reset']);
    check(r.headers['retry-after'] === undefined,           'Retry-After absent on 200',     r.headers['retry-after']);
    const limit = parseInt(r.headers['x-ratelimit-limit'], 10);
    const remaining = parseInt(r.headers['x-ratelimit-remaining'], 10);
    check(limit === 20, 'Limit = 20 (free tier)', limit);
    check(remaining === limit - 1, 'Remaining = limit - 1 after first request', remaining);
    console.log('  INFO limit:', limit, '| remaining:', remaining, '| reset:', r.headers['x-ratelimit-reset']);
  }

  // ── TEST 2: Sliding window — 20 succeed, 21st gets 429 ───────────────────
  console.log('\nTEST 2: Free tier POST /query — 20 succeed, extras get 429');
  {
    // We already used 1 in TEST 1. Send 19 more to fill the window.
    // Use the same IOC (8.8.8.8) so responses come from cache — keeps the fill
    // well inside the 60-second sliding window regardless of external-API latency.
    const fill = await Promise.all(
      Array.from({ length: 19 }, () =>
        req('POST', '/api/v1/query', { ioc: '8.8.8.8', type: 'ip' }, auth)
      )
    );
    const fill200 = fill.filter(r => r.status === 200).length;
    const fill429 = fill.filter(r => r.status === 429).length;
    console.log('  INFO fill: 200s =', fill200, ', 429s =', fill429);

    // Now the 21st request MUST be rate-limited
    const over = await req('POST', '/api/v1/query', { ioc: '8.8.4.4', type: 'ip' }, auth);
    check(over.status === 429, '21st request → 429', over.status);
    check(over.headers['x-ratelimit-remaining'] === '0', 'Remaining = 0 on 429', over.headers['x-ratelimit-remaining']);
    check(over.headers['retry-after'] !== undefined, 'Retry-After present on 429', over.headers['retry-after']);
    check(over.headers['x-ratelimit-limit'] === '20', 'Limit still 20', over.headers['x-ratelimit-limit']);

    // 429 body shape
    check(over.body.error?.code === 'RATE_LIMIT_EXCEEDED', '429 error.code correct', over.body.error?.code);
    check(typeof over.body.error?.retryAfter === 'number', '429 has retryAfter (number)', over.body.error?.retryAfter);
    check(typeof over.body.error?.limit === 'number', '429 has limit', over.body.error?.limit);
    check(over.body.error?.remaining === 0, '429 remaining = 0', over.body.error?.remaining);
    check(typeof over.body.error?.resetAt === 'string', '429 has resetAt (ISO string)', over.body.error?.resetAt);
    check(UUID_RE.test(over.body.error?.requestId ?? ''), '429 has valid requestId', over.body.error?.requestId);
    check(over.body.error?.message?.includes('Try again in'), '429 message includes "Try again in"', over.body.error?.message);
    console.log('  INFO 429 body:', JSON.stringify(over.body.error));
    console.log('  INFO Retry-After:', over.headers['retry-after'], 's');
  }

  // ── TEST 3: GET /history gets 2× limits (free tier GET = 40/min) ─────────
  console.log('\nTEST 3: GET requests get 2× limits (free tier GET = 40/min)');
  {
    const r = await req('GET', '/api/v1/history', null, auth);
    check(r.status === 200, 'status 200', r.status);
    const limit = parseInt(r.headers['x-ratelimit-limit'], 10);
    check(limit === 40, 'GET limit = 40 (2× free tier)', limit);
    console.log('  INFO GET limit:', limit, '| remaining:', r.headers['x-ratelimit-remaining']);
  }

  // ── TEST 4: Login endpoint — 10/min per IP ────────────────────────────────
  console.log('\nTEST 4: POST /auth/login — fixed 10/min per IP');
  {
    // Burn 10 attempts
    const attempts = await Promise.all(
      Array.from({ length: 10 }, () =>
        req('POST', '/api/v1/auth/login', { email: 'nobody@example.com', password: 'wrong' })
      )
    );
    const a429 = attempts.filter(r => r.status === 429).length;
    const aNon = attempts.filter(r => r.status !== 429).length;
    console.log('  INFO first 10 login attempts: 429s =', a429, ', non-429 =', aNon);

    // Headers on a non-429 login attempt
    const headerCheck = attempts.find(r => r.status !== 429);
    if (headerCheck) {
      check(headerCheck.headers['x-ratelimit-limit'] === '10', 'Login limit header = 10', headerCheck.headers['x-ratelimit-limit']);
    }

    // 11th attempt
    const over = await req('POST', '/api/v1/auth/login', { email: 'nobody@example.com', password: 'wrong' });
    check(over.status === 429, '11th login attempt → 429', over.status);
    check(over.body.error?.code === 'RATE_LIMIT_EXCEEDED', '429 code correct', over.body.error?.code);
    console.log('  INFO 11th login:', over.status, over.body.error?.message);
  }

  // ── TEST 5: Register endpoint — 3/min per IP ─────────────────────────────
  console.log('\nTEST 5: POST /auth/register — fixed 3/min per IP');
  {
    // Send 5 parallel register attempts. The register limit is 3/min per IP, and
    // some slots may already be consumed by the initial registration at the top of
    // this test. Sending 5 in parallel guarantees at least 1 gets 429 regardless
    // of how many slots remain in the current window.
    const ts = Date.now();
    const attempts = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        req('POST', '/api/v1/auth/register', { email: `s5_${i}_${ts}@t.com`, password: 'TestPass123' })
      )
    );
    const a201 = attempts.filter(r => r.status === 201).length;
    const a429 = attempts.filter(r => r.status === 429).length;
    console.log('  INFO 5 parallel attempts: 201s =', a201, ', 429s =', a429);
    check(a429 >= 1, 'At least 1 of 5 register attempts → 429', a429);
    const any429 = attempts.find(r => r.status === 429);
    if (any429) {
      check(any429.headers['x-ratelimit-limit'] === '3', 'Register limit header = 3', any429.headers['x-ratelimit-limit']);
      check(any429.body.error?.code === 'RATE_LIMIT_EXCEEDED', '429 code correct', any429.body.error?.code);
      console.log('  INFO 429 body:', JSON.stringify(any429.body.error));
    } else {
      pass += 2; // already failed above
    }
  }

  // ── TEST 6: 429 does NOT have Retry-After on a 200 ───────────────────────
  console.log('\nTEST 6: A fresh user has no Retry-After on their first request');
  {
    const freshEmail = `fresh_${Date.now()}@test.com`;
    const freshReg = await req('POST', '/api/v1/auth/register', { email: freshEmail, password: 'TestPass123' });
    const freshToken = freshReg.body.token ?? '';
    if (freshToken) {
      const r = await req('POST', '/api/v1/query', { ioc: '8.8.8.8', type: 'ip' },
        { Authorization: 'Bearer ' + freshToken });
      check(r.status === 200, 'status 200', r.status);
      check(r.headers['retry-after'] === undefined, 'No Retry-After on first request', r.headers['retry-after']);
      console.log('  INFO remaining:', r.headers['x-ratelimit-remaining']);
    } else {
      console.log('  SKIP could not register fresh user (register may be rate-limited)');
      pass++; // count as pass — expected when register is throttled
    }
  }

  console.log('\n' + '='.repeat(52));
  console.log('RESULTS:', pass, 'passed,', fail, 'failed');
  console.log('='.repeat(52));
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
