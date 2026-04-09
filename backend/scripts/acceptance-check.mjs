import { performance } from 'node:perf_hooks';

const BASE_URL = 'http://localhost:3001';

const jsonHeaders = { 'content-type': 'application/json' };

const request = async ({ method, path, body, token }) => {
  const headers = { ...jsonHeaders };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const startedAt = performance.now();
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const durationMs = Math.round(performance.now() - startedAt);

  const raw = await response.text();
  let parsedBody = null;
  try {
    parsedBody = raw ? JSON.parse(raw) : null;
  } catch {
    parsedBody = raw;
  }

  return {
    status: response.status,
    body: parsedBody,
    durationMs,
    headers: {
      retryAfter: response.headers.get('retry-after'),
      xRequestId: response.headers.get('x-request-id'),
    },
  };
};

const checks = [];
const check = (name, pass, details) => {
  checks.push({ name, pass, details });
};

const userEmail = 'test@test.com';
const userPassword = 'testpass123';

// 1) Register
const registerResponse = await request({
  method: 'POST',
  path: '/api/v1/auth/register',
  body: { email: userEmail, password: userPassword },
});

const registerPass =
  registerResponse.status === 201 &&
  registerResponse.body &&
  typeof registerResponse.body.id === 'string' &&
  registerResponse.body.email === userEmail &&
  typeof registerResponse.body.token === 'string';

check('1) POST /api/v1/auth/register', registerPass, {
  status: registerResponse.status,
  hasId: typeof registerResponse.body?.id === 'string',
  email: registerResponse.body?.email,
  hasToken: typeof registerResponse.body?.token === 'string',
});

// 2) Login
const loginResponse = await request({
  method: 'POST',
  path: '/api/v1/auth/login',
  body: { email: userEmail, password: userPassword },
});

const token = loginResponse.body?.token;

const loginPass =
  loginResponse.status === 200 &&
  loginResponse.body &&
  typeof loginResponse.body.id === 'string' &&
  loginResponse.body.email === userEmail &&
  typeof loginResponse.body.tier === 'string' &&
  typeof token === 'string';

check('2) POST /api/v1/auth/login', loginPass, {
  status: loginResponse.status,
  hasId: typeof loginResponse.body?.id === 'string',
  email: loginResponse.body?.email,
  tier: loginResponse.body?.tier,
  hasToken: typeof token === 'string',
});

// 3) Health
const healthResponse = await request({ method: 'GET', path: '/health' });
const healthPass =
  healthResponse.status === 200 &&
  typeof healthResponse.body?.status === 'string' &&
  typeof healthResponse.body?.db === 'string' &&
  typeof healthResponse.body?.redis === 'string' &&
  typeof healthResponse.body?.feeds === 'object';

check('3) GET /health', healthPass, {
  status: healthResponse.status,
  statusField: healthResponse.body?.status,
  db: healthResponse.body?.db,
  redis: healthResponse.body?.redis,
  feedsKeys: Object.keys(healthResponse.body?.feeds ?? {}),
});

// 4) Query valid IP with JWT
const query1Response = await request({
  method: 'POST',
  path: '/api/v1/query',
  token,
  body: { ioc: '8.8.8.8', type: 'ip' },
});

const queryId = query1Response.body?.queryId;
const query1Pass =
  query1Response.status === 200 &&
  query1Response.durationMs <= 10_000 &&
  typeof query1Response.body?.queryId === 'string' &&
  typeof query1Response.body?.riskScore === 'number' &&
  typeof query1Response.body?.riskLevel === 'string' &&
  Array.isArray(query1Response.body?.feeds) &&
  Array.isArray(query1Response.body?.mitreTechniques);

check('4) POST /api/v1/query valid IP', query1Pass, {
  status: query1Response.status,
  durationMs: query1Response.durationMs,
  queryId,
  riskLevel: query1Response.body?.riskLevel,
});

// 5) Query invalid IP
const invalidQueryResponse = await request({
  method: 'POST',
  path: '/api/v1/query',
  token,
  body: { ioc: 'not-an-ip', type: 'ip' },
});

