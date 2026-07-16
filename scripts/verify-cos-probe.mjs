import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const probe = resolve(import.meta.dirname, 'probe-cos-environment.mjs');
const tempDir = mkdtempSync(join(tmpdir(), 'cat-diary-cos-probe-'));
const fakeSecretId = 'fakeCosSecretIdForDryRunOnly123';
const fakeSecretKey = 'catDiaryPreviewSecretKeyForDryRunOnly123';
const fakeEnv = {
  PATH: process.env.PATH,
  APP_ENV: 'preview',
  COS_SECRET_ID: fakeSecretId,
  COS_SECRET_KEY: fakeSecretKey,
  COS_BUCKET: 'catdiary-preview-1250000000',
  COS_REGION: 'ap-shanghai',
};

try {
  const placeholderEnvFile = join(tempDir, 'placeholder.env');
  writeFileSync(
    placeholderEnvFile,
    [
      'APP_ENV=preview',
      'COS_SECRET_ID=__PREVIEW_COS_SECRET_ID__',
      'COS_SECRET_KEY=__PREVIEW_COS_SECRET_KEY__',
      'COS_BUCKET=__PREVIEW_COS_PRIVATE_BUCKET__',
      'COS_REGION=ap-shanghai',
      '',
    ].join('\n'),
  );

  const checks = {
    help: run(['--help']).status === 0,
    rejectsMissingTarget: rejectsConfig(['--dry-run', '--json'], 'target'),
    rejectsInvalidTarget: rejectsConfig(
      ['--target', 'staging', '--dry-run', '--json'],
      'target',
      fakeEnv,
    ),
    rejectsMissingCosEnv: rejectsConfig(
      ['--target', 'preview', '--dry-run', '--json'],
      'COS_SECRET_ID',
    ),
    rejectsPlaceholderEnvFile: rejectsConfig(
      ['--target', 'preview', '--env-file', placeholderEnvFile, '--dry-run', '--json'],
      'COS_SECRET_ID',
    ),
    acceptsDryRun: acceptsDryRun(),
    redactsSecrets: redactsSecrets(),
  };

  if (!Object.values(checks).every(Boolean)) {
    console.error(`COS_PROBE_SELF_CHECK_INVALID ${JSON.stringify(checks)}`);
    process.exit(1);
  }

  console.log(`COS_PROBE_SELF_CHECK_OK ${JSON.stringify(checks)}`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function run(args, env = { PATH: process.env.PATH }) {
  return spawnSync(process.execPath, [probe, ...args], {
    encoding: 'utf8',
    env,
  });
}

function rejectsConfig(args, expectedCheckName, env) {
  const result = run(args, env);
  if (result.status === 0) return false;
  const body = parseJson(result.stdout);
  return body?.checks?.some((check) => check.name === expectedCheckName && check.ok === false);
}

function acceptsDryRun() {
  const result = run(['--target', 'preview', '--dry-run', '--json'], fakeEnv);
  const body = parseJson(result.stdout);
  return (
    result.status === 0 &&
    body?.summary?.ok === true &&
    body?.checks?.some((check) => check.name === 'dryRun')
  );
}

function redactsSecrets() {
  const result = run(['--target', 'preview', '--dry-run', '--json'], fakeEnv);
  const combined = `${result.stdout}\n${result.stderr}`;
  return !combined.includes(fakeSecretId) && !combined.includes(fakeSecretKey);
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
