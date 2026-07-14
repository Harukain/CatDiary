const base = 'http://127.0.0.1:3000/api/v1';
async function request(path, init = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const payload = await response.json();
  return { status: response.status, body: payload.data ?? payload.error };
}
const phone = `139${String(Date.now()).slice(-8)}`;
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
      deviceId: `records-${Date.now()}`,
      platform: 'IOS',
      deviceName: 'Records verification',
    },
  }),
});
if (login.status !== 200) throw new Error(`login failed ${JSON.stringify(login)}`);
const auth = { Authorization: `Bearer ${login.body.accessToken}` };
const family = await request('/families', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ name: '记录验证家庭', timezone: 'Asia/Shanghai' }),
});
const familyHeaders = { ...auth, 'X-Family-Id': family.body.id };
const pet = await request('/pets', {
  method: 'POST',
  headers: familyHeaders,
  body: JSON.stringify({ name: '验收猫', sex: 'UNKNOWN' }),
});
const clientId = crypto.randomUUID();
const recordInput = {
  clientId,
  petId: pet.body.id,
  type: 'WEIGHT',
  title: '体重记录',
  occurredAt: new Date().toISOString(),
  abnormal: false,
  data: { weightKg: 4.25, method: 'SCALE' },
  note: '真实集成验证',
};
const first = await request('/records', {
  method: 'POST',
  headers: { ...familyHeaders, 'Idempotency-Key': clientId },
  body: JSON.stringify(recordInput),
});
const replay = await request('/records', {
  method: 'POST',
  headers: { ...familyHeaders, 'Idempotency-Key': clientId },
  body: JSON.stringify(recordInput),
});
const list = await request(`/records?petId=${pet.body.id}`, { headers: familyHeaders });
const invalid = await request('/records', {
  method: 'POST',
  headers: { ...familyHeaders, 'Idempotency-Key': crypto.randomUUID() },
  body: JSON.stringify({
    ...recordInput,
    clientId: crypto.randomUUID(),
    occurredAt: new Date(Date.now() + 86_400_000).toISOString(),
  }),
});
const updated = await request(`/records/${first.body.id}`, {
  method: 'PATCH',
  headers: familyHeaders,
  body: JSON.stringify({ data: { weightKg: 4.3, method: 'SCALE' }, version: first.body.version }),
});
const removed = await request(`/records/${first.body.id}`, {
  method: 'DELETE',
  headers: familyHeaders,
  body: JSON.stringify({ version: updated.body.version }),
});
const restored = await request(`/records/${first.body.id}/restore`, {
  method: 'POST',
  headers: familyHeaders,
  body: '{}',
});
const stoolClientId = crypto.randomUUID();
const stoolOccurredAt = '2026-07-11T08:15:00.000Z';
const stool = await request('/records', {
  method: 'POST',
  headers: { ...familyHeaders, 'Idempotency-Key': stoolClientId },
  body: JSON.stringify({
    clientId: stoolClientId,
    petId: pet.body.id,
    type: 'STOOL',
    title: '排便记录',
    occurredAt: stoolOccurredAt,
    abnormal: true,
    data: { condition: 'SOFT', count: 1, blood: true },
    note: '便血观察',
  }),
});
const editedOccurredAt = '2026-07-11T09:20:00.000Z';
const editedStool = await request(`/records/${stool.body.id}`, {
  method: 'PATCH',
  headers: familyHeaders,
  body: JSON.stringify({
    occurredAt: editedOccurredAt,
    data: { condition: 'NORMAL', count: 2, blood: false },
    abnormal: false,
    note: '已恢复正常',
    version: stool.body.version,
  }),
});
const invalidStool = await request('/records', {
  method: 'POST',
  headers: { ...familyHeaders, 'Idempotency-Key': crypto.randomUUID() },
  body: JSON.stringify({
    ...recordInput,
    clientId: crypto.randomUUID(),
    type: 'STOOL',
    data: { condition: 'INVALID', count: 1, blood: false },
  }),
});
const publicLitterClientId = crypto.randomUUID();
const publicLitter = await request('/records', {
  method: 'POST',
  headers: { ...familyHeaders, 'Idempotency-Key': publicLitterClientId },
  body: JSON.stringify({
    clientId: publicLitterClientId,
    petId: null,
    type: 'LITTER',
    title: '公共猫砂盆观察',
    occurredAt: new Date().toISOString(),
    abnormal: false,
    data: { boxId: '客厅猫砂盆', observation: '已清理' },
  }),
});
const missingPetClientId = crypto.randomUUID();
const missingPet = await request('/records', {
  method: 'POST',
  headers: { ...familyHeaders, 'Idempotency-Key': missingPetClientId },
  body: JSON.stringify({
    clientId: missingPetClientId,
    petId: null,
    type: 'WEIGHT',
    title: '缺少猫咪的体重记录',
    occurredAt: new Date().toISOString(),
    abnormal: false,
    data: { weightKg: 4.1, method: 'SCALE' },
  }),
});
const emptyLitterClientId = crypto.randomUUID();
const emptyLitter = await request('/records', {
  method: 'POST',
  headers: { ...familyHeaders, 'Idempotency-Key': emptyLitterClientId },
  body: JSON.stringify({
    clientId: emptyLitterClientId,
    petId: null,
    type: 'LITTER',
    title: '空猫砂盆记录',
    occurredAt: new Date().toISOString(),
    abnormal: false,
    data: {},
  }),
});
if (
  first.status !== 201 ||
  replay.body.id !== first.body.id ||
  list.body.items.length !== 1 ||
  invalid.status !== 422 ||
  updated.body.data.weightKg !== 4.3 ||
  ![200, 204].includes(removed.status) ||
  restored.body.status !== 'ACTIVE' ||
  stool.status !== 201 ||
  stool.body.occurredAt !== stoolOccurredAt ||
  stool.body.data.blood !== true ||
  editedStool.status !== 200 ||
  editedStool.body.occurredAt !== editedOccurredAt ||
  editedStool.body.data.condition !== 'NORMAL' ||
  editedStool.body.data.blood !== false ||
  editedStool.body.abnormal !== false ||
  invalidStool.status !== 400 ||
  publicLitter.status !== 201 ||
  publicLitter.body.petId !== null ||
  missingPet.status !== 422 ||
  emptyLitter.status !== 400
) {
  throw new Error(
    JSON.stringify(
      {
        first,
        replay,
        list,
        invalid,
        updated,
        removed,
        restored,
        stool,
        editedStool,
        invalidStool,
        publicLitter,
        missingPet,
        emptyLitter,
      },
      null,
      2,
    ),
  );
}
console.log(
  'RECORDS_API_INTEGRATION_OK',
  JSON.stringify({
    recordId: first.body.id,
    idempotent: true,
    futureRejected: invalid.status,
    restored: restored.body.status,
    stoolFields: true,
    occurrenceEdited: true,
    invalidStoolRejected: invalidStool.status,
    publicLitterScope: publicLitter.body.petId,
    missingPetRejected: missingPet.status,
    emptyLitterRejected: emptyLitter.status,
  }),
);
