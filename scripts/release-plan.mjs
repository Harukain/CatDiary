import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const knownEasProjectId = '29f29ec5-c4ab-4371-bf41-b5b72077e531';
const publicEnvKeys = new Set([
  'APP_ENV',
  'NODE_ENV',
  'PUBLIC_API_URL',
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_PRIVACY_POLICY_URL',
  'EXPO_PUBLIC_TERMS_URL',
  'CORS_ALLOWED_ORIGINS',
  'TRUST_PROXY',
  'ENABLE_SWAGGER',
  'FEATURE_NOTIFICATIONS_ENABLED',
  'FEATURE_EXPORTS_ENABLED',
  'WORKER_HOST',
  'WORKER_PORT',
  'COS_BUCKET',
  'COS_REGION',
  'SMS_REGION',
  'SMS_CODE_TTL_SECONDS',
  'DEFAULT_TIMEZONE',
  'EAS_PROJECT_ID',
]);

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`发布执行清单生成器

Usage:
  pnpm release:plan -- --target preview --registry ccr.ccs.tencentyun.com --namespace harukains
  pnpm release:plan -- --target preview --registry ccr.ccs.tencentyun.com --namespace harukains --env-file ../.env.preview --format markdown

Options:
  --target <preview|production>   发布目标，必填。
  --registry <host>               镜像 registry host，例如 ccr.ccs.tencentyun.com，必填。
  --namespace <path>              registry 下的命名空间/项目路径，必填。
  --env-file <path>               可选：读取真实 env 文件，只输出脱敏摘要。
  --image-prefix <name>           镜像名前缀，默认 cat-diary。
  --sha <git-sha>                 指定 Git SHA；默认读取当前 HEAD。
  --date <YYYYMMDD>               指定 tag 日期；默认使用当前 UTC 日期。
  --format <json|markdown>        输出格式，默认 json。
  --output <path>                 可选：把输出写入文件。
  --skip-git-clean                跳过工作区干净检查，仅用于脚本自检或临时排查。
`);
  process.exit(0);
}

const manifest = buildManifest(args);
const output =
  args.format === 'markdown' ? renderMarkdown(manifest) : `${JSON.stringify(manifest, null, 2)}\n`;

if (args.output) writeFileSync(resolvePath(args.output), output);
else process.stdout.write(output);

if (!manifest.ok) process.exitCode = 1;

