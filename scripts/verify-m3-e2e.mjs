const base = 'http://127.0.0.1:3000/api/v1';

async function request(path, init = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const payload = response.status === 204 ? null : await response.json();
  return { status: response.status, body: payload?.data ?? payload?.error ?? payload };
}

async function login(phone, label) {
  await request('/auth/sms/send', {
    method: 'POST',
    body: JSON.stringify({ phone, purpose: 'login' }),
  });
  const result = await request('/auth/sms/verify', {
    method: 'POST',
    body: JSON.stringify({
      phone,
      code: '123456',
      device: { deviceId: `${label}-${Date.now()}`, platform: 'IOS', deviceName: label },
    }),
  });
  if (result.status !== 200) throw new Error(`${label} login failed: ${JSON.stringify(result)}`);
  return result.body;
}

const suffix = String(Date.now()).slice(-8);
const ownerPhone = `137${suffix}`;
const memberPhone = `136${suffix}`;
const owner = await login(ownerPhone, 'M3 owner');
const member = await login(memberPhone, 'M3 member');
const ownerAuth = { Authorization: `Bearer ${owner.accessToken}` };
const memberAuth = { Authorization: `Bearer ${member.accessToken}` };

const family = await request('/families', {
  method: 'POST',
  headers: ownerAuth,
  body: JSON.stringify({ name: 'M3 端到端验收', timezone: 'Asia/Shanghai' }),
});
if (family.status !== 201) throw new Error(`family create failed: ${JSON.stringify(family)}`);
const ownerHeaders = { ...ownerAuth, 'X-Family-Id': family.body.id };
const memberHeaders = { ...memberAuth, 'X-Family-Id': family.body.id };
const pet = await request('/pets', {
  method: 'POST',
  headers: ownerHeaders,
  body: JSON.stringify({ name: '协作验收猫', sex: 'UNKNOWN' }),
});

const invite = await request(`/families/${family.body.id}/invites`, {
  method: 'POST',
  headers: ownerAuth,
  body: JSON.stringify({ phone: memberPhone, role: 'MEMBER' }),
});
const accepted = await request(`/family-invites/${invite.body.token}/accept`, {
  method: 'POST',
  headers: memberAuth,
  body: '{}',
});
if (invite.status !== 201 || accepted.status !== 201)
  throw new Error(`invite failed: ${JSON.stringify({ invite, accepted })}`);

const ownerClientId = crypto.randomUUID();
const ownerRecordInput = {
  clientId: ownerClientId,
  petId: pet.body.id,
  type: 'VOMIT',
  title: '呕吐记录',
  occurredAt: new Date(Date.now() - 60_000).toISOString(),
  abnormal: true,
  data: { contentType: 'HAIRBALL', count: 1, blood: false },
  note: '家庭协作验收',
};
const created = await request('/records', {
  method: 'POST',
  headers: { ...ownerHeaders, 'Idempotency-Key': ownerClientId },
  body: JSON.stringify(ownerRecordInput),
});

// Simulates the same offline operation being replayed after the client did not receive the first response.
const replayed = await request('/records', {
  method: 'POST',
  headers: { ...ownerHeaders, 'Idempotency-Key': ownerClientId },
  body: JSON.stringify(ownerRecordInput),
});

const memberEditOwner = await request(`/records/${created.body.id}`, {
  method: 'PATCH',
  headers: memberHeaders,
  body: JSON.stringify({ note: '成员不应覆盖', version: created.body.version }),
});
const memberDeleteOwner = await request(`/records/${created.body.id}`, {
  method: 'DELETE',
  headers: memberHeaders,
  body: JSON.stringify({ version: created.body.version }),
});

const ownerUpdate = await request(`/records/${created.body.id}`, {
  method: 'PATCH',
  headers: ownerHeaders,
  body: JSON.stringify({ note: '服务端最新内容', version: created.body.version }),
});
const staleUpdate = await request(`/records/${created.body.id}`, {
  method: 'PATCH',
  headers: ownerHeaders,
  body: JSON.stringify({ note: '离线旧版本内容', version: created.body.version }),
});

const memberClientId = crypto.randomUUID();
const memberRecord = await request('/records', {
  method: 'POST',
  headers: { ...memberHeaders, 'Idempotency-Key': memberClientId },
  body: JSON.stringify({
    clientId: memberClientId,
    petId: pet.body.id,
    type: 'WATER',
    title: '饮水记录',
    occurredAt: new Date(Date.now() - 30_000).toISOString(),
    abnormal: false,
    data: { amountMl: 120 },
  }),
});
const ownerEditsMember = await request(`/records/${memberRecord.body.id}`, {
  method: 'PATCH',
  headers: ownerHeaders,
  body: JSON.stringify({ note: '管理员补充说明', version: memberRecord.body.version }),
});

const checks = {
  replayIdempotent: created.status === 201 && replayed.body.id === created.body.id,
  memberCannotEditOthers:
    memberEditOwner.status === 403 && memberEditOwner.body.code === 'RECORD_EDIT_FORBIDDEN',
  memberCannotDeleteOthers:
    memberDeleteOwner.status === 403 && memberDeleteOwner.body.code === 'RECORD_DELETE_FORBIDDEN',
  optimisticConflict:
    ownerUpdate.status === 200 &&
    staleUpdate.status === 409 &&
    staleUpdate.body.code === 'VERSION_CONFLICT' &&
    staleUpdate.body.details?.serverVersion === ownerUpdate.body.version,
  memberCanCreate: memberRecord.status === 201,
  ownerCanModerate:
    ownerEditsMember.status === 200 && ownerEditsMember.body.note === '管理员补充说明',
};

if (Object.values(checks).some((passed) => !passed)) {
  throw new Error(
    JSON.stringify(
      {
        checks,
        created,
        replayed,
        memberEditOwner,
        memberDeleteOwner,
        ownerUpdate,
        staleUpdate,
        memberRecord,
        ownerEditsMember,
      },
      null,
      2,
    ),
  );
}

console.log('M3_E2E_OK', JSON.stringify(checks));
