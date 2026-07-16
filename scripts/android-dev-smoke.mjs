import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

const PACKAGE_NAME = 'com.haruka.catdiary';
const DEFAULT_DURATION_MS = 12_000;
const MIN_DURATION_MS = 3_000;
const MAX_DURATION_MS = 60_000;
const root = resolve(import.meta.dirname, '..');

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`Android smoke 参数无效：${error.message}`);
  process.exit(1);
}

const { help, selfCheck, skipPreflight, skipLaunch, evidenceFile } = options;

if (help) {
  console.log(`Android Development Build 真机冒烟检查

Usage:
  pnpm android:smoke
  ANDROID_API_PORT=3310 ANDROID_METRO_PORT=8082 pnpm android:smoke
  pnpm android:smoke -- --skip-launch
  pnpm android:smoke -- --evidence-file docs/device-acceptance/android-smoke.json

Options:
  --skip-preflight  不执行 android:preflight，直接读取设备日志。
  --skip-launch     不重新发送 Development Client 深链，只检查当前进程和日志。
  --evidence-file    成功后写入脱敏 JSON 证据，可合并到真机验收草稿。
  --self-check      只验证本脚本的参数解析和崩溃识别规则，不连接设备。

Environment:
  ANDROID_SERIAL=<serial>       多台设备时指定目标设备。
  ANDROID_API_PORT=3000         本机 API 端口，默认 3000。
  ANDROID_METRO_PORT=8081       本机 Metro 端口，默认 8081。
  ANDROID_SMOKE_DURATION_MS=12000  观察窗口，3000-60000 毫秒。
`);
  process.exit(0);
}

