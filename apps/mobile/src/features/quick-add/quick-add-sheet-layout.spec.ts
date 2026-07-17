import { describe, expect, it } from 'vitest';
import { spacing } from '@cat-diary/design-tokens';
import { quickAddScrollBottomPadding, quickAddSheetMaxHeight } from './quick-add-sheet-layout';

describe('quick add sheet layout', () => {
  it('keeps the quick-add sheet visually distinct from a standalone page', () => {
    expect(quickAddSheetMaxHeight).toBe('76%');
  });

  it('keeps scrollable content clear of the device bottom safe area', () => {
    expect(quickAddScrollBottomPadding(0)).toBe(spacing.xxxl);
    expect(quickAddScrollBottomPadding(34)).toBe(34 + spacing.lg);
  });
});
