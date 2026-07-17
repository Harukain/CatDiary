import { describe, expect, it } from 'vitest';
import newPhotoSource from '../../../app/photos/new.tsx?raw';

describe('photo upload bottom actions', () => {
  it('keeps upload actions fixed and safe-area aware when the keyboard is hidden', () => {
    expect(newPhotoSource).toContain('KeyboardAvoidingView');
    expect(newPhotoSource).toContain('Keyboard.addListener');
    expect(newPhotoSource).toContain('useSafeAreaInsets');
    expect(newPhotoSource).toContain('testID="photo-new.footer"');
    expect(newPhotoSource).toContain('testID="photo-new.submit.button"');
    expect(newPhotoSource).toContain('testID="photo-new.cancel.button"');
    expect(newPhotoSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
  });

  it('keeps inline upload actions available while editing the note field', () => {
    expect(newPhotoSource).toContain('keyboardShouldPersistTaps="handled"');
    expect(newPhotoSource).toContain('keyboardVisible ? (');
    expect(newPhotoSource).toContain('testID="photo-new.submit.inline-button"');
    expect(newPhotoSource).toContain('testID="photo-new.cancel.inline-button"');
  });
});
