import { execFileSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { URL } from 'node:url';

const APP_NAME = '猫伴日记';
const BUNDLE_ID = 'com.haruka.catdiary';
const LOCAL_METRO_URL = 'http://127.0.0.1:8081';
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? process.env.IOS_API_URL;
const IOS_METRO_URL = process.env.IOS_METRO_URL;
const localHostnames = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

const args = new Set(process.argv.slice(2));

if (args.has('--help') || args.has('-h')) {
  console.log(`iOS Development Build 真机调试预检

Usage:
  EXPO_PUBLIC_API_URL='http://开发机局域网IP:3000/api/v1' pnpm ios:preflight
  EXPO_PUBLIC_API_URL='http://开发机局域网IP:3000/api/v1' \\
    IOS_METRO_URL='http://开发机局域网IP:8081' pnpm ios:preflight

Environment:
  EXPO_PUBLIC_API_URL  iPhone 可访问的开发 API，必须以 /api/v1 结尾。
  IOS_API_URL          EXPO_PUBLIC_API_URL 的本地预检别名；App 实际仍读取 EXPO_PUBLIC_API_URL。
  IOS_METRO_URL        可选。iPhone 可访问的 Metro 地址，用于生成 Development Client 深链。

Notes:
  iPhone 真机不能访问 Mac 上的 localhost/127.0.0.1。请让 iPhone 与 Mac 接入同一 Wi-Fi，
  并使用 Mac 的局域网 IPv4 启动 API 和 Metro。${APP_NAME} 的 Bundle ID 为 ${BUNDLE_ID}。
`);
  process.exit(0);
}

let failed = false;

function print(status, message) {
  const icon = status === 'ok' ? '✓' : status === 'warn' ? '!' : '✗';
  console.log(`${icon} ${message}`);
}

function ok(message) {
  print('ok', message);
}

function warn(message) {
  print('warn', message);
}

function fail(message) {
  failed = true;
  print('fail', message);
}

function run(command, commandArgs, options = {}) {
  try {
    return execFileSync(command, commandArgs, {
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

function parsePhysicalIosDevices(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /(iPhone|iPad|iPod)/i.test(line))
    .filter((line) => !/Simulator/i.test(line))
    .filter((line) => /\([0-9A-Fa-f-]{20,}\)$/.test(line));
}

function localIpv4Candidates() {
  const ignoredInterfaces = /^(lo|utun|awdl|llw|bridge|gif|stf|anpi)/i;
  return Object.entries(networkInterfaces())
    .filter(([name]) => !ignoredInterfaces.test(name))
    .flatMap(([name, addresses]) =>
      (addresses ?? [])
        .filter((address) => address.family === 'IPv4' && !address.internal)
        .map((address) => ({ name, address: address.address })),
    );
}

function parseUrl(value, name) {
  try {
    return new URL(value);
  } catch {
    fail(`${name} 必须是绝对 URL：${value}`);
    return undefined;
  }
}

function isLocalHost(hostname) {
  return localHostnames.has(hostname.toLowerCase());
}

function normalizeBaseUrl(value) {
  return value.replace(/\/$/, '');
}

function appendPath(baseUrl, path) {
  return `${normalizeBaseUrl(baseUrl)}${path}`;
}

function validateApiUrl() {
  if (!API_URL) {
    fail(
      '未设置 EXPO_PUBLIC_API_URL。iPhone 真机不会使用 iOS 的 127.0.0.1 fallback，请用开发机局域网 IPv4 启动 Metro。',
    );
    return undefined;
  }

  const url = parseUrl(API_URL, 'EXPO_PUBLIC_API_URL');
  if (!url) return undefined;

  if (url.username || url.password || url.search || url.hash) {
    fail('EXPO_PUBLIC_API_URL 不得包含账号密码、查询参数或 fragment。');
    return undefined;
  }
  if (!url.pathname.replace(/\/$/, '').endsWith('/api/v1')) {
    fail('EXPO_PUBLIC_API_URL 必须以 /api/v1 结尾。');
    return undefined;
  }
  if (isLocalHost(url.hostname) || url.hostname === '10.0.2.2') {
    fail('iPhone 真机不能访问 localhost、127.0.0.1 或 Android Emulator 专用的 10.0.2.2。');
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    fail('EXPO_PUBLIC_API_URL 必须使用 http 或 https。');
    return undefined;
  }

  ok(`开发 API 地址格式有效：${normalizeBaseUrl(API_URL)}`);
  return normalizeBaseUrl(API_URL);
}

function validateMetroUrl() {
  if (!IOS_METRO_URL) {
    warn(
      '未设置 IOS_METRO_URL；将只检查本机 Metro。若 Development Client 没有自动发现项目，请设置后重试以生成深链。',
    );
    return undefined;
  }

  const url = parseUrl(IOS_METRO_URL, 'IOS_METRO_URL');
  if (!url) return undefined;

  if (url.username || url.password || url.search || url.hash) {
    fail('IOS_METRO_URL 不得包含账号密码、查询参数或 fragment。');
    return undefined;
  }
  if (isLocalHost(url.hostname)) {
    fail('IOS_METRO_URL 不能使用 localhost/127.0.0.1，iPhone 真机需要局域网 IP 或可访问域名。');
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    fail('IOS_METRO_URL 必须使用 http 或 https。');
    return undefined;
  }

  ok(`Metro 真机地址格式有效：${normalizeBaseUrl(IOS_METRO_URL)}`);
  return normalizeBaseUrl(IOS_METRO_URL);
}

async function checkHttp(url, label, expectedText) {
  const controller = new globalThis.AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 3000);
  try {
    const response = await globalThis.fetch(url, { signal: controller.signal });
    const body = await response.text();
    if (!response.ok) {
      fail(`${label} 返回 HTTP ${response.status}：${url}`);
      return;
    }
    if (expectedText && !body.includes(expectedText)) {
      fail(`${label} 响应不包含预期内容 ${expectedText}：${url}`);
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

function printNetworkHints() {
  const candidates = localIpv4Candidates();
  if (candidates.length === 0) {
    warn(
      '未检测到可用局域网 IPv4。请确认 Mac 已连接 Wi-Fi 或有线网络，且 iPhone 与 Mac 在同一网络。',
    );
    return;
  }

  console.log('\n可尝试的局域网地址：');
  for (const candidate of candidates) {
    console.log(`- ${candidate.name}: ${candidate.address}`);
  }
  console.log(
    "\n示例：EXPO_PUBLIC_API_URL='http://上方IP:3000/api/v1' IOS_METRO_URL='http://上方IP:8081' pnpm ios:preflight",
  );
}

function checkXcodeTooling() {
  try {
    const version = run('xcrun', ['--version']);
    ok(`xcrun 可用：${version}`);
  } catch (error) {
    fail(`xcrun 不可用：${error.message}`);
    return;
  }

  try {
    const version = run('xcodebuild', ['-version']);
    ok(`Xcode 命令行工具可用：${version.split(/\r?\n/).join(' / ')}`);
  } catch (error) {
    fail(`xcodebuild 不可用：${error.message}`);
  }

  try {
    const devicesOutput = run('xcrun', ['xctrace', 'list', 'devices']);
    const devices = parsePhysicalIosDevices(devicesOutput);
    if (devices.length === 0) {
      fail('未发现已连接并信任的 iPhone/iPad 真机。请插线、解锁设备，并在手机上信任当前电脑。');
      return;
    }
    ok(`发现 ${devices.length} 台 iOS 真机：${devices.join('；')}`);
  } catch (error) {
    fail(`无法读取 iOS 设备列表：${error.message}`);
  }
}

async function main() {
  console.log('iOS Development Build 真机调试预检');
  printNetworkHints();
  checkXcodeTooling();

  const apiUrl = validateApiUrl();
  const metroUrl = validateMetroUrl();

  await checkHttp(appendPath(LOCAL_METRO_URL, '/status'), '本机 Metro status', 'packager-status');
  if (metroUrl)
    await checkHttp(
      appendPath(metroUrl, '/status'),
      'iPhone 可访问的 Metro status',
      'packager-status',
    );
  if (apiUrl)
    await checkHttp(appendPath(apiUrl, '/health/live'), 'iPhone 可访问的 API health/live', 'ok');

  if (metroUrl) {
    const devClientUrl = `exp+catdiary://expo-development-client/?url=${encodeURIComponent(metroUrl)}`;
    console.log(`\nDevelopment Client 深链：${devClientUrl}`);
    console.log(
      '如果 iPhone 上的 Development Build 没有自动发现项目，可在 iPhone Safari 中打开该深链。',
    );
  }

  if (failed) {
    console.log('\n预检未通过。按上方失败项修复后重试。');
    process.exit(1);
  }

  console.log('\n预检通过。可以在 iPhone Development Build 中加载当前 Metro 项目并开始真机回归。');
}

await main();
