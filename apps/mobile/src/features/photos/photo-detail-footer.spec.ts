import { describe, expect, it } from 'vitest';
import photoDetailSource from '../../../app/photos/[id].tsx?raw';

describe('photo detail bottom actions', () => {
  it('keeps photo detail actions fixed and safe-area aware when the keyboard is hidden', () => {
    expect(photoDetailSource).toContain('KeyboardAvoidingView');
    expect(photoDetailSource).toContain('Keyboard.addListener');
    expect(photoDetailSource).toContain('useSafeAreaInsets');
    expect(photoDetailSource).toContain('keyboardShouldPersistTaps="handled"');
    expect(photoDetailSource).toContain('testID="photo-detail.footer"');
    expect(photoDetailSource).toContain('testID="photo-detail.save.button"');
    expect(photoDetailSource).toContain('testID="photo-detail.delete.button"');
    expect(photoDetailSource).toContain('testID="photo-detail.return.button"');
    expect(photoDetailSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
  });

  it('keeps inline actions available while editing the note field', () => {
    expect(photoDetailSource).toContain('keyboardVisible ? (');
    expect(photoDetailSource).toContain('testID="photo-detail.save.inline-button"');
    expect(photoDetailSource).toContain('testID="photo-detail.delete.inline-button"');
    expect(photoDetailSource).toContain('testID="photo-detail.return.inline-button"');
  });
});
