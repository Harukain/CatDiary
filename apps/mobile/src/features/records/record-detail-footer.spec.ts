import { describe, expect, it } from 'vitest';
import recordDetailSource from '../../../app/records/[id].tsx?raw';

describe('record detail editable footer', () => {
  it('keeps manual record editing actions fixed and safe-area aware', () => {
    expect(recordDetailSource).toContain('KeyboardAvoidingView');
    expect(recordDetailSource).toContain('Keyboard.addListener');
    expect(recordDetailSource).toContain('useSafeAreaInsets');
    expect(recordDetailSource).toContain('testID="record-detail.footer"');
    expect(recordDetailSource).toContain('testID="record-detail.save.button"');
    expect(recordDetailSource).toContain('testID="record-detail.delete.button"');
    expect(recordDetailSource).toContain('testID="record-detail.back-timeline.button"');
    expect(recordDetailSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
  });

  it('keeps an inline save action available while the keyboard is visible', () => {
    expect(recordDetailSource).toContain('keyboardVisible ? (');
    expect(recordDetailSource).toContain('testID="record-detail.save.inline-button"');
  });
});
