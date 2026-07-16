import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const defaultChecklistPath = resolve(root, 'docs/EXTERNAL_ACCEPTANCE_CHECKLIST.md');

try {
  const options = parseArgs(process.argv.slice(2));
  const checklistPath = resolvePath(options.checklist ?? defaultChecklistPath);
  const checklist = readFileSync(checklistPath, 'utf8');
  const report = buildReport(parseChecklist(checklist, checklistPath));
  const output =
    options.format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report);

  if (options.output) writeFileSync(resolvePath(options.output), output);
  else process.stdout.write(output);

  if (report.summary.sensitiveFindings > 0) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseChecklist(checklist, path) {
  const lines = checklist.split(/\r?\n/);
  const items = [];
  const sensitiveFindings = [];
  let section = '未分组';

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    const heading = line.match(/^##\s+(?:\d+\.\s+)?(.+)$/);
    if (heading) section = heading[1].trim();

    sensitiveFindings.push(...detectSensitiveValue(line, lineNumber));

    const checklistItem = line.match(/^-\s+\[( |x|X)\]\s+(.+)$/);
    if (!checklistItem) continue;

    const checked = checklistItem[1].toLowerCase() === 'x';
    const text = checklistItem[2].trim();
    items.push({
      line: lineNumber,
      section,
      text,
      checked,
      placeholder: /待确认/.test(text),
    });
  }

  return { path, items, sensitiveFindings };
}

function buildReport({ path, items, sensitiveFindings }) {
  const sensitiveLines = new Set(sensitiveFindings.map((finding) => finding.line));
  const publicItems = items.map((item) => ({
    line: item.line,
    section: item.section,
    text: sensitiveLines.has(item.line) ? '<已隐藏：该行疑似包含敏感信息>' : item.text,
    checked: item.checked,
    placeholder: item.placeholder,
    status: item.checked && !item.placeholder ? 'done' : 'pending',
  }));

  const sections = [];
  for (const sectionName of [...new Set(publicItems.map((item) => item.section))]) {
    const sectionItems = publicItems.filter((item) => item.section === sectionName);
    sections.push({
      name: sectionName,
      totalItems: sectionItems.length,
      checkedItems: sectionItems.filter((item) => item.status === 'done').length,
      pendingItems: sectionItems.filter((item) => item.status !== 'done').length,
      items: sectionItems,
    });
  }

  const totalItems = publicItems.length;
  const checkedItems = publicItems.filter((item) => item.status === 'done').length;
  const pendingItems = publicItems.length - checkedItems;
  const readyForProduction = pendingItems === 0 && sensitiveFindings.length === 0;

  const summary = {
    checklist: path,
    generatedAt: new Date().toISOString(),
    totalItems,
    checkedItems,
    pendingItems,
    completionPercent:
      totalItems === 0 ? 0 : Number(((checkedItems / totalItems) * 100).toFixed(1)),
    sensitiveFindings: sensitiveFindings.length,
    readyForProduction,
    releaseStatus: readyForProduction
      ? '可进入 Production 发布前最终复核'
      : '不能进入 Production 发布',
  };

  return {
    summary,
    nextActions: buildNextActions({ sections, sensitiveFindings }),
    sensitiveFindings: sensitiveFindings.map(({ line, reason }) => ({ line, reason })),
    sections,
  };
}

function buildNextActions({ sections, sensitiveFindings }) {
  const actions = [];
  if (sensitiveFindings.length > 0)
    actions.push(
      '先移除清单中的疑似 Secret/Token/密码/私钥，仅保留“已确认/是/否/不适用”等非敏感结果。',
    );

  const pendingNames = sections
    .filter((section) => section.pendingItems > 0)
    .map((section) => section.name);

  if (pendingNames.some((name) => name.includes('需要确认')))
    actions.push(
      '补齐 Preview/Production API、腾讯云地域、COS Bucket、短信模板等非敏感标识；不要填写 Secret 值。',
    );
  if (pendingNames.some((name) => name.includes('COS')))
    actions.push(
      '在腾讯云 COS 完成私有 Bucket、CAM 最小权限、CORS、10MB 限制、生命周期/版本控制和误删恢复验证。',
    );
  if (pendingNames.some((name) => name.includes('EAS')))
    actions.push(
      '用当前 Git HEAD 的 Development Build 做 iOS/Android 真机回归，并用 `pnpm acceptance:evidence -- --file <证据文件> --require-passed` 校验证据。',
    );
  if (pendingNames.some((name) => name.includes('Preview 环境')))
    actions.push(
      '部署 Preview 后运行 `release:preflight`、`preview:probe`、备份恢复和监控告警验证，再勾选环境项。',
    );
  if (pendingNames.some((name) => name.includes('Preview 回归')))
    actions.push(
      '完成 14 条 App E2E 主流程、双平台/多机型覆盖、P0/P1 清零、法律文档和内测构建安装验证。',
    );

  if (actions.length === 0) actions.push('清单已完成；进入 Production 发布前最终复核。');
  return actions;
}

