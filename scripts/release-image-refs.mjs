import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`发布镜像引用生成器

Usage:
  pnpm release:image-refs -- --registry ccr.ccs.tencentyun.com --namespace harukains
  pnpm release:image-refs -- --registry ccr.ccs.tencentyun.com --namespace harukains --format export
  pnpm release:image-refs -- --registry ccr.ccs.tencentyun.com --namespace harukains --json

Options:
  --registry <host>          镜像 registry host，例如 ccr.ccs.tencentyun.com，必填。
  --namespace <path>         registry 下的命名空间/项目路径，例如 harukains，必填。
  --image-prefix <name>      镜像名前缀，默认 cat-diary。
  --sha <git-sha>            指定 Git SHA；默认读取当前 HEAD。
  --date <YYYYMMDD>          指定 tag 日期；默认使用当前 UTC 日期。
  --format <env|export>      输出 KEY=value 或 export KEY=value，默认 env。
  --json                     输出 JSON。
  --skip-git-clean           跳过工作区干净检查，仅用于脚本自检或临时排查。
`);
  process.exit(0);
}

const registry = normalizeInput(args.registry);
const namespace = normalizeInput(args.namespace);
const imagePrefix = normalizeInput(args.imagePrefix ?? 'cat-diary');
const commitSha = normalizeInput(args.sha) ?? readGitSha();
const tagDate = normalizeInput(args.date) ?? utcDate();

const errors = [];
if (!isSafeRegistry(registry))
  errors.push('registry 必须是真实 registry host，不能包含协议、路径、本地地址或占位值');
if (!isSafeNamespace(namespace))
  errors.push(
    'namespace 必须是合法 Docker repository path，且不能使用 example/placeholder 等占位值',
  );
if (!isSafeImageName(imagePrefix))
  errors.push('image-prefix 必须是合法 Docker image name 片段，默认使用 cat-diary');
if (!/^[a-f0-9]{12,40}$/i.test(commitSha ?? '')) errors.push('Git SHA 必须是 12-40 位十六进制字符');
if (!/^\d{8}$/.test(tagDate) || !isRealDate(tagDate)) errors.push('date 必须是合法 YYYYMMDD 日期');
if (!args.skipGitClean && !isGitClean())
  errors.push('工作区存在未提交改动；请先提交，再生成发布镜像 tag');

if (errors.length > 0) {
  if (args.json) {
    console.log(JSON.stringify({ ok: false, errors }, null, 2));
  } else {
    console.error('RELEASE_IMAGE_REFS_INVALID');
    for (const error of errors) console.error(`- ${error}`);
  }
  process.exit(1);
}

const shortSha = commitSha.slice(0, 12).toLowerCase();
const imageTag = `${tagDate}-${shortSha}`;
const base = `${registry}/${namespace}/${imagePrefix}`;
const output = {
  IMAGE_TAG: imageTag,
  COMMIT_SHA: commitSha.toLowerCase(),
  API_IMAGE: `${base}-api:${imageTag}`,
  WORKER_IMAGE: `${base}-worker:${imageTag}`,
};

if (args.json) {
  console.log(JSON.stringify({ ok: true, ...output }, null, 2));
} else {
  for (const [key, value] of Object.entries(output)) {
    console.log(`${args.format === 'export' ? 'export ' : ''}${key}=${value}`);
  }
}

function parseArgs(argv) {
  const parsed = {
    registry: undefined,
    namespace: undefined,
    imagePrefix: undefined,
    sha: undefined,
    date: undefined,
    format: 'env',
    json: false,
    help: false,
    skipGitClean: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--json') parsed.json = true;
    else if (arg === '--skip-git-clean') parsed.skipGitClean = true;
    else if (arg === '--registry') {
      parsed.registry = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--namespace') {
      parsed.namespace = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--image-prefix') {
      parsed.imagePrefix = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--sha') {
      parsed.sha = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--date') {
      parsed.date = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--format') {
      parsed.format = requireArg(argv, index, arg);
      index += 1;
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }

  if (!['env', 'export'].includes(parsed.format)) throw new Error('--format 只支持 env 或 export');
  return parsed;
}

function requireArg(argv, index, name) {
  const value = argv[index + 1];
  if (!value) throw new Error(`${name} 需要参数`);
  return value;
}

function normalizeInput(value) {
  return typeof value === 'string' ? value.trim() : undefined;
}

function readGitSha() {
  const result = command('git', ['rev-parse', '--verify', 'HEAD']);
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function isGitClean() {
  const result = command('git', ['status', '--porcelain']);
  return result.status === 0 && result.stdout.trim() === '';
}

function command(name, commandArgs) {
  return spawnSync(name, commandArgs, { cwd: root, encoding: 'utf8' });
}

function utcDate() {
  const now = new Date();
  return [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('');
}

function isRealDate(value) {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function isSafeRegistry(value) {
  if (!value || value.includes('/') || /\s/.test(value)) return false;
  if (/^https?:\/\//i.test(value)) return false;
  if (!value.includes('.') && !value.includes(':')) return false;
  return !isLocalHost(value) && !looksPlaceholder(value);
}

function isSafeNamespace(value) {
  if (!value || /\s/.test(value) || looksPlaceholder(value)) return false;
  return value.split('/').every((part) => /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(part));
}

function isSafeImageName(value) {
  return Boolean(value && /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value));
}

function isLocalHost(hostname) {
  const host = String(hostname ?? '').toLowerCase();
  return (
    host === 'localhost' ||
    host === '::1' ||
    host === '[::1]' ||
    host === '0.0.0.0' ||
    host === '10.0.2.2' ||
    host.startsWith('127.')
  );
}

function looksPlaceholder(value) {
  return /example|invalid|localhost|待确认|replace|placeholder|your-|<|>/i.test(
    String(value ?? ''),
  );
}
