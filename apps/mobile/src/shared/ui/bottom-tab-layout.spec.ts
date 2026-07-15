import { describe, expect, it } from 'vitest';
import {
  bottomTabBarStyle,
  bottomTabMetrics,
  bottomTabOffset,
  bottomTabScrollPadding,
} from './bottom-tab-layout';

describe('bottom tab layout', () => {
  it('keeps the confirmed navigation shell metrics on flat-bottom devices', () => {
    expect(bottomTabOffset(0)).toBe(12);
    expect(bottomTabScrollPadding(0)).toBe(104);
    expect(bottomTabBarStyle(0)).toMatchObject({
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: 12,
      height: 68,
      borderRadius: 24,
    });
  });

  it('adds safe-area room on gesture-navigation devices', () => {
    expect(bottomTabOffset(34)).toBe(46);
    expect(bottomTabScrollPadding(34)).toBe(138);
    expect(bottomTabBarStyle(34)).toMatchObject({ bottom: 46 });
  });

  it('keeps content padding below the floating tab bar', () => {
    expect(bottomTabScrollPadding(24)).toBeGreaterThan(
      bottomTabOffset(24) + bottomTabMetrics.height,
    );
  });
});