function renderMarkdown(report) {
  const lines = [
    '# 外部环境与真机验收报告',
    '',
    `- 生成时间：${report.summary.generatedAt}`,
    `- 清单：${report.summary.checklist}`,
    `- 完成度：${report.summary.checkedItems}/${report.summary.totalItems}（${report.summary.completionPercent}%）`,
    `- 待处理：${report.summary.pendingItems}`,
    `- 敏感信息检查：${report.summary.sensitiveFindings === 0 ? '未发现疑似敏感信息' : `${report.summary.sensitiveFindings} 项需处理`}`,
    `- 发布状态：${report.summary.releaseStatus}`,
    '',
    '## 下一步建议',
    '',
    ...report.nextActions.map((action) => `- ${action}`),
  ];

  if (report.sensitiveFindings.length > 0) {
    lines.push('', '## 疑似敏感信息', '');
    for (const finding of report.sensitiveFindings)
      lines.push(`- L${finding.line}: ${finding.reason}`);
  }

  lines.push('', '## 按章节状态', '');
  for (const section of report.sections) {
    lines.push(
      `### ${section.name}`,
      '',
      `- 完成：${section.checkedItems}/${section.totalItems}`,
      `- 待处理：${section.pendingItems}`,
      '',
    );

    const pending = section.items.filter((item) => item.status !== 'done');
    if (pending.length > 0) {
      lines.push('待处理项：');
      for (const item of pending) lines.push(`- L${item.line}: ${item.text}`);
      lines.push('');
    }

    const completed = section.items.filter((item) => item.status === 'done');
    if (completed.length > 0) {
      lines.push('已完成项：');
      for (const item of completed) lines.push(`- L${item.line}: ${item.text}`);
      lines.push('');
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function detectSensitiveValue(line, lineNumber) {
  const findings = [];
  if (/-----BEGIN [A-Z ]+PRIVATE KEY-----/.test(line))
    findings.push({ line: lineNumber, reason: '包含私钥头' });
  if (
    /\b(?:TOKEN|PASSWORD|SECRET_KEY|SECRET_ACCESS_KEY)\s*=\s*['"]?[A-Za-z0-9_./+=-]{12,}/i.test(
      line,
    )
  )
    findings.push({ line: lineNumber, reason: '疑似明文环境密钥或密码' });

  const valueMatch = line.match(
    /(?:SecretId|SecretKey|AccessKey|Token|密码|私钥|密钥)[^：:]*[：:]\s*(`[^`]+`|[^，。；\s]+)/i,
  );
  if (!valueMatch) return findings;

  const value = valueMatch[1];
  if (!isAllowedSensitiveConfirmation(value))
    findings.push({ line: lineNumber, reason: '疑似把敏感标识或密钥值写入清单' });
  return findings;
}

function isAllowedSensitiveConfirmation(value) {
  return /^(待确认|已确认|是|否|不适用|N\/A)$/i.test(stripInlineCode(value));
}

function stripInlineCode(value) {
  return value.replaceAll('`', '').trim();
}

function parseArgs(argv) {
  const parsed = {
    checklist: undefined,
    format: 'markdown',
    output: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--checklist') {
      parsed.checklist = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--format') {
      parsed.format = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--output') {
      parsed.output = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`外部环境与真机验收报告

Usage:
  pnpm acceptance:report
  pnpm acceptance:report -- --format json
  pnpm acceptance:report -- --output /tmp/catdiary-acceptance-report.md

Options:
  --checklist <path>      可选：指定验收清单，默认 docs/EXTERNAL_ACCEPTANCE_CHECKLIST.md
  --format <markdown|json> 输出格式，默认 markdown
  --output <path>         可选：写入报告文件
`);
      process.exit(0);
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }

  if (!['markdown', 'json'].includes(parsed.format))
    throw new Error('--format 只支持 markdown 或 json');
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
