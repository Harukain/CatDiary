import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, isAbsolute, resolve } from 'node:path';
import { URL } from 'node:url';

const APP_NAME = '猫伴日记';
const BUNDLE_ID = 'com.haruka.catdiary';
const LOCAL_METRO_URL = 'http://127.0.0.1:8081';
const root = resolve(import.meta.dirname, '..');
const localHostnames = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`iOS preflight 参数无效：${error.message}`);
  process.exit(1);
}

if (options.help) {
  console.log(`iOS Development Build 真机调试预检

Usage:
  EXPO_PUBLIC_API_URL='http://开发机局域网IP:3000/api/v1' pnpm ios:preflight
  EXPO_PUBLIC_API_URL='http://开发机局域网IP:3000/api/v1' \\
    IOS_METRO_URL='http://开发机局域网IP:8081' pnpm ios:preflight
  EXPO_PUBLIC_API_URL='http://开发机局域网IP:3000/api/v1' \\
    IOS_METRO_URL='http://开发机局域网IP:8081' \\
    pnpm ios:preflight -- --screen 393x852 --evidence-file docs/device-acceptance/ios-preflight.json

Environment:
  EXPO_PUBLIC_API_URL  iPhone 可访问的开发 API，必须以 /api/v1 结尾。
  IOS_API_URL          EXPO_PUBLIC_API_URL 的本地预检别名；App 实际仍读取 EXPO_PUBLIC_API_URL。
  IOS_METRO_URL        可选。iPhone 可访问的 Metro 地址，用于生成 Development Client 深链。

Options:
  --evidence-file <path>  预检通过后写入脱敏 JSON 证据，可合并到真机验收草稿。
  --screen <value>        iPhone 屏幕尺寸，例如 393x852；写入证据时必填。
  --device-model <value>  覆盖 xctrace 解析出的设备名称。
  --os-version <value>    覆盖 xctrace 解析出的 iOS 版本，例如 iOS 18.5。
  --self-check            只验证参数、设备解析和证据字段规则，不连接设备。

Notes:
  iPhone 真机不能访问 Mac 上的 localhost/127.0.0.1。请让 iPhone 与 Mac 接入同一 Wi-Fi，
  并使用 Mac 的局域网 IPv4 启动 API 和 Metro。${APP_NAME} 的 Bundle ID 为 ${BUNDLE_ID}。
`);
  process.exit(0);
}

if (options.selfCheck) {
  runSelfCheck();
  process.exit(0);
}

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? process.env.IOS_API_URL;
const IOS_METRO_URL = process.env.IOS_METRO_URL;
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

function parsePhysicalIosDeviceInfo(line) {
  const match = String(line)
    .trim()
    .match(/^(?<label>.+?)\s+\((?<identifier>[0-9A-Fa-f-]{20,})\)$/);
  if (!match?.groups) return undefined;

  const label = match.groups.label.trim();
  const osMatch = label.match(/^(?<model>.+?)\s+\((?<version>[0-9]+(?:\.[0-9]+){0,2})\)$/);
  return {
    model: (osMatch?.groups?.model ?? label).trim(),
    osVersion: osMatch?.groups?.version ? `iOS ${osMatch.groups.version}` : '',
    identifier: match.groups.identifier,
    raw: line,
  };
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
  let parsedDevices = [];
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
      return parsedDevices;
    }
    parsedDevices = devices.map(parsePhysicalIosDeviceInfo).filter(Boolean);
    ok(`发现 ${devices.length} 台 iOS 真机：${devices.join('；')}`);
  } catch (error) {
    fail(`无法读取 iOS 设备列表：${error.message}`);
  }

  return parsedDevices;
}

