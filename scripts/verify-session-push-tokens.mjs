import { PrismaClient } from '@prisma/client';

const base = 'http://127.0.0.1:3000/api/v1';
const prisma = new PrismaClient();

async function request(path, init = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const payload = response.status === 204 ? null : await response.json();
  return { status: response.status, body: payload?.data ?? payload?.error ?? payload };
}
async function login(phone, deviceId, deviceName) {
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
        device: { deviceId, deviceName, platform: 'IOS' },
      }),
    })
  ).body;
}
async function register(session, token) {
  return request('/devices/push-token', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({ token, provider: 'EXPO', platform: 'IOS' }),
  });
}
async function active(token) {
  return (await prisma.devicePushToken.findUnique({ where: { token }, select: { active: true } }))
    ?.active;
}

try {
  const suffix = String(Date.now()).slice(-8);
  const phone = `131${suffix}`;
  const first = await login(phone, `push-a-${suffix}`, 'Push A');
  const second = await login(phone, `push-b-${suffix}`, 'Push B');
  const tokenA = `ExponentPushToken[session-a-${suffix}]`;
  const tokenB = `ExponentPushToken[session-b-${suffix}]`;
  const registeredA = await register(first, tokenA);
  const registeredB = await register(second, tokenB);
  const sessions = await request('/auth/sessions', {
    headers: { Authorization: `Bearer ${first.accessToken}` },
  });
  const secondSession = sessions.body.find((item) => item.deviceName === 'Push B');
  const revoke = await request(`/auth/sessions/${secondSession?.id ?? 'missing'}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${first.accessToken}` },
  });
  const tokenBAfterRevoke = await active(tokenB);
  const tokenAWhileCurrent = await active(tokenA);
  const logout = await request('/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${first.accessToken}` },
    body: '{}',
  });
  const tokenAAfterLogout = await active(tokenA);

  const third = await login(phone, `push-c-${suffix}`, 'Push C');
  const fourth = await login(phone, `push-d-${suffix}`, 'Push D');
  const tokenC = `ExponentPushToken[session-c-${suffix}]`;
  const tokenD = `ExponentPushToken[session-d-${suffix}]`;
  await register(third, tokenC);
  await register(fourth, tokenD);
  const logoutAll = await request('/auth/logout-all', {
    method: 'POST',
    headers: { Authorization: `Bearer ${third.accessToken}` },
    body: '{}',
  });
  const checks = {
    registrationSucceeded: registeredA.status === 201 && registeredB.status === 201,
    remoteRevokeDeactivatesOnlyTarget:
      revoke.status === 204 && tokenBAfterRevoke === false && tokenAWhileCurrent === true,
    logoutDeactivatesCurrent: logout.status === 204 && tokenAAfterLogout === false,
    logoutAllDeactivatesEveryDevice:
      logoutAll.status === 201 &&
      (await active(tokenC)) === false &&
      (await active(tokenD)) === false,
  };
  if (Object.values(checks).some((value) => !value))
    throw new Error(
      JSON.stringify(
        {
          checks,
          registeredA,
          registeredB,
          sessions,
          revoke,
          logout,
          logoutAll,
        },
        null,
        2,
      ),
    );
  console.log('SESSION_PUSH_TOKEN_LIFECYCLE_OK', JSON.stringify(checks));
} finally {
  await prisma.$disconnect();
}
