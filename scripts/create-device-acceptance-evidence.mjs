import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { URL } from 'node:url';
import { REQUIRED_DEVICE_CHECKS, REQUIRED_MVP_FLOWS } from './acceptance-definitions.mjs';

const root = resolve(import.meta.dirname, '..');
const verifier = resolve(import.meta.dirname, 'verify-device-acceptance-evidence.mjs');
const script = resolve(import.meta.dirname, 'create-device-acceptance-evidence.mjs');

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

  const result = createDraft(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`DEVICE_ACCEPTANCE_EVIDENCE_DRAFT_CREATED ${JSON.stringify(result)}`);
    console.log(
      `下一步：完成真机回归后执行 pnpm acceptance:evidence -- --file ${result.relativeOutput} --require-passed`,
    );
  }
} catch (error) {
  console.error(
    `DEVICE_ACCEPTANCE_EVIDENCE_DRAFT_INVALID\n- ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}

function createDraft(options) {
  const sourceCommit = readCurrentGitHead();
  if (!sourceCommit) throw new Error('无法读取当前 Git HEAD');

  if (!options.allowDirty) {
    const dirty = readGitDirtyFiles();
    if (dirty.length > 0) {
      throw new Error(
        `当前工作区不干净，不能生成可复现真机验收草稿。请先提交或暂存改动；临时调试可加 --allow-dirty。未提交项：${dirty.slice(0, 5).join('，')}${dirty.length > 5 ? ` 等 ${dirty.length} 项` : ''}`,
      );
    }
  }

  const output = resolvePath(options.output ?? defaultOutputPath());
  if (existsSync(output) && !options.force) {
    throw new Error(`证据草稿已存在：${output}。如需覆盖，请加 --force`);
  }

  const evidence = buildDraft({
    sourceCommit,
    appEnvironment: options.appEnvironment,
    apiUrl: options.apiUrl,
    tester: options.tester,
    iosBuildUrl: options.iosBuildUrl,
    androidBuildUrl: options.androidBuildUrl,
  });

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);

  const verification = runVerifier(output);
  if (verification.status !== 0) {
    throw new Error(
      `生成后的草稿未通过模板校验：${verification.stderr || verification.stdout || 'unknown error'}`,
    );
  }

  return {
    output,
    relativeOutput: relativeToRoot(output),
    sourceCommit,
    appEnvironment: evidence.environment.appEnvironment,
    mvpFlows: evidence.mvpFlows.length,
    deviceChecks: evidence.deviceChecks.length,
    deviceRuns: evidence.deviceRuns.length,
  };
}

function buildDraft({
  sourceCommit,
  appEnvironment,
  apiUrl,
  tester,
  iosBuildUrl,
  androidBuildUrl,
}) {
  const createdAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    evidenceType: 'cat-diary-device-acceptance',
    sourceCommit,
    createdAt,
    environment: {
      appEnvironment,
      apiBaseUrl: apiUrl ?? '待填写：只写 URL，不写任何 Token、密码或密钥',
      database: appEnvironment === 'development' ? 'local-development' : 'preview',
      notes:
        '由 pnpm acceptance:evidence-draft 生成。真实验收文件保存在 docs/device-acceptance/ 下，该目录已被 git 忽略。',
    },
    deviceRuns: [
      deviceRunDraft({
        platform: 'ios',
        tester,
        buildUrl: iosBuildUrl,
        command:
          "EXPO_PUBLIC_API_URL='http://开发机局域网IP:3000/api/v1' IOS_METRO_URL='http://开发机局域网IP:8081' pnpm ios:preflight",
      }),
      deviceRunDraft({
        platform: 'android',
        tester,
        buildUrl: androidBuildUrl,
        command: 'pnpm android:preflight -- --fix --launch',
      }),
    ],
    mvpFlows: REQUIRED_MVP_FLOWS.map((item) => ({
      id: item.id,
      title: item.title,
      status: 'pending',
      evidence: evidenceHintForFlow(item.id),
    })),
    deviceChecks: REQUIRED_DEVICE_CHECKS.map((item) => ({
      id: item.id,
      title: item.title,
      status: 'pending',
      evidence: evidenceHintForDeviceCheck(item.id),
    })),
    openIssues: [],
  };
}

function deviceRunDraft({ platform, tester, buildUrl, command }) {
  const isIos = platform === 'ios';
  return {
    platform,
    checkedAt: '待填写：YYYY-MM-DDTHH:mm:ss+08:00',
    tester,
    device: {
      model: isIos ? '待填写：例如 iPhone 15' : '待填写：例如 OPPO PKG110',
      osVersion: isIos ? '待填写：例如 iOS 18.5' : '待填写：例如 Android 15',
      screen: isIos ? '待填写：例如 393x852' : '待填写：例如 360dp / 1080x2376',
      identifier: 'redacted-last4',
    },
    appBuild: {
      profile: 'development',
      buildUrl: buildUrl ?? '待填写：EAS build 页面 URL 或内部构建编号',
      version: '待填写',
      runtimeVersion: '待填写',
    },
    preflight: {
      command,
      status: 'pending',
      evidence: '待填写：预检输出保存路径或摘要',
    },
    logs: {
      jsCrashFree: false,
      nativeCrashFree: false,
      evidence: isIos
        ? '待填写：Xcode/console 日志摘要，不能粘贴敏感值'
        : '待填写：logcat 摘要，不能粘贴敏感值',
    },
  };
}

function evidenceHintForFlow(id) {
  const hints = {
    'login-otp': '待填写：手机号需脱敏，只记录固定开发验证码或真实短信验证码是否按预期工作',
    'task-concurrency': '待填写：物理双机结果或服务端门禁 run id',
    'photo-upload-filter': '待填写：不要写入照片原始隐私内容',
    'feishu-failure-retry': '待填写：只记录脱敏 Webhook 尾号或日志 id，不写 URL 全量密钥',
  };
  return hints[id] ?? '待填写';
}

function evidenceHintForDeviceCheck(id) {
  const hints = {
    'first-use-chain-regression':
      '待填写：同一台真机连续完成启动恢复态、手机号登录、创建家庭、创建第一只猫和家庭邀请 Deep Link，记录脱敏截图/录屏编号',
    'push-test-notification': '待填写：记录收到系统通知的时间、设备和脱敏截图编号',
    'push-privacy-lockscreen': '待填写：记录锁屏文案检查结果，不写猫名、药名或品牌',
    'release-cold-start': '待填写：记录目标真机、构建类型和冷启动耗时',
  };
  return hints[id] ?? '待填写';
}

function runSelfCheck() {
  const tmp = mkdtempSync(join(tmpdir(), 'catdiary-device-evidence-draft-'));
  try {
    const firstOutput = join(tmp, 'draft.json');
    const secondOutput = join(tmp, 'draft-force.json');
    const first = runGenerator([
      '--output',
      firstOutput,
      '--allow-dirty',
      '--api-url',
      'http://192.0.2.10:3000/api/v1',
      '--ios-build-url',
      'https://expo.dev/accounts/harukains-team/projects/catdiary/builds/ios-self-check',
      '--android-build-url',
      'https://expo.dev/artifacts/eas/android-self-check.apk',
      '--json',
    ]);
    const duplicate = runGenerator(['--output', firstOutput, '--allow-dirty']);
    const forced = runGenerator(['--output', secondOutput, '--allow-dirty', '--force', '--json']);
    const verified = runVerifier(firstOutput);
    const strictRejected = runRawVerifier(['--file', firstOutput, '--require-passed']);

    const checks = {
      createsDraft: first.status === 0 && existsSync(firstOutput),
      generatedDraftShape: hasExpectedDraft(firstOutput),
      rejectsDuplicateWithoutForce: duplicate.status !== 0 && duplicate.stderr.includes('已存在'),
      forceCreatesDraft: forced.status === 0 && existsSync(secondOutput),
      generatedDraftPassesTemplateValidation: verified.status === 0,
      strictRejectsPendingDraft:
        strictRejected.status !== 0 && strictRejected.stderr.includes('严格模式'),
    };

    if (!Object.values(checks).every(Boolean)) {
      console.error(
        `DEVICE_ACCEPTANCE_EVIDENCE_DRAFT_SELF_CHECK_INVALID ${JSON.stringify(checks)}`,
      );
      process.exit(1);
    }

    console.log(`DEVICE_ACCEPTANCE_EVIDENCE_DRAFT_SELF_CHECK_OK ${JSON.stringify(checks)}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function hasExpectedDraft(path) {
  try {
    const draft = JSON.parse(readFileSync(path, 'utf8'));
    return (
      draft.evidenceType === 'cat-diary-device-acceptance' &&
      /^[a-f0-9]{40}$/i.test(draft.sourceCommit) &&
      draft.deviceRuns.length === 2 &&
      draft.mvpFlows.length === REQUIRED_MVP_FLOWS.length &&
      draft.deviceChecks.length === REQUIRED_DEVICE_CHECKS.length &&
      draft.mvpFlows.every((item) => item.status === 'pending') &&
      draft.deviceChecks.every((item) => item.status === 'pending')
    );
  } catch {
    return false;
  }
}

function runGenerator(args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { PATH: process.env.PATH },
  });
}

