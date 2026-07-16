import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const probe = resolve(import.meta.dirname, 'probe-preview-environment.mjs');

const checks = {
  help: run(['--help']).status === 0,
  rejectsMissingUrl: rejectsWithConfiguration([]),
  rejectsHttpUrl: rejectsPreviewUrl('http://preview.example.com/api/v1', 'HTTPS'),
  rejectsLocalHttpsUrl: rejectsPreviewUrl('https://localhost/api/v1', 'local'),
  rejectsWrongPath: rejectsPreviewUrl('https://preview.example.com/api', '/api/v1'),
};

if (!Object.values(checks).every(Boolean)) {
  console.error(`PREVIEW_PROBE_SELF_CHECK_INVALID ${JSON.stringify(checks)}`);
  process.exit(1);
}

console.log(`PREVIEW_PROBE_SELF_CHECK_OK ${JSON.stringify(checks)}`);

function run(args) {
  return spawnSync(process.execPath, [probe, ...args], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
    },
  });
}

function rejectsWithConfiguration(args) {
  const result = run(['--json', ...args]);
  if (result.status === 0) return false;
  const body = parseJson(result.stdout);
  return body?.checks?.[0]?.name === 'configuration';
}

function rejectsPreviewUrl(url, expectedDetail) {
  const result = run(['--url', url, '--json']);
  if (result.status === 0) return false;
  const body = parseJson(result.stdout);
  return (
    body?.checks?.[0]?.name === 'previewApiUrl' &&
    String(body.checks[0].detail).includes(expectedDetail)
  );
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
