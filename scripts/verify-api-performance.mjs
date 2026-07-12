import { performance } from 'node:perf_hooks';

const base = 'http://127.0.0.1:3000/api/v1';

async function request(path, init = {}) {
  const startedAt = performance.now();
  const response = await fetch(base + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const durationMs = performance.now() - startedAt;
  const payload = response.status === 204 ? null : await response.json();
  return { status: response.status, body: payload?.data ?? payload?.error ?? payload, durationMs };
}

function percentile(values, ratio) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * ratio) - 1] ?? 0;
}

const phone = `132${String(Date.now()).slice(-8)}`;
const sent = await request('/auth/sms/send', {
  method: 'POST',
  body: JSON.stringify({ phone, purpose: 'login' }),
});
if (sent.status !== 200) throw new Error(`Performance login send failed: ${sent.status}`);
const login = await request('/auth/sms/verify', {
  method: 'POST',
  body: JSON.stringify({ phone, code: '123456', device: { deviceId: crypto.randomUUID() } }),
});
if (login.status !== 200) throw new Error(`Performance login failed: ${login.status}`);
const authorization = { Authorization: `Bearer ${login.body.accessToken}` };
const family = await request('/families', {
  method: 'POST',
  headers: authorization,
  body: JSON.stringify({ name: '性能门禁家庭', timezone: 'Asia/Shanghai' }),
});
const headers = { ...authorization, 'X-Family-Id': family.body.id };
const pet = await request('/pets', {
  method: 'POST',
  headers,
  body: JSON.stringify({ name: '性能猫', sex: 'UNKNOWN' }),
});

await request('/records', { headers });
const readDurations = [];
for (let index = 0; index < 30; index += 1)
  readDurations.push((await request('/records?limit=20', { headers })).durationMs);

const writeDurations = [];
for (let index = 0; index < 10; index += 1) {
  const clientId = crypto.randomUUID();
  const result = await request('/records', {
    method: 'POST',
    headers: { ...headers, 'Idempotency-Key': clientId },
    body: JSON.stringify({
      clientId,
      petId: pet.body.id,
      type: 'WEIGHT',
      title: `性能体重 ${index + 1}`,
      occurredAt: new Date(Date.now() - index * 1000).toISOString(),
      abnormal: false,
      data: { weightKg: 4 + index / 100, method: 'SCALE' },
    }),
  });
  if (result.status !== 201) throw new Error(`Performance write failed: ${result.status}`);
  writeDurations.push(result.durationMs);
}

const readP95 = percentile(readDurations, 0.95);
const writeP95 = percentile(writeDurations, 0.95);
if (readP95 >= 500) throw new Error(`Read P95 ${readP95.toFixed(1)}ms exceeds 500ms`);
if (writeP95 >= 800) throw new Error(`Write P95 ${writeP95.toFixed(1)}ms exceeds 800ms`);

console.log(
  'API_PERFORMANCE_SMOKE_OK',
  JSON.stringify({ readP95Ms: Math.round(readP95), writeP95Ms: Math.round(writeP95) }),
);
