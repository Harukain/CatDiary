import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const scriptPath = resolve(import.meta.dirname, 'verify-legal-docs.mjs');
const defaultPrivacyPath = resolve(root, 'docs/legal/PRIVACY_POLICY_DRAFT.md');
const defaultTermsPath = resolve(root, 'docs/legal/USER_AGREEMENT_DRAFT.md');

const definitions = {
  privacy: {
    label: '隐私政策',
    title: /猫伴日记隐私政策/,
    required: [
      ['版本', /版本[:：]\s*\S+/],
      ['生效日期', /生效日期[:：]\s*\S+/],
      ['运营主体', /运营主体[:：]/],
      ['联系方式', /(隐私邮箱|客服邮箱|联系我们)/],
      ['账号注销/删除渠道', /(账号注销|注销账号|账号删除|删除账号)/],
      ['收集的信息', /(收集的信息|我们收集|个人信息)/],
      ['使用目的', /(使用目的|用途|用于)/],
      ['权限用途', /(权限用途|相机权限|相册权限|通知权限)/],
      ['存储与保留', /(存储|保留|保存期限|删除)/],
      ['第三方处理者', /(第三方处理者|第三方服务|腾讯云|Expo|飞书)/],
      ['家庭共享', /(家庭共享|家庭成员|家庭权限)/],
      ['用户权利', /(用户权利|访问|更正|导出)/],
      ['未成年人', /未成年人/],
      ['不追踪/不用于广告', /(不用于广告|不追踪|不会用于追踪|不会.*广告)/],
    ],
  },
  terms: {
    label: '用户协议',
    title: /猫伴日记用户协议/,
    required: [
      ['版本', /版本[:：]\s*\S+/],
      ['生效日期', /生效日期[:：]\s*\S+/],
      ['运营主体', /运营主体[:：]/],
      ['联系方式', /(客服邮箱|隐私邮箱|联系我们)/],
      ['服务范围', /(服务范围|服务内容)/],
      ['账号与安全', /(账号与安全|验证码|登录设备)/],
      ['家庭与成员权限', /(家庭|成员权限|管理员)/],
      ['用户内容', /(用户内容|猫咪档案|照片|备注)/],
      ['提醒与医疗免责声明', /(医疗免责声明|不构成兽医诊断|提醒)/],
      ['费用说明', /(费用|付费|免费|订阅)/],
      ['第三方服务', /(第三方服务|飞书|系统推送)/],
      ['数据导出与账号注销', /(数据导出|账号注销|账号删除|删除账号)/],
      ['禁止行为', /(禁止行为|不得)/],
      ['变更/终止', /(服务变更|中止|终止|协议变更)/],
    ],
  },
};

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfCheck) {
    runSelfCheck();
    process.exit(0);
  }

  const report = buildReport(options);
  if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(renderText(report));

  if (
    report.summary.sensitiveFindings > 0 ||
    report.summary.missingRequiredItems > 0 ||
    (options.strict && report.summary.releaseBlockers > 0)
  )
    process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function buildReport(options) {
  const files = [
    {
      kind: 'privacy',
      path: resolvePath(options.privacy ?? defaultPrivacyPath),
    },
    {
      kind: 'terms',
      path: resolvePath(options.terms ?? defaultTermsPath),
    },
  ];

  const docs = files.map((file) => auditDoc(file));
  const missingRequiredItems = docs.reduce((sum, doc) => sum + doc.missing.length, 0);
  const placeholderFindings = docs.reduce((sum, doc) => sum + doc.placeholders.length, 0);
  const draftFindings = docs.reduce((sum, doc) => sum + doc.draftMarkers.length, 0);
  const sensitiveFindings = docs.reduce((sum, doc) => sum + doc.sensitiveFindings.length, 0);
  const releaseBlockers =
    missingRequiredItems + placeholderFindings + draftFindings + sensitiveFindings;

  return {
    summary: {
      generatedAt: new Date().toISOString(),
      strict: options.strict,
      documents: docs.length,
      missingRequiredItems,
      placeholderFindings,
      draftFindings,
      sensitiveFindings,
      releaseBlockers,
      readyForRelease: releaseBlockers === 0,
    },
    documents: docs,
  };
}

