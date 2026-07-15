import { describe, expect, it } from 'vitest';
import { resolveDraftExitDecision } from './draft-exit';

describe('draft exit navigation rules', () => {
  it('waits while a draft operation is running', () => {
    expect(resolveDraftExitDecision({ busy: true, isDirty: false })).toBe('wait');
    expect(resolveDraftExitDecision({ busy: true, isDirty: true, allowLeave: true })).toBe('wait');
  });

  it('continues when the draft is unchanged or already allowed to leave', () => {
    expect(resolveDraftExitDecision({ busy: false, isDirty: false })).toBe('continue');
    expect(resolveDraftExitDecision({ busy: false, isDirty: true, allowLeave: true })).toBe(
      'continue',
    );
  });

  it('asks for confirmation before discarding unsaved edits', () => {
    expect(resolveDraftExitDecision({ busy: false, isDirty: true })).toBe('confirmDiscard');
  });
});
