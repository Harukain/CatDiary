import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const checklistPath = resolve(root, 'docs/EXTERNAL_ACCEPTANCE_CHECKLIST.md');
const args = new Set(process.argv.slice(2));
const json = args.has('--json');
const strict = args.has('--strict');

const checklist = readFileSync(checklistPath, 'utf8');
const lines = checklist.split(/\r?\n/);

const items = [];
const sensitiveFindings = [];
let section = '未分组';

function stripInlineCode(value) {
  return value.replaceAll('`', '').trim();
}

function isAllowedSensitiveConfirmation(value) {
  return /^(待确认|已确认|是|否|不适用|N\/A)$/i.test(stripInlineCode(value));
}

function detectSensitiveValue(line, lineNumber) {
  if (/-----BEGIN [A-Z ]+PRIVATE KEY-----/.test(line))
    sensitiveFindings.push({ line: lineNumber, reason: '包含私钥头' });
  if (
    /\b(?:TOKEN|PASSWORD|SECRET_KEY|SECRET_ACCESS_KEY)\s*=\s*['"]?[A-Za-z0-9_./+=-]{12,}/i.test(
      line,
    )
  )
    sensitiveFindings.push({ line: lineNumber, reason: '疑似明文环境密钥或密码' });

  const valueMatch = line.match(
    /(?:SecretId|SecretKey|AccessKey|Token|密码|私钥|密钥)[^：:]*[：:]\s*(`[^`]+`|[^，。；\s]+)/i,
  );
  if (!valueMatch) return;

  const value = valueMatch[1];
  if (!isAllowedSensitiveConfirmation(value))
    sensitiveFindings.push({ line: lineNumber, reason: '疑似把敏感标识或密钥值写入清单' });
}

for (const [index, line] of lines.entries()) {
  const lineNumber = index + 1;
  const heading = line.match(/^##\s+\d+\.\s+(.+)$/);
  if (heading) section = heading[1].trim();

  detectSensitiveValue(line, lineNumber);

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

const pendingItems = items.filter((item) => !item.checked || item.placeholder);
const pendingBySection = pendingItems.reduce((accumulator, item) => {
  accumulator[item.section] ??= [];
  accumulator[item.section].push(item);
  return accumulator;
}, {});

const summary = {
  checklist: checklistPath,
  totalItems: items.length,
  checkedItems: items.filter((item) => item.checked && !item.placeholder).length,
  pendingItems: pendingItems.length,
  sensitiveFindings: sensitiveFindings.length,
  readyForProduction: pendingItems.length === 0 && sensitiveFindings.length === 0,
};

if (json) {
  console.log(JSON.stringify({ summary, pendingBySection, sensitiveFindings }, null, 2));
} else {
  console.log('外部环境与真机验收审计');
  console.log(`清单：${checklistPath}`);
  console.log(
    `完成：${summary.checkedItems}/${summary.totalItems}；待处理：${summary.pendingItems}`,
  );

  if (sensitiveFindings.length > 0) {
    console.log('\n疑似敏感信息写入清单：');
    for (const finding of sensitiveFindings) console.log(`- L${finding.line}: ${finding.reason}`);
  }

  if (pendingItems.length > 0) {
    console.log('\n待完成项：');
    for (const [group, groupItems] of Object.entries(pendingBySection)) {
      console.log(`\n${group}（${groupItems.length}）`);
      for (const item of groupItems.slice(0, 8)) console.log(`- L${item.line}: ${item.text}`);
      if (groupItems.length > 8) console.log(`- ... 还有 ${groupItems.length - 8} 项`);
    }
  } else {
    console.log('\n全部外部环境与真机验收项已完成。');
  }

  console.log(
    `\n发布状态：${summary.readyForProduction ? '可进入 Production 发布前最终复核' : '不能进入 Production 发布'}`,
  );
  if (!strict && !summary.readyForProduction)
    console.log('提示：发布前使用 `pnpm acceptance:gate` 让未完成项返回非零退出码。');
}

if (sensitiveFindings.length > 0 || (strict && pendingItems.length > 0)) process.exitCode = 1;
