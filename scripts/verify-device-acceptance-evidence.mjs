import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';
import { REQUIRED_DEVICE_CHECKS, REQUIRED_MVP_FLOWS } from './acceptance-definitions.mjs';

const root = resolve(import.meta.dirname, '..');
const defaultEvidencePath = resolve(root, 'docs/DEVICE_ACCEPTANCE_EVIDENCE.example.json');

const allowedStatuses = new Set(['pending', 'passed', 'failed', 'blocked', 'not-applicable']);
const acceptedPlatforms = new Set(['ios', 'android']);
const acceptedSeverities = new Set(['P0', 'P1', 'P2', 'P3']);

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`DEVICE_ACCEPTANCE_EVIDENCE_INVALID\n- ${error.message}`);
  process.exit(1);
}
if (options.help) {
  console.log(`真机验收证据校验

Usage:
  pnpm acceptance:evidence-template
  pnpm acceptance:evidence -- --file docs/device-acceptance/2026-07-iphone-android.json
  pnpm acceptance:evidence -- --file docs/device-acceptance/2026-07-iphone-android.json --require-passed

Options:
  --file <path>       要校验的证据 JSON。默认校验模板。
  --allow-template    允许 pending 和“待填写”占位，仅用于模板。
  --require-passed    发布前严格模式：双平台设备、14 条主流程和设备专项检查必须通过。
  --json              输出 JSON 摘要。
`);
  process.exit(0);
}

const evidencePath = resolvePath(options.file ?? defaultEvidencePath);
const allowTemplate = options.allowTemplate || evidencePath === defaultEvidencePath;
const requirePassed = options.requirePassed;
const errors = [];

if (allowTemplate && requirePassed) {
  errors.push('--allow-template 和 --require-passed 不能同时使用');
}

let evidence;
let raw;
try {
  raw = readFileSync(evidencePath, 'utf8');
  evidence = JSON.parse(raw);
} catch (error) {
  console.error(`DEVICE_ACCEPTANCE_EVIDENCE_INVALID\n- 无法读取或解析证据文件：${error.message}`);
  process.exit(1);
}

detectSensitiveStrings(raw);
validateTopLevel(evidence);
validateDeviceRuns(evidence.deviceRuns ?? []);
validateItems('mvpFlows', evidence.mvpFlows ?? [], REQUIRED_MVP_FLOWS);
validateItems('deviceChecks', evidence.deviceChecks ?? [], REQUIRED_DEVICE_CHECKS);
validateOpenIssues(evidence.openIssues ?? []);

if (!allowTemplate) detectPlaceholders(evidence);

const summary = {
  file: evidencePath,
  mode: requirePassed ? 'require-passed' : allowTemplate ? 'template' : 'structure',
  deviceRuns: Array.isArray(evidence.deviceRuns) ? evidence.deviceRuns.length : 0,
  mvpFlows: Array.isArray(evidence.mvpFlows) ? evidence.mvpFlows.length : 0,
  deviceChecks: Array.isArray(evidence.deviceChecks) ? evidence.deviceChecks.length : 0,
  openIssues: Array.isArray(evidence.openIssues) ? evidence.openIssues.length : 0,
};

if (errors.length > 0) {
  if (options.json) console.log(JSON.stringify({ ok: false, summary, errors }, null, 2));
  else {
    console.error('DEVICE_ACCEPTANCE_EVIDENCE_INVALID');
    for (const error of errors) console.error(`- ${error}`);
  }
  process.exit(1);
}

if (options.json) console.log(JSON.stringify({ ok: true, summary }, null, 2));
else console.log(`DEVICE_ACCEPTANCE_EVIDENCE_OK ${JSON.stringify(summary)}`);

