const base = process.env.CATDIARY_API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1';
async function request(path, init = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const payload = response.status === 204 ? null : await response.json();
  return { status: response.status, body: payload?.data ?? payload?.error ?? payload };
}
async function login(phone, label) {
  const sent = await request('/auth/sms/send', {
    method: 'POST',
    body: JSON.stringify({ phone, purpose: 'login' }),
  });
  if (sent.status !== 200) throw new Error(`SMS send failed: ${sent.status}`);
  const verified = await request('/auth/sms/verify', {
    method: 'POST',
    body: JSON.stringify({
      phone,
      code: '123456',
      device: { deviceId: `${label}-${Date.now()}`, platform: 'IOS', deviceName: label },
    }),
  });
  if (verified.status !== 200) throw new Error(`SMS verify failed: ${verified.status}`);
  return verified.body;
}
async function waitReady(id, headers) {
  for (let i = 0; i < 40; i += 1) {
    const result = await request(`/exports/${id}`, { headers });
    if (['READY', 'FAILED'].includes(result.body.status)) return result;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`export timeout ${id}`);
}
async function download(id, headers) {
  const link = await request(`/exports/${id}/download`, { headers });
  const response = await fetch(
    link.body.downloadUrl.startsWith('http') ? link.body.downloadUrl : base + link.body.downloadUrl,
  );
  return { link, response, bytes: Buffer.from(await response.arrayBuffer()) };
}
const suffix = String(Date.now()).slice(-8);
const ownerPhone = `131${suffix}`;
const memberPhone = `130${suffix}`;
const owner = await login(ownerPhone, 'Export owner');
const member = await login(memberPhone, 'Export member');
const ownerAuth = { Authorization: `Bearer ${owner.accessToken}` };
const memberAuth = { Authorization: `Bearer ${member.accessToken}` };
const family = await request('/families', {
  method: 'POST',
  headers: ownerAuth,
  body: JSON.stringify({ name: '导出验收家庭', timezone: 'Asia/Shanghai' }),
});
const ownerHeaders = { ...ownerAuth, 'X-Family-Id': family.body.id };
const memberHeaders = { ...memberAuth, 'X-Family-Id': family.body.id };
const pet = await request('/pets', {
  method: 'POST',
  headers: ownerHeaders,
  body: JSON.stringify({ name: '导出猫', sex: 'UNKNOWN' }),
});
const clientId = crypto.randomUUID();
await request('/records', {
  method: 'POST',
  headers: { ...ownerHeaders, 'Idempotency-Key': clientId },
  body: JSON.stringify({
    clientId,
    petId: pet.body.id,
    type: 'WEIGHT',
    title: '导出体重',
    occurredAt: new Date().toISOString(),
    abnormal: false,
    data: { weightKg: 4.6, method: 'SCALE' },
  }),
});
const invite = await request(`/families/${family.body.id}/invites`, {
  method: 'POST',
  headers: ownerAuth,
  body: JSON.stringify({ phone: memberPhone, role: 'MEMBER' }),
});
await request(`/family-invites/${invite.body.token}/accept`, {
  method: 'POST',
  headers: memberAuth,
  body: '{}',
});
const key = `export-${Date.now()}-owner`;
const ownerExport = await request('/exports', {
  method: 'POST',
  headers: { ...ownerHeaders, 'Idempotency-Key': key },
  body: JSON.stringify({ format: 'JSON', scope: 'FAMILY' }),
});
const replay = await request('/exports', {
  method: 'POST',
  headers: { ...ownerHeaders, 'Idempotency-Key': key },
  body: JSON.stringify({ format: 'JSON', scope: 'FAMILY' }),
});
const memberForbidden = await request('/exports', {
  method: 'POST',
  headers: { ...memberHeaders, 'Idempotency-Key': `export-${Date.now()}-forbidden` },
  body: JSON.stringify({ format: 'JSON', scope: 'FAMILY' }),
});
const memberExport = await request('/exports', {
  method: 'POST',
  headers: { ...memberHeaders, 'Idempotency-Key': `export-${Date.now()}-member` },
  body: JSON.stringify({ format: 'CSV', scope: 'PERSONAL' }),
});
const [ownerReady, memberReady] = await Promise.all([
  waitReady(ownerExport.body.id, ownerHeaders),
  waitReady(memberExport.body.id, memberHeaders),
]);
const ownerFile = await download(ownerExport.body.id, ownerHeaders);
const memberFile = await download(memberExport.body.id, memberHeaders);
const familyJson = JSON.parse(ownerFile.bytes.toString('utf8'));
const csv = memberFile.bytes.toString('utf8');
const checks = {
  idempotent: ownerExport.status === 201 && replay.body.id === ownerExport.body.id,
  memberFamilyExportForbidden:
    memberForbidden.status === 403 && memberForbidden.body.code === 'FAMILY_EXPORT_FORBIDDEN',
  asynchronousReady: ownerReady.body.status === 'READY' && memberReady.body.status === 'READY',
  familyJsonCompleteAndSafe:
    familyJson.scope === 'FAMILY' &&
    familyJson.family.name === '导出验收家庭' &&
    familyJson.records.some((record) => record.title === '导出体重') &&
    familyJson.members.every(
      (entry) => !('phoneEncrypted' in entry.user) && !('phoneHash' in entry.user),
    ),
  personalCsvValid:
    csv.startsWith('entity_type,id,data_json') &&
    csv.includes('PERSONAL') &&
    !csv.includes('phoneEncrypted') &&
    !csv.includes('导出体重'),
  shortLinksWork:
    ownerFile.response.status === 200 &&
    memberFile.response.status === 200 &&
    new Date(ownerFile.link.body.expiresAt) > new Date(),
};
if (Object.values(checks).some((value) => !value))
  throw new Error(
    JSON.stringify(
      {
        checks,
        ownerExport,
        replay,
        memberForbidden,
        memberExport,
        ownerReady,
        memberReady,
        familyJson,
        csv,
      },
      null,
      2,
    ),
  );
console.log('EXPORTS_API_WORKER_OK', JSON.stringify(checks));
