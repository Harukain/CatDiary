import { execFileSync } from 'node:child_process';

const PACKAGE_NAME = 'com.haruka.catdiary';
const DEFAULT_DURATION_MS = 12_000;
const MIN_DURATION_MS = 3_000;
const MAX_DURATION_MS = 60_000;

const help = process.argv.includes('--help') || process.argv.includes('-h');
const selfCheck = process.argv.includes('--self-check');
const skipPreflight = process.argv.includes('--skip-preflight');
const skipLaunch = process.argv.includes('--skip-launch');

if (help) {
  console.log(`Android Development Build 真机冒烟检查

Usage:
  pnpm android:smoke
  ANDROID_API_PORT=3310 ANDROID_METRO_PORT=8082 pnpm android:smoke
  pnpm android:smoke -- --skip-launch

Options:
  --skip-preflight  不执行 android:preflight，直接读取设备日志。
  --skip-launch     不重新发送 Development Client 深链，只检查当前进程和日志。
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

function suspiciousLogLines(logcat) {
  return logcat
    .split('\n')
    .filter((line) => fatalPatterns.some((pattern) => pattern.test(line)))
    .slice(-80);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  console.log(
    `ANDROID_SMOKE_OK ${JSON.stringify({
      serial: device.serial,
      packageName: PACKAGE_NAME,
      apiPort: API_PORT,
      metroPort: METRO_PORT,
      observedMs: DURATION_MS,
      pid: pidAfterWindow,
    })}`,
  );
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

  if (!crashMatches || !cleanMatches) {
    throw new Error('Android smoke 崩溃识别规则自检失败');
  }

  console.log(
    `ANDROID_SMOKE_SELF_CHECK_OK ${JSON.stringify({
      crashMatches,
      cleanMatches,
      defaultDurationMs: DEFAULT_DURATION_MS,
    })}`,
  );
}

await main();