const errorMessage = invalidQueryResponse.body?.error?.message;
const invalidQueryPass =
  invalidQueryResponse.status === 400 &&
  typeof errorMessage === 'string' &&
  !String(errorMessage).toLowerCase().includes('stack');

check('5) POST /api/v1/query invalid input', invalidQueryPass, {
  status: invalidQueryResponse.status,
  errorCode: invalidQueryResponse.body?.error?.code,
  errorMessage,
});

// 6) Query no auth
const noAuthResponse = await request({
  method: 'POST',
  path: '/api/v1/query',
  body: { ioc: '8.8.8.8', type: 'ip' },
});

const noAuthPass = noAuthResponse.status === 401;
check('6) POST /api/v1/query no auth', noAuthPass, {
  status: noAuthResponse.status,
  errorCode: noAuthResponse.body?.error?.code,
});

// 7) Query same IoC again (cache)
const query2Response = await request({
  method: 'POST',
  path: '/api/v1/query',
  token,
  body: { ioc: '8.8.8.8', type: 'ip' },
});

const query2Pass =
  query2Response.status === 200 &&
  query2Response.durationMs < 200 &&
  query2Response.body?.cachedAt !== null &&
  query2Response.body?.cachedAt !== undefined;

check('7) POST /api/v1/query cache hit', query2Pass, {
  status: query2Response.status,
  durationMs: query2Response.durationMs,
  cachedAt: query2Response.body?.cachedAt,
});

// 8) GET /api/v1/history
const historyResponse = await request({
  method: 'GET',
  path: '/api/v1/history',
  token,
});

const historyPass =
  historyResponse.status === 200 &&
  Array.isArray(historyResponse.body?.items) &&
  typeof historyResponse.body?.total === 'number' &&
  typeof historyResponse.body?.page === 'number' &&
  typeof historyResponse.body?.pageSize === 'number';

check('8) GET /api/v1/history', historyPass, {
  status: historyResponse.status,
  itemCount: Array.isArray(historyResponse.body?.items)
    ? historyResponse.body.items.length
    : null,
  total: historyResponse.body?.total,
});

// 9) GET /api/v1/query/:id
const byIdResponse = await request({
  method: 'GET',
  path: `/api/v1/query/${queryId}`,
  token,
});

const byIdPass =
  byIdResponse.status === 200 &&
  byIdResponse.body?.queryId === queryId;

check('9) GET /api/v1/query/:id', byIdPass, {
  status: byIdResponse.status,
  returnedQueryId: byIdResponse.body?.queryId,
});

// 10) Rate-limit (fresh user to avoid prior quota usage)
const rateUserEmail = `rate-${Date.now()}@test.com`;
await request({
  method: 'POST',
  path: '/api/v1/auth/register',
  body: { email: rateUserEmail, password: userPassword },
});
const rateLoginResponse = await request({
  method: 'POST',
  path: '/api/v1/auth/login',
  body: { email: rateUserEmail, password: userPassword },
});
const rateToken = rateLoginResponse.body?.token;

const burstResults = [];
for (let i = 0; i < 25; i += 1) {
  const r = await request({
    method: 'POST',
    path: '/api/v1/query',
    token: rateToken,
    body: { ioc: '8.8.8.8', type: 'ip' },
  });
  burstResults.push(r);
}

const successCount = burstResults.filter((r) => r.status === 200).length;
const tooManyCount = burstResults.filter((r) => r.status === 429).length;
const first429 = burstResults.find((r) => r.status === 429);

const rateLimitPass =
  successCount === 20 &&
  tooManyCount === 5 &&
  typeof first429?.headers?.retryAfter === 'string' &&
  first429.headers.retryAfter.length > 0;

check('10) Rate limit 25 rapid requests', rateLimitPass, {
  successCount,
  tooManyCount,
  retryAfter: first429?.headers?.retryAfter ?? null,
  statuses: burstResults.map((r) => r.status),
});

console.log(JSON.stringify({ checks }, null, 2));

const failed = checks.filter((entry) => !entry.pass);
if (failed.length > 0) {
  process.exitCode = 1;
}
