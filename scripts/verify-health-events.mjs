const base = process.env.CATDIARY_API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1';
async function request(path, init = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const payload = response.status === 204 ? {} : await response.json();
  return { status: response.status, body: payload.data ?? payload.error };
}
const phone = `138${String(Date.now()).slice(-8)}`;
await request('/auth/sms/send', {
  method: 'POST',
  body: JSON.stringify({ phone, purpose: 'login' }),
});
const login = await request('/auth/sms/verify', {
  method: 'POST',
  body: JSON.stringify({
    phone,
    code: '123456',
    device: {
      deviceId: `health-${Date.now()}`,
      platform: 'IOS',
      deviceName: 'Health verification',
    },
  }),
});
const auth = { Authorization: `Bearer ${login.body.accessToken}` };
const family = await request('/families', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ name: '健康事件验证家庭', timezone: 'Asia/Shanghai' }),
});
const headers = { ...auth, 'X-Family-Id': family.body.id };
const pet = await request('/pets', {
  method: 'POST',
  headers,
  body: JSON.stringify({ name: '观察猫', sex: 'UNKNOWN' }),
});
const otherPet = await request('/pets', {
  method: 'POST',
  headers,
  body: JSON.stringify({ name: '另一只猫', sex: 'UNKNOWN' }),
});
async function record(petId, title) {
  const clientId = crypto.randomUUID();
  return request('/records', {
    method: 'POST',
    headers: { ...headers, 'Idempotency-Key': clientId },
    body: JSON.stringify({
      clientId,
      petId,
      type: 'VOMIT',
      title,
      occurredAt: new Date().toISOString(),
      abnormal: true,
      data: { contentType: 'HAIRBALL', count: 1, blood: false },
    }),
  });
}
const symptom = await record(pet.body.id, '呕吐一次');
const observation = await record(pet.body.id, '后续观察');
const wrongPetRecord = await record(otherPet.body.id, '另一只猫呕吐');
const key = crypto.randomUUID();
const startedAt = new Date().toISOString();
const eventInput = {
  petId: pet.body.id,
  title: '呕吐观察',
  startedAt,
  summary: '精神状态正常',
  recordIds: [symptom.body.id],
};
const created = await request('/health-events', {
  method: 'POST',
  headers: { ...headers, 'Idempotency-Key': key },
  body: JSON.stringify(eventInput),
});
const replay = await request('/health-events', {
  method: 'POST',
  headers: { ...headers, 'Idempotency-Key': key },
  body: JSON.stringify(eventInput),
});
const invalidLink = await request(`/health-events/${created.body.id}/records`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ recordId: wrongPetRecord.body.id, relationType: 'OBSERVATION' }),
});
const updated = await request(`/health-events/${created.body.id}`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({
    title: '呕吐持续观察',
    summary: '食欲恢复',
    version: created.body.version,
  }),
});
const attached = await request(`/health-events/${created.body.id}/records`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ recordId: observation.body.id, relationType: 'OBSERVATION' }),
});
const detached = await request(`/health-events/${created.body.id}/records/${observation.body.id}`, {
  method: 'DELETE',
  headers,
});
const afterDetach = await request(`/health-events/${created.body.id}`, { headers });
const listed = await request('/health-events?status=ACTIVE', { headers });
const recovered = await request(`/health-events/${created.body.id}/recover`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ recoveredAt: new Date().toISOString(), version: updated.body.version }),
});
if (
  created.status !== 201 ||
  replay.body.id !== created.body.id ||
  invalidLink.status !== 422 ||
  updated.body.title !== '呕吐持续观察' ||
  attached.body.records.length !== 2 ||
  ![200, 204].includes(detached.status) ||
  afterDetach.body.records.length !== 1 ||
  listed.body.length !== 1 ||
  recovered.body.status !== 'RECOVERED'
)
  throw new Error(
    JSON.stringify(
      { created, replay, invalidLink, updated, attached, detached, afterDetach, listed, recovered },
      null,
      2,
    ),
  );
console.log(
  'HEALTH_EVENTS_API_INTEGRATION_OK',
  JSON.stringify({
    linkedRecords: created.body.records.length,
    edited: updated.body.title,
    attachedThenRemoved: true,
    crossPetRejected: invalidLink.status,
    recovered: recovered.body.status,
  }),
);
