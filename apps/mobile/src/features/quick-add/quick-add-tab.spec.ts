import { describe, expect, it } from 'vitest';
import tabsLayoutSource from '../../../app/(tabs)/_layout.tsx?raw';
import addTabSource from '../../../app/(tabs)/add.tsx?raw';

describe('quick add tab contract', () => {
  it('opens the quick-add bottom sheet instead of navigating to a standalone tab page', () => {
    expect(tabsLayoutSource).toContain('tabPress: (event)');
    expect(tabsLayoutSource).toContain('event.preventDefault();');
    expect(tabsLayoutSource).toContain('openQuickAdd();');
    expect(tabsLayoutSource).toContain('<QuickAddSheet visible={quickAddVisible}');
    expect(tabsLayoutSource).toContain('testID="tab.quick-add.button"');
  });

  it('keeps direct deep links to the add tab from showing a duplicate add page', () => {
    expect(addTabSource).toContain('<Redirect href="/(tabs)" />');
    expect(addTabSource).not.toContain('QuickAddSheet');
    expect(addTabSource).not.toContain('ScrollView');
  });
});
