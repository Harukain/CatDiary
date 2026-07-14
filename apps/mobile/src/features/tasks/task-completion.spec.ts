import { describe, expect, it } from 'vitest';
import {
  buildTaskCompletionInput,
  formatTaskCompletionResult,
  initialTaskCompletionDraft,
} from './task-completion';

describe('task completion payload', () => {
  it('builds actual time, result and note for a normal task', () => {
    const validation = buildTaskCompletionInput(
      { type: 'LITTER' },
      {
        actualAtLocal: '2026-07-15 08:30',
        resultText: ' 已清理，状态正常 ',
        note: ' 无异常 ',
      },
      new Date(2026, 6, 15, 9, 0),
    );

    expect(validation.error).toBeUndefined();
    expect(validation.input).toMatchObject({
      result: { summary: '已清理，状态正常' },
      note: '无异常',
      medicalConfirmed: false,
    });
  });

  it('marks medical tasks as confirmed by the completion form', () => {
    const draft = initialTaskCompletionDraft({ type: 'MEDICATION' }, new Date(2026, 6, 15, 8, 30));
    const validation = buildTaskCompletionInput(
      { type: 'MEDICATION' },
      draft,
      new Date(2026, 6, 15, 8, 31),
    );

    expect(validation.input?.medicalConfirmed).toBe(true);
    expect(validation.input?.result).toEqual({ summary: '已按计划完成用药' });
  });

  it('rejects invalid or future actual time', () => {
    expect(
      buildTaskCompletionInput(
        { type: 'LITTER' },
        { actualAtLocal: '2026-02-31 08:30', resultText: '已完成', note: '' },
      ).error,
    ).toContain('实际完成时间');

    expect(
      buildTaskCompletionInput(
        { type: 'LITTER' },
        { actualAtLocal: '2026-07-15 09:10', resultText: '已完成', note: '' },
        new Date(2026, 6, 15, 9, 0),
      ).error,
    ).toContain('不能晚于现在');
  });

  it('formats task result summary first', () => {
    expect(formatTaskCompletionResult({ summary: '已清理' })).toBe('已清理');
    expect(formatTaskCompletionResult({ value: 1 })).toBe('{"value":1}');
    expect(formatTaskCompletionResult({})).toBe('');
  });
});