const API_PORT = readPort('ANDROID_API_PORT', 3000);
const METRO_PORT = readPort('ANDROID_METRO_PORT', 8081);
const DURATION_MS = readDuration();
const DEV_CLIENT_URL = `exp+catdiary://expo-development-client/?url=${encodeURIComponent(
  `http://127.0.0.1:${METRO_PORT}`,
)}`;

const fatalPatterns = [
  /\bFATAL EXCEPTION\b/i,
  /\bAndroidRuntime\b/i,
  /\bJSApplicationIllegalArgumentException\b/i,
  /\bCould not get BatchedBridge\b/i,
  /\bUnable to resolve module\b/i,
  /\bInvariant Violation\b/i,
  /\bReactNativeJS\b.*\b(?:TypeError|ReferenceError|SyntaxError)\b/i,
];

if (selfCheck) {
  runSelfCheck();
  process.exit(0);
}

function readPort(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    console.error(`${name} 必须是 1-65535 的整数，当前值：${raw}`);
    process.exit(1);
  }
  return value;
}

function readDuration() {
  const raw = process.env.ANDROID_SMOKE_DURATION_MS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_DURATION_MS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < MIN_DURATION_MS || value > MAX_DURATION_MS) {
    console.error(
      `ANDROID_SMOKE_DURATION_MS 必须是 ${MIN_DURATION_MS}-${MAX_DURATION_MS} 的整数，当前值：${raw}`,
    );
    process.exit(1);
  }
  return value;
}

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    }).trim();
  } catch (error) {
    const stderr = error?.stderr?.toString?.().trim();
    const stdout = error?.stdout?.toString?.().trim();
    const detail = stderr || stdout || error.message;
    throw new Error(detail, { cause: error });
  }
}

function adb(serial, args) {
  return run('adb', ['-s', serial, ...args]);
}

function listDevices() {
  const output = run('adb', ['devices', '-l']);
  return output
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state] = line.split(/\s+/);
      return { serial, state, line };
    });
}

function selectedDevice() {
  const devices = listDevices();
  const requested = process.env.ANDROID_SERIAL;
  if (requested) {
    const device = devices.find((item) => item.serial === requested);
    if (!device) throw new Error(`ANDROID_SERIAL=${requested} 未在 adb devices 中找到`);
    if (device.state !== 'device') throw new Error(`设备未就绪：${device.line}`);
    return device;
  }

  const ready = devices.filter((item) => item.state === 'device');
  if (ready.length === 0) {
    const detail = devices.length
      ? devices.map((item) => item.line).join('；')
      : 'adb devices 为空';
    throw new Error(`未发现已授权 Android 设备：${detail}`);
  }
  if (ready.length > 1) {
    console.log(`! 检测到 ${ready.length} 台设备；默认使用 ${ready[0].serial}`);
  }
  return ready[0];
}

function launchDevelopmentClient(serial) {
  adb(serial, [
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    DEV_CLIENT_URL,
    PACKAGE_NAME,
  ]);
}

function pidOf(serial) {
  try {
    return adb(serial, ['shell', 'pidof', PACKAGE_NAME]).trim();
  } catch {
    return '';
  }
}

function readAndroidDeviceMetadata(serial) {
  const manufacturer = adb(serial, ['shell', 'getprop', 'ro.product.manufacturer']);
  const model = adb(serial, ['shell', 'getprop', 'ro.product.model']);
  const release = adb(serial, ['shell', 'getprop', 'ro.build.version.release']);
  const sdk = adb(serial, ['shell', 'getprop', 'ro.build.version.sdk']);
  const size = parseWmSize(adb(serial, ['shell', 'wm', 'size']));
  const density = parseWmDensity(adb(serial, ['shell', 'wm', 'density']));
  const screen = [size, density].filter(Boolean).join(' / ');

  return {
    model: requireNonEmpty(formatDeviceModel(manufacturer, model), 'Android 设备型号'),
    osVersion: requireNonEmpty(formatAndroidVersion(release, sdk), 'Android 系统版本'),
    screen: requireNonEmpty(screen, 'Android 屏幕信息'),
  };
}

function readAndroidAppBuildMetadata(serial) {
  const config = readMobileAppConfigVersion();
  const packageInfo = adb(serial, ['shell', 'dumpsys', 'package', PACKAGE_NAME]);
  const version = parsePackageVersionName(packageInfo) || config.appVersion;
  const runtimeVersion =
    config.runtimeVersionPolicy === 'appVersion' ? version : config.runtimeVersion;
  const versionCode = parsePackageVersionCode(packageInfo);

  return {
    profile: 'development',
    version: requireNonEmpty(version, 'Android App version'),
    runtimeVersion: requireNonEmpty(runtimeVersion, 'Android App runtimeVersion'),
    ...(versionCode ? { versionCode } : {}),
  };
}

function readMobileAppConfigVersion() {
  const appJsonPath = resolve(root, 'apps/mobile/app.json');
  const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8'));
  const appVersion = requireNonEmpty(appJson?.expo?.version, 'apps/mobile/app.json expo.version');
  const runtimeVersion = appJson?.expo?.runtimeVersion;

  if (runtimeVersion?.policy === 'appVersion') {
    return {
      appVersion,
      runtimeVersion: appVersion,
      runtimeVersionPolicy: 'appVersion',
    };
  }

  if (typeof runtimeVersion === 'string' && runtimeVersion.trim().length > 0) {
    return {
      appVersion,
      runtimeVersion: runtimeVersion.trim(),
      runtimeVersionPolicy: 'custom',
    };
  }

  throw new Error('apps/mobile/app.json 必须配置 runtimeVersion 或 runtimeVersion.policy');
}

function formatDeviceModel(manufacturer, model) {
  const normalizedManufacturer = String(manufacturer ?? '').trim();
  const normalizedModel = String(model ?? '').trim();
  if (!normalizedManufacturer) return normalizedModel;
  if (!normalizedModel) return normalizedManufacturer;
  if (normalizedModel.toLowerCase().includes(normalizedManufacturer.toLowerCase())) {
    return normalizedModel;
  }
  return `${normalizedManufacturer} ${normalizedModel}`;
}

function formatAndroidVersion(release, sdk) {
  const normalizedRelease = String(release ?? '').trim();
  const normalizedSdk = String(sdk ?? '').trim();
  if (!normalizedRelease) return normalizedSdk ? `Android API ${normalizedSdk}` : '';
  return normalizedSdk
    ? `Android ${normalizedRelease} (API ${normalizedSdk})`
    : `Android ${normalizedRelease}`;
}

function parseWmSize(output) {
  return parseFirstMatch(
    output,
    /Physical size:\s*([0-9]+x[0-9]+)/i,
    /Override size:\s*([0-9]+x[0-9]+)/i,
  );
}

function parseWmDensity(output) {
  const value = parseFirstMatch(
    output,
    /Physical density:\s*([0-9]+)/i,
    /Override density:\s*([0-9]+)/i,
  );
  return value ? `${value}dpi` : '';
}

function parsePackageVersionName(output) {
  return parseFirstMatch(output, /\bversionName=([^\s]+)/);
}

function parsePackageVersionCode(output) {
  return parseFirstMatch(output, /\bversionCode=([0-9]+)/);
}

function parseFirstMatch(output, ...patterns) {
  const source = String(output ?? '');
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function requireNonEmpty(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label} 为空，无法写入可用真机 smoke 证据`);
  return normalized;
}

