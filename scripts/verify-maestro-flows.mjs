import { readFile } from 'node:fs/promises';
import {
  APP_ID,
  MAESTRO_FLOWS,
  REQUIRED_MAESTRO_SCRIPTS,
  REQUIRED_MVP_FLOWS,
} from './acceptance-definitions.mjs';

const flows = MAESTRO_FLOWS;

const errors = [];
const phoneDefaults = new Map();
const requiredMvpFlowIds = new Set(REQUIRED_MVP_FLOWS.map((flow) => flow.id));
const coveredMvpFlowIds = new Set();

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

  if (!Array.isArray(flow.mvpFlowIds) || flow.mvpFlowIds.length === 0) {
    fail(`${flow.file}: missing mvpFlowIds`);
  } else {
    for (const flowId of flow.mvpFlowIds) {
      if (!requiredMvpFlowIds.has(flowId))
        fail(`${flow.file}: unknown mvpFlowId ${flowId} in shared acceptance definitions`);
      coveredMvpFlowIds.add(flowId);
    }
  }

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
for (const [name, expected] of Object.entries(REQUIRED_MAESTRO_SCRIPTS)) {
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
    mvpFlowIds: coveredMvpFlowIds.size,
    defaultPhones: phoneDefaults.size,
    appId: APP_ID,
  })}`,
);