function auditDoc({ kind, path }) {
  const definition = definitions[kind];
  if (!existsSync(path)) {
    return {
      kind,
      label: definition.label,
      path,
      exists: false,
      missing: ['文件不存在'],
      placeholders: [],
      draftMarkers: [],
      sensitiveFindings: [],
    };
  }

  const content = readFileSync(path, 'utf8');
  const missing = [];
  if (!definition.title.test(content)) missing.push('标题必须包含“猫伴日记”及文档类型');
  for (const [name, pattern] of definition.required) {
    if (!pattern.test(content)) missing.push(name);
  }

  return {
    kind,
    label: definition.label,
    path,
    exists: true,
    missing,
    placeholders: findPlaceholders(content),
    draftMarkers: findDraftMarkers(content),
    sensitiveFindings: findSensitiveFindings(content),
  };
}

function findPlaceholders(content) {
  return findPatternHits(content, [
    ['待确认', /待确认/g],
    ['尖括号占位符', /<[^>\n]+>/g],
    ['TODO/TBD/FIXME', /\b(?:TODO|TBD|FIXME)\b/gi],
    [
      '示例域名或邮箱',
      /\b(?:example\.(?:com|cn|net|org|invalid)|your-domain\.example|privacy@example|support@example)\b/gi,
    ],
    ['日期占位符', /\b(?:YYYY-MM-DD|0000-00-00)\b/g],
  ]);
}

function findDraftMarkers(content) {
  return findPatternHits(content, [
    ['草稿声明', /(草稿|不可直接发布|不替代法律意见|待产品所有者|待合规|待法务)/g],
  ]);
}