function suspiciousLogLines(logcat) {
  return logcat
    .split('\n')
    .filter((line) => fatalPatterns.some((pattern) => pattern.test(line)))
    .slice(-80);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const parsed = {
    help: false,
    selfCheck: false,
    skipPreflight: false,
    skipLaunch: false,
    evidenceFile: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--self-check') parsed.selfCheck = true;
    else if (arg === '--skip-preflight') parsed.skipPreflight = true;
    else if (arg === '--skip-launch') parsed.skipLaunch = true;
    else if (arg === '--evidence-file') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--evidence-file 需要路径参数');
      parsed.evidenceFile = value;
      index += 1;
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }

  return parsed;
}

function resolvePath(value) {
  return isAbsolute(value) ? value : resolve(root, value);
}

function readCurrentGitHead() {
  try {
    const value = run('git', ['rev-parse', 'HEAD']);
    return /^[a-f0-9]{40}$/i.test(value) ? value : null;
  } catch {
    return null;
  }
}

function redactDeviceIdentifier(serial) {
  const normalized = String(serial ?? '').replace(/[^A-Za-z0-9_-]/g, '');
  if (normalized.length === 0) return 'redacted';
  return `redacted-last4-${normalized.slice(-4)}`;
}

function buildSmokeCommand() {
  const flags = [];
  if (skipPreflight) flags.push('--skip-preflight');
  if (skipLaunch) flags.push('--skip-launch');
  if (evidenceFile) flags.push('--evidence-file <redacted-local-path>');
  const suffix = flags.length > 0 ? ` -- ${flags.join(' ')}` : '';
  return `ANDROID_API_PORT=${API_PORT} ANDROID_METRO_PORT=${METRO_PORT} ANDROID_SMOKE_DURATION_MS=${DURATION_MS} pnpm android:smoke${suffix}`;
}

function writeEvidenceFile(outputPath, result) {
  const sourceCommit = readCurrentGitHead();
  if (!sourceCommit) {
    throw new Error('无法读取当前 Git HEAD，未写入真机 smoke 证据');
  }

  const output = resolvePath(outputPath);
  const evidence = {
    schemaVersion: 1,
    evidenceType: 'cat-diary-android-smoke',
    sourceCommit,
    createdAt: new Date().toISOString(),
    platform: 'android',
    status: 'passed',
    packageName: PACKAGE_NAME,
    device: {
      identifier: redactDeviceIdentifier(result.serial),
      ...readAndroidDeviceMetadata(result.serial),
    },
    appBuild: {
      ...readAndroidAppBuildMetadata(result.serial),
    },
    appRuntime: {
      apiPort: API_PORT,
      metroPort: METRO_PORT,
      devClientUrl: DEV_CLIENT_URL,
      pid: result.pid,
      observedMs: DURATION_MS,
    },
    preflight: {
      status: skipPreflight ? 'not-run' : 'passed',
      command: skipPreflight
        ? 'not-run: android:smoke was executed with --skip-preflight'
        : `ANDROID_API_PORT=${API_PORT} ANDROID_METRO_PORT=${METRO_PORT} pnpm android:preflight -- --fix`,
    },
    logs: {
      jsCrashFree: true,
      nativeCrashFree: true,
      evidence:
        'android:smoke cleared logcat, launched Development Client when requested, observed logcat, and found no configured Android/RN startup crash patterns.',
    },
    command: buildSmokeCommand(),
  };

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  return output;
}

