import { spacing } from '@cat-diary/design-tokens';

export const quickAddSheetMaxHeight = '76%';

export function quickAddScrollBottomPadding(bottomSafeAreaInset: number) {
  return Math.max(spacing.xxxl, bottomSafeAreaInset + spacing.lg);
}