function findSensitiveFindings(content) {
  return findPatternHits(content, [
    ['私钥头', /-----BEGIN [A-Z ]+PRIVATE KEY-----/g],
    ['疑似 GitHub Token', /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/g],
    ['疑似 AWS Access Key', /\bAKIA[0-9A-Z]{16}\b/g],
    ['疑似飞书/Slack Token', /\b(?:xox[baprs]-|lark_[A-Za-z0-9_-]{20,})[A-Za-z0-9_-]*\b/g],
    [
      '疑似环境密钥',
      /\b(?:TOKEN|PASSWORD|SECRET|SECRET_KEY|SECRET_ACCESS_KEY|ACCESS_KEY|PRIVATE_KEY)\s*=\s*['"]?[A-Za-z0-9_./+=-]{12,}/gi,
    ],
    [
      '疑似明文密钥字段',
      /(?:SecretId|SecretKey|AccessKey|Token|密码|私钥|密钥)[^：:\n]{0,24}[：:]\s*(`?)(?!待确认|已确认|是|否|不适用|N\/A)[A-Za-z0-9_./+=-]{16,}\1/gi,
    ],
  ]);
}

function findPatternHits(content, patterns) {
  const lines = content.split(/\r?\n/);
  const findings = [];
  for (const [index, line] of lines.entries()) {
    for (const [reason, pattern] of patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) findings.push({ line: index + 1, reason });
    }
  }
  return findings;
}

function renderText(report) {
  const lines = [
    '法律文档审计',
    `生成时间：${report.summary.generatedAt}`,
    `文档数量：${report.summary.documents}`,
    `缺失核心项：${report.summary.missingRequiredItems}`,
    `占位项：${report.summary.placeholderFindings}`,
    `草稿声明：${report.summary.draftFindings}`,
    `疑似敏感信息：${report.summary.sensitiveFindings}`,
    `发布状态：${report.summary.readyForRelease ? '可进入发布前人工复核' : '不能作为正式发布文本'}`,
    '',
  ];

  for (const doc of report.documents) {
    lines.push(`${doc.label}：${doc.exists ? doc.path : `${doc.path}（不存在）`}`);
    if (doc.missing.length > 0) {
      lines.push('  缺失核心项：');
      for (const item of doc.missing) lines.push(`  - ${item}`);
    }
    appendFindings(lines, '占位项', doc.placeholders);
    appendFindings(lines, '草稿声明', doc.draftMarkers);
    appendFindings(lines, '疑似敏感信息', doc.sensitiveFindings);
    if (
      doc.missing.length === 0 &&
      doc.placeholders.length === 0 &&
      doc.draftMarkers.length === 0 &&
      doc.sensitiveFindings.length === 0
    )
      lines.push('  结构检查通过。');
    lines.push('');
  }

  if (!report.summary.strict && !report.summary.readyForRelease) {
    lines.push(
      '提示：日常 audit 允许保留草稿占位项；发布前必须用 `pnpm legal:gate` 让占位项和草稿声明返回非零退出码。',
      '',
    );
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function appendFindings(lines, title, findings) {
  if (findings.length === 0) return;
  lines.push(`  ${title}：`);
  for (const finding of findings.slice(0, 12))
    lines.push(`  - L${finding.line}: ${finding.reason}`);
  if (findings.length > 12) lines.push(`  - ... 还有 ${findings.length - 12} 项`);
}

function runSelfCheck() {
  const currentAudit = run([]);

  const tmp = mkdtempSync(join(tmpdir(), 'catdiary-legal-docs-'));
  try {
    const privacy = join(tmp, 'privacy.md');
    const terms = join(tmp, 'terms.md');
    const draftPrivacy = join(tmp, 'privacy-draft.md');
    const draftTerms = join(tmp, 'terms-draft.md');
    const sensitive = join(tmp, 'privacy-sensitive.md');
    writeFileSync(privacy, confirmedPrivacyFixture());
    writeFileSync(terms, confirmedTermsFixture());
    writeFileSync(draftPrivacy, draftPrivacyFixture());
    writeFileSync(draftTerms, draftTermsFixture());
    writeFileSync(
      sensitive,
      `${confirmedPrivacyFixture()}\n\n内部密钥：SECRET_KEY=fixture-secret-value-1234567890\n`,
    );

    const draftAudit = run(['--privacy', draftPrivacy, '--terms', draftTerms]);
    const strictDraft = run(['--privacy', draftPrivacy, '--terms', draftTerms, '--strict']);
    const strictConfirmed = run(['--privacy', privacy, '--terms', terms, '--strict', '--json']);
    const sensitiveRejected = run(['--privacy', sensitive, '--terms', terms, '--strict', '--json']);

    const checks = {
      currentAuditPasses: currentAudit.status === 0,
      auditPassesWithDraftFixtures: draftAudit.status === 0,
      strictFailsWithDrafts: strictDraft.status !== 0,
      strictPassesWithConfirmedFixtures: strictConfirmed.status === 0,
      confirmedJsonShape: hasExpectedJson(strictConfirmed.stdout),
      rejectsSensitiveFixture: sensitiveRejected.status !== 0,
      redactsSensitiveFixture:
        !sensitiveRejected.stdout.includes('fixture-secret-value-1234567890') &&
        !sensitiveRejected.stderr.includes('fixture-secret-value-1234567890') &&
        sensitiveRejected.stdout.includes('疑似环境密钥'),
    };

    if (!Object.values(checks).every(Boolean)) {
      console.error(`LEGAL_DOCS_SELF_CHECK_INVALID ${JSON.stringify(checks)}`);
      process.exit(1);
    }

    console.log(`LEGAL_DOCS_SELF_CHECK_OK ${JSON.stringify(checks)}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function run(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });
}

function hasExpectedJson(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    return (
      parsed.summary.documents === 2 &&
      parsed.summary.readyForRelease === true &&
      parsed.summary.releaseBlockers === 0 &&
      parsed.documents.every((doc) => doc.exists && doc.missing.length === 0)
    );
  } catch {
    return false;
  }
}

function confirmedPrivacyFixture() {
  return `# 猫伴日记隐私政策

版本：v1.0.0
生效日期：2026-07-17
运营主体：猫伴日记服务运营者
隐私邮箱：privacy@catdiary.test
客服邮箱：support@catdiary.test

## 1. 我们收集的信息
我们收集手机号、用户 ID、猫咪档案、任务、饮食、排便、呕吐、体重、疫苗、驱虫、用药、照片、备注、设备推送 Token 和安全日志等个人信息与用户内容。

## 2. 使用目的
上述信息用于登录、家庭协作、权限隔离、记录、提醒、相册、数据导出、故障排查和服务安全。

## 3. 权限用途
相机权限用于拍摄照片，相册权限用于选择照片，通知权限用于发送提醒。

## 4. 存储、保留与删除
数据存储在腾讯云上海地域；记录保留到用户删除或账号注销，导出文件 7 天过期，本机缓存按记录 90 天、任务 7 天保留。

## 5. 第三方处理者
第三方处理者包括腾讯云短信、腾讯云对象存储 COS、腾讯云 PostgreSQL 与 Redis、Expo Push 和用户配置的飞书 Webhook。

## 6. 家庭共享与数据可见性
家庭成员按家庭权限查看猫咪档案、任务、记录、照片和通知状态。

## 7. 用户权利
用户可以访问、更正、删除、导出数据，并通过 App 内“我的 - 账号与隐私 - 注销账号”申请账号注销或账号删除。

## 8. 未成年人
未成年人应在监护人同意和指导下使用。

## 9. 不追踪与广告
我们不追踪用户，不用于广告投放，也不会出售用户内容。
`;
}

function draftPrivacyFixture() {
  return confirmedPrivacyFixture()
    .replace('# 猫伴日记隐私政策', '# 猫伴日记隐私政策（草稿）')
    .replace('生效日期：2026-07-17', '生效日期：<YYYY-MM-DD，待确认>')
    .replace('运营主体：猫伴日记服务运营者', '运营主体：<运营主体法定名称，待确认>')
    .replace('隐私邮箱：privacy@catdiary.test', '隐私邮箱：<privacy@your-domain.example，待确认>')
    .replace('客服邮箱：support@catdiary.test', '客服邮箱：<support@your-domain.example，待确认>');
}

function confirmedTermsFixture() {
  return `# 猫伴日记用户协议

版本：v1.0.0
生效日期：2026-07-17
运营主体：猫伴日记服务运营者
客服邮箱：support@catdiary.test
隐私邮箱：privacy@catdiary.test

## 1. 服务范围
服务范围包括猫咪档案、照顾任务、提醒、记录、相册、就医摘要、家庭协作、系统推送、飞书 Webhook 和数据导出。

## 2. 账号与安全
用户通过手机号验证码登录，应保护验证码、登录设备和账号安全。

## 3. 家庭与成员权限
管理员和家庭成员按权限管理猫咪、成员、记录、任务、通知和数据导出。

## 4. 用户内容
用户内容包括猫咪档案、任务、记录、照片和备注，用户应确保内容合法真实。

## 5. 提醒与医疗免责声明
提醒可能受网络和系统影响；健康记录和就医摘要不构成兽医诊断、治疗建议或处方。

## 6. 费用
当前版本免费；后续付费、订阅或收费功能会在购买前说明。

## 7. 通知与第三方服务
系统推送、飞书和其他第三方服务可能因网络、权限或供应商规则不可用。

## 8. 数据导出与账号注销
用户可以导出数据，并通过 App 内“我的 - 账号与隐私 - 注销账号”申请账号注销、删除账号或账号删除。

## 9. 禁止行为
用户不得攻击服务、绕过权限、访问他人家庭数据、上传恶意文件或实施违法行为。

## 10. 服务变更、中止与终止
我们可能因安全、运维、法律或业务原因变更、中止或终止部分功能。

## 11. 协议变更
协议变更时会更新版本号和生效日期。
`;
}

function draftTermsFixture() {
  return confirmedTermsFixture()
    .replace('# 猫伴日记用户协议', '# 猫伴日记用户协议（草稿）')
    .replace('生效日期：2026-07-17', '生效日期：<YYYY-MM-DD，待确认>')
    .replace('运营主体：猫伴日记服务运营者', '运营主体：<运营主体法定名称，待确认>')
    .replace('客服邮箱：support@catdiary.test', '客服邮箱：<support@your-domain.example，待确认>')
    .replace('隐私邮箱：privacy@catdiary.test', '隐私邮箱：<privacy@your-domain.example，待确认>');
}

function parseArgs(argv) {
  const parsed = {
    privacy: undefined,
    terms: undefined,
    strict: false,
    json: false,
    selfCheck: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--privacy') {
      parsed.privacy = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--terms') {
      parsed.terms = requireArg(argv, index, arg);
      index += 1;
    } else if (arg === '--strict') {
      parsed.strict = true;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--self-check') {
      parsed.selfCheck = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`法律文档审计

Usage:
  pnpm legal:audit
  pnpm legal:gate
  pnpm test:legal-docs

Options:
  --privacy <path>  指定隐私政策 Markdown，默认 docs/legal/PRIVACY_POLICY_DRAFT.md
  --terms <path>    指定用户协议 Markdown，默认 docs/legal/USER_AGREEMENT_DRAFT.md
  --strict          发布门禁模式，占位项和草稿声明会失败
  --json            输出 JSON
  --self-check      运行脚本自检
`);
      process.exit(0);
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }

  return parsed;
}

function requireArg(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} 需要参数`);
  return value;
}

function resolvePath(path) {
  return isAbsolute(path) ? path : resolve(root, path);
}
