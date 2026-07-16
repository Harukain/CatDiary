import { readFile } from 'node:fs/promises';

const APP_ID = 'com.haruka.catdiary';

const flows = [
  {
    file: '.maestro/01-login-onboarding.yaml',
    tags: ['smoke', 'mvp'],
    env: ['CATDIARY_E2E_PHONE', 'CATDIARY_E2E_FAMILY', 'CATDIARY_E2E_PET'],
    ids: [
      'login.phone.input',
      'login.send-code.button',
      'login.code.input',
      'login.verify.button',
      'onboarding.family.name.input',
      'onboarding.family.submit.button',
      'onboarding.pet.name.input',
      'onboarding.pet.submit.button',
      'home.title',
    ],
  },
  {
    file: '.maestro/02-create-plan-complete-task.yaml',
    tags: ['smoke', 'mvp'],
    env: ['CATDIARY_E2E_PHONE', 'CATDIARY_E2E_FAMILY', 'CATDIARY_E2E_PET', 'CATDIARY_E2E_PLAN'],
    ids: [
      'quick-add.action.new-plan',
      'plan.type.LITTER',
      'plan.pet.public',
      'plan.frequency.daily',
      'tasks.scope.upcoming',
      'tasks.item.complete',
      'task-completion.sheet.title',
      'task-completion.submit.button',
      'tasks.undo.banner',
      'records.item',
    ],
  },
  {
    file: '.maestro/03-vomit-health-event.yaml',
    tags: ['smoke', 'mvp'],
    env: ['CATDIARY_E2E_PHONE', 'CATDIARY_E2E_FAMILY', 'CATDIARY_E2E_PET', 'CATDIARY_E2E_EVENT'],
    ids: [
      'quick-add.action.more-records',
      'record-new.type.VOMIT',
      'record-new.option.HAIRBALL',
      'record-new.blood.switch',
      'record-detail.create-health-event.button',
      'health-event-new.linked-record',
      'health-event-new.submit.button',
      'health-event-detail.record.item',
    ],
  },
  {
    file: '.maestro/04-weight-trend.yaml',
    tags: ['smoke', 'mvp'],
    env: ['CATDIARY_E2E_PHONE', 'CATDIARY_E2E_FAMILY', 'CATDIARY_E2E_PET'],
    ids: [
      'quick-add.action.weight',
      'record-new.occurred-date.input',
      'record-new.primary.input',
      'me.pets.button',
      'pets.item',
      'pet-detail.weight.card',
      'pet-detail.weight.latest',
      'pet-detail.weight.bar',
    ],
  },
  {
    file: '.maestro/05-logout-all.yaml',
    tags: ['smoke', 'mvp'],
    env: ['CATDIARY_E2E_PHONE', 'CATDIARY_E2E_FAMILY', 'CATDIARY_E2E_PET'],
    ids: ['me.account.button', 'account.title', 'account.logout-all.button', 'login.phone.input'],
  },
  {
    file: '.maestro/06-medical-next-reminder.yaml',
    tags: ['smoke', 'mvp'],
    env: [
      'CATDIARY_E2E_PHONE',
      'CATDIARY_E2E_FAMILY',
      'CATDIARY_E2E_PET',
      'CATDIARY_E2E_MEDICAL_TITLE',
    ],
    ids: [
      'pet-detail.quick-medical.button',
      'medical-records.add.button',
      'medical-new.type.VACCINE',
      'medical-new.occurred-date.input',
      'medical-new.next-date.input',
      'medical-records.next-date',
      'pet-detail.medical.next-due.item',
    ],
  },
  {
    file: '.maestro/07-data-export-medical-summary.yaml',
    tags: ['smoke', 'mvp'],
    env: [
      'CATDIARY_E2E_PHONE',
      'CATDIARY_E2E_FAMILY',
      'CATDIARY_E2E_PET',
      'CATDIARY_E2E_MEDICAL_TITLE',
    ],
    ids: [
      'medical-records.export.button',
      'medical-records.summary-ready.text',
      'medical-records.summary-share.button',
      'me.export.button',
      'export.generate.button',
      'export.ready.text',
      'export.share.button',
    ],
  },
  {
    file: '.maestro/08-family-invite-role.yaml',
    tags: ['smoke', 'mvp'],
    env: [
      'CATDIARY_E2E_OWNER_PHONE',
      'CATDIARY_E2E_MEMBER_PHONE',
      'CATDIARY_E2E_FAMILY',
      'CATDIARY_E2E_PET',
    ],
    ids: [
      'me.family-members.button',
      'family-members.invite-phone.input',
      'family-members.invite-submit.button',
      'family-members.dev-invite.link',
      'family-invite.accept.button',
      'family-members.member.role.button',
      'family-members.success.text',
    ],
    requiredText: ['copyTextFrom:', 'openLink: ${maestro.copiedText}', '设为管理员'],
  },
  {
    file: '.maestro/09-feishu-settings-notification-logs.yaml',
    tags: ['smoke', 'mvp'],
    env: ['CATDIARY_E2E_PHONE', 'CATDIARY_E2E_FAMILY', 'CATDIARY_E2E_PET'],
    ids: [
      'me.notifications.button',
      'notifications.feishu.button',
      'feishu.webhook.input',
      'feishu.back.button',
      'me.notification-logs.button',
      'notification-logs.filter.FAILED',
      'notification-logs.empty.card',
      'notification-logs.refresh.button',
    ],
    requiredText: ['https://example.com/open-apis/bot/v2/hook/maestro'],
  },
  {
    file: '.maestro-android/08-offline-record-sync.yaml',
    tags: ['android', 'offline', 'mvp'],
    env: [
      'CATDIARY_E2E_PHONE',
      'CATDIARY_E2E_FAMILY',
      'CATDIARY_E2E_PET',
      'CATDIARY_E2E_FOOD',
      'CATDIARY_E2E_NOTE',
    ],
    ids: [
      'quick-add.action.food',
      'record-new.primary.input',
      'record-new.secondary.input',
      'record-new.note.input',
      'records.route-notice.text',
      'records.sync.offline',
      'records.pending.badge',
      'records.sync.synced',
    ],
    requiredText: ['setAirplaneMode: enabled', 'setAirplaneMode: disabled'],
  },
];

