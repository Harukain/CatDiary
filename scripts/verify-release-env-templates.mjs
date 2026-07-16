import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { URL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const knownEasProjectId = '29f29ec5-c4ab-4371-bf41-b5b72077e531';
const templateFiles = [
  ['preview', resolve(root, '.env.preview.example')],
  ['production', resolve(root, '.env.production.example')],
];
const requiredKeys = [
  'NODE_ENV',
  'APP_ENV',
  'PORT',
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'PHONE_LOOKUP_SECRET',
  'PHONE_ENCRYPTION_SECRET',
  'CHANNEL_ENCRYPTION_SECRET',
  'DEV_OTP_CODE',
  'DEFAULT_TIMEZONE',
  'PUBLIC_API_URL',
  'EXPO_PUBLIC_API_URL',
  'EAS_PROJECT_ID',
  'EXPO_PUBLIC_PRIVACY_POLICY_URL',
  'EXPO_PUBLIC_TERMS_URL',
  'CORS_ALLOWED_ORIGINS',
  'TRUST_PROXY',
  'ENABLE_SWAGGER',
  'FEATURE_NOTIFICATIONS_ENABLED',
  'FEATURE_EXPORTS_ENABLED',
  'METRICS_TOKEN',
  'WORKER_HOST',
  'WORKER_PORT',
  'THROTTLE_DEFAULT_LIMIT',
  'THROTTLE_SMS_SEND_LIMIT',
  'THROTTLE_SMS_VERIFY_LIMIT',
  'COS_SECRET_ID',
  'COS_SECRET_KEY',
  'COS_BUCKET',
  'COS_REGION',
  'SMS_APP_ID',
  'SMS_SIGN_NAME',
  'SMS_TEMPLATE_ID',
  'SMS_SECRET_ID',
  'SMS_SECRET_KEY',
  'SMS_REGION',
  'SMS_CODE_TTL_SECONDS',
];
const secretKeys = new Set([
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'PHONE_LOOKUP_SECRET',
  'PHONE_ENCRYPTION_SECRET',
  'CHANNEL_ENCRYPTION_SECRET',
  'METRICS_TOKEN',
  'COS_SECRET_ID',
  'COS_SECRET_KEY',
  'COS_BUCKET',
  'SMS_APP_ID',
  'SMS_SIGN_NAME',
  'SMS_TEMPLATE_ID',
  'SMS_SECRET_ID',
  'SMS_SECRET_KEY',
]);
const forbiddenKeys = new Set([
  'UPLOAD_LOCAL_DIR',
  'EXPORT_LOCAL_DIR',
  'API_IMAGE',
  'WORKER_IMAGE',
]);

const errors = [];
const summaries = [];

const gitignore = readFileSync(resolve(root, '.gitignore'), 'utf8');
for (const name of ['!.env.preview.example', '!.env.production.example']) {
  if (!gitignore.split(/\r?\n/).includes(name)) errors.push(`.gitignore 缺少 ${name}`);
}

for (const [target, path] of templateFiles) {
  if (!existsSync(path)) {
    errors.push(`缺少模板文件：${path}`);
    continue;
  }
  const env = parseEnvFile(path);
  validateTemplate(target, path, env);
  summaries.push({ target, path, keys: Object.keys(env).length });
}

if (errors.length > 0) {
  console.error('RELEASE_ENV_TEMPLATES_INVALID');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`RELEASE_ENV_TEMPLATES_OK ${JSON.stringify({ templates: summaries })}`);

function parseEnvFile(path) {
  const env = {};
  const raw = readFileSync(path, 'utf8');
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      errors.push(`${path}:${index + 1} 不是 KEY=value 格式`);
      continue;
    }
    const [, key, rawValue] = match;
    if (Object.hasOwn(env, key)) errors.push(`${path}:${index + 1} 重复变量 ${key}`);
    env[key] = rawValue.trim();
  }
  return env;
}

