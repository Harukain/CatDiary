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
  await request('/auth/sms/send', {
    method: 'POST',
    body: JSON.stringify({ phone, purpose: 'login' }),
  });
  return (
    await request('/auth/sms/verify', {
      method: 'POST',
      body: JSON.stringify({
        phone,
        code: '123456',
        device: { deviceId: `${label}-${Date.now()}`, platform: 'IOS', deviceName: label },
      }),
    })
  ).body;
}
const suffix = String(Date.now()).slice(-8);
const ownerPhone = `133${suffix}`;
const adminPhone = `132${suffix}`;
let owner = await login(ownerPhone, 'Preferences owner');
const admin = await login(adminPhone, 'Preferences admin');
const ownerAuth = () => ({ Authorization: `Bearer ${owner.accessToken}` });
const adminAuth = { Authorization: `Bearer ${admin.accessToken}` };
const family = await request('/families', {
  method: 'POST',
  headers: ownerAuth(),
  body: JSON.stringify({ name: '设置验收家庭', timezone: 'Asia/Shanghai' }),
});
const ownerFamily = () => ({ ...ownerAuth(), 'X-Family-Id': family.body.id });
const defaults = await request('/notification-preferences/me', { headers: ownerFamily() });
const disabled = await request('/notification-preferences/me', {
  method: 'PATCH',
  headers: ownerFamily(),
  body: JSON.stringify({ taskReminderEnabled: false, pushEnabled: false, overdueEnabled: false }),
});
const invalidCode = await request('/account/deletion-request', {
  method: 'POST',
  headers: ownerAuth(),
  body: JSON.stringify({ code: '000000' }),
});
const blocked = await request('/account/deletion-request', {
  method: 'POST',
  headers: ownerAuth(),
  body: JSON.stringify({ code: '123456' }),
});
const invite = await request(`/families/${family.body.id}/invites`, {
  method: 'POST',
  headers: ownerAuth(),
  body: JSON.stringify({ phone: adminPhone, role: 'ADMIN' }),
});
await request(`/family-invites/${invite.body.token}/accept`, {
  method: 'POST',
  headers: adminAuth,
  body: '{}',
});
const requested = await request('/account/deletion-request', {
  method: 'POST',
  headers: ownerAuth(),
  body: JSON.stringify({ code: '123456' }),
});
const revokedToken = await request('/account/deletion-status', { headers: ownerAuth() });
owner = await login(ownerPhone, 'Preferences owner return');
const pendingStatus = await request('/account/deletion-status', { headers: ownerAuth() });
const businessBlocked = await request('/pets', { headers: ownerFamily() });
const cancelled = await request('/account/deletion-request', {
  method: 'DELETE',
  headers: ownerAuth(),
});
const businessRestored = await request('/pets', { headers: ownerFamily() });
const checks = {
  defaultsEnabled:
    defaults.status === 200 &&
    defaults.body.taskReminderEnabled &&
    defaults.body.pushEnabled &&
    defaults.body.overdueEnabled,
  preferenceSaved:
    disabled.status === 200 &&
    !disabled.body.taskReminderEnabled &&
    !disabled.body.pushEnabled &&
    !disabled.body.overdueEnabled,
  recentCodeRequired: invalidCode.status === 401 && invalidCode.body.code === 'INVALID_CODE',
  lastAdminProtected: blocked.status === 422 && blocked.body.code === 'ADMIN_TRANSFER_REQUIRED',
  requestRevokesSessions:
    requested.status === 201 &&
    requested.body.status === 'PENDING_DELETION' &&
    revokedToken.status === 401,
  pendingCanOnlyManageDeletion:
    pendingStatus.status === 200 &&
    pendingStatus.body.canCancel === true &&
    businessBlocked.status === 401,
  cancellationRestoresAccount:
    cancelled.status === 200 &&
    cancelled.body.status === 'ACTIVE' &&
    businessRestored.status === 200,
};
if (Object.values(checks).some((value) => !value))
  throw new Error(
    JSON.stringify(
      {
        checks,
        defaults,
        disabled,
        invalidCode,
        blocked,
        requested,
        revokedToken,
        pendingStatus,
        businessBlocked,
        cancelled,
        businessRestored,
      },
      null,
      2,
    ),
  );
console.log('PREFERENCES_ACCOUNT_API_OK', JSON.stringify(checks));
