import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, resolve } from 'node:path';
import { URL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`腾讯云 COS 环境探针

Usage:
  pnpm cos:probe -- --target preview --env-file ../.env.preview

Options:
  --target <preview|production>  要验证的环境，必填。
  --env-file <path>              读取发布环境变量文件；不传时读取当前进程环境。
  --dry-run                      只校验参数和脱敏输出，不连接 COS。
  --keep-object                  排查时保留探针对象；默认验证后删除。
  --json                         输出 JSON。
  --help                         显示帮助。

Required env:
  COS_SECRET_ID
  COS_SECRET_KEY
  COS_BUCKET
  COS_REGION
`);
  process.exit(0);
}

const checks = [];
const secretRedactions = [];
const timeoutMs = Number(process.env.COS_PROBE_TIMEOUT_MS ?? 15_000);
const objectBody = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);
const objectMime = 'image/png';
const objectHash = createHash('sha256').update(objectBody).digest('hex');

let envFilePath = null;
let loadedEnv = {};
let config = {
  target: null,
  appEnv: null,
  secretId: null,
  secretKey: null,
  bucket: null,
  region: null,
};
try {
  envFilePath = args.envFile ? resolvePath(args.envFile) : null;
  loadedEnv = envFilePath ? loadEnvFile(envFilePath) : {};
} catch (error) {
  record('envFile', false, sanitizeError(error));
  finish();
  process.exit(process.exitCode ?? 1);
}

const env = { ...loadedEnv, ...process.env };
config = readConfig();

record('target', config.target === 'preview' || config.target === 'production', safeTarget(), {
  action: '传入 --target preview 或 --target production',
});
record('envSource', !envFilePath || existsSync(envFilePath), envFilePath ?? 'process.env', {
  action: '提供存在的 --env-file，或在受控环境变量中注入 COS 配置',
});
validateConfig();

if (args.dryRun) {
  record('dryRun', true, '仅校验配置与脱敏输出；未连接 COS');
  finish();
  process.exit(process.exitCode ?? 0);
}

if (checks.some((check) => !check.ok && !check.skipped)) {
  finish();
  process.exit(process.exitCode ?? 1);
}

await runCosProbe();
finish();

