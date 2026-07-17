import { describe, expect, it } from 'vitest';
import medicalIndexSource from '../../../app/medical-records/index.tsx?raw';
import newMedicalSource from '../../../app/medical-records/new.tsx?raw';

describe('medical records index actions', () => {
  it('keeps list-level medical actions fixed and safe-area aware', () => {
    expect(medicalIndexSource).toContain('useSafeAreaInsets');
    expect(medicalIndexSource).toContain('keyboardShouldPersistTaps="handled"');
    expect(medicalIndexSource).toContain('testID="medical-records.footer"');
    expect(medicalIndexSource).toContain('testID="medical-records.add.button"');
    expect(medicalIndexSource).toContain('testID="medical-records.export.button"');
    expect(medicalIndexSource).toContain('testID="medical-records.summary-share.button"');
    expect(medicalIndexSource).toContain('testID="medical-records.return.button"');
    expect(medicalIndexSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
  });

  it('guards summary operations and keeps add flow bound to the selected cat', () => {
    expect(medicalIndexSource).toContain(
      'const canGenerateSummary = !summaryBusy && !!session && !!activeFamily && !!petId;',
    );
    expect(medicalIndexSource).toContain(
      'const canShareSummary = !summaryBusy && !!preparedSummary;',
    );
    expect(medicalIndexSource).toContain('const canAddMedicalRecord = canEdit && !summaryBusy;');
    expect(medicalIndexSource).toContain("pathname: '/medical-records/new'");
    expect(medicalIndexSource).toContain('params: petId ? { petId } : {}');
    expect(newMedicalSource).toContain('useLocalSearchParams<{ petId?: string }>()');
    expect(newMedicalSource).toContain("const requestedPetId = params.petId ?? '';");
    expect(newMedicalSource).toContain(
      'const nextPetId = items.some((item) => item.id === requestedPetId)',
    );
  });
});