async function main() {
  console.log('Android Development Build 真机冒烟检查');

  if (!skipPreflight) {
    console.log('> 执行 Android 预检并配置 USB reverse');
    execFileSync('node', ['scripts/android-dev-preflight.mjs', '--fix'], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    });
  }

  const device = selectedDevice();
  console.log(`✓ 使用设备：${device.serial}`);

  adb(device.serial, ['logcat', '-c']);
  console.log('✓ 已清空当前设备 logcat 缓冲区');

  if (!skipLaunch) {
    launchDevelopmentClient(device.serial);
    console.log(`✓ 已发送 Development Client 深链：${DEV_CLIENT_URL}`);
  }

  await sleep(1500);
  const pidAfterLaunch = pidOf(device.serial);
  if (!pidAfterLaunch) {
    throw new Error(`${PACKAGE_NAME} 进程未启动`);
  }
  console.log(`✓ App 进程运行中：${pidAfterLaunch}`);

  console.log(`> 观察 ${DURATION_MS}ms 内的 Android/RN 崩溃日志`);
  await sleep(DURATION_MS);

  const pidAfterWindow = pidOf(device.serial);
  if (!pidAfterWindow) {
    throw new Error(`${PACKAGE_NAME} 在观察窗口内退出`);
  }

  const logcat = adb(device.serial, ['logcat', '-d', '-t', '1200']);
  const suspicious = suspiciousLogLines(logcat);
  if (suspicious.length > 0) {
    console.error('\n检测到疑似崩溃日志：');
    console.error(suspicious.join('\n'));
    process.exit(1);
  }

  const result = {
    serial: device.serial,
    packageName: PACKAGE_NAME,
    apiPort: API_PORT,
    metroPort: METRO_PORT,
    observedMs: DURATION_MS,
    pid: pidAfterWindow,
  };

  if (evidenceFile) {
    const output = writeEvidenceFile(evidenceFile, result);
    console.log(`✓ 已写入脱敏 smoke 证据：${output}`);
  }

  console.log(`ANDROID_SMOKE_OK ${JSON.stringify(result)}`);
}

function runSelfCheck() {
  const sampleCrash = [
    '07-17 12:00:00.000 123 456 E AndroidRuntime: FATAL EXCEPTION: mqt_native_modules',
    '07-17 12:00:00.001 123 456 E ReactNativeJS: TypeError: Cannot read property x of undefined',
    '07-17 12:00:00.002 123 456 E ReactNativeJS: Invariant Violation: broken',
  ].join('\n');
  const sampleClean = [
    '07-17 12:00:00.000 123 456 I ActivityTaskManager: Displayed com.haruka.catdiary',
    '07-17 12:00:00.001 123 456 I Expo: App started',
  ].join('\n');

  const crashMatches = suspiciousLogLines(sampleCrash).length >= 2;
  const cleanMatches = suspiciousLogLines(sampleClean).length === 0;
  const parsesScreenSize =
    parseWmSize('Physical size: 1080x2376\nOverride size: 720x1584') === '1080x2376';
  const parsesScreenDensity =
    parseWmDensity('Physical density: 440\nOverride density: 320') === '440dpi';
  const parsesVersionName =
    parsePackageVersionName('versionCode=1000000 minSdk=23 targetSdk=35\nversionName=1.0.0') ===
    '1.0.0';
  const parsesVersionCode =
    parsePackageVersionCode('versionCode=1000000 minSdk=23 targetSdk=35') === '1000000';

  if (
    !crashMatches ||
    !cleanMatches ||
    !parsesScreenSize ||
    !parsesScreenDensity ||
    !parsesVersionName ||
    !parsesVersionCode
  ) {
    throw new Error('Android smoke 崩溃识别或元数据解析规则自检失败');
  }

  console.log(
    `ANDROID_SMOKE_SELF_CHECK_OK ${JSON.stringify({
      crashMatches,
      cleanMatches,
      parsesScreenSize,
      parsesScreenDensity,
      parsesVersionName,
      parsesVersionCode,
      defaultDurationMs: DEFAULT_DURATION_MS,
    })}`,
  );
}

await main();