const errors = [];
const phoneDefaults = new Map();

function fail(message) {
  errors.push(message);
}

function checkIncludes(content, expected, file, label) {
  if (!content.includes(expected)) fail(`${file}: missing ${label} "${expected}"`);
}

function parseEnv(content) {
  const env = new Map();
  const envBlock = content.match(/^env:\n(?<body>(?: {2}[A-Z0-9_]+: .+\n)+)/m)?.groups?.body ?? '';
  for (const line of envBlock.split('\n')) {
    const match = line.match(/^\s{2}(?<key>[A-Z0-9_]+):\s*['"]?(?<value>[^'"\n]+)['"]?\s*$/);
    if (match?.groups) env.set(match.groups.key, match.groups.value);
  }
  return env;
}

for (const flow of flows) {
  const content = await readFile(flow.file, 'utf8');
  const env = parseEnv(content);

  checkIncludes(content, `appId: ${APP_ID}`, flow.file, 'appId');
  checkIncludes(content, 'name:', flow.file, 'name');
  checkIncludes(content, '---', flow.file, 'document separator');
  checkIncludes(content, 'launchApp:', flow.file, 'launchApp');
  checkIncludes(content, 'clearState: true', flow.file, 'launchApp clearState');

  for (const tag of flow.tags) checkIncludes(content, `  - ${tag}`, flow.file, `tag`);
  for (const key of flow.env) {
    if (!env.has(key)) fail(`${flow.file}: missing env ${key}`);
  }
  for (const id of flow.ids) checkIncludes(content, `id: ${id}`, flow.file, 'testID');
  for (const text of flow.requiredText ?? [])
    checkIncludes(content, text, flow.file, 'required text');

  for (const [key, value] of env.entries()) {
    if (key.endsWith('PHONE')) {
      if (!/^1\d{10}$/.test(value)) fail(`${flow.file}: ${key} default must be 11-digit phone`);
      const owner = phoneDefaults.get(value);
      if (owner) fail(`${flow.file}: ${key} default phone ${value} duplicates ${owner}`);
      phoneDefaults.set(value, `${flow.file}:${key}`);
    }
  }
}

const runbook = await readFile('docs/APP_E2E_RUNBOOK.md', 'utf8');
for (const flow of flows)
  checkIncludes(runbook, flow.file, 'docs/APP_E2E_RUNBOOK.md', 'runbook flow');
checkIncludes(runbook, 'pnpm e2e:maestro', 'docs/APP_E2E_RUNBOOK.md', 'default Maestro command');
checkIncludes(
  runbook,
  'pnpm e2e:maestro:android-offline',
  'docs/APP_E2E_RUNBOOK.md',
  'Android offline Maestro command',
);

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const scripts = packageJson.scripts ?? {};
const requiredScripts = {
  'e2e:maestro': 'maestro test .maestro',
  'e2e:maestro:feishu-logs': 'maestro test .maestro/09-feishu-settings-notification-logs.yaml',
  'e2e:maestro:android-offline': 'maestro test .maestro-android/08-offline-record-sync.yaml',
};
for (const [name, expected] of Object.entries(requiredScripts)) {
  if (scripts[name] !== expected) fail(`package.json: script ${name} must be "${expected}"`);
}

const sensitivePattern =
  /(secret[_-]?id|secret[_-]?key|access[_-]?key|private[_-]?key|bearer\s+[a-z0-9._-]{12,}|sk-[a-z0-9_-]{16,})/i;
for (const flow of flows) {
  const content = await readFile(flow.file, 'utf8');
  if (sensitivePattern.test(content)) fail(`${flow.file}: looks like it contains a secret`);
}
if (sensitivePattern.test(runbook))
  fail('docs/APP_E2E_RUNBOOK.md: looks like it contains a secret');

if (errors.length > 0) {
  console.error('MAESTRO_FLOWS_INVALID');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `MAESTRO_FLOWS_OK ${JSON.stringify({
    flows: flows.length,
    defaultPhones: phoneDefaults.size,
    appId: APP_ID,
  })}`,
);
