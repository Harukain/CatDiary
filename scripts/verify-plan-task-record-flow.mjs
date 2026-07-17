const base = process.env.CATDIARY_API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1';
const timezone = 'Asia/Shanghai';

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
      device: {
        deviceId: `${label}-${Date.now()}`,
        platform: 'ANDROID',
        deviceName: label,
      },
    }),
  });
  if (result.status !== 200) throw new Error(`${label} login failed: ${JSON.stringify(result)}`);
  return result.body;
}

function localParts(date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
}

function localDateKey(date) {
  const parts = localParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localTime(date) {
  const parts = localParts(date);
  return `${parts.hour}:${parts.minute}`;
}

const suffix = String(Date.now()).slice(-8);
const phone = `137${suffix}`;
const title = `计划任务记录闭环-${suffix}`;
const note = `plan-task-record-flow-${suffix}`;
const scheduledAt = new Date(Date.now() + 30 * 60_000);
const taskScope = localDateKey(scheduledAt) === localDateKey(new Date()) ? 'today' : 'upcoming';

const session = await login(phone, 'Plan task record flow');
const auth = { Authorization: `Bearer ${session.accessToken}` };
const family = await request('/families', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ name: '计划任务记录闭环家庭', timezone }),
});
if (family.status !== 201) throw new Error(`family create failed: ${JSON.stringify(family)}`);
const familyHeaders = { ...auth, 'X-Family-Id': family.body.id };

const pet = await request('/pets', {
  method: 'POST',
  headers: familyHeaders,
  body: JSON.stringify({ name: '闭环猫', sex: 'UNKNOWN' }),
});
if (pet.status !== 201) throw new Error(`pet create failed: ${JSON.stringify(pet)}`);

const plan = await request('/plans', {
  method: 'POST',
  headers: familyHeaders,
  body: JSON.stringify({
    petId: pet.body.id,
    type: 'LITTER',
    title,
    detail: '集成测试：计划生成任务，任务完成后生成记录',
    startAt: new Date().toISOString(),
    localTime: localTime(scheduledAt),
    recurrenceRule: { frequency: 'once' },
  }),
});
if (plan.status !== 201 || plan.body.generatedTaskCount < 1)
  throw new Error(`plan did not generate tasks: ${JSON.stringify(plan)}`);

const tasks = await request(`/tasks?scope=${taskScope}&petId=${pet.body.id}`, {
  headers: familyHeaders,
});
const task = tasks.body.items?.find((item) => item.title === title);
if (tasks.status !== 200 || !task || task.status !== 'PENDING')
  throw new Error(`generated task not visible in ${taskScope}: ${JSON.stringify(tasks)}`);

const complete = await request(`/tasks/${task.id}/complete`, {
  method: 'POST',
  headers: { ...familyHeaders, 'Idempotency-Key': crypto.randomUUID() },
  body: JSON.stringify({
    actualAt: new Date().toISOString(),
    result: { summary: '已清理猫砂盆', source: 'integration' },
    note,
    version: task.version,
  }),
});
if (
  complete.status !== 201 ||
  complete.body.task?.status !== 'COMPLETED' ||
  complete.body.record?.source !== 'TASK' ||
  complete.body.record?.status !== 'ACTIVE' ||
  complete.body.record?.taskId !== task.id ||
  complete.body.record?.petId !== pet.body.id
)
  throw new Error(`task completion did not create linked record: ${JSON.stringify(complete)}`);

const records = await request(`/records?petId=${pet.body.id}&type=LITTER&limit=10`, {
  headers: familyHeaders,
});
const timelineRecord = records.body.items?.find((item) => item.id === complete.body.record.id);
const completedTasks = await request(`/tasks?scope=completed&petId=${pet.body.id}`, {
  headers: familyHeaders,
});
const completedTask = completedTasks.body.items?.find((item) => item.id === task.id);
const recordDetail = await request(`/records/${complete.body.record.id}`, {
  headers: familyHeaders,
});

const checks = {
  planGeneratedTask: plan.body.generatedTaskCount >= 1,
  taskVisibleBeforeCompletion: task.status === 'PENDING',
  completeReturnedLinkedRecord: complete.body.record.taskId === task.id,
  recordVisibleInTimeline:
    records.status === 200 &&
    timelineRecord?.source === 'TASK' &&
    timelineRecord?.title === title &&
    timelineRecord?.note === note,
  completedTaskVisible:
    completedTasks.status === 200 &&
    completedTask?.status === 'COMPLETED' &&
    completedTask?.version === task.version + 1,
  recordDetailLinked:
    recordDetail.status === 200 &&
    recordDetail.body.taskId === task.id &&
    recordDetail.body.status === 'ACTIVE',
};

if (Object.values(checks).some((passed) => !passed)) {
  throw new Error(
    JSON.stringify(
      { checks, plan, tasks, complete, records, completedTasks, recordDetail },
      null,
      2,
    ),
  );
}

console.log(
  'PLAN_TASK_RECORD_FLOW_OK',
  JSON.stringify({
    taskScope,
    planId: plan.body.id,
    taskId: task.id,
    recordId: complete.body.record.id,
    checks,
  }),
);
