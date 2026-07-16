import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatPushLockScreenBody,
  formatTaskMessage,
  sendNotification,
} from './notification-sender';

afterEach(() => vi.unstubAllGlobals());

describe('formatTaskMessage', () => {
  it('contains the concrete task and time', () => {
    const message = formatTaskMessage('猫三联疫苗', new Date('2026-07-12T08:30:00.000Z'));
    expect(message).toContain('猫三联疫苗');
    expect(message).toContain('2026');
    expect(message).toContain('到时间');
  });

  it('marks overdue stages clearly', () => {
    const message = formatTaskMessage('喂药', new Date('2026-07-12T08:30:00.000Z'), 'overdue-1');

    expect(message).toContain('逾期');
    expect(message).toContain('原计划');
  });

  it('includes the task and family identifiers needed for safe App routing', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { status: 'ok', id: 'expo-ticket' } }),
    });
    vi.stubGlobal('fetch', fetcher);

    await sendNotification({} as never, {
      id: 'task_12345678',
      familyId: 'family_12345678',
      title: '铲屎',
      scheduledAt: '2026-07-12T08:30:00.000Z',
      channel: 'EXPO_PUSH',
      pushToken: 'ExponentPushToken[test]',
    });

    const request = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      data: {
        taskId: 'task_12345678',
        familyId: 'family_12345678',
        category: 'TASK_REMINDER',
        stage: 'due',
      },
    });
  });

  it('keeps lock-screen push copy generic while preserving routing payload', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { status: 'ok', id: 'expo-ticket' } }),
    });
    vi.stubGlobal('fetch', fetcher);

    await sendNotification({} as never, {
      id: 'task_12345678',
      familyId: 'family_12345678',
      title: 'Mimi 服用阿莫西林 1/2 片',
      scheduledAt: '2026-07-12T08:30:00.000Z',
      channel: 'EXPO_PUSH',
      pushToken: 'ExponentPushToken[test]',
      stage: 'overdue-1',
    });

    const request = fetcher.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as { body: string; data: { stage: string } };
    expect(body.body).toBe(formatPushLockScreenBody('overdue-1'));
    expect(body.body).not.toContain('Mimi');
    expect(body.body).not.toContain('阿莫西林');
    expect(body.body).not.toContain('2026');
    expect(body.data.stage).toBe('overdue-1');
  });
});
