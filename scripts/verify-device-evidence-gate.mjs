import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const root = resolve(import.meta.dirname, '..');
const verifier = resolve(import.meta.dirname, 'verify-device-acceptance-evidence.mjs');
const templatePath = resolve(root, 'docs/DEVICE_ACCEPTANCE_EVIDENCE.example.json');

const currentHead = readCurrentGitHead();
if (!currentHead) {
  console.error('DEVICE_EVIDENCE_GATE_SELF_CHECK_INVALID {"gitHead":false}');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'catdiary-device-evidence-'));
try {
  const template = JSON.parse(readFileSync(templatePath, 'utf8'));
  const validPath = join(tmp, 'valid-current-head.json');
  writeFileSync(
    validPath,
    `${JSON.stringify(completedEvidence(template, currentHead), null, 2)}\n`,
  );

  const malformedPath = join(tmp, 'malformed-commit.json');
  writeFileSync(
    malformedPath,
    `${JSON.stringify(completedEvidence(template, 'not-a-git-sha'), null, 2)}\n`,
  );

  const stalePath = join(tmp, 'stale-commit.json');
  writeFileSync(
    stalePath,
    `${JSON.stringify(completedEvidence(template, '0'.repeat(40)), null, 2)}\n`,
  );

  const checks = {
    templateStillValid: run(['--file', templatePath, '--allow-template']).status === 0,
    currentHeadStrictPasses: run(['--file', validPath, '--require-passed']).status === 0,
    malformedCommitRejected: rejectsWith(malformedPath, [], 'sourceCommit'),
    staleCommitRejected: rejectsWith(stalePath, ['--require-passed'], '当前 HEAD'),
  };

  if (!Object.values(checks).every(Boolean)) {
    console.error(`DEVICE_EVIDENCE_GATE_SELF_CHECK_INVALID ${JSON.stringify(checks)}`);
    process.exit(1);
  }

  console.log(`DEVICE_EVIDENCE_GATE_SELF_CHECK_OK ${JSON.stringify(checks)}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

function completedEvidence(template, sourceCommit) {
  return {
    ...template,
    sourceCommit,
    createdAt: '2026-07-17T12:00:00+08:00',
    environment: {
      appEnvironment: 'development',
      apiBaseUrl: 'https://preview.example.com/api/v1',
      database: 'local-development',
      notes: '自检生成的脱敏真机验收证据样例',
    },
    deviceRuns: template.deviceRuns.map((run) => ({
      ...run,
      checkedAt: '2026-07-17T12:00:00+08:00',
      tester: 'QA self check',
      device: {
        ...run.device,
        model: run.platform === 'ios' ? 'iPhone self-check' : 'Android self-check',
        osVersion: run.platform === 'ios' ? 'iOS 18.5' : 'Android 15',
        screen: run.platform === 'ios' ? '393x852' : '360dp / 1080x2376',
        identifier: 'redacted-last4',
      },
      appBuild: {
        ...run.appBuild,
        profile: 'development',
        buildUrl: 'https://expo.dev/accounts/harukains-team/projects/catdiary/builds/self-check',
        version: '0.1.0',
        runtimeVersion: '1.0.0',
      },
      preflight: {
        ...run.preflight,
        command:
          run.platform === 'ios'
            ? "EXPO_PUBLIC_API_URL='https://preview.example.com/api/v1' IOS_METRO_URL='http://192.0.2.10:8081' pnpm ios:preflight"
            : 'pnpm android:preflight -- --fix --launch',
        status: 'passed',
        evidence: '自检样例：预检通过摘要',
      },
      logs: {
        ...run.logs,
        jsCrashFree: true,
        nativeCrashFree: true,
        evidence: '自检样例：未发现 JS 或原生崩溃',
      },
    })),
    mvpFlows: template.mvpFlows.map((item) => ({
      ...item,
      status: 'passed',
      evidence: `自检样例：${item.title} 已通过`,
    })),
    deviceChecks: template.deviceChecks.map((item) => ({
      ...item,
      status: 'passed',
      evidence: `自检样例：${item.title} 已通过`,
    })),
    openIssues: [],
  };
}

function run(args) {
  return spawnSync(process.execPath, [verifier, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
    },
  });
}

function rejectsWith(file, args, expectedText) {
  const result = run(['--file', file, ...args]);
  if (result.status === 0) return false;
  return `${result.stdout}\n${result.stderr}`.includes(expectedText);
}

function readCurrentGitHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  const value = result.stdout.trim();
  return /^[a-f0-9]{40}$/i.test(value) ? value : null;
}
