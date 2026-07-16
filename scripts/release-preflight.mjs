import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { URL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const knownEasProjectId = '29f29ec5-c4ab-4371-bf41-b5b72077e531';
const developmentSecretPatterns = [
  /cat-diary-dev/i,
  /replace-with/i,
  /placeholder/i,
  /change-?me/i,
  /todo/i,
  /^123456$/,
];

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(`发布前静态预检

Usage:
  pnpm release:preflight -- --target preview --env-file ../.env.preview \\
    --api-image ccr.ccs.tencentyun.com/team/cat-diary-api:20260717-abcdef123456 \\
    --worker-image ccr.ccs.tencentyun.com/team/cat-diary-worker:20260717-abcdef123456

Options:
  --target <preview|production>   要检查的发布目标，必填。
  --env-file <path>               读取服务端环境变量文件；不传时读取当前进程环境。
  --api-image <image>             API 镜像引用；也可用 API_IMAGE。
  --worker-image <image>          Worker 镜像引用；也可用 WORKER_IMAGE。
  --skip-git-clean                跳过工作区干净检查，仅用于脚本自检或临时排查。
  --json                          输出 JSON。
`);
  process.exit(0);
}

const checks = [];

const envFilePath = args.envFile ? resolvePath(args.envFile) : null;
const serviceEnv = envFilePath ? loadEnvFile(envFilePath) : process.env;
const target = args.target ?? value('APP_ENV');
const apiImage = args.apiImage ?? serviceEnv.API_IMAGE ?? process.env.API_IMAGE;
const workerImage = args.workerImage ?? serviceEnv.WORKER_IMAGE ?? process.env.WORKER_IMAGE;

record('target', target === 'preview' || target === 'production', target ?? 'missing', {
  action: '传入 --target preview 或 --target production',
});
record(
  'envSource',
  envFilePath ? existsSync(envFilePath) : true,
  envFilePath ? envFilePath : 'process.env',
  { action: '提供存在的 --env-file，或在受控环境中注入变量' },
);

checkGit();
checkEasProfile();
checkRuntimeEnvironment();
checkMobilePublicConfig();
checkServerEnvironment();
checkImages();

finish();

function parseArgs(argv) {
  const parsed = {
    target: undefined,
    envFile: undefined,
    apiImage: undefined,
    workerImage: undefined,
    skipGitClean: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--json') parsed.json = true;
    else if (arg === '--skip-git-clean') parsed.skipGitClean = true;
    else if (arg === '--target') {
      parsed.target = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--env-file') {
      parsed.envFile = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--api-image') {
      parsed.apiImage = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--worker-image') {
      parsed.workerImage = requireArg(argv, index, arg);
      index += 1;
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }

  return parsed;
}

function requireArg(argv, index, name) {
  const value = argv[index + 1];
  if (!value) throw new Error(`${name} 需要参数`);
  return value;
}

function resolvePath(path) {
  return isAbsolute(path) ? path : resolve(root, path);
}

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const env = {};
  const raw = readFileSync(path, 'utf8');
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) throw new Error(`无法解析 ${path}:${index + 1}`);
    env[match[1]] = unquote(match[2].trim());
  }
  return env;
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  )
    return value.slice(1, -1);
  const commentIndex = value.search(/\s#/);
  return commentIndex === -1 ? value : value.slice(0, commentIndex).trim();
}

function value(name) {
  const raw = serviceEnv[name];
  return typeof raw === 'string' ? raw.trim() : raw;
}

function deploymentValue(name) {
  const raw = serviceEnv[name] ?? process.env[name];
  return typeof raw === 'string' ? raw.trim() : raw;
}

function record(name, ok, detail, extra = {}) {
  checks.push({
    name,
    ok: Boolean(ok),
    detail: String(detail ?? ''),
    ...(ok || !extra.action ? {} : { action: extra.action }),
  });
}

function checkGit() {
  const topLevel = command('git', ['rev-parse', '--show-toplevel']);
  const gitRootOk = topLevel.status === 0 && resolve(topLevel.stdout.trim()) === root;
  record('gitRoot', gitRootOk, gitRootOk ? root : 'not cat-diary git root', {
    action: '在 cat-diary 仓库根目录执行发布预检',
  });

  const head = command('git', ['rev-parse', '--verify', 'HEAD']);
  record(
    'gitHead',
    head.status === 0 && /^[a-f0-9]{40}$/i.test(head.stdout.trim()),
    head.status === 0 ? head.stdout.trim().slice(0, 12) : 'missing',
    { action: '先完成经过审核的 Git 提交' },
  );

  if (!args.skipGitClean) {
    const status = command('git', ['status', '--porcelain']);
    record('gitClean', status.status === 0 && status.stdout.trim() === '', 'working tree clean', {
      action: '提交或移出未提交改动后再发布',
    });
  }
}