function buildPreflightCommand() {
  const env = [];
  if (API_URL) env.push(`EXPO_PUBLIC_API_URL='${normalizeBaseUrl(API_URL)}'`);
  if (IOS_METRO_URL) env.push(`IOS_METRO_URL='${normalizeBaseUrl(IOS_METRO_URL)}'`);
  const flags = [];
  if (options.evidenceFile) flags.push('--evidence-file <redacted-local-path>');
  if (options.screen) flags.push('--screen <redacted-screen-size>');
  if (options.deviceModel) flags.push('--device-model <redacted-device-model>');
  if (options.osVersion) flags.push('--os-version <redacted-ios-version>');
  const suffix = flags.length > 0 ? ` -- ${flags.join(' ')}` : '';
  return `${env.join(' ')}${env.length > 0 ? ' ' : ''}pnpm ios:preflight${suffix}`;
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

function redactDeviceIdentifier(identifier) {
  const normalized = String(identifier ?? '').replace(/[^A-Za-z0-9_-]/g, '');
  if (normalized.length === 0) return 'redacted';
  return `redacted-last4-${normalized.slice(-4)}`;
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

function requireNonEmpty(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label} 为空，无法写入可用 iOS preflight 证据`);
  if (/待填写|待确认|<[^>]+>/.test(normalized)) {
    throw new Error(`${label} 不能包含占位内容`);
  }
  return normalized;
}

function selectedDeviceForEvidence(devices) {
  if (!Array.isArray(devices) || devices.length === 0) {
    throw new Error('无法写入 iOS preflight 证据：未发现可用 iOS 真机');
  }
  if (devices.length > 1) {
    warn(`检测到 ${devices.length} 台 iOS 真机；证据默认使用第一台：${devices[0].model}`);
  }
  return devices[0];
}

function writeEvidenceFile(outputPath, result) {
  const sourceCommit = readCurrentGitHead();
  if (!sourceCommit) {
    throw new Error('无法读取当前 Git HEAD，未写入 iOS preflight 证据');
  }
  const device = selectedDeviceForEvidence(result.devices);
  const config = readMobileAppConfigVersion();
  const version = config.appVersion;
  const runtimeVersion =
    config.runtimeVersionPolicy === 'appVersion' ? version : config.runtimeVersion;
  const screen = requireNonEmpty(options.screen, 'iOS 设备屏幕尺寸');
  const model = requireNonEmpty(options.deviceModel ?? device.model, 'iOS 设备型号');
  const osVersion = requireNonEmpty(options.osVersion ?? device.osVersion, 'iOS 系统版本');
  const apiUrl = requireNonEmpty(result.apiUrl, 'iPhone 可访问 API URL');
  const metroUrl = requireNonEmpty(result.metroUrl, 'iPhone 可访问 Metro URL');
  const output = resolvePath(outputPath);
  const devClientUrl = `exp+catdiary://expo-development-client/?url=${encodeURIComponent(metroUrl)}`;
  const evidence = {
    schemaVersion: 1,
    evidenceType: 'cat-diary-ios-preflight',
    sourceCommit,
    createdAt: new Date().toISOString(),
    platform: 'ios',
    status: 'passed',
    bundleIdentifier: BUNDLE_ID,
    device: {
      identifier: redactDeviceIdentifier(device.identifier),
      model,
      osVersion,
      screen,
    },
    appBuild: {
      profile: 'development',
      version,
      runtimeVersion,
    },
    appRuntime: {
      apiUrl,
      metroUrl,
      devClientUrl,
    },
    preflight: {
      status: 'passed',
      command: buildPreflightCommand(),
      evidence:
        'ios:preflight checked Xcode tooling, trusted physical iOS device visibility, local Metro, iPhone-reachable Metro, and iPhone-reachable API health/live.',
    },
    command: buildPreflightCommand(),
  };

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  return output;
}

async function main() {
  console.log('iOS Development Build 真机调试预检');
  printNetworkHints();
  const devices = checkXcodeTooling();

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

  if (options.evidenceFile) {
    const output = writeEvidenceFile(options.evidenceFile, { devices, apiUrl, metroUrl });
    console.log(`✓ 已写入脱敏 iOS preflight 证据：${output}`);
  }

  console.log('\n预检通过。可以在 iPhone Development Build 中加载当前 Metro 项目并开始真机回归。');
}

function parseArgs(argv) {
  const parsed = {
    help: false,
    selfCheck: false,
    evidenceFile: undefined,
    screen: undefined,
    deviceModel: undefined,
    osVersion: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--self-check') parsed.selfCheck = true;
    else if (arg === '--evidence-file') {
      parsed.evidenceFile = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--screen') {
      parsed.screen = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--device-model') {
      parsed.deviceModel = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--os-version') {
      parsed.osVersion = requireArg(argv, index, arg);
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

function runSelfCheck() {
  const sample = [
    '== Devices ==',
    'Haruka’s iPhone (18.5) (00008110-001A2B3C4D5E801E)',
    'iPad Pro (17.6.1) (00008030-000C195E0E91802E)',
    'iPhone 16 Pro Simulator (18.5) (11111111-2222-3333-4444-555555555555)',
  ].join('\n');
  const devices = parsePhysicalIosDevices(sample);
  const first = parsePhysicalIosDeviceInfo(devices[0]);
  const parsedArgs = parseArgs([
    '--',
    '--evidence-file',
    'docs/device-acceptance/ios-preflight.json',
    '--screen',
    '393x852',
    '--device-model',
    'iPhone 15',
    '--os-version',
    'iOS 18.5',
  ]);
  const checks = {
    filtersPhysicalDevices: devices.length === 2,
    parsesModel: first?.model === 'Haruka’s iPhone',
    parsesOsVersion: first?.osVersion === 'iOS 18.5',
    redactsIdentifier: redactDeviceIdentifier(first?.identifier) === 'redacted-last4-801E',
    parsesArgs:
      parsedArgs.evidenceFile === 'docs/device-acceptance/ios-preflight.json' &&
      parsedArgs.screen === '393x852' &&
      parsedArgs.deviceModel === 'iPhone 15' &&
      parsedArgs.osVersion === 'iOS 18.5',
  };

  if (!Object.values(checks).every(Boolean)) {
    console.error(`IOS_PREFLIGHT_SELF_CHECK_INVALID ${JSON.stringify(checks)}`);
    process.exit(1);
  }
  console.log(`IOS_PREFLIGHT_SELF_CHECK_OK ${JSON.stringify(checks)}`);
}

await main();
