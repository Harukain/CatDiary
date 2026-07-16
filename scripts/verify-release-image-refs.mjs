import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const script = resolve(import.meta.dirname, 'release-image-refs.mjs');
const sampleSha = ['abcdef', '123456', '7890ab', 'cdef12', '345678', '90abcd', 'ef12'].join('');

const validJson = run([
  '--registry',
  'ccr.ccs.tencentyun.com',
  '--namespace',
  'harukains',
  '--sha',
  sampleSha,
  '--date',
  '20260717',
  '--skip-git-clean',
  '--json',
]);

const validExport = run([
  '--registry',
  'ccr.ccs.tencentyun.com',
  '--namespace',
  'harukains/catdiary',
  '--image-prefix',
  'cat-diary',
  '--sha',
  sampleSha,
  '--date',
  '20260717',
  '--skip-git-clean',
  '--format',
  'export',
]);

const checks = {
  validJsonPasses: validJson.status === 0,
  validJsonShape: hasExpectedJson(validJson.stdout),
  validExportPasses: validExport.status === 0,
  validExportShape:
    validExport.stdout.includes(
      'export API_IMAGE=ccr.ccs.tencentyun.com/harukains/catdiary/cat-diary-api:20260717-abcdef123456',
    ) &&
    validExport.stdout.includes(
      'export WORKER_IMAGE=ccr.ccs.tencentyun.com/harukains/catdiary/cat-diary-worker:20260717-abcdef123456',
    ),
  rejectsMissingRegistry: rejects(['--namespace', 'harukains', '--sha', sampleSha]),
  rejectsHttpRegistry: rejects([
    '--registry',
    'https://ccr.ccs.tencentyun.com',
    '--namespace',
    'harukains',
    '--sha',
    sampleSha,
  ]),
  rejectsLocalRegistry: rejects([
    '--registry',
    '127.0.0.1:5000',
    '--namespace',
    'harukains',
    '--sha',
    sampleSha,
  ]),
  rejectsInvalidNamespace: rejects([
    '--registry',
    'ccr.ccs.tencentyun.com',
    '--namespace',
    'Harukains',
    '--sha',
    sampleSha,
  ]),
  rejectsInvalidSha: rejects([
    '--registry',
    'ccr.ccs.tencentyun.com',
    '--namespace',
    'harukains',
    '--sha',
    'main',
  ]),
  rejectsInvalidDate: rejects([
    '--registry',
    'ccr.ccs.tencentyun.com',
    '--namespace',
    'harukains',
    '--sha',
    sampleSha,
    '--date',
    '20260230',
  ]),
};

if (!Object.values(checks).every(Boolean)) {
  console.error(`RELEASE_IMAGE_REFS_SELF_CHECK_INVALID ${JSON.stringify(checks)}`);
  process.exit(1);
}

console.log(`RELEASE_IMAGE_REFS_SELF_CHECK_OK ${JSON.stringify(checks)}`);

function run(args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });
}

function rejects(args) {
  const finalArgs = [...args];
  if (!finalArgs.includes('--date')) finalArgs.push('--date', '20260717');
  finalArgs.push('--skip-git-clean', '--json');
  return run(finalArgs).status !== 0;
}

function hasExpectedJson(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    return (
      parsed.ok === true &&
      parsed.IMAGE_TAG === '20260717-abcdef123456' &&
      parsed.COMMIT_SHA === sampleSha &&
      parsed.API_IMAGE === 'ccr.ccs.tencentyun.com/harukains/cat-diary-api:20260717-abcdef123456' &&
      parsed.WORKER_IMAGE ===
        'ccr.ccs.tencentyun.com/harukains/cat-diary-worker:20260717-abcdef123456'
    );
  } catch {
    return false;
  }
}
