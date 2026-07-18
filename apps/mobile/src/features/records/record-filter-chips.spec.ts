import { describe, expect, it } from 'vitest';
import recordsTabSource from '../../../app/(tabs)/records.tsx?raw';

describe('record timeline filter chips', () => {
  it('keeps pet filters accessible, stateful, and automation-addressable', () => {
    expect(recordsTabSource).toContain('testID="records.filter.all"');
    expect(recordsTabSource).toContain('testID={`records.filter.pet.${pet.id}`}');
    expect(recordsTabSource).toContain('accessibilityRole="button"');
    expect(recordsTabSource).toContain(
      'accessibilityState={{ selected: active, disabled: !!disabled }}',
    );
    expect(recordsTabSource).toContain('accessibilityLabel={`筛选${label}记录`}');
    expect(recordsTabSource).toContain('disabled={disabled}');
    expect(recordsTabSource).toContain('style={({ pressed }) => [');
    expect(recordsTabSource).toContain('active && styles.filterActive');
    expect(recordsTabSource).toContain('disabled && styles.disabled');
    expect(recordsTabSource).toContain('pressed && styles.pressed');
  });
});
