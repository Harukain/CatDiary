import { describe, expect, it } from 'vitest';
import { healthEventDraftSnapshot, isHealthEventDraftDirty } from './health-event-form';

const initial = {
  title: '持续观察：呕吐',
  summary: '',
};

describe('health event form rules', () => {
  it('keeps an unchanged prefilled health event draft clean', () => {
    expect(isHealthEventDraftDirty({ ...initial }, initial)).toBe(false);
  });

  it('treats title and summary changes as unsaved edits', () => {
    expect(isHealthEventDraftDirty({ ...initial, title: '连续呕吐观察' }, initial)).toBe(true);
    expect(isHealthEventDraftDirty({ ...initial, summary: '精神一般，已禁食观察' }, initial)).toBe(
      true,
    );
  });

  it('creates stable snapshots for detail forms after save', () => {
    expect(healthEventDraftSnapshot(initial)).toBe(healthEventDraftSnapshot({ ...initial }));
  });
});
