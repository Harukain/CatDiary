const base = process.env.CATDIARY_API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1';

async function request(path, init = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const payload = response.status === 204 ? null : await response.json();
  return { status: response.status, body: payload?.data ?? payload?.error ?? payload };
}

async function login() {
  const phone = `135${String(Date.now()).slice(-8)}`;
  await request('/auth/sms/send', {
    method: 'POST',
    body: JSON.stringify({ phone, purpose: 'login' }),
  });
  const result = await request('/auth/sms/verify', {
    method: 'POST',
    body: JSON.stringify({
      phone,
      code: '123456',
      device: {
        deviceId: `pet-profile-${Date.now()}`,
        platform: 'IOS',
        deviceName: 'Pet profile verification',
      },
    }),
  });
  if (result.status !== 200) throw new Error(`login failed: ${JSON.stringify(result)}`);
  return result.body;
}

async function createRecord(headers, petId, input) {
  const clientId = crypto.randomUUID();
  return request('/records', {
    method: 'POST',
    headers: { ...headers, 'Idempotency-Key': clientId },
    body: JSON.stringify({ clientId, petId, ...input }),
  });
}

const session = await login();
const auth = { Authorization: `Bearer ${session.accessToken}` };
const family = await request('/families', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ name: '档案聚合验证家庭', timezone: 'Asia/Shanghai' }),
});
const headers = { ...auth, 'X-Family-Id': family.body.id };
const pet = await request('/pets', {
  method: 'POST',
  headers,
  body: JSON.stringify({ name: '聚合猫', sex: 'FEMALE', breed: '中华田园猫' }),
});
const plan = await request('/plans', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    petId: pet.body.id,
    type: 'WEIGHT',
    title: '每周称重',
    timezone: 'Asia/Shanghai',
    startAt: new Date(Date.now() - 86_400_000).toISOString(),
    localTime: '08:00',
    recurrenceRule: { frequency: 'weekly', weekdays: [3] },
  }),
});
const firstWeight = await createRecord(headers, pet.body.id, {
  type: 'WEIGHT',
  title: '早间称重',
  occurredAt: '2026-07-10T01:00:00.000Z',
  abnormal: false,
  data: { weightKg: 4.1, method: 'SCALE' },
});
const secondWeight = await createRecord(headers, pet.body.id, {
  type: 'WEIGHT',
  title: '复称',
  occurredAt: '2026-07-10T03:00:00.000Z',
  abnormal: false,
  data: { weightKg: 4.3, method: 'SCALE' },
});
const vomit = await createRecord(headers, pet.body.id, {
  type: 'VOMIT',
  title: '呕吐观察',
  occurredAt: new Date(Date.now() - 60_000).toISOString(),
  abnormal: true,
  data: { contentType: 'FOOD', count: 1, blood: false },
  note: '聚合验证异常记录',
});
const medical = await request('/medical-records', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    petId: pet.body.id,
    type: 'VACCINE',
    title: '猫三联加强针',
    occurredAt: new Date(Date.now() - 86_400_000).toISOString(),
    brand: '验证品牌',
    nextDueAt: new Date(Date.now() + 90 * 86_400_000).toISOString(),
  }),
});
const health = await request('/health-events', {
  method: 'POST',
  headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
  body: JSON.stringify({
    petId: pet.body.id,
    title: '呕吐后观察',
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    summary: '继续观察食欲和精神状态',
    recordIds: [vomit.body.id],
  }),
});
const summary = await request(`/pets/${pet.body.id}/profile-summary`, { headers });
const dayTrend = await request(`/pets/${pet.body.id}/weight-trend?bucket=day`, { headers });
const rawTrend = await request(`/pets/${pet.body.id}/weight-trend?bucket=raw`, { headers });

const checks = {
  planCreated: plan.status === 201,
  recordsCreated: firstWeight.status === 201 && secondWeight.status === 201 && vomit.status === 201,
  medicalCreated: medical.status === 201,
  healthCreated: health.status === 201,
  profileLoaded: summary.status === 200 && summary.body.pet.id === pet.body.id,
  careAggregated: summary.body.care.activePlanCount === 1,
  weightDayBucketed:
    summary.body.weight.latest?.weightKg === 4.3 &&
    summary.body.weight.trend.length === 1 &&
    summary.body.weight.trend[0]?.bucket === '2026-07-10',
  medicalAggregated:
    summary.body.medical.counts.vaccines === 1 &&
    summary.body.medical.nextDue[0]?.id === medical.body.id,
  healthAggregated:
    summary.body.health.activeEvents[0]?.id === health.body.id &&
    summary.body.health.abnormalRecordCount30d === 1,
  recentRecordsAggregated: summary.body.recentRecords.some((record) => record.id === vomit.body.id),
  rawTrendKeepsBothPoints: rawTrend.body.points.length === 2,
  dayTrendKeepsLatestPoint:
    dayTrend.body.points.length === 1 && dayTrend.body.points[0]?.recordId === secondWeight.body.id,
};

if (Object.values(checks).some((passed) => !passed)) {
  throw new Error(
    JSON.stringify(
      {
        checks,
        plan,
        firstWeight,
        secondWeight,
        vomit,
        medical,
        health,
        summary,
        dayTrend,
        rawTrend,
      },
      null,
      2,
    ),
  );
}

console.log('PET_PROFILE_AGGREGATION_OK', JSON.stringify(checks));
