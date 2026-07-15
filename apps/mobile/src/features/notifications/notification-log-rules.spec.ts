import { describe, expect, it } from 'vitest';
import type { NotificationLogSummary } from '../auth/auth-api';
import {
  mergeRetriedNotificationLog,
  notificationLogChannelLabel,
  notificationLogEmptyCopy,
  notificationLogPageStats,
  notificationLogRetrySuccessMessage,
  notificationLogStatusCopy,
} from './notification-log-rules';

const base: NotificationLogSummary = {
  id: 'log-1',
  channel: 'EXPO_PUSH',
  status: 'FAILED',
  attempt: 2,
  scheduledAt: '2026-07-15T08:00:00.000Z',
  sentAt: null,
  errorCode: 'EXPO_REJECTED',
  errorMessageSafe: '手机推送发送失败',
  task: { id: 'task-1', title: 'Mimi 疫苗提醒', scheduledAt: '2026-07-15T08:00:00.000Z' },
};

describe('notification log rules', () => {
  it('keeps status and channel copy explicit', () => {
    expect(notificationLogStatusCopy('FAILED')).toMatchObject({
      label: '发送失败',
      tone: 'danger',
    });
    expect(notificationLogStatusCopy('SKIPPED').description).toContain('发送前复核');
    expect(notificationLogChannelLabel('FEISHU')).toBe('飞书通知');
  });

  it('summarizes the loaded page by status', () => {
    const stats = notificationLogPageStats([
      base,
      { ...base, id: 'log-2', status: 'QUEUED' },
      { ...base, id: 'log-3', status: 'DELIVERED' },
      { ...base, id: 'log-4', status: 'SKIPPED' },
    ]);

    expect(stats).toMatchObject({
      total: 4,
      failed: 1,
      queued: 1,
      delivered: 1,
      skipped: 1,
    });
  });

  it('removes a retried log from a mismatched active status filter', () => {
    const retried = { ...base, status: 'QUEUED' as const, errorMessageSafe: null };

    expect(mergeRetriedNotificationLog([base], retried, 'FAILED')).toEqual([]);
    expect(notificationLogRetrySuccessMessage(retried, 'FAILED')).toContain('已从当前筛选结果移除');
  });

  it('keeps a retried log visible when it still matches the current filter', () => {
    const retried = { ...base, status: 'QUEUED' as const, errorMessageSafe: null };

    expect(mergeRetriedNotificationLog([base], retried)).toEqual([retried]);
    expect(notificationLogRetrySuccessMessage(retried)).toContain('请稍后刷新');
  });

  it('uses filtered empty copy instead of generic empty state', () => {
    expect(notificationLogEmptyCopy().title).toBe('还没有提醒记录');
    expect(notificationLogEmptyCopy('FAILED').title).toBe('没有发送失败的提醒');
  });
});
