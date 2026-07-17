import { describe, expect, it } from 'vitest';
import petDetailSource from '../../../app/pets/[id].tsx?raw';

describe('pet profile detail bottom actions', () => {
  it('keeps editable pet profile actions fixed and safe-area aware when the keyboard is hidden', () => {
    expect(petDetailSource).toContain('KeyboardAvoidingView');
    expect(petDetailSource).toContain('Keyboard.addListener');
    expect(petDetailSource).toContain('useSafeAreaInsets');
    expect(petDetailSource).toContain('keyboardShouldPersistTaps="handled"');
    expect(petDetailSource).toContain('testID="pet-detail.footer"');
    expect(petDetailSource).toContain('testID="pet-detail.save.button"');
    expect(petDetailSource).toContain('testID="pet-detail.delete.button"');
    expect(petDetailSource).toContain('testID="pet-detail.return.button"');
    expect(petDetailSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
  });

  it('keeps inline actions available while editing fields and locks navigation during mutations', () => {
    expect(petDetailSource).toContain('testID="pet-detail.save.inline-button"');
    expect(petDetailSource).toContain('testID="pet-detail.delete.inline-button"');
    expect(petDetailSource).toContain('testID="pet-detail.return.inline-button"');
    expect(petDetailSource).toContain('accessibilityState={{ disabled: busy }}');
    expect(petDetailSource).toContain('disabled={busy}');
    expect(petDetailSource).toContain('editable={!busy}');
  });
});