function buildManifest(options) {
  const errors = [];
  const warnings = [];
  const target = normalizeInput(options.target);
  const registry = normalizeInput(options.registry);
  const namespace = normalizeInput(options.namespace);
  const imagePrefix = normalizeInput(options.imagePrefix ?? 'cat-diary');
  const commitSha = normalizeInput(options.sha) ?? readGitSha();
  const tagDate = normalizeInput(options.date) ?? utcDate();
  const envFilePath = options.envFile ? resolvePath(options.envFile) : null;

  if (target !== 'preview' && target !== 'production')
    errors.push('target 必须是 preview 或 production');
  if (!isSafeRegistry(registry))
    errors.push('registry 必须是真实 registry host，不能包含协议、路径、本地地址或占位值');
  if (!isSafeNamespace(namespace))
    errors.push(
      'namespace 必须是合法 Docker repository path，且不能使用 example/placeholder 等占位值',
    );
  if (!isSafeImageName(imagePrefix))
    errors.push('image-prefix 必须是合法 Docker image name 片段，默认使用 cat-diary');
  if (!/^[a-f0-9]{12,40}$/i.test(commitSha ?? ''))
    errors.push('Git SHA 必须是 12-40 位十六进制字符');
  if (!/^\d{8}$/.test(tagDate) || !isRealDate(tagDate))
    errors.push('date 必须是合法 YYYYMMDD 日期');

  const gitClean = isGitClean();
  if (!options.skipGitClean && !gitClean)
    errors.push('工作区存在未提交改动；请先提交，再生成发布执行清单');
  if (options.skipGitClean && !gitClean)
    warnings.push('已跳过 Git clean 检查；当前清单只适合本地排查，不可作为正式发布证据');

  let envSummary = { provided: false };
  if (envFilePath) {
    if (!existsSync(envFilePath)) {
      errors.push(`env 文件不存在：${envFilePath}`);
      envSummary = { provided: true, path: envFilePath, exists: false };
    } else {
      try {
        envSummary = summarizeEnvFile(envFilePath, target, warnings);
      } catch (error) {
        errors.push(`env 文件无法解析：${error instanceof Error ? error.message : String(error)}`);
        envSummary = { provided: true, path: envFilePath, exists: true, parseError: true };
      }
    }
  } else {
    warnings.push('未提供 --env-file；清单只包含镜像和命令，不包含环境摘要');
  }

  const shortSha = /^[a-f0-9]{12,40}$/i.test(commitSha ?? '')
    ? commitSha.slice(0, 12).toLowerCase()
    : null;
  const imageTag = shortSha && /^\d{8}$/.test(tagDate) ? `${tagDate}-${shortSha}` : null;
  const base =
    registry && namespace && imagePrefix ? `${registry}/${namespace}/${imagePrefix}` : null;
  const images =
    base && imageTag
      ? {
          tag: imageTag,
          api: `${base}-api:${imageTag}`,
          worker: `${base}-worker:${imageTag}`,
        }
      : null;

  return {
    ok: errors.length === 0,
    generatedAt: new Date().toISOString(),
    target: target ?? null,
    errors,
    warnings,
    git: {
      head: commitSha?.toLowerCase() ?? null,
      clean: gitClean,
    },
    images,
    environment: envSummary,
    commands: images
      ? buildCommands({ target, registry, namespace, imagePrefix, images, envFilePath })
      : {},
  };
}

function summarizeEnvFile(path, target, warnings) {
  const raw = readFileSync(path, 'utf8');
  const env = parseEnvFile(raw);
  const placeholderKeys = Object.entries(env)
    .filter(([, value]) => /^__.+__$/.test(value))
    .map(([key]) => key)
    .sort();
  const missingPublicKeys = [
    'APP_ENV',
    'NODE_ENV',
    'PUBLIC_API_URL',
    'EXPO_PUBLIC_API_URL',
    'EAS_PROJECT_ID',
    'EXPO_PUBLIC_PRIVACY_POLICY_URL',
    'EXPO_PUBLIC_TERMS_URL',
  ].filter((key) => !env[key]);
  if (env.APP_ENV && target && env.APP_ENV !== target)
    warnings.push(`env APP_ENV=${env.APP_ENV} 与 --target ${target} 不一致`);
  if (env.EAS_PROJECT_ID && env.EAS_PROJECT_ID !== knownEasProjectId)
    warnings.push('env EAS_PROJECT_ID 与当前 EAS 项目不一致');
  if (placeholderKeys.length > 0)
    warnings.push(`env 仍包含 ${placeholderKeys.length} 个 __...__ 占位值`);

  return {
    provided: true,
    path,
    exists: true,
    sha256: createHash('sha256').update(raw).digest('hex').slice(0, 16),
    keyCount: Object.keys(env).length,
    placeholderKeys,
    missingPublicKeys,
    publicValues: Object.fromEntries(
      Object.entries(env)
        .filter(([key]) => publicEnvKeys.has(key))
        .map(([key, value]) => [key, redactPublicValue(key, value)]),
    ),
    secretKeysPresent: Object.keys(env)
      .filter((key) => !publicEnvKeys.has(key))
      .sort(),
  };
}

function parseEnvFile(raw) {
  const env = {};
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) throw new Error(`无法解析 env 第 ${index + 1} 行`);
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

function redactPublicValue(key, value) {
  if (!value) return '';
  if (/SECRET|TOKEN|PASSWORD|KEY/i.test(key) && key !== 'EAS_PROJECT_ID') return '<redacted>';
  return value;
}

