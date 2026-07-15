export type FeishuChannelStatus = 'configured' | 'unconfigured';

const allowedHosts = new Set(['open.feishu.cn', 'open.larksuite.com']);

export function normalizeFeishuWebhookUrl(value: string) {
  return value.trim();
}

export function isFeishuWebhookDraftDirty(value: string) {
  return normalizeFeishuWebhookUrl(value).length > 0;
}

export function validateFeishuWebhookUrl(value: string) {
  const normalized = normalizeFeishuWebhookUrl(value);
  if (!normalized) return '请输入飞书机器人 Webhook';
  if (normalized.length > 500) return 'Webhook 不能超过 500 个字符';
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'https:') return 'Webhook 必须使用 HTTPS';
    if (!allowedHosts.has(parsed.hostname)) return '仅支持飞书或 Lark 自定义机器人 Webhook';
    if (!parsed.pathname.includes('/open-apis/bot/')) return '请输入自定义机器人 Webhook 地址';
    return '';
  } catch {
    return 'Webhook 地址格式不正确';
  }
}

export function resolveFeishuChannelStatus(channel: { enabled: boolean } | null | undefined) {
  if (!channel?.enabled) return 'unconfigured' satisfies FeishuChannelStatus;
  return 'configured' satisfies FeishuChannelStatus;
}

export function feishuChannelStatusCopy(status: FeishuChannelStatus) {
  if (status === 'configured')
    return {
      title: '已配置',
      detail: '家庭提醒会同时发送到已绑定的飞书群机器人。',
    };
  return {
    title: '未配置',
    detail: '保存飞书机器人 Webhook 后，可向家庭群发送任务提醒和测试通知。',
  };
}
