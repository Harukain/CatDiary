import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const verifier = resolve(import.meta.dirname, 'verify-device-acceptance-evidence.mjs');
const script = resolve(import.meta.dirname, 'apply-android-smoke-evidence.mjs');
const templatePath = resolve(root, 'docs/DEVICE_ACCEPTANCE_EVIDENCE.example.json');

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    process.exit(0);
  }
  if (options.selfCheck) {
    runSelfCheck();
    process.exit(0);
  }

  const result = applyAndroidSmokeEvidence(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`ANDROID_SMOKE_EVIDENCE_APPLIED ${JSON.stringify(result)}`);
} catch (error) {
  console.error(
    `ANDROID_SMOKE_EVIDENCE_INVALID\n- ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}

function applyAndroidSmokeEvidence({ file, smokeFile, json: _json }) {
  if (!file) throw new Error('--file 需要真机验收草稿 JSON 路径');
  if (!smokeFile) throw new Error('--smoke-file 需要 android:smoke 证据 JSON 路径');

  const evidencePath = resolvePath(file);
  const smokePath = resolvePath(smokeFile);

  if (!existsSync(evidencePath)) throw new Error(`真机验收草稿不存在：${evidencePath}`);
  if (!existsSync(smokePath)) throw new Error(`Android smoke 证据不存在：${smokePath}`);

  const evidence = readJson(evidencePath, '真机验收草稿');
  const smoke = readJson(smokePath, 'Android smoke 证据');

  validateDeviceEvidence(evidence);
  validateSmokeEvidence(smoke);

  if (evidence.sourceCommit !== smoke.sourceCommit) {
    throw new Error(
      `证据 commit 不一致：验收草稿 ${evidence.sourceCommit}，smoke ${smoke.sourceCommit}`,
    );
  }

  const androidRun = evidence.deviceRuns.find((item) => item.platform === 'android');
  if (!androidRun) throw new Error('真机验收草稿缺少 android deviceRuns 记录');

  androidRun.checkedAt = smoke.createdAt;
  androidRun.device = {
    ...androidRun.device,
    identifier: smoke.device.identifier,
  };

  if (smoke.preflight.status === 'passed') {
    androidRun.preflight = {
      ...androidRun.preflight,
      command: smoke.preflight.command,
      status: 'passed',
      evidence: `Android smoke 已完成预检：API ${smoke.appRuntime.apiPort}，Metro ${smoke.appRuntime.metroPort}；证据文件 ${relativeToRoot(smokePath)}`,
    };
  }

  androidRun.logs = {
    ...androidRun.logs,
    jsCrashFree: true,
    nativeCrashFree: true,
    evidence: `Android smoke 观察 ${smoke.appRuntime.observedMs}ms，未发现 AndroidRuntime/FATAL EXCEPTION/RN JS 启动崩溃；证据文件 ${relativeToRoot(smokePath)}`,
  };

  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

  const verification = runVerifier(evidencePath);
  if (verification.status !== 0) {
    throw new Error(
      `合并后的验收草稿未通过结构校验：${verification.stderr || verification.stdout || 'unknown error'}`,
    );
  }

  return {
    file: evidencePath,
    smokeFile: smokePath,
    sourceCommit: evidence.sourceCommit,
    androidPreflightStatus: androidRun.preflight.status,
    androidJsCrashFree: androidRun.logs.jsCrashFree,
    androidNativeCrashFree: androidRun.logs.nativeCrashFree,
  };
}

function validateDeviceEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new Error('真机验收草稿根节点必须是 JSON object');
  }
  if (evidence.evidenceType !== 'cat-diary-device-acceptance') {
    throw new Error('真机验收草稿 evidenceType 必须为 cat-diary-device-acceptance');
  }
  if (!/^[a-f0-9]{40}$/i.test(String(evidence.sourceCommit ?? ''))) {
    throw new Error('真机验收草稿 sourceCommit 必须是 40 位 Git SHA');
  }
  if (!Array.isArray(evidence.deviceRuns)) {
    throw new Error('真机验收草稿 deviceRuns 必须是数组');
  }
}

function validateSmokeEvidence(smoke) {
  if (!smoke || typeof smoke !== 'object' || Array.isArray(smoke)) {
    throw new Error('Android smoke 证据根节点必须是 JSON object');
  }
  if (smoke.evidenceType !== 'cat-diary-android-smoke') {
    throw new Error('Android smoke 证据 evidenceType 必须为 cat-diary-android-smoke');
  }
  if (!/^[a-f0-9]{40}$/i.test(String(smoke.sourceCommit ?? ''))) {
    throw new Error('Android smoke 证据 sourceCommit 必须是 40 位 Git SHA');
  }
  if (smoke.platform !== 'android') throw new Error('Android smoke 证据 platform 必须为 android');
  if (smoke.status !== 'passed') throw new Error('Android smoke 证据 status 必须为 passed');
  if (smoke.packageName !== 'com.haruka.catdiary') {
    throw new Error('Android smoke 证据 packageName 必须为 com.haruka.catdiary');
  }
  if (smoke.preflight?.status !== 'passed' && smoke.preflight?.status !== 'not-run') {
    throw new Error('Android smoke 证据 preflight.status 必须为 passed 或 not-run');
  }
  if (smoke.logs?.jsCrashFree !== true || smoke.logs?.nativeCrashFree !== true) {
    throw new Error('Android smoke 证据必须标记 JS 与原生启动崩溃检查通过');
  }
  if (!/^redacted/.test(String(smoke.device?.identifier ?? ''))) {
    throw new Error('Android smoke 证据 device.identifier 必须脱敏');
  }
  if (!Number.isInteger(smoke.appRuntime?.observedMs) || smoke.appRuntime.observedMs <= 0) {
    throw new Error('Android smoke 证据 appRuntime.observedMs 必须是正整数');
  }
  for (const key of ['apiPort', 'metroPort']) {
    const value = smoke.appRuntime?.[key];
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
      throw new Error(`Android smoke 证据 appRuntime.${key} 必须是 1-65535 的整数`);
    }
  }
}

function runSelfCheck() {
  const tmp = mkdtempSync(join(tmpdir(), 'catdiary-android-smoke-evidence-'));
  try {
    const currentHead = readCurrentGitHead();
    if (!currentHead) throw new Error('无法读取当前 Git HEAD');

    const draftPath = join(tmp, 'device-evidence.json');
    const smokePath = join(tmp, 'android-smoke.json');
    const staleSmokePath = join(tmp, 'android-smoke-stale.json');

    const draft = {
      ...JSON.parse(readFileSync(templatePath, 'utf8')),
      sourceCommit: currentHead,
      createdAt: '2026-07-17T12:00:00+08:00',
    };
    writeFileSync(draftPath, `${JSON.stringify(draft, null, 2)}\n`);

    const smoke = smokeFixture(currentHead);
    writeFileSync(smokePath, `${JSON.stringify(smoke, null, 2)}\n`);
    writeFileSync(staleSmokePath, `${JSON.stringify(smokeFixture('0'.repeat(40)), null, 2)}\n`);

    const applied = runScript(['--file', draftPath, '--smoke-file', smokePath, '--json']);
    const after = JSON.parse(readFileSync(draftPath, 'utf8'));
    const androidRun = after.deviceRuns.find((item) => item.platform === 'android');
    const strictRejected = runVerifierRaw(['--file', draftPath, '--require-passed']);
    const staleRejected = runScript(['--file', draftPath, '--smoke-file', staleSmokePath]);

    const checks = {
      appliesEvidence: applied.status === 0,
      androidPreflightPassed: androidRun?.preflight?.status === 'passed',
      androidLogsCrashFree:
        androidRun?.logs?.jsCrashFree === true && androidRun?.logs?.nativeCrashFree === true,
      doesNotMarkMvpFlowsPassed: after.mvpFlows.every((item) => item.status === 'pending'),
      templateValidationStillPasses: runVerifier(draftPath).status === 0,
      strictStillRequiresFullAcceptance:
        strictRejected.status !== 0 && strictRejected.stderr.includes('严格模式'),
      rejectsStaleSmoke:
        staleRejected.status !== 0 && staleRejected.stderr.includes('证据 commit 不一致'),
    };

    if (!Object.values(checks).every(Boolean)) {
      console.error(`ANDROID_SMOKE_EVIDENCE_SELF_CHECK_INVALID ${JSON.stringify(checks)}`);
      process.exit(1);
    }

    console.log(`ANDROID_SMOKE_EVIDENCE_SELF_CHECK_OK ${JSON.stringify(checks)}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function smokeFixture(sourceCommit) {
  return {
    schemaVersion: 1,
    evidenceType: 'cat-diary-android-smoke',
    sourceCommit,
    createdAt: '2026-07-17T12:00:00+08:00',
    platform: 'android',
    status: 'passed',
    packageName: 'com.haruka.catdiary',
    device: {
      identifier: 'redacted-last4-40dd',
    },
    appRuntime: {
      apiPort: 3310,
      metroPort: 8082,
      devClientUrl: 'exp+catdiary://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8082',
      pid: '14401',
      observedMs: 12000,
    },
    preflight: {
      status: 'passed',
      command: 'ANDROID_API_PORT=3310 ANDROID_METRO_PORT=8082 pnpm android:preflight -- --fix',
    },
    logs: {
      jsCrashFree: true,
      nativeCrashFree: true,
      evidence: 'self-check fixture',
    },
    command:
      'ANDROID_API_PORT=3310 ANDROID_METRO_PORT=8082 ANDROID_SMOKE_DURATION_MS=12000 pnpm android:smoke -- --evidence-file <redacted-local-path>',
  };
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`无法读取或解析${label}：${error.message}`, { cause: error });
  }
}

