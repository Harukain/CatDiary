import {
  NotificationChannelType,
  NotificationStatus,
  PrismaClient,
  RecordType,
} from '@prisma/client';

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
  await request('/auth/sms/send', { method: 'POST', body: JSON.stringify({ phone }) });
  return (
    await request('/auth/sms/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code: '123456', device: { deviceId, deviceName } }),
    })
  ).body;
}

try {
  const suffix = String(Date.now()).slice(-8);
  const owner = await login(`139${suffix}`, `boundary-owner-${suffix}`, 'Boundary owner');
  const member = await login(`138${suffix}`, `boundary-member-${suffix}`, 'Boundary member');
  const ownerAuth = { Authorization: `Bearer ${owner.accessToken}` };
  const memberAuth = { Authorization: `Bearer ${member.accessToken}` };
  const family = await request('/families', {
    method: 'POST',
    headers: ownerAuth,
    body: JSON.stringify({ name: '提醒边界验收家庭', timezone: 'Asia/Shanghai' }),
  });
  const familyHeaders = { ...ownerAuth, 'X-Family-Id': family.body.id };
  const invite = await request(`/families/${family.body.id}/invites`, {
    method: 'POST',
    headers: ownerAuth,
    body: JSON.stringify({ phone: `138${suffix}`, role: 'MEMBER' }),
  });
  const accepted = await request(`/family-invites/${invite.body.token}/accept`, {
    method: 'POST',
    headers: memberAuth,
    body: '{}',
  });
  const plan = await request('/plans', {
    method: 'POST',
    headers: familyHeaders,
    body: JSON.stringify({
      type: 'LITTER',
      title: '边界铲屎提醒',
      assigneeId: member.user.id,
      startAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      localTime: '20:00',
      recurrenceRule: { frequency: 'once' },
    }),
  });
  const task = await prisma.task.create({
    data: {
      familyId: family.body.id,
      planId: plan.body.id,
      createdById: owner.user.id,
      assigneeId: member.user.id,
      title: '边界铲屎提醒',
      type: RecordType.LITTER,
      scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    },
  });
  const members = await request(`/families/${family.body.id}/members`, { headers: ownerAuth });
  const memberMembership = members.body.find((item) => item.user.id === member.user.id);
  const removed = await request(
    `/families/${family.body.id}/members/${memberMembership?.id ?? 'missing'}`,
    {
      method: 'DELETE',
      headers: ownerAuth,
    },
  );
  const [clearedPlan, clearedTask] = await Promise.all([
    prisma.plan.findUnique({ where: { id: plan.body.id }, select: { assigneeId: true } }),
    prisma.task.findUnique({ where: { id: task.id }, select: { assigneeId: true } }),
  ]);
  const failedLog = await prisma.notificationLog.create({
    data: {
      jobKey: `former-member-retry-${suffix}`,
      familyId: family.body.id,
      taskId: task.id,
      userId: member.user.id,
      channel: NotificationChannelType.EXPO_PUSH,
      status: NotificationStatus.FAILED,
      scheduledAt: new Date(),
    },
  });
  const retry = await request(`/notification-logs/${failedLog.id}/retry`, {
    method: 'POST',
    headers: familyHeaders,
    body: '{}',
  });
  const checks = {
    inviteAccepted: accepted.status === 201,
    memberRemoved: removed.status === 204,
    assignmentsCleared: clearedPlan?.assigneeId === null && clearedTask?.assigneeId === null,
    retryBlocksFormerMember:
      retry.status === 410 && retry.body.code === 'NOTIFICATION_RECIPIENT_LEFT_FAMILY',
  };
  if (Object.values(checks).some((value) => !value))
    throw new Error(
      JSON.stringify({ checks, family, invite, accepted, plan, members, removed, retry }, null, 2),
    );
  console.log('FAMILY_REMINDER_BOUNDARY_OK', JSON.stringify(checks));
} finally {
  await prisma.$disconnect();
}
