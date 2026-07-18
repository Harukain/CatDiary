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
      'const canGenerateSummary = !interactionLocked && !!session && !!activeFamily && !!petId;',
    );
    expect(medicalIndexSource).toContain(
      'const canShareSummary = !interactionLocked && !!preparedSummary;',
    );
    expect(medicalIndexSource).toContain(
      'const canAddMedicalRecord = canEdit && !interactionLocked && !!petId;',
    );
    expect(medicalIndexSource).toContain("pathname: '/medical-records/new'");
    expect(medicalIndexSource).toContain('params: petId ? { petId } : {}');
    expect(newMedicalSource).toContain('useLocalSearchParams<{ petId?: string }>()');
    expect(newMedicalSource).toContain("const requestedPetId = params.petId ?? '';");
    expect(newMedicalSource).toContain(
      'const nextPetId = items.some((item) => item.id === requestedPetId)',
    );
  });

  it('shows explicit restoration, missing context, and load failure states', () => {
    expect(medicalIndexSource).toContain(
      'const { restoring, session, activeFamily } = useSession();',
    );
    expect(medicalIndexSource).toContain(
      'const contextUnavailable = !restoring && (!session || !activeFamily);',
    );
    expect(medicalIndexSource).toContain('const loadingInitial = restoring || loading;');
    expect(medicalIndexSource).toContain('testID="medical-records.loading.card"');
    expect(medicalIndexSource).toContain('testID="medical-records.context-empty.card"');
    expect(medicalIndexSource).toContain('testID="medical-records.error.card"');
    expect(medicalIndexSource).toContain('testID="medical-records.reload.button"');
    expect(medicalIndexSource).toContain('testID="medical-records.error.text"');
  });

  it('guards medical index loading against stale focus effects and array route params', () => {
    expect(medicalIndexSource).toContain(
      'const params = useLocalSearchParams<{ petId?: string | string[] }>();',
    );
    expect(medicalIndexSource).toContain(
      "const requestedPetId = Array.isArray(params.petId) ? params.petId[0] : (params.petId ?? '');",
    );
    expect(medicalIndexSource).toContain('void load(() => mounted);');
    expect(medicalIndexSource).toContain('mounted = false;');
    expect(medicalIndexSource).toContain('if (shouldApply()) setLoading(false);');
    expect(
      (medicalIndexSource.match(/if \(!shouldApply\(\)\) return;/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('locks filters, detail entries, summary, and add actions during loading or summary work', () => {
    expect(medicalIndexSource).toContain(
      'const interactionLocked = loading || summaryBusy || contextUnavailable;',
    );
    expect(medicalIndexSource).toContain(
      'if (!session || !activeFamily || interactionLocked) return;',
    );
    expect(medicalIndexSource).toContain(
      'if (!session || !activeFamily || !petId || interactionLocked) return;',
    );
    expect(medicalIndexSource).toContain('if (!preparedSummary || interactionLocked) return;');
    expect(medicalIndexSource).toContain('if (!canAddMedicalRecord) return;');
    expect(medicalIndexSource).toContain('if (interactionLocked) return;');
    expect(medicalIndexSource).toContain(
      'accessibilityState={{ selected: pet.id === petId, disabled: interactionLocked }}',
    );
    expect(
      (medicalIndexSource.match(/disabled={interactionLocked}/g) ?? []).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('does not write summary or selection results after the list unmounts', () => {
    expect(medicalIndexSource).toContain('const mountedRef = useRef(true);');
    expect(medicalIndexSource).toContain('mountedRef.current = false;');
    expect(
      (medicalIndexSource.match(/if \(!mountedRef\.current\) return;/g) ?? []).length,
    ).toBeGreaterThanOrEqual(4);
    expect(medicalIndexSource).toContain("if (mountedRef.current) setSummaryOperation('');");
    expect(medicalIndexSource).toContain('if (mountedRef.current) setLoading(false);');
  });
});
