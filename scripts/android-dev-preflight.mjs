import { execFileSync } from 'node:child_process';

const PACKAGE_NAME = 'com.haruka.catdiary';
const fix = process.argv.includes('--fix');
const launch = process.argv.includes('--launch');

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`Android Development Build 调试预检

Usage:
  pnpm android:preflight
  pnpm android:preflight -- --fix
  pnpm android:preflight -- --fix --launch

Options:
  --fix      自动配置 adb reverse tcp:<ANDROID_METRO_PORT> 和 tcp:<ANDROID_API_PORT>。
  --launch   预检通过后用 Expo Development Client 深链打开当前项目。

Environment:
  ANDROID_SERIAL=<serial>  多台设备时指定目标设备。
  ANDROID_API_PORT=3000    本机 API 端口，默认 3000。
  ANDROID_METRO_PORT=8081  本机 Metro 端口，默认 8081。
`);
  process.exit(0);
}

const API_PORT = readPort('ANDROID_API_PORT', 3000);
const METRO_PORT = readPort('ANDROID_METRO_PORT', 8081);
const API_HEALTH_URL = `http://127.0.0.1:${API_PORT}/api/v1/health/live`;
const METRO_STATUS_URL = `http://127.0.0.1:${METRO_PORT}/status`;
const DEV_CLIENT_URL = `exp+catdiary://expo-development-client/?url=${encodeURIComponent(
  `http://127.0.0.1:${METRO_PORT}`,
)}`;
const REQUIRED_REVERSES = [
  [`tcp:${METRO_PORT}`, `tcp:${METRO_PORT}`, `Metro ${METRO_PORT}`],
  [`tcp:${API_PORT}`, `tcp:${API_PORT}`, `API ${API_PORT}`],
];

let failed = false;

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

function print(status, message) {
  const icon = status === 'ok' ? '✓' : status === 'warn' ? '!' : '✗';
  console.log(`${icon} ${message}`);
}

function fail(message) {
  failed = true;
  print('fail', message);
}

function warn(message) {
  print('warn', message);
}

function ok(message) {
  print('ok', message);
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

function selectedDevice(devices) {
  const requested = process.env.ANDROID_SERIAL;
  if (requested) {
    const device = devices.find((item) => item.serial === requested);
    if (!device) fail(`ANDROID_SERIAL=${requested} 未在 adb devices 中找到`);
    return device;
  }
  const ready = devices.filter((item) => item.state === 'device');
  if (ready.length > 1) {
    warn(
      `检测到 ${ready.length} 台已授权设备；默认使用 ${ready[0].serial}，可设置 ANDROID_SERIAL 指定`,
    );
  }
  return ready[0];
}

function adb(serial, args) {
  return run('adb', ['-s', serial, ...args]);
}

function ensureReverse(serial, local, remote, label) {
  const reverseList = adb(serial, ['reverse', '--list']);
  const expected = `${local} ${remote}`;
  if (reverseList.includes(expected)) {
    ok(`${label} reverse 已存在：${expected}`);
    return;
  }

  if (!fix) {
    fail(
      `${label} reverse 缺失：请执行 pnpm android:preflight -- --fix 或 adb reverse ${local} ${remote}`,
    );
    return;
  }

  adb(serial, ['reverse', local, remote]);
  ok(`${label} reverse 已配置：${expected}`);
}

function launchDevelopmentClient(serial) {
  try {
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
    ok(`已向 ${PACKAGE_NAME} 发送 Development Client 深链：${DEV_CLIENT_URL}`);
  } catch (error) {
    fail(`Development Client 深链启动失败：${error.message}`);
  }
}

async function checkHttp(url, label, expectedText) {
  const controller = new globalThis.AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 2500);
  try {
    const response = await globalThis.fetch(url, { signal: controller.signal });
    const body = await response.text();
    if (!response.ok) {
      fail(`${label} 返回 HTTP ${response.status}，地址：${url}`);
      return;
    }
    if (expectedText && !body.includes(expectedText)) {
      warn(`${label} 可访问，但响应不包含预期内容：${expectedText}`);
      return;
    }
    ok(`${label} 可访问：${url}`);
  } catch (error) {
    fail(
      `${label} 不可访问：${url}（${error.name === 'AbortError' ? '请求超时' : error.message}）`,
    );
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function main() {
  console.log('Android Development Build 调试预检');

  let devices;
  try {
    devices = listDevices();
  } catch (error) {
    fail(`ADB 不可用：${error.message}`);
    console.log('处理：确认 Android Platform Tools 已安装，并在非沙箱终端执行。');
    process.exit(1);
  }

  if (devices.length === 0) {
    fail('未发现 Android 设备。请插入手机，开启 USB 调试，并在手机上允许当前电脑。');
    process.exit(1);
  }

  for (const device of devices.filter((item) => item.state !== 'device')) {
    fail(`设备未就绪：${device.line}`);
  }

  const device = selectedDevice(devices);
  if (!device) process.exit(1);
  ok(`使用设备：${device.serial}`);

  try {
    const packagePath = adb(device.serial, ['shell', 'pm', 'path', PACKAGE_NAME]);
    ok(`已安装 ${PACKAGE_NAME}：${packagePath.split('\n')[0]}`);
  } catch {
    fail(`未安装 ${PACKAGE_NAME}。请先安装 Android Development Build APK。`);
  }

  for (const [local, remote, label] of REQUIRED_REVERSES) {
    try {
      ensureReverse(device.serial, local, remote, label);
    } catch (error) {
      fail(`${label} reverse 检查失败：${error.message}`);
    }
  }

  await checkHttp(API_HEALTH_URL, '本机 API health/live', 'ok');
  await checkHttp(METRO_STATUS_URL, '本机 Metro status', 'packager-status');

  if (failed) {
    console.log('\n预检未通过。按上方失败项修复后重试。');
    process.exit(1);
  }

  if (launch) launchDevelopmentClient(device.serial);

  if (failed) {
    console.log('\n预检通过，但 Development Client 启动失败。按上方失败项修复后重试。');
    process.exit(1);
  }

  console.log(
    launch
      ? '\n预检通过，已请求 Android Development Build 加载 Metro 项目。'
      : '\n预检通过。可在 Android Development Build 中加载 Metro 项目并开始真机回归；需要自动打开时执行 pnpm android:preflight -- --fix --launch。',
  );
}

await main();
