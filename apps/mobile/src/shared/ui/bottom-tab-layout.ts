import type { ViewStyle } from 'react-native';
import { colors, radii, spacing } from '@cat-diary/design-tokens';

export const bottomTabMetrics = {
  horizontalInset: spacing.md,
  minBottomInset: spacing.md,
  contentGap: spacing.xxl,
  height: 68,
  paddingVertical: spacing.sm,
} as const;

export function bottomTabOffset(bottomSafeAreaInset: number) {
  return Math.max(bottomTabMetrics.minBottomInset, bottomSafeAreaInset + spacing.md);
}

export function bottomTabScrollPadding(bottomSafeAreaInset: number) {
  return (
    bottomTabOffset(bottomSafeAreaInset) + bottomTabMetrics.height + bottomTabMetrics.contentGap
  );
}

export function bottomTabBarStyle(bottomSafeAreaInset: number): ViewStyle {
  return {
    position: 'absolute',
    left: bottomTabMetrics.horizontalInset,
    right: bottomTabMetrics.horizontalInset,
    bottom: bottomTabOffset(bottomSafeAreaInset),
    height: bottomTabMetrics.height,
    borderRadius: radii.navigation,
    borderTopWidth: 0,
    backgroundColor: colors.ink,
    paddingTop: bottomTabMetrics.paddingVertical,
    paddingBottom: bottomTabMetrics.paddingVertical,
  };
}
