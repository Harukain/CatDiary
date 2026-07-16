import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { URL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const verifier = resolve(import.meta.dirname, 'verify-device-acceptance-evidence.mjs');
const script = resolve(import.meta.dirname, 'apply-ios-preflight-evidence.mjs');
const templatePath = resolve(root, 'docs/DEVICE_ACCEPTANCE_EVIDENCE.example.json');
const localHostnames = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '10.0.2.2']);

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

  const result = applyIosPreflightEvidence(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`IOS_PREFLIGHT_EVIDENCE_APPLIED ${JSON.stringify(result)}`);
} catch (error) {
  console.error(
    `IOS_PREFLIGHT_EVIDENCE_INVALID\n- ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}

function applyIosPreflightEvidence({ file, preflightFile, json: _json }) {
  if (!file) throw new Error('--file 需要真机验收草稿 JSON 路径');
  if (!preflightFile) throw new Error('--preflight-file 需要 ios:preflight 证据 JSON 路径');

  const evidencePath = resolvePath(file);
  const preflightPath = resolvePath(preflightFile);

  if (!existsSync(evidencePath)) throw new Error(`真机验收草稿不存在：${evidencePath}`);
  if (!existsSync(preflightPath)) throw new Error(`iOS preflight 证据不存在：${preflightPath}`);

  const evidence = readJson(evidencePath, '真机验收草稿');
  const preflight = readJson(preflightPath, 'iOS preflight 证据');

  validateDeviceEvidence(evidence);
  validatePreflightEvidence(preflight);

  if (evidence.sourceCommit !== preflight.sourceCommit) {
    throw new Error(
      `证据 commit 不一致：验收草稿 ${evidence.sourceCommit}，preflight ${preflight.sourceCommit}`,
    );
  }

  const iosRun = evidence.deviceRuns.find((item) => item.platform === 'ios');
  if (!iosRun) throw new Error('真机验收草稿缺少 ios deviceRuns 记录');

  iosRun.checkedAt = preflight.createdAt;
  iosRun.device = {
    ...iosRun.device,
    model: preflight.device.model,
    osVersion: preflight.device.osVersion,
    screen: preflight.device.screen,
    identifier: preflight.device.identifier,
  };
  iosRun.appBuild = {
    ...iosRun.appBuild,
    ...(preflight.appBuild.profile ? { profile: preflight.appBuild.profile } : {}),
    version: preflight.appBuild.version,
    runtimeVersion: preflight.appBuild.runtimeVersion,
  };
  iosRun.preflight = {
    ...iosRun.preflight,
    command: preflight.preflight.command,
    status: 'passed',
    evidence: `iOS preflight 已完成：API ${preflight.appRuntime.apiUrl}，Metro ${preflight.appRuntime.metroUrl}；证据文件 ${relativeToRoot(
      preflightPath,
    )}`,
  };

  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

  const verification = runVerifier(evidencePath);
  if (verification.status !== 0) {
    throw new Error(
      `合并后的验收草稿未通过结构校验：${
        verification.stderr || verification.stdout || 'unknown error'
      }`,
    );
  }

  return {
    file: evidencePath,
    preflightFile: preflightPath,
    sourceCommit: evidence.sourceCommit,
    iosPreflightStatus: iosRun.preflight.status,
    iosJsCrashFree: iosRun.logs.jsCrashFree,
    iosNativeCrashFree: iosRun.logs.nativeCrashFree,
    iosDeviceModel: iosRun.device.model,
    iosAppVersion: iosRun.appBuild.version,
    iosRuntimeVersion: iosRun.appBuild.runtimeVersion,
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

function validatePreflightEvidence(preflight) {
  if (!preflight || typeof preflight !== 'object' || Array.isArray(preflight)) {
    throw new Error('iOS preflight 证据根节点必须是 JSON object');
  }
  if (preflight.evidenceType !== 'cat-diary-ios-preflight') {
    throw new Error('iOS preflight 证据 evidenceType 必须为 cat-diary-ios-preflight');
  }
  if (!/^[a-f0-9]{40}$/i.test(String(preflight.sourceCommit ?? ''))) {
    throw new Error('iOS preflight 证据 sourceCommit 必须是 40 位 Git SHA');
  }
  if (preflight.platform !== 'ios') throw new Error('iOS preflight 证据 platform 必须为 ios');
  if (preflight.status !== 'passed') throw new Error('iOS preflight 证据 status 必须为 passed');
  if (preflight.bundleIdentifier !== 'com.haruka.catdiary') {
    throw new Error('iOS preflight 证据 bundleIdentifier 必须为 com.haruka.catdiary');
  }
  if (preflight.preflight?.status !== 'passed') {
    throw new Error('iOS preflight 证据 preflight.status 必须为 passed');
  }
  if (!/^redacted/.test(String(preflight.device?.identifier ?? ''))) {
    throw new Error('iOS preflight 证据 device.identifier 必须脱敏');
  }
  requireEvidenceString(preflight.device, 'model', 'device');
  requireEvidenceString(preflight.device, 'osVersion', 'device');
  requireEvidenceString(preflight.device, 'screen', 'device');
  requireEvidenceString(preflight.appBuild, 'version', 'appBuild');
  requireEvidenceString(preflight.appBuild, 'runtimeVersion', 'appBuild');
  if (preflight.appBuild?.profile !== undefined) {
    requireEvidenceString(preflight.appBuild, 'profile', 'appBuild');
  }
  requireEvidenceUrl(preflight.appRuntime, 'apiUrl');
  requireEvidenceUrl(preflight.appRuntime, 'metroUrl');
  requireEvidenceUrl(preflight.appRuntime, 'devClientUrl', { allowCustomScheme: true });
}

function requireEvidenceString(object, key, prefix) {
  const value = object?.[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`iOS preflight 证据 ${prefix}.${key} 必须是非空字符串`);
  }
  if (/待填写|待确认|<[^>]+>/.test(value)) {
    throw new Error(`iOS preflight 证据 ${prefix}.${key} 不能包含占位内容`);
  }
  return value.trim();
}

function requireEvidenceUrl(object, key, options = {}) {
  const value = requireEvidenceString(object, key, 'appRuntime');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`iOS preflight 证据 appRuntime.${key} 必须是绝对 URL`);
  }
  if (options.allowCustomScheme && url.protocol === 'exp+catdiary:') {
    if (url.username || url.password || url.hash) {
      throw new Error(`iOS preflight 证据 appRuntime.${key} 不得包含账号密码或 fragment`);
    }
    return value;
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`iOS preflight 证据 appRuntime.${key} 不得包含账号密码、查询参数或 fragment`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`iOS preflight 证据 appRuntime.${key} 必须使用 http 或 https`);
  }
  if (localHostnames.has(url.hostname.toLowerCase())) {
    throw new Error(`iOS preflight 证据 appRuntime.${key} 不能使用本机或 Android Emulator 地址`);
  }
  return value;
}

function runSelfCheck() {
  const tmp = mkdtempSync(join(tmpdir(), 'catdiary-ios-preflight-evidence-'));
  try {
    const currentHead = readCurrentGitHead();
    if (!currentHead) throw new Error('无法读取当前 Git HEAD');

    const draftPath = join(tmp, 'device-evidence.json');
    const preflightPath = join(tmp, 'ios-preflight.json');
    const stalePreflightPath = join(tmp, 'ios-preflight-stale.json');

    const draft = {
      ...JSON.parse(readFileSync(templatePath, 'utf8')),
      sourceCommit: currentHead,
      createdAt: '2026-07-17T12:00:00+08:00',
    };
    writeFileSync(draftPath, `${JSON.stringify(draft, null, 2)}\n`);

    const preflight = preflightFixture(currentHead);
    writeFileSync(preflightPath, `${JSON.stringify(preflight, null, 2)}\n`);
    writeFileSync(
      stalePreflightPath,
      `${JSON.stringify(preflightFixture('0'.repeat(40)), null, 2)}\n`,
    );

    const applied = runScript(['--file', draftPath, '--preflight-file', preflightPath, '--json']);
    const after = JSON.parse(readFileSync(draftPath, 'utf8'));
    const iosRun = after.deviceRuns.find((item) => item.platform === 'ios');
    const strictRejected = runVerifierRaw(['--file', draftPath, '--require-passed']);
    const staleRejected = runScript(['--file', draftPath, '--preflight-file', stalePreflightPath]);

    const checks = {
      appliesEvidence: applied.status === 0,
      iosPreflightPassed: iosRun?.preflight?.status === 'passed',
      iosDeviceMetadataApplied:
        iosRun?.device?.model === 'iPhone 15' &&
        iosRun?.device?.osVersion === 'iOS 18.5' &&
        iosRun?.device?.screen === '393x852',
      iosAppBuildApplied:
        iosRun?.appBuild?.version === '1.0.0' && iosRun?.appBuild?.runtimeVersion === '1.0.0',
      doesNotMarkIosLogsPassed:
        iosRun?.logs?.jsCrashFree === false && iosRun?.logs?.nativeCrashFree === false,
      doesNotMarkMvpFlowsPassed: after.mvpFlows.every((item) => item.status === 'pending'),
      templateValidationStillPasses: runVerifier(draftPath).status === 0,
      strictStillRequiresFullAcceptance:
        strictRejected.status !== 0 && strictRejected.stderr.includes('严格模式'),
      rejectsStalePreflight:
        staleRejected.status !== 0 && staleRejected.stderr.includes('证据 commit 不一致'),
    };

    if (!Object.values(checks).every(Boolean)) {
      console.error(`IOS_PREFLIGHT_EVIDENCE_SELF_CHECK_INVALID ${JSON.stringify(checks)}`);
      process.exit(1);
    }

    console.log(`IOS_PREFLIGHT_EVIDENCE_SELF_CHECK_OK ${JSON.stringify(checks)}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function preflightFixture(sourceCommit) {
  return {
    schemaVersion: 1,
    evidenceType: 'cat-diary-ios-preflight',
    sourceCommit,
    createdAt: '2026-07-17T12:00:00+08:00',
    platform: 'ios',
    status: 'passed',
    bundleIdentifier: 'com.haruka.catdiary',
    device: {
      identifier: 'redacted-last4-801E',
      model: 'iPhone 15',
      osVersion: 'iOS 18.5',
      screen: '393x852',
    },
    appBuild: {
      profile: 'development',
      version: '1.0.0',
      runtimeVersion: '1.0.0',
    },
    appRuntime: {
      apiUrl: 'http://192.0.2.10:3310/api/v1',
      metroUrl: 'http://192.0.2.10:8082',
      devClientUrl: 'exp+catdiary://expo-development-client/?url=http%3A%2F%2F192.0.2.10%3A8082',
    },
    preflight: {
      status: 'passed',
      command:
        "EXPO_PUBLIC_API_URL='http://192.0.2.10:3310/api/v1' IOS_METRO_URL='http://192.0.2.10:8082' pnpm ios:preflight -- --screen <redacted-screen-size> --evidence-file <redacted-local-path>",
    },
    command:
      "EXPO_PUBLIC_API_URL='http://192.0.2.10:3310/api/v1' IOS_METRO_URL='http://192.0.2.10:8082' pnpm ios:preflight -- --screen <redacted-screen-size> --evidence-file <redacted-local-path>",
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
    preflightFile: undefined,
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
    } else if (arg === '--preflight-file') {
      parsed.preflightFile = requireArg(argv, index, arg);
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
  console.log(`iOS preflight 证据合并工具

Usage:
  pnpm acceptance:ios-preflight-evidence -- --file docs/device-acceptance/2026-07-17-development-build.json --preflight-file docs/device-acceptance/ios-preflight.json

Options:
  --file <path>            真机验收草稿 JSON。
  --preflight-file <path>  pnpm ios:preflight -- --evidence-file 生成的 JSON。
  --json                  输出 JSON 摘要。
  --self-check            只运行脚本自检，不读取真实设备。

说明：
  本工具只更新 iOS deviceRuns 中的设备信息、App 版本和预检状态。
  它不会把 iOS 崩溃日志、14 条 MVP 主流程、权限、照片、推送、飞书或离线验收标记为通过。
`);
}
