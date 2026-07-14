import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatTaskMessage, sendNotification } from './notification-sender';

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
});