function parseArgs(argv) {
  const parsed = {
    file: undefined,
    allowTemplate: false,
    requirePassed: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--allow-template') parsed.allowTemplate = true;
    else if (arg === '--require-passed') parsed.requirePassed = true;
    else if (arg === '--json') parsed.json = true;
    else if (arg === '--file') {
      const value = argv[index + 1];
      if (!value) throw new Error('--file 需要路径参数');
      parsed.file = value;
      index += 1;
    } else if (!arg.startsWith('--') && !parsed.file) {
      parsed.file = arg;
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }

  return parsed;
}

function resolvePath(value) {
  return isAbsolute(value) ? value : resolve(root, value);
}

function fail(message) {
  errors.push(message);
}

function validateTopLevel(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('证据根节点必须是 JSON object');
    return;
  }
  if (value.schemaVersion !== 1) fail('schemaVersion 必须为 1');
  if (value.evidenceType !== 'cat-diary-device-acceptance')
    fail('evidenceType 必须为 cat-diary-device-acceptance');
  requireString(value, 'sourceCommit');
  validateSourceCommit(value.sourceCommit);
  requireString(value, 'createdAt');
  if (!value.environment || typeof value.environment !== 'object')
    fail('environment 必须是 object');
  if (!Array.isArray(value.deviceRuns)) fail('deviceRuns 必须是数组');
  if (!Array.isArray(value.mvpFlows)) fail('mvpFlows 必须是数组');
  if (!Array.isArray(value.deviceChecks)) fail('deviceChecks 必须是数组');
  if (!Array.isArray(value.openIssues)) fail('openIssues 必须是数组');
}

function validateSourceCommit(sourceCommit) {
  if (allowTemplate && /待填写|待确认|<[^>]+>/.test(String(sourceCommit))) return;
  if (!/^[a-f0-9]{40}$/i.test(String(sourceCommit ?? ''))) {
    fail('sourceCommit 必须填写 40 位 Git commit SHA');
    return;
  }
  if (!requirePassed) return;
  const currentHead = readCurrentGitHead();
  if (!currentHead) {
    fail('严格模式无法读取当前 Git HEAD，不能确认真机证据对应当前代码');
    return;
  }
  if (sourceCommit.toLowerCase() !== currentHead.toLowerCase()) {
    fail(`严格模式要求 sourceCommit 等于当前 HEAD：${currentHead}`);
  }
}

function readCurrentGitHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  const value = result.stdout.trim();
  return /^[a-f0-9]{40}$/i.test(value) ? value : null;
}

function validateDeviceRuns(deviceRuns) {
  const platformSet = new Set();
  for (const [index, run] of deviceRuns.entries()) {
    const prefix = `deviceRuns[${index}]`;
    if (!run || typeof run !== 'object' || Array.isArray(run)) {
      fail(`${prefix} 必须是 object`);
      continue;
    }
    if (!acceptedPlatforms.has(run.platform)) fail(`${prefix}.platform 必须是 ios 或 android`);
    else platformSet.add(run.platform);
    requireString(run, 'checkedAt', prefix);
    requireString(run, 'tester', prefix);
    if (!run.device || typeof run.device !== 'object') fail(`${prefix}.device 必须是 object`);
    else {
      requireString(run.device, 'model', `${prefix}.device`);
      requireString(run.device, 'osVersion', `${prefix}.device`);
      requireString(run.device, 'screen', `${prefix}.device`);
    }
    if (!run.appBuild || typeof run.appBuild !== 'object') fail(`${prefix}.appBuild 必须是 object`);
    else {
      requireString(run.appBuild, 'profile', `${prefix}.appBuild`);
      requireString(run.appBuild, 'buildUrl', `${prefix}.appBuild`);
    }
    if (!run.preflight || typeof run.preflight !== 'object')
      fail(`${prefix}.preflight 必须是 object`);
    else validateStatus(run.preflight.status, `${prefix}.preflight.status`);
    if (!run.logs || typeof run.logs !== 'object') fail(`${prefix}.logs 必须是 object`);
    else if (requirePassed) {
      if (run.logs.jsCrashFree !== true) fail(`${prefix}.logs.jsCrashFree 必须为 true`);
      if (run.logs.nativeCrashFree !== true) fail(`${prefix}.logs.nativeCrashFree 必须为 true`);
    }
  }

  if (requirePassed) {
    for (const platform of acceptedPlatforms) {
      if (!platformSet.has(platform)) fail(`严格模式缺少 ${platform} 真机记录`);
    }
    for (const [index, run] of deviceRuns.entries()) {
      if (run?.preflight?.status !== 'passed')
        fail(`严格模式要求 deviceRuns[${index}].preflight.status 为 passed`);
    }
  }
}