function checkEasProfile() {
  let easConfig;
  try {
    easConfig = JSON.parse(readFileSync(resolve(root, 'apps/mobile/eas.json'), 'utf8'));
  } catch (error) {
    record('easConfig', false, error instanceof Error ? error.message : String(error), {
      action: '修复 apps/mobile/eas.json',
    });
    return;
  }
  const profile = target ? easConfig.build?.[target] : undefined;
  record(
    `easProfile:${target ?? 'missing'}`,
    Boolean(profile),
    profile ? 'configured' : 'missing',
    {
      action: `在 apps/mobile/eas.json 中配置 build.${target ?? '<target>'}`,
    },
  );
  record(
    `easProfileEnv:${target ?? 'missing'}`,
    profile?.env?.APP_ENV === target,
    profile?.env?.APP_ENV ?? 'missing',
    { action: 'EAS profile 必须注入与目标一致的 APP_ENV' },
  );
}

function checkRuntimeEnvironment() {
  record('NODE_ENV', value('NODE_ENV') === 'production', safeState(value('NODE_ENV')), {
    action: '发布环境必须设置 NODE_ENV=production',
  });
  record('APP_ENV', value('APP_ENV') === target, safeState(value('APP_ENV')), {
    action: 'APP_ENV 必须与 --target 一致',
  });
}

function checkMobilePublicConfig() {
  validatePublicUrl('EXPO_PUBLIC_API_URL', {
    pathSuffix: '/api/v1',
    allowPath: true,
    action: '配置真实 Preview/Production HTTPS API，路径必须以 /api/v1 结尾',
  });
  validateOptionalPublicUrl('PUBLIC_API_URL', {
    pathSuffix: '/api/v1',
    allowPath: true,
    action: 'PUBLIC_API_URL 如存在，也必须指向相同 HTTPS API',
  });
  const publicApiUrl = value('PUBLIC_API_URL');
  if (publicApiUrl) {
    record(
      'publicApiMatchesMobile',
      stripTrailingSlash(publicApiUrl) === stripTrailingSlash(value('EXPO_PUBLIC_API_URL')),
      'PUBLIC_API_URL vs EXPO_PUBLIC_API_URL',
      { action: '保持服务端公开 API 地址与 App 构建 API 地址一致' },
    );
  }

  validatePublicUrl('EXPO_PUBLIC_PRIVACY_POLICY_URL', {
    allowPath: true,
    action: '配置未登录可访问的隐私政策 HTTPS URL',
  });
  validatePublicUrl('EXPO_PUBLIC_TERMS_URL', {
    allowPath: true,
    action: '配置未登录可访问的用户协议 HTTPS URL',
  });

  const projectId = value('EAS_PROJECT_ID');
  record('EAS_PROJECT_ID', projectId === knownEasProjectId, projectId ? 'configured' : 'missing', {
    action: `EAS_PROJECT_ID 必须为当前项目 ${knownEasProjectId}`,
  });
}

function checkServerEnvironment() {
  validateDatabaseUrl();
  validateRedisUrl();
  validateCorsOrigins();

  record('TRUST_PROXY', value('TRUST_PROXY') === 'true', safeState(value('TRUST_PROXY')), {
    action: 'HTTPS 反向代理后必须设置 TRUST_PROXY=true',
  });
  record(
    'ENABLE_SWAGGER',
    value('ENABLE_SWAGGER') === 'false',
    safeState(value('ENABLE_SWAGGER')),
    {
      action: '发布环境必须显式设置 ENABLE_SWAGGER=false',
    },
  );
  record(
    'FEATURE_NOTIFICATIONS_ENABLED',
    value('FEATURE_NOTIFICATIONS_ENABLED') === 'true',
    safeState(value('FEATURE_NOTIFICATIONS_ENABLED')),
    { action: 'MVP 发布前通知功能应保持开启；事故关闭需另走运行手册' },
  );
  record(
    'FEATURE_EXPORTS_ENABLED',
    value('FEATURE_EXPORTS_ENABLED') === 'true',
    safeState(value('FEATURE_EXPORTS_ENABLED')),
    { action: 'MVP 发布前导出功能应保持开启；事故关闭需另走运行手册' },
  );

  validateOtp();
  for (const key of [
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'PHONE_LOOKUP_SECRET',
    'PHONE_ENCRYPTION_SECRET',
    'CHANNEL_ENCRYPTION_SECRET',
    'METRICS_TOKEN',
  ])
    validateSecret(key);

  validateCos();
  validateSms();
  validateWorker();
  validatePreviewComposeOverrides();
  validateThrottles();
  validateNoLocalStorageDirs();
}

