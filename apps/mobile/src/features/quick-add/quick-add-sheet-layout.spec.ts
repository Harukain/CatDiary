import { describe, expect, it } from 'vitest';
import { spacing } from '@cat-diary/design-tokens';
import { quickAddScrollBottomPadding, quickAddSheetMaxHeight } from './quick-add-sheet-layout';

describe('quick add sheet layout', () => {
  it('keeps the admin quick-add sheet tall enough for all visible actions', () => {
    expect(quickAddSheetMaxHeight).toBe('88%');
  });

  it('keeps scrollable content clear of the device bottom safe area', () => {
    expect(quickAddScrollBottomPadding(0)).toBe(spacing.xxxl);
    expect(quickAddScrollBottomPadding(34)).toBe(34 + spacing.lg);
  });
});