function validateTemplate(target, path, env) {
  for (const key of requiredKeys) {
    if (!(key in env)) errors.push(`${path} 缺少 ${key}`);
    else if (!env[key]) errors.push(`${path} 的 ${key} 不能为空`);
  }
  for (const key of Object.keys(env)) {
    if (!requiredKeys.includes(key) && !forbiddenKeys.has(key))
      errors.push(`${path} 包含未登记变量 ${key}`);
    if (forbiddenKeys.has(key)) errors.push(`${path} 不应包含发布禁用变量 ${key}`);
  }

  expectValue(path, env, 'NODE_ENV', 'production');
  expectValue(path, env, 'APP_ENV', target);
  expectValue(path, env, 'TRUST_PROXY', 'true');
  expectValue(path, env, 'ENABLE_SWAGGER', 'false');
  expectValue(path, env, 'FEATURE_NOTIFICATIONS_ENABLED', 'true');
  expectValue(path, env, 'FEATURE_EXPORTS_ENABLED', 'true');
  expectValue(path, env, 'WORKER_HOST', '0.0.0.0');
  expectValue(path, env, 'WORKER_PORT', '3001');
  expectValue(path, env, 'EAS_PROJECT_ID', knownEasProjectId);

  if (env.DEV_OTP_CODE === '123456') errors.push(`${path} 不能保留开发验证码 123456`);
  if (!/^__.+__$/.test(env.DEV_OTP_CODE ?? ''))
    errors.push(`${path} 的 DEV_OTP_CODE 应使用 __...__ 占位，提示替换为非 123456 六位数字`);

  for (const key of secretKeys) {
    if (!/^__.+__$/.test(env[key] ?? '') && !allowedNonSecretTemplateValue(key, env[key] ?? '')) {
      errors.push(`${path} 的 ${key} 必须使用脱敏占位或明确的示例域名`);
    }
  }

  validateHttpsUrl(path, env, 'EXPO_PUBLIC_API_URL', '/api/v1');
  validateHttpsUrl(path, env, 'PUBLIC_API_URL', '/api/v1');
  if (env.EXPO_PUBLIC_API_URL !== env.PUBLIC_API_URL)
    errors.push(`${path} 的 EXPO_PUBLIC_API_URL 和 PUBLIC_API_URL 应保持一致`);
  validateHttpsUrl(path, env, 'EXPO_PUBLIC_PRIVACY_POLICY_URL');
  validateHttpsUrl(path, env, 'EXPO_PUBLIC_TERMS_URL');
  validateHttpsOriginList(path, env.CORS_ALLOWED_ORIGINS);

  if ((env.COS_SECRET_ID ?? '') === (env.SMS_SECRET_ID ?? ''))
    errors.push(`${path} 的 COS_SECRET_ID 和 SMS_SECRET_ID 占位也必须区分`);
  if ((env.COS_SECRET_KEY ?? '') === (env.SMS_SECRET_KEY ?? ''))
    errors.push(`${path} 的 COS_SECRET_KEY 和 SMS_SECRET_KEY 占位也必须区分`);

  for (const key of [
    'THROTTLE_DEFAULT_LIMIT',
    'THROTTLE_SMS_SEND_LIMIT',
    'THROTTLE_SMS_VERIFY_LIMIT',
  ]) {
    if (!/^\d+$/.test(env[key] ?? '') || Number(env[key]) <= 0)
      errors.push(`${path} 的 ${key} 必须是正整数`);
  }
  const ttl = Number(env.SMS_CODE_TTL_SECONDS);
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 900)
    errors.push(`${path} 的 SMS_CODE_TTL_SECONDS 必须在 60-900 秒`);
}

function expectValue(path, env, key, expected) {
  if (env[key] !== expected) errors.push(`${path} 的 ${key} 必须为 ${expected}`);
}

function allowedNonSecretTemplateValue(key, value) {
  if (['SMS_REGION', 'COS_REGION'].includes(key)) return /^ap-[a-z]+/.test(value);
  return false;
}

function validateHttpsUrl(path, env, key, suffix) {
  let url;
  try {
    url = new URL(env[key]);
  } catch {
    errors.push(`${path} 的 ${key} 必须是 URL`);
    return;
  }
  if (url.protocol !== 'https:') errors.push(`${path} 的 ${key} 必须使用 HTTPS`);
  if (url.username || url.password || url.search || url.hash)
    errors.push(`${path} 的 ${key} 不得包含账号密码、query 或 fragment`);
  if (suffix && !url.pathname.replace(/\/+$/, '').endsWith(suffix))
    errors.push(`${path} 的 ${key} 必须以 ${suffix} 结尾`);
  if (/localhost|127\.|10\.0\.2\.2/i.test(url.hostname))
    errors.push(`${path} 的 ${key} 不得使用本地地址`);
}

function validateHttpsOriginList(path, value) {
  const origins = String(value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    errors.push(`${path} 的 CORS_ALLOWED_ORIGINS 至少需要一个来源`);
    return;
  }
  for (const origin of origins) {
    let url;
    try {
      url = new URL(origin);
    } catch {
      errors.push(`${path} 的 CORS 来源不是 URL：${origin}`);
      continue;
    }
    if (url.protocol !== 'https:') errors.push(`${path} 的 CORS 来源必须使用 HTTPS：${origin}`);
    if ((url.pathname && url.pathname !== '/') || url.search || url.hash)
      errors.push(`${path} 的 CORS 来源只能是 origin，不能带路径/query/fragment：${origin}`);
  }
}
