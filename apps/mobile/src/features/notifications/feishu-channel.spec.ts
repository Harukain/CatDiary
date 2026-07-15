import { describe, expect, it } from 'vitest';
import {
  feishuChannelStatusCopy,
  isFeishuWebhookDraftDirty,
  normalizeFeishuWebhookUrl,
  resolveFeishuChannelStatus,
  validateFeishuWebhookUrl,
} from './feishu-channel';

describe('feishu channel rules', () => {
  it('normalizes whitespace before saving', () => {
    expect(normalizeFeishuWebhookUrl('  https://open.feishu.cn/open-apis/bot/v2/hook/abc  ')).toBe(
      'https://open.feishu.cn/open-apis/bot/v2/hook/abc',
    );
  });

  it('accepts Feishu and Lark custom bot webhooks', () => {
    expect(validateFeishuWebhookUrl('https://open.feishu.cn/open-apis/bot/v2/hook/abc')).toBe('');
    expect(validateFeishuWebhookUrl('https://open.larksuite.com/open-apis/bot/v2/hook/abc')).toBe(
      '',
    );
  });

  it('rejects insecure or unrelated webhook URLs', () => {
    expect(validateFeishuWebhookUrl('http://open.feishu.cn/open-apis/bot/v2/hook/abc')).toBe(
      'Webhook 必须使用 HTTPS',
    );
    expect(validateFeishuWebhookUrl('https://example.com/open-apis/bot/v2/hook/abc')).toBe(
      '仅支持飞书或 Lark 自定义机器人 Webhook',
    );
    expect(validateFeishuWebhookUrl('https://open.feishu.cn/open-apis/card/abc')).toBe(
      '请输入自定义机器人 Webhook 地址',
    );
  });

  it('tracks unsaved webhook drafts', () => {
    expect(isFeishuWebhookDraftDirty('')).toBe(false);
    expect(isFeishuWebhookDraftDirty('  ')).toBe(false);
    expect(isFeishuWebhookDraftDirty('https://open.feishu.cn/open-apis/bot/v2/hook/abc')).toBe(
      true,
    );
  });

  it('resolves configured status from enabled channel state', () => {
    expect(resolveFeishuChannelStatus(undefined)).toBe('unconfigured');
    expect(resolveFeishuChannelStatus({ enabled: false })).toBe('unconfigured');
    expect(resolveFeishuChannelStatus({ enabled: true })).toBe('configured');
  });

  it('returns explicit user-facing status copy', () => {
    expect(feishuChannelStatusCopy('configured').title).toBe('已配置');
    expect(feishuChannelStatusCopy('unconfigured').title).toBe('未配置');
  });
});
