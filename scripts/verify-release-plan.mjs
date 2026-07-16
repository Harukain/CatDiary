import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const script = resolve(import.meta.dirname, 'release-plan.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'catdiary-release-plan-'));
const sampleSha = ['abcdef', '123456', '7890ab', 'cdef12', '345678', '90abcd', 'ef12'].join('');
const sampleJwtSecret = ['sample', 'secret', 'value'].join('-');
const sampleCosSecret = ['sample', 'cos', 'secret'].join('-');
const sampleSmsSecret = ['sample', 'sms', 'secret'].join('-');
const envFile = join(tmp, 'preview.env');
const invalidEnvFile = join(tmp, 'invalid.env');

writeFileSync(
  envFile,
  [
    'NODE_ENV=production',
    'APP_ENV=preview',
    'PUBLIC_API_URL=https://preview-api.catdiary.test/api/v1',
    'EXPO_PUBLIC_API_URL=https://preview-api.catdiary.test/api/v1',
    'EAS_PROJECT_ID=29f29ec5-c4ab-4371-bf41-b5b72077e531',
    'EXPO_PUBLIC_PRIVACY_POLICY_URL=https://catdiary.test/privacy',
    'EXPO_PUBLIC_TERMS_URL=https://catdiary.test/terms',
    'CORS_ALLOWED_ORIGINS=https://preview.catdiary.test',
    `JWT_ACCESS_SECRET=${sampleJwtSecret}`,
    `COS_SECRET_KEY=${sampleCosSecret}`,
    `SMS_SECRET_KEY=${sampleSmsSecret}`,
    'COS_BUCKET=catdiary-preview-private',
    'COS_REGION=ap-shanghai',
  ].join('\n'),
);
writeFileSync(invalidEnvFile, 'not a valid env line\n');

try {
  const validJson = run([
    '--target',
    'preview',
    '--registry',
    'ccr.ccs.tencentyun.com',
    '--namespace',
    'harukains',
    '--sha',
    sampleSha,
    '--date',
    '20260717',
    '--env-file',
    envFile,
    '--skip-git-clean',
  ]);
  const validMarkdown = run([
    '--target',
    'preview',
    '--registry',
    'ccr.ccs.tencentyun.com',
    '--namespace',
    'harukains',
    '--sha',
    sampleSha,
    '--date',
    '20260717',
    '--env-file',
    envFile,
    '--format',
    'markdown',
    '--skip-git-clean',
  ]);

  const checks = {
    validJsonPasses: validJson.status === 0,
    validJsonShape: hasExpectedJson(validJson.stdout),
    redactsSecrets: !validJson.stdout.includes(sampleJwtSecret),
    markdownPasses: validMarkdown.status === 0,
    markdownIncludesCommands:
      validMarkdown.stdout.includes('docker build -f apps/api/Dockerfile') &&
      validMarkdown.stdout.includes('pnpm release:preflight'),
    markdownRedactsSecrets: !validMarkdown.stdout.includes(sampleCosSecret),
    rejectsInvalidTarget: rejects(['--target', 'dev', '--registry', 'ccr.ccs.tencentyun.com']),
    rejectsLocalRegistry: rejects([
      '--target',
      'preview',
      '--registry',
      '127.0.0.1:5000',
      '--namespace',
      'harukains',
    ]),
    rejectsMissingEnvFile: rejects([
      '--target',
      'preview',
      '--registry',
      'ccr.ccs.tencentyun.com',
      '--namespace',
      'harukains',
      '--env-file',
      join(tmp, 'missing.env'),
    ]),
    rejectsInvalidEnvSyntax: rejects([
      '--target',
      'preview',
      '--registry',
      'ccr.ccs.tencentyun.com',
      '--namespace',
      'harukains',
      '--env-file',
      invalidEnvFile,
    ]),
  };

  if (!Object.values(checks).every(Boolean)) {
    console.error(`RELEASE_PLAN_SELF_CHECK_INVALID ${JSON.stringify(checks)}`);
    process.exit(1);
  }

  console.log(`RELEASE_PLAN_SELF_CHECK_OK ${JSON.stringify(checks)}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

function run(args) {
  return spawnSync(
    process.execPath,
    [
      script,
      ...args,
      ...(args.includes('--sha') ? [] : ['--sha', sampleSha]),
      ...(args.includes('--date') ? [] : ['--date', '20260717']),
      '--skip-git-clean',
    ],
    { cwd: root, encoding: 'utf8', env: process.env },
  );
}

function rejects(args) {
  return run(args).status !== 0;
}

function hasExpectedJson(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    return (
      parsed.ok === true &&
      parsed.target === 'preview' &&
      parsed.images.tag === '20260717-abcdef123456' &&
      parsed.images.api ===
        'ccr.ccs.tencentyun.com/harukains/cat-diary-api:20260717-abcdef123456' &&
      parsed.environment.provided === true &&
      parsed.environment.publicValues.PUBLIC_API_URL ===
        'https://preview-api.catdiary.test/api/v1' &&
      parsed.environment.secretKeysPresent.includes('JWT_ACCESS_SECRET')
    );
  } catch {
    return false;
  }
}