function runVerifier(path) {
  return runVerifierRaw(['--file', path, '--allow-template']);
}

function runVerifierRaw(args) {
  return spawnSync(process.execPath, [verifier, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { PATH: process.env.PATH },
  });
}

function runScript(args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { PATH: process.env.PATH },
  });
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

function resolvePath(value) {
  return isAbsolute(value) ? value : resolve(root, value);
}

function relativeToRoot(path) {
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}

function parseArgs(argv) {
  const parsed = {
    file: undefined,
    smokeFile: undefined,
    json: false,
    selfCheck: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--json') parsed.json = true;
    else if (arg === '--self-check') parsed.selfCheck = true;
    else if (arg === '--file') {
      parsed.file = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--smoke-file') {
      parsed.smokeFile = requireArg(argv, index, arg);
      index += 1;
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }

  return parsed;
}

function requireArg(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} 需要参数`);
  return value;
}

function printHelp() {
  console.log(`Android smoke 证据合并工具

Usage:
  pnpm acceptance:android-smoke-evidence -- --file docs/device-acceptance/2026-07-17-development-build.json --smoke-file docs/device-acceptance/android-smoke.json

Options:
  --file <path>        真机验收草稿 JSON。
  --smoke-file <path>  pnpm android:smoke -- --evidence-file 生成的 JSON。
  --json              输出 JSON 摘要。
  --self-check        只运行脚本自检，不读取真实设备。

说明：
  本工具只更新 Android deviceRuns 中的预检状态和崩溃日志状态。
  它不会把 14 条 MVP 主流程、权限、照片、推送、飞书或离线验收标记为通过。
`);
}