function buildCommands({ target, registry, namespace, imagePrefix, images, envFilePath }) {
  const registryArgs = `--registry ${registry} --namespace ${namespace}${
    imagePrefix === 'cat-diary' ? '' : ` --image-prefix ${imagePrefix}`
  }`;
  const envArg = envFilePath ? ` --env-file ${shellQuote(relativeOrAbsolute(envFilePath))}` : '';
  return {
    imageRefs: `pnpm --silent release:image-refs -- ${registryArgs} --format export > /tmp/catdiary-images.env`,
    loadImageRefs: '. /tmp/catdiary-images.env',
    buildApi: 'docker build -f apps/api/Dockerfile -t "$API_IMAGE" .',
    buildWorker: 'docker build -f apps/worker/Dockerfile -t "$WORKER_IMAGE" .',
    pushApi: 'docker push "$API_IMAGE"',
    pushWorker: 'docker push "$WORKER_IMAGE"',
    releasePreflight: `pnpm release:preflight -- --target ${target}${envArg} --api-image ${images.api} --worker-image ${images.worker}`,
    composeConfig: envFilePath
      ? `ENV_FILE=${shellQuote(relativeOrAbsolute(envFilePath))} API_IMAGE=${images.api} WORKER_IMAGE=${images.worker} docker compose -f infra/docker-compose.preview.yml config`
      : 'ENV_FILE=<env-file> API_IMAGE="$API_IMAGE" WORKER_IMAGE="$WORKER_IMAGE" docker compose -f infra/docker-compose.preview.yml config',
  };
}

function renderMarkdown(manifest) {
  const lines = [
    `# 猫伴日记发布执行清单`,
    '',
    `- 目标：${manifest.target ?? 'missing'}`,
    `- 状态：${manifest.ok ? '可继续' : '需修复'}`,
    `- Git HEAD：${manifest.git.head ?? 'missing'}`,
    `- Git 工作区：${manifest.git.clean ? 'clean' : 'dirty'}`,
  ];
  if (manifest.images) {
    lines.push(
      `- 镜像 tag：${manifest.images.tag}`,
      `- API 镜像：${manifest.images.api}`,
      `- Worker 镜像：${manifest.images.worker}`,
    );
  }
  if (manifest.errors.length > 0) {
    lines.push('', '## 必须修复', '', ...manifest.errors.map((item) => `- ${item}`));
  }
  if (manifest.warnings.length > 0) {
    lines.push('', '## 注意事项', '', ...manifest.warnings.map((item) => `- ${item}`));
  }
  lines.push(
    '',
    '## 环境摘要',
    '',
    '```json',
    JSON.stringify(manifest.environment, null, 2),
    '```',
  );
  lines.push('', '## 下一步命令', '');
  for (const [name, command] of Object.entries(manifest.commands)) {
    lines.push(`### ${name}`, '', '```bash', command, '```', '');
  }
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  const parsed = {
    target: undefined,
    registry: undefined,
    namespace: undefined,
    envFile: undefined,
    imagePrefix: undefined,
    sha: undefined,
    date: undefined,
    format: 'json',
    output: undefined,
    help: false,
    skipGitClean: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--skip-git-clean') parsed.skipGitClean = true;
    else if (arg === '--target') {
      parsed.target = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--registry') {
      parsed.registry = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--namespace') {
      parsed.namespace = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--env-file') {
      parsed.envFile = requireArg(argv, index, arg);
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
    } else if (arg === '--output') {
      parsed.output = requireArg(argv, index, arg);
      index += 1;
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }

  if (!['json', 'markdown'].includes(parsed.format))
    throw new Error('--format 只支持 json 或 markdown');
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

function resolvePath(path) {
  return isAbsolute(path) ? path : resolve(root, path);
}

function relativeOrAbsolute(path) {
  return path.startsWith(root) ? path.slice(root.length + 1) : path;
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

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:@,+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}