function validateItems(name, items, requiredDefinitions) {
  const seen = new Set();
  const requiredById = new Map(requiredDefinitions.map((item) => [item.id, item]));
  for (const [index, item] of items.entries()) {
    const prefix = `${name}[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      fail(`${prefix} 必须是 object`);
      continue;
    }
    requireString(item, 'id', prefix);
    requireString(item, 'title', prefix);
    const requiredItem = requiredById.get(item.id);
    if (requiredItem && item.title !== requiredItem.title) {
      fail(`${prefix}.title 必须为“${requiredItem.title}”，当前为“${item.title}”`);
    }
    validateStatus(item.status, `${prefix}.status`);
    if (typeof item.evidence !== 'string' || item.evidence.trim().length === 0)
      fail(`${prefix}.evidence 必须填写证据说明、日志路径或截图说明`);
    if (item.id) seen.add(item.id);
    if (requirePassed && item.status !== 'passed')
      fail(`严格模式要求 ${prefix}（${item.id ?? 'unknown'}）状态为 passed`);
  }

  for (const { id } of requiredDefinitions) {
    if (!seen.has(id)) fail(`${name} 缺少必需项：${id}`);
  }
}

function validateOpenIssues(openIssues) {
  for (const [index, issue] of openIssues.entries()) {
    const prefix = `openIssues[${index}]`;
    if (!issue || typeof issue !== 'object' || Array.isArray(issue)) {
      fail(`${prefix} 必须是 object`);
      continue;
    }
    if (!acceptedSeverities.has(issue.severity)) fail(`${prefix}.severity 必须是 P0/P1/P2/P3`);
    requireString(issue, 'title', prefix);
    requireString(issue, 'owner', prefix);
    requireString(issue, 'targetVersion', prefix);
    if (requirePassed && (issue.severity === 'P0' || issue.severity === 'P1'))
      fail(`严格模式不允许遗留 ${issue.severity} 问题：${issue.title ?? prefix}`);
  }
}

function validateStatus(status, path) {
  if (!allowedStatuses.has(status)) fail(`${path} 必须是 ${Array.from(allowedStatuses).join('/')}`);
}

function requireString(object, key, prefix = '') {
  const path = prefix ? `${prefix}.${key}` : key;
  if (typeof object?.[key] !== 'string' || object[key].trim().length === 0)
    fail(`${path} 必须是非空字符串`);
}

function detectSensitiveStrings(rawJson) {
  const findings = [];
  if (/-----BEGIN [A-Z ]+PRIVATE KEY-----/.test(rawJson)) findings.push('包含私钥头');
  if (/\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i.test(rawJson)) findings.push('疑似 Bearer Token');
  if (/\b(?:sk|gh[pousr]|xox[baprs])_[A-Za-z0-9_-]{16,}\b/i.test(rawJson))
    findings.push('疑似 API Token');
  if (
    /"(?:password|secret|secretKey|secretId|token|privateKey|accessKey|refreshToken|expoPushToken)"\s*:\s*"(?!待填写|待确认|redacted|已脱敏|<redacted>|N\/A)[^"]{8,}"/i.test(
      rawJson,
    )
  )
    findings.push('疑似敏感字段写入明文值');
  for (const finding of findings) fail(`证据文件疑似包含敏感信息：${finding}`);
}

function detectPlaceholders(value, path = '$') {
  if (typeof value === 'string') {
    if (/待填写|待确认|<[^>]+>/.test(value)) fail(`${path} 仍包含占位内容：${value}`);
    return;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) detectPlaceholders(item, `${path}[${index}]`);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) detectPlaceholders(item, `${path}.${key}`);
  }
}
