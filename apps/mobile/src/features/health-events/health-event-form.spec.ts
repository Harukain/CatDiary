import { describe, expect, it } from 'vitest';
import {
  healthEventDetailNavigationCopy,
  healthEventDraftSnapshot,
  isHealthEventDraftDirty,
  resolveHealthEventDetailNavigationDecision,
} from './health-event-form';

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

  it('guards health event detail navigation while busy or dirty', () => {
    expect(resolveHealthEventDetailNavigationDecision({ busy: true, isDirty: false })).toBe('wait');
    expect(resolveHealthEventDetailNavigationDecision({ busy: false, isDirty: true })).toBe(
      'confirmDiscard',
    );
    expect(resolveHealthEventDetailNavigationDecision({ busy: false, isDirty: false })).toBe(
      'continue',
    );
  });

  it('uses explicit discard copy for every health event detail exit target', () => {
    expect(healthEventDetailNavigationCopy('return').confirmLabel).toBe('放弃修改');
    expect(healthEventDetailNavigationCopy('linkRecord').message).toContain('继续关联记录');
    expect(healthEventDetailNavigationCopy('viewRecord').confirmLabel).toBe('放弃并查看');
  });
});
