import { describe, expect, it } from 'vitest';
import medicalDetailSource from '../../../app/medical-records/[id].tsx?raw';
import newMedicalSource from '../../../app/medical-records/new.tsx?raw';

describe('medical record form bottom actions', () => {
  it('keeps the new medical record actions fixed and safe-area aware', () => {
    expect(newMedicalSource).toContain('KeyboardAvoidingView');
    expect(newMedicalSource).toContain('Keyboard.addListener');
    expect(newMedicalSource).toContain('useSafeAreaInsets');
    expect(newMedicalSource).toContain('keyboardShouldPersistTaps="handled"');
    expect(newMedicalSource).toContain('testID="medical-new.footer"');
    expect(newMedicalSource).toContain('testID="medical-new.submit.button"');
    expect(newMedicalSource).toContain('testID="medical-new.cancel.button"');
    expect(newMedicalSource).toContain('testID="medical-new.submit.inline-button"');
    expect(newMedicalSource).toContain('testID="medical-new.cancel.inline-button"');
    expect(newMedicalSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
  });

  it('keeps the editable medical record detail actions fixed and keyboard-safe', () => {
    expect(medicalDetailSource).toContain('KeyboardAvoidingView');
    expect(medicalDetailSource).toContain('Keyboard.addListener');
    expect(medicalDetailSource).toContain('useSafeAreaInsets');
    expect(medicalDetailSource).toContain('keyboardShouldPersistTaps="handled"');
    expect(medicalDetailSource).toContain('testID="medical-detail.footer"');
    expect(medicalDetailSource).toContain('testID="medical-detail.save.button"');
    expect(medicalDetailSource).toContain('testID="medical-detail.delete.button"');
    expect(medicalDetailSource).toContain('testID="medical-detail.return.button"');
    expect(medicalDetailSource).toContain('testID="medical-detail.save.inline-button"');
    expect(medicalDetailSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
  });
});
