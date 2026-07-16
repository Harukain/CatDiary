import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const script = resolve(import.meta.dirname, 'acceptance-report.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'catdiary-acceptance-report-'));
const fixtureValue = ['fixture', 'value', 'material', '1234567890'].join('-');

try {
  const json = run(['--format', 'json']);
  const markdown = run(['--format', 'markdown']);
  const outputFile = join(tmp, 'report.md');
  const output = run(['--format', 'markdown', '--output', outputFile]);
  const sensitiveChecklist = join(tmp, 'sensitive-checklist.md');
  writeFileSync(
    sensitiveChecklist,
    [
      '# 外部环境与真机验收清单',
      '',
      '## 1. 需要确认的非敏感信息',
      '',
      '- [x] EAS 项目：`@harukains-team/catdiary`',
      `- [ ] COS SecretKey：\`${fixtureValue}\``,
    ].join('\n'),
  );
  const sensitive = run(['--checklist', sensitiveChecklist, '--format', 'markdown']);

  const checks = {
    jsonPasses: json.status === 0,
    jsonShape: hasExpectedJson(json.stdout),
    markdownPasses: markdown.status === 0,
    markdownIncludesSummary:
      markdown.stdout.includes('完成度：5/56') &&
      markdown.stdout.includes('发布状态：不能进入 Production 发布') &&
      markdown.stdout.includes('## 下一步建议'),
    outputFileWritten: output.status === 0 && existsSync(outputFile),
    outputFileUseful:
      existsSync(outputFile) && readFileSync(outputFile, 'utf8').includes('按章节状态'),
    rejectsSensitiveChecklist: sensitive.status !== 0,
    redactsSensitiveChecklist:
      !sensitive.stdout.includes(fixtureValue) &&
      !sensitive.stderr.includes(fixtureValue) &&
      sensitive.stdout.includes('<已隐藏：该行疑似包含敏感信息>'),
  };

  if (!Object.values(checks).every(Boolean)) {
    console.error(`ACCEPTANCE_REPORT_SELF_CHECK_INVALID ${JSON.stringify(checks)}`);
    process.exit(1);
  }

  console.log(`ACCEPTANCE_REPORT_SELF_CHECK_OK ${JSON.stringify(checks)}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

function run(args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });
}

function hasExpectedJson(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    return (
      parsed.summary.totalItems === 56 &&
      parsed.summary.checkedItems === 5 &&
      parsed.summary.pendingItems === 51 &&
      parsed.summary.readyForProduction === false &&
      parsed.sections.some(
        (section) => section.name === 'EAS Development Build' && section.pendingItems === 14,
      ) &&
      parsed.nextActions.some((action) => action.includes('真机回归'))
    );
  } catch {
    return false;
  }
}
