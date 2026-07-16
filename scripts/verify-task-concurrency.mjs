import { PrismaClient, RecordSource, RecordStatus, RecordType, TaskStatus } from '@prisma/client';

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
      device: { deviceId: `${label}-${Date.now()}`, platform: 'ANDROID', deviceName: label },
    }),
  });
  if (result.status !== 200) throw new Error(`${label} login failed: ${JSON.stringify(result)}`);
  return result.body;
}

function completionBody(version, note) {
  return JSON.stringify({
    actualAt: new Date().toISOString(),
    result: { observed: true, source: note },
    note,
    version,
  });
}

try {
  const suffix = String(Date.now()).slice(-8);
  const ownerPhone = `135${suffix}`;
  const memberPhone = `134${suffix}`;
  const owner = await login(ownerPhone, 'Task concurrency owner');
  const member = await login(memberPhone, 'Task concurrency member');
  const ownerAuth = { Authorization: `Bearer ${owner.accessToken}` };
  const memberAuth = { Authorization: `Bearer ${member.accessToken}` };

  const family = await request('/families', {
    method: 'POST',
    headers: ownerAuth,
    body: JSON.stringify({ name: '任务并发验收家庭', timezone: 'Asia/Shanghai' }),
  });
  if (family.status !== 201) throw new Error(`family create failed: ${JSON.stringify(family)}`);
  const ownerHeaders = { ...ownerAuth, 'X-Family-Id': family.body.id };
  const memberHeaders = { ...memberAuth, 'X-Family-Id': family.body.id };

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

  const task = await prisma.task.create({
    data: {
      familyId: family.body.id,
      createdById: owner.user.id,
      title: '并发完成铲屎提醒',
      type: RecordType.LITTER,
      scheduledAt: new Date(Date.now() + 60_000),
    },
  });

  const [ownerSnapshot, memberSnapshot] = await Promise.all([
    request(`/tasks/${task.id}`, { headers: ownerHeaders }),
    request(`/tasks/${task.id}`, { headers: memberHeaders }),
  ]);
  const staleVersion = ownerSnapshot.body.version;
  if (
    ownerSnapshot.status !== 200 ||
    memberSnapshot.status !== 200 ||
    ownerSnapshot.body.version !== memberSnapshot.body.version ||
    ownerSnapshot.body.status !== TaskStatus.PENDING ||
    memberSnapshot.body.status !== TaskStatus.PENDING
  )
    throw new Error(`task snapshots invalid: ${JSON.stringify({ ownerSnapshot, memberSnapshot })}`);

  const ownerNote = `owner-complete-${suffix}`;
  const memberNote = `member-complete-${suffix}`;
  const [ownerComplete, memberComplete] = await Promise.all([
    request(`/tasks/${task.id}/complete`, {
      method: 'POST',
      headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() },
      body: completionBody(staleVersion, ownerNote),
    }),
    request(`/tasks/${task.id}/complete`, {
      method: 'POST',
      headers: { ...memberHeaders, 'Idempotency-Key': crypto.randomUUID() },
      body: completionBody(staleVersion, memberNote),
    }),
  ]);

  const completions = [
    { actor: 'owner', note: ownerNote, result: ownerComplete },
    { actor: 'member', note: memberNote, result: memberComplete },
  ];
  const successful = completions.filter((item) => item.result.status === 201);
  const rejected = completions.filter((item) => item.result.status === 409);
  const conflictCodes = new Set(['VERSION_CONFLICT', 'TASK_ALREADY_COMPLETED']);
  const loser = rejected[0];
  const winner = successful[0];

  const finalTask = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
  const records = await prisma.record.findMany({ where: { taskId: task.id } });
  const loserHeaders = loser?.actor === 'owner' ? ownerHeaders : memberHeaders;
  const loserRefresh = loser ? await request(`/tasks/${task.id}`, { headers: loserHeaders }) : null;

  const checks = {
    oneCompletionAccepted: successful.length === 1,
    oneCompletionRejected:
      rejected.length === 1 && conflictCodes.has(String(rejected[0].result.body.code)),
    taskCompletedOnce:
      finalTask.status === TaskStatus.COMPLETED &&
      finalTask.version === staleVersion + 1 &&
      finalTask.note === winner?.note,
    recordCreatedOnce:
      records.length === 1 &&
      records[0].source === RecordSource.TASK &&
      records[0].status === RecordStatus.ACTIVE &&
      records[0].note === winner?.note,
    losingDeviceCanRefresh:
      loserRefresh?.status === 200 &&
      loserRefresh.body.status === TaskStatus.COMPLETED &&
      loserRefresh.body.version === staleVersion + 1,
  };

  if (Object.values(checks).some((passed) => !passed)) {
    throw new Error(
      JSON.stringify(
        {
          checks,
          ownerSnapshot,
          memberSnapshot,
          ownerComplete,
          memberComplete,
          finalTask,
          records,
          loserRefresh,
        },
        null,
        2,
      ),
    );
  }

  console.log('TASK_CONCURRENCY_OK', JSON.stringify(checks));
} finally {
  await prisma.$disconnect();
}