function runVerifier(path) {
  return runRawVerifier(['--file', path, '--allow-template']);
}

function runRawVerifier(args) {
  return spawnSync(process.execPath, [verifier, ...args], {
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

function readGitDirtyFiles() {
  const result = spawnSync('git', ['status', '--porcelain'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error('无法读取 git status');
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function defaultOutputPath() {
  return resolve(
    root,
    'docs/device-acceptance',
    `${formatShanghaiDate(new Date())}-development-build.json`,
  );
}

function formatShanghaiDate(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function relativeToRoot(path) {
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}

function resolvePath(value) {
  return isAbsolute(value) ? value : resolve(root, value);
}

function parseArgs(argv) {
  const parsed = {
    output: undefined,
    force: false,
    allowDirty: false,
    json: false,
    selfCheck: false,
    help: false,
    appEnvironment: 'development',
    apiUrl: undefined,
    tester: '待填写',
    iosBuildUrl: undefined,
    androidBuildUrl: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--force') parsed.force = true;
    else if (arg === '--allow-dirty') parsed.allowDirty = true;
    else if (arg === '--json') parsed.json = true;
    else if (arg === '--self-check') parsed.selfCheck = true;
    else if (arg === '--output') {
      parsed.output = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--app-environment') {
      parsed.appEnvironment = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--api-url') {
      parsed.apiUrl = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--tester') {
      parsed.tester = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--ios-build-url') {
      parsed.iosBuildUrl = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--android-build-url') {
      parsed.androidBuildUrl = requireArg(argv, index, arg);
      index += 1;
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }

  if (!['development', 'preview'].includes(parsed.appEnvironment))
    throw new Error('--app-environment 只支持 development 或 preview');
  if (parsed.apiUrl) validatePublicUrlLike(parsed.apiUrl, '--api-url');
  if (parsed.iosBuildUrl) validatePublicUrlLike(parsed.iosBuildUrl, '--ios-build-url');
  if (parsed.androidBuildUrl) validatePublicUrlLike(parsed.androidBuildUrl, '--android-build-url');

  return parsed;
}

function validatePublicUrlLike(value, flag) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${flag} 必须是绝对 URL`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol))
    throw new Error(`${flag} 必须使用 http 或 https`);
  if (parsed.username || parsed.password) throw new Error(`${flag} 不得包含账号密码`);
}

function requireArg(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} 需要参数`);
  return value;
}

function printHelp() {
  console.log(`真机验收证据草稿生成器

Usage:
  pnpm acceptance:evidence-draft
  pnpm acceptance:evidence-draft -- --output docs/device-acceptance/2026-07-development-build.json
  pnpm acceptance:evidence-draft -- --api-url http://192.168.1.10:3000/api/v1 --tester Haruka

Options:
  --output <path>             输出路径，默认 docs/device-acceptance/YYYY-MM-DD-development-build.json
  --force                     允许覆盖已有草稿
  --allow-dirty               允许在工作区有未提交改动时生成，仅用于临时调试
  --app-environment <value>   development 或 preview，默认 development
  --api-url <url>             本轮真机连接的 API URL，只写公开 URL，不写 Token 或密钥
  --tester <name>             验收人，默认“待填写”
  --ios-build-url <url>       iOS EAS build URL 或内部构建编号 URL
  --android-build-url <url>   Android EAS build/artifact URL
  --json                      输出 JSON 摘要

生成后：
  1. 按真机结果填写 pending 项。
  2. 执行 pnpm acceptance:evidence -- --file <输出文件> --require-passed。
`);
}
