import { describe, expect, it } from 'vitest';
import { isE2eLocalResetEnabled } from './e2e-reset';

describe('isE2eLocalResetEnabled', () => {
  it('allows app-level E2E reset only in development builds', () => {
    expect(isE2eLocalResetEnabled('development')).toBe(true);
    expect(isE2eLocalResetEnabled('preview')).toBe(false);
    expect(isE2eLocalResetEnabled('production')).toBe(false);
    expect(isE2eLocalResetEnabled(undefined)).toBe(false);
  });
});
