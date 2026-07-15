import type { NotificationLogSummary, NotificationStatus } from '../auth/auth-api';

export type NotificationLogTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

export function notificationLogStatusCopy(status: NotificationStatus): {
  label: string;
  tone: NotificationLogTone;
  description: string;
} {
  const copy: Record<
    NotificationStatus,
    { label: string; tone: NotificationLogTone; description: string }
  > = {
    QUEUED: {
      label: '队列中',
      tone: 'warning',
      description: '提醒已进入发送队列，等待 Worker 处理。',
    },
    SENT: {
      label: '已发送',
      tone: 'brand',
      description: '提醒已提交给外部通道，仍在等待送达回执。',
    },
    DELIVERED: {
      label: '已送达',
      tone: 'success',
      description: '外部通道已返回送达或成功回执。',
    },
    FAILED: {
      label: '发送失败',
      tone: 'danger',
      description: '提醒发送失败。管理员可在排查渠道后重新发送。',
    },
    SKIPPED: {
      label: '已跳过',
      tone: 'neutral',
      description: '发送前复核发现提醒已失效，因此没有调用外部通道。',
    },
  };
  return copy[status];
}

export function notificationLogChannelLabel(channel: NotificationLogSummary['channel']) {
  return { DEVELOPMENT: '开发通知', EXPO_PUSH: '手机推送', FEISHU: '飞书通知' }[channel];
}

export function notificationLogPageStats(items: NotificationLogSummary[]) {
  return items.reduce(
    (stats, item) => {
      stats.total += 1;
      if (item.status === 'FAILED') stats.failed += 1;
      if (item.status === 'QUEUED') stats.queued += 1;
      if (item.status === 'SENT') stats.sent += 1;
      if (item.status === 'DELIVERED') stats.delivered += 1;
      if (item.status === 'SKIPPED') stats.skipped += 1;
      return stats;
    },
    { total: 0, failed: 0, queued: 0, sent: 0, delivered: 0, skipped: 0 },
  );
}

export function mergeRetriedNotificationLog(
  items: NotificationLogSummary[],
  retried: NotificationLogSummary,
  activeStatus?: NotificationStatus,
) {
  if (activeStatus && retried.status !== activeStatus) {
    return items.filter((item) => item.id !== retried.id);
  }
  return items.map((item) => (item.id === retried.id ? retried : item));
}

export function notificationLogRetrySuccessMessage(
  retried: NotificationLogSummary,
  activeStatus?: NotificationStatus,
) {
  const title = retried.task?.title ?? '原任务';
  if (activeStatus && retried.status !== activeStatus) {
    return `「${title}」已重新入队，已从当前筛选结果移除。`;
  }
  return `「${title}」已重新入队，请稍后刷新查看发送结果。`;
}

export function notificationLogEmptyCopy(status?: NotificationStatus) {
  if (!status) {
    return {
      title: '还没有提醒记录',
      body: '创建照顾计划并到达提醒时间后，这里会显示发送状态。',
    };
  }
  const copy = notificationLogStatusCopy(status);
  return {
    title: `没有${copy.label}的提醒`,
    body: '切换筛选或刷新后，可查看其它发送状态。',
  };
}