function parseArgs(argv) {
  const parsed = {
    target: undefined,
    envFile: undefined,
    dryRun: false,
    keepObject: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--json') parsed.json = true;
    else if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--keep-object') parsed.keepObject = true;
    else if (arg === '--target') {
      parsed.target = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--env-file') {
      parsed.envFile = requireArg(argv, index, arg);
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
  const result = {};
  const raw = readFileSync(path, 'utf8');
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) throw new Error(`无法解析 ${path}:${index + 1}`);
    result[match[1]] = unquote(match[2].trim());
  }
  return result;
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

function readConfig() {
  const target = args.target;
  const secretId = value('COS_SECRET_ID');
  const secretKey = value('COS_SECRET_KEY');
  if (secretId) secretRedactions.push(secretId);
  if (secretKey) secretRedactions.push(secretKey);
  return {
    target,
    appEnv: value('APP_ENV'),
    secretId,
    secretKey,
    bucket: value('COS_BUCKET'),
    region: value('COS_REGION'),
  };
}

function value(name) {
  const raw = env[name];
  return typeof raw === 'string' ? raw.trim() : raw;
}

function safeTarget() {
  return config.target ?? 'missing';
}

function validateConfig() {
  validateSecret('COS_SECRET_ID', config.secretId);
  validateSecret('COS_SECRET_KEY', config.secretKey);
  validateBucket(config.bucket);
  validateRegion(config.region);
  validateOptionalAppEnv();
}

function validateSecret(name, rawValue) {
  const missing = !rawValue;
  const placeholder = rawValue ? isPlaceholder(rawValue) : false;
  record(
    name,
    !missing && !placeholder && rawValue.length >= 8,
    missing ? 'missing' : 'configured',
    {
      action: `${name} 必须由密钥管理或受控环境注入，且不能使用模板占位值`,
    },
  );
}

function validateBucket(rawValue) {
  const missing = !rawValue;
  const placeholder = rawValue ? isPlaceholder(rawValue) : false;
  const validShape =
    Boolean(rawValue) &&
    !rawValue.includes('://') &&
    !rawValue.includes('/') &&
    /^[a-z0-9][a-z0-9-]{2,62}$/i.test(rawValue);
  record(
    'COS_BUCKET',
    !missing && !placeholder && validShape,
    missing ? 'missing' : placeholder ? 'placeholder' : rawValue,
    {
      action: '配置腾讯云私有 Bucket 名称，例如 catdiary-preview-1250000000',
    },
  );
}

function validateRegion(rawValue) {
  const missing = !rawValue;
  const placeholder = rawValue ? isPlaceholder(rawValue) : false;
  const validShape = Boolean(rawValue) && /^[a-z]{2,}-[a-z0-9-]+$/i.test(rawValue);
  record(
    'COS_REGION',
    !missing && !placeholder && validShape,
    missing ? 'missing' : placeholder ? 'placeholder' : rawValue,
    {
      action: '配置腾讯云 COS 地域，例如 ap-shanghai',
    },
  );
}

function validateOptionalAppEnv() {
  if (!config.appEnv) {
    record('APP_ENV', true, 'missing; skipped optional consistency check', { skipped: true });
    return;
  }
  record('APP_ENV', config.appEnv === config.target, config.appEnv, {
    action: 'env 文件中的 APP_ENV 应与 --target 保持一致',
  });
}

function isPlaceholder(rawValue) {
  const valueToCheck = rawValue.trim();
  return [
    /^__.*__$/,
    /^<.*>$/,
    /^todo$/i,
    /^tbd$/i,
    /待确认/,
    /placeholder/i,
    /replace/i,
    /change-?me/i,
    /your-domain/i,
    /example/i,
  ].some((pattern) => pattern.test(valueToCheck));
}

function record(name, ok, detail, extra = {}) {
  checks.push({
    name,
    ok: Boolean(ok),
    skipped: Boolean(extra.skipped),
    detail: sanitizeString(String(detail ?? '')),
    ...(ok || extra.skipped || !extra.action ? {} : { action: extra.action }),
  });
}

function finish() {
  const summary = {
    ok: checks.every((check) => check.ok || check.skipped),
    checked: checks.filter((check) => !check.skipped).length,
    skipped: checks.filter((check) => check.skipped).length,
    failed: checks.filter((check) => !check.ok && !check.skipped).length,
    target: config?.target ?? null,
    bucket: config?.bucket && !isPlaceholder(config.bucket) ? config.bucket : null,
    region: config?.region && !isPlaceholder(config.region) ? config.region : null,
  };
  if (args.json) {
    console.log(JSON.stringify({ summary, checks }, null, 2));
  } else {
    console.log('腾讯云 COS 环境探针');
    for (const check of checks) {
      const marker = check.skipped ? '-' : check.ok ? '✓' : '✗';
      const action = check.action ? `；处理：${check.action}` : '';
      console.log(`${marker} ${check.name}: ${check.detail}${action}`);
    }
    console.log(
      `结果：${summary.ok ? '通过' : '失败'}（检查 ${summary.checked}，跳过 ${summary.skipped}，失败 ${summary.failed}）`,
    );
  }
  if (!summary.ok) process.exitCode = 1;
}

async function runCosProbe() {
  const key = `cat-diary-probes/${config.target}/${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}-${randomBytes(6).toString('hex')}/probe.png`;
  let uploaded = false;
  const cos = createCosClient();

  record('probeObjectKey', true, key);

  try {
    const putUrl = await signedObjectUrl(cos, {
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
      Method: 'PUT',
      Sign: true,
      Expires: 600,
    });
    validateSignedUrl(putUrl);
    record('signedPutUrl', true, 'generated; expires=600s');

    const upload = await fetchWithTimeout(putUrl, {
      method: 'PUT',
      headers: {
        'content-type': objectMime,
        'content-length': String(objectBody.length),
      },
      body: objectBody,
    });
    const uploadText = await limitedText(upload);
    uploaded = upload.status >= 200 && upload.status < 300;
    record(
      'signedPutUpload',
      uploaded,
      uploaded
        ? `${upload.status}; ${objectBody.length} bytes uploaded`
        : `${upload.status}; ${uploadText}`,
      { action: '检查 Bucket、CAM PutObject 权限、地域和 CORS/签名配置' },
    );
    if (!uploaded) return;

    const head = await cosRequest(cos, 'headObject', {
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
    });
    const headers = lowerCaseHeaders(head.headers ?? {});
    const sizeOk = Number(headers['content-length']) === objectBody.length;
    const mimeOk = headers['content-type']?.split(';')[0]?.toLowerCase() === objectMime;
    record(
      'headObjectMetadata',
      sizeOk && mimeOk,
      `size=${headers['content-length'] ?? 'unknown'}, contentType=${
        headers['content-type'] ?? 'unknown'
      }`,
      { action: '确认上传对象的大小和 MIME 与服务端凭证一致' },
    );

    const getUrl = await signedObjectUrl(cos, {
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
      Method: 'GET',
      Sign: true,
      Expires: 600,
    });
    validateSignedUrl(getUrl);
    record('signedGetUrl', true, 'generated; expires=600s');

    const download = await fetchWithTimeout(getUrl);
    const downloaded = Buffer.from(await download.arrayBuffer());
    const downloadedHash = createHash('sha256').update(downloaded).digest('hex');
    record(
      'signedGetDownload',
      download.status === 200 && downloadedHash === objectHash,
      `${download.status}; bytes=${downloaded.length}; hashMatch=${downloadedHash === objectHash}`,
      { action: '检查 CAM GetObject 权限与短期下载签名' },
    );

    await checkAnonymousReadBlocked(key);
  } catch (error) {
    record('cosProbe', false, sanitizeError(error), {
      action: '检查腾讯云网络、Bucket/Region、CAM 权限和密钥有效性',
    });
  } finally {
    if (uploaded && !args.keepObject) {
      await cleanupObject(cos, key);
    } else if (uploaded && args.keepObject) {
      record('cleanup', true, 'skipped by --keep-object', { skipped: true });
    }
  }
}

function createCosClient() {
  try {
    const requireFromApi = createRequire(resolve(root, 'apps/api/package.json'));
    const COS = requireFromApi('cos-nodejs-sdk-v5');
    return new COS({ SecretId: config.secretId, SecretKey: config.secretKey });
  } catch (error) {
    throw new Error(`无法加载 cos-nodejs-sdk-v5：${sanitizeError(error)}`, { cause: error });
  }
}

function signedObjectUrl(cos, params) {
  return new Promise((resolvePromise, reject) => {
    try {
      const syncUrl = cos.getObjectUrl(params);
      if (typeof syncUrl === 'string' && syncUrl) {
        resolvePromise(syncUrl);
        return;
      }
      cos.getObjectUrl(params, (error, data) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePromise(data?.Url);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function validateSignedUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') throw new Error('signed URL is not HTTPS');
  } catch (error) {
    throw new Error(`签名地址无效：${sanitizeError(error)}`, { cause: error });
  }
}

function cosRequest(cos, method, params) {
  return new Promise((resolvePromise, reject) => {
    try {
      cos[method](params, (error, data) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePromise(data ?? {});
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new globalThis.AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await globalThis.fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timer);
  }
}

async function limitedText(response) {
  const text = await response.text().catch(() => '');
  return sanitizeString(text.slice(0, 500));
}

function lowerCaseHeaders(headers) {
  const result = {};
  for (const [key, rawValue] of Object.entries(headers)) {
    result[key.toLowerCase()] = Array.isArray(rawValue) ? rawValue.join(',') : String(rawValue);
  }
  return result;
}

async function checkAnonymousReadBlocked(key) {
  const url = publicObjectUrl(key);
  try {
    const response = await fetchWithTimeout(url, { method: 'GET' });
    const ok = response.status === 401 || response.status === 403 || response.status === 404;
    record(
      'anonymousReadBlocked',
      ok,
      ok
        ? `${response.status}; object is not publicly readable`
        : `${response.status}; anonymous GET succeeded or was not denied`,
      { action: 'Bucket 必须保持私有读写，禁止公共读' },
    );
  } catch (error) {
    record('anonymousReadBlocked', false, sanitizeError(error), {
      action: '确认 Bucket 默认访问域名可达，并验证匿名读取被拒绝',
    });
  }
}

function publicObjectUrl(key) {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return `https://${config.bucket}.cos.${config.region}.myqcloud.com/${encodedKey}`;
}

async function cleanupObject(cos, key) {
  try {
    await cosRequest(cos, 'deleteObject', {
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
    });
    record('deleteObject', true, 'probe object deleted');
  } catch (error) {
    record('deleteObject', false, sanitizeError(error), {
      action: '手工删除探针对象，避免测试文件残留',
    });
    return;
  }

  try {
    await cosRequest(cos, 'headObject', {
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
    });
    record('objectRemoved', false, 'headObject still returned success after delete', {
      action: '检查删除权限、版本控制或生命周期策略是否保留当前版本',
    });
  } catch (error) {
    const status = cosErrorStatus(error);
    record(
      'objectRemoved',
      status === 404 || status === 403,
      `headObject after delete returned ${status ?? 'error'}`,
      { action: '确认探针对象已不可读取' },
    );
  }
}

function cosErrorStatus(error) {
  const candidates = [
    error?.statusCode,
    error?.status,
    error?.code === 'NoSuchKey' ? 404 : undefined,
    error?.Code === 'NoSuchKey' ? 404 : undefined,
  ];
  const value = candidates.find((candidate) => Number.isFinite(Number(candidate)));
  return value === undefined ? null : Number(value);
}

function sanitizeError(error) {
  if (error instanceof Error) return sanitizeString(error.message);
  return sanitizeString(String(error));
}

function sanitizeString(valueToSanitize) {
  let result = valueToSanitize;
  for (const secret of secretRedactions) {
    if (secret && result.includes(secret)) result = result.split(secret).join('[redacted]');
  }
  result = result.replace(/(q-signature=)[^&\s]+/gi, '$1[redacted]');
  result = result.replace(/(sign=)[^&\s]+/gi, '$1[redacted]');
  result = result.replace(/(authorization=)[^&\s]+/gi, '$1[redacted]');
  result = result.replace(/(x-cos-security-token=)[^&\s]+/gi, '$1[redacted]');
  return result;
}