function validateDatabaseUrl() {
  const parsed = parseUrl(value('DATABASE_URL'));
  const ok =
    Boolean(parsed) &&
    parsed.protocol === 'postgresql:' &&
    !isLocalHost(parsed.hostname) &&
    !looksPlaceholder(parsed.hostname) &&
    parsed.username.length > 0 &&
    parsed.password.length > 0;
  record('DATABASE_URL', ok, parsed ? `${parsed.protocol}//${parsed.hostname}` : 'invalid', {
    action: '配置非本地 PostgreSQL 托管实例连接串，并包含受控凭据',
  });
}

function validateRedisUrl() {
  const parsed = parseUrl(value('REDIS_URL'));
  const ok =
    Boolean(parsed) &&
    /^rediss?:$/.test(parsed.protocol) &&
    !isLocalHost(parsed.hostname) &&
    !looksPlaceholder(parsed.hostname);
  record('REDIS_URL', ok, parsed ? `${parsed.protocol}//${parsed.hostname}` : 'invalid', {
    action: '配置非本地 Redis/托管 Redis 连接串，协议必须为 redis:// 或 rediss://',
  });
}

function validateCorsOrigins() {
  const origins = String(value('CORS_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const invalid = origins.filter((origin) => !isSafeOrigin(origin));
  record(
    'CORS_ALLOWED_ORIGINS',
    origins.length > 0 && invalid.length === 0,
    origins.length === 0 ? 'missing' : `${origins.length} origin(s)`,
    { action: '配置 HTTPS 可信来源，禁止 *、localhost、路径、查询参数或 fragment' },
  );
}

function isSafeOrigin(origin) {
  if (origin === '*') return false;
  const parsed = parseUrl(origin);
  return (
    Boolean(parsed) &&
    parsed.protocol === 'https:' &&
    !isLocalHost(parsed.hostname) &&
    !looksPlaceholder(parsed.hostname) &&
    (parsed.pathname === '' || parsed.pathname === '/') &&
    !parsed.search &&
    !parsed.hash &&
    !parsed.username &&
    !parsed.password
  );
}

function validateOtp() {
  const otp = value('DEV_OTP_CODE');
  record('DEV_OTP_CODE', /^\d{6}$/.test(otp ?? '') && otp !== '123456', 'configured', {
    action: '发布环境必须使用非 123456 的 6 位占位码，真实短信验证码由 Redis 随机生成',
  });
  const ttl = Number(value('SMS_CODE_TTL_SECONDS') ?? 300);
  record('SMS_CODE_TTL_SECONDS', Number.isInteger(ttl) && ttl >= 60 && ttl <= 900, String(ttl), {
    action: '短信验证码有效期必须在 60 到 900 秒之间',
  });
}

function validateSecret(key) {
  const secret = value(key);
  const ok =
    typeof secret === 'string' &&
    secret.length >= 32 &&
    !developmentSecretPatterns.some((pattern) => pattern.test(secret));
  record(key, ok, secret ? 'present' : 'missing', {
    action: `${key} 必须由密钥管理系统注入，长度至少 32 位且不能使用开发默认值`,
  });
}

function validateCos() {
  const present = ['COS_SECRET_ID', 'COS_SECRET_KEY', 'COS_BUCKET', 'COS_REGION'].every((key) =>
    hasUsableValue(key),
  );
  const bucket = value('COS_BUCKET');
  record('COS_CONFIG', present && !looksPlaceholder(bucket), present ? 'configured' : 'missing', {
    action: '配置 COS Secret、Bucket 与地域；Bucket 必须为真实 Preview/Production 私有 Bucket',
  });
}

function validateSms() {
  const present = [
    'SMS_APP_ID',
    'SMS_SIGN_NAME',
    'SMS_TEMPLATE_ID',
    'SMS_SECRET_ID',
    'SMS_SECRET_KEY',
    'SMS_REGION',
  ].every((key) => hasUsableValue(key));
  record('SMS_CONFIG', present, present ? 'configured' : 'missing', {
    action: '配置腾讯云 SMS 3.0 应用、签名、模板、地域和独立最小权限密钥',
  });
  record(
    'SMS_SECRET_SEPARATION',
    hasUsableValue('SMS_SECRET_ID') &&
      hasUsableValue('COS_SECRET_ID') &&
      value('SMS_SECRET_ID') !== value('COS_SECRET_ID') &&
      value('SMS_SECRET_KEY') !== value('COS_SECRET_KEY'),
    'SMS vs COS',
    { action: 'SMS 必须使用与 COS 分离的最小权限 SecretId/SecretKey' },
  );
}

function validateWorker() {
  record('WORKER_HOST', value('WORKER_HOST') === '0.0.0.0', safeState(value('WORKER_HOST')), {
    action: '容器内 Worker 必须监听 0.0.0.0 供健康探针访问',
  });
  record(
    'WORKER_PORT',
    Number(value('WORKER_PORT') ?? 3001) === 3001,
    safeState(value('WORKER_PORT')),
    {
      action: 'Worker 运维端口应保持 3001，并限制网络访问',
    },
  );
}

function validatePreviewComposeOverrides() {
  const apiBindAddress = deploymentValue('API_BIND_ADDRESS');
  record(
    'API_BIND_ADDRESS',
    !apiBindAddress || isLoopbackHost(apiBindAddress),
    apiBindAddress ? safeState(apiBindAddress) : 'default:127.0.0.1',
    {
      action:
        'Preview Compose 的 API_BIND_ADDRESS 必须留空或绑定 127.0.0.1/::1，由 HTTPS 反向代理对外服务',
    },
  );

  const rawApiPort = deploymentValue('API_PORT');
  const apiPort = Number(rawApiPort ?? 3000);
  record(
    'API_PORT',
    Number.isInteger(apiPort) && apiPort > 0 && apiPort <= 65535,
    rawApiPort ? safeState(rawApiPort) : 'default:3000',
    {
      action: 'Preview Compose 的 API_PORT 必须为 1-65535 的端口号',
    },
  );
}

function validateThrottles() {
  for (const key of [
    'THROTTLE_DEFAULT_LIMIT',
    'THROTTLE_SMS_SEND_LIMIT',
    'THROTTLE_SMS_VERIFY_LIMIT',
  ]) {
    const number = Number(value(key));
    record(
      key,
      Number.isInteger(number) && number > 0,
      Number.isNaN(number) ? 'missing' : String(number),
      {
        action: `${key} 必须为正整数`,
      },
    );
  }
}

function validateNoLocalStorageDirs() {
  const uploadLocal = value('UPLOAD_LOCAL_DIR');
  const exportLocal = value('EXPORT_LOCAL_DIR');
  record('UPLOAD_LOCAL_DIR', !uploadLocal, uploadLocal ? 'set' : 'not set', {
    action: '发布环境图片必须使用 COS，不得依赖容器本地上传目录',
  });
  record('EXPORT_LOCAL_DIR', !exportLocal, exportLocal ? 'set' : 'not set', {
    action: '发布环境导出文件必须使用 COS，不得依赖容器本地导出目录',
  });
}

function checkImages() {
  validateImage('API_IMAGE', apiImage, 'API');
  validateImage('WORKER_IMAGE', workerImage, 'Worker');
  record(
    'IMAGE_SEPARATION',
    typeof apiImage === 'string' &&
      typeof workerImage === 'string' &&
      apiImage.trim() !== workerImage.trim(),
    'API vs Worker',
    { action: 'API 与 Worker 必须使用各自独立构建的镜像引用，避免错误发布同一服务镜像' },
  );
}

function validateImage(name, image, label) {
  const parsed = parseImageRef(image);
  record(name, parsed.ok, parsed.detail, {
    action: `${label} 镜像必须使用真实 registry、仓库命名空间和不可变引用：sha256 digest、SemVer、日期+Git SHA 或 12-40 位 Git SHA；禁止 latest/main/prod/stable 等浮动标签`,
  });
}

function validatePublicUrl(name, options) {
  const parsed = parseUrl(value(name));
  record(name, isSafePublicUrl(parsed, options), parsed ? safeUrlDetail(parsed) : 'missing', {
    action: options.action,
  });
}

function validateOptionalPublicUrl(name, options) {
  if (!value(name)) return;
  validatePublicUrl(name, options);
}

function isSafePublicUrl(url, options = {}) {
  if (!url) return false;
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password || url.search || url.hash) return false;
  if (isLocalHost(url.hostname) || looksPlaceholder(url.hostname)) return false;
  if (options.pathSuffix && !url.pathname.replace(/\/+$/, '').endsWith(options.pathSuffix))
    return false;
  if (!options.allowPath && url.pathname !== '/' && url.pathname !== '') return false;
  return true;
}

function parseUrl(input) {
  if (!input || typeof input !== 'string') return null;
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function isLocalHost(hostname) {
  const host = String(hostname ?? '').toLowerCase();
  return (
    isLoopbackHost(host) || host === '0.0.0.0' || host === '10.0.2.2' || host.startsWith('127.')
  );
}

function isLoopbackHost(hostname) {
  const host = String(hostname ?? '').toLowerCase();
  return host === 'localhost' || host === '::1' || host === '[::1]' || host.startsWith('127.');
}

function looksPlaceholder(value) {
  return /example|invalid|localhost|待确认|replace|placeholder|your-|<|>/i.test(
    String(value ?? ''),
  );
}

function hasUsableValue(key) {
  const current = value(key);
  return (
    typeof current === 'string' &&
    current.length > 0 &&
    !looksPlaceholder(current) &&
    !developmentSecretPatterns.some((pattern) => pattern.test(current))
  );
}

function safeState(input) {
  return input ? 'configured' : 'missing';
}

function safeUrlDetail(url) {
  return `${url.protocol}//${url.hostname}${url.pathname}`;
}

function stripTrailingSlash(input) {
  return String(input ?? '').replace(/\/+$/, '');
}

function parseImageRef(image) {
  if (!image || typeof image !== 'string') return { ok: false, detail: 'missing' };
  const normalized = image.trim();
  if (image !== normalized || /\s/.test(normalized))
    return { ok: false, detail: 'contains whitespace' };
  if (/VERSION|example|placeholder|replace|your-|<|>/i.test(normalized))
    return { ok: false, detail: 'placeholder' };

  const digestSeparatorCount = normalized.split('@').length - 1;
  if (digestSeparatorCount > 1) return { ok: false, detail: 'invalid digest reference' };

  const [nameAndTag, digest] = normalized.split('@');
  const nameParts = nameAndTag.split('/');
  const registry = nameParts[0] ?? '';
  if (nameParts.length < 3) return { ok: false, detail: 'missing registry namespace' };
  if (!registry.includes('.') && !registry.includes(':'))
    return { ok: false, detail: 'missing registry host' };
  if (isLocalHost(registry) || looksPlaceholder(registry))
    return { ok: false, detail: 'unsafe registry host' };
  if (nameParts.some((part) => !part)) return { ok: false, detail: 'invalid repository path' };

  const hasDigest = /^sha256:[a-f0-9]{64}$/i.test(digest ?? '');
  if (digest && !hasDigest) return { ok: false, detail: 'invalid digest reference' };
  const lastSegment = nameParts.at(-1) ?? '';
  const tag = lastSegment.includes(':') ? lastSegment.split(':').at(-1) : '';
  const tagCheck = validateImmutableTag(tag);
  return {
    ok: hasDigest || tagCheck.ok,
    detail: hasDigest ? 'digest' : tagCheck.detail,
  };
}

function validateImmutableTag(tag) {
  if (!tag) return { ok: false, detail: 'missing immutable tag' };

  const normalized = tag.toLowerCase();
  const mutableTags = new Set([
    'latest',
    'main',
    'master',
    'develop',
    'development',
    'dev',
    'preview',
    'production',
    'prod',
    'staging',
    'stage',
    'stable',
    'release',
    'nightly',
    'edge',
    'current',
  ]);
  if (mutableTags.has(normalized)) return { ok: false, detail: `mutable tag:${tag}` };

  const semver = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
  const dateWithSha = /^\d{8}[-_.][a-f0-9]{7,40}$/i;
  const gitSha = /^[a-f0-9]{12,40}$/i;
  const ok = semver.test(tag) || dateWithSha.test(tag) || gitSha.test(tag);
  return { ok, detail: ok ? `tag:${tag}` : `non-immutable tag:${tag}` };
}

function command(name, commandArgs) {
  return spawnSync(name, commandArgs, { cwd: root, encoding: 'utf8' });
}

function finish() {
  const summary = {
    target: target ?? null,
    ok: checks.every((check) => check.ok),
    checked: checks.length,
    failed: checks.filter((check) => !check.ok).length,
  };

  if (args.json) {
    console.log(JSON.stringify({ summary, checks }, null, 2));
  } else {
    console.log('发布前静态预检');
    for (const check of checks) {
      const marker = check.ok ? '✓' : '✗';
      console.log(`${marker} ${check.name}: ${check.detail}`);
      if (!check.ok && check.action) console.log(`  → ${check.action}`);
    }
    console.log(
      `结果：${summary.ok ? '通过' : '失败'}（检查 ${summary.checked}，失败 ${summary.failed}）`,
    );
  }
  if (!summary.ok) process.exitCode = 1;
}
