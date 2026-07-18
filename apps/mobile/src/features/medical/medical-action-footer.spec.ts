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

  it('shows explicit restoration, missing context, and load failure states on medical detail', () => {
    expect(medicalDetailSource).toContain(
      'const { restoring, session, activeFamily } = useSession();',
    );
    expect(medicalDetailSource).toContain('const [loading, setLoading] = useState(true);');
    expect(medicalDetailSource).toContain(
      'const contextUnavailable = !restoring && (!session || !activeFamily || !medicalRecordId);',
    );
    expect(medicalDetailSource).toContain(
      'const loadingInitial = restoring || (loading && !record);',
    );
    expect(medicalDetailSource).toContain('testID="medical-detail.loading.card"');
    expect(medicalDetailSource).toContain('testID="medical-detail.context-empty.card"');
    expect(medicalDetailSource).toContain('testID="medical-detail.error.card"');
    expect(medicalDetailSource).toContain('testID="medical-detail.reload.button"');
    expect(medicalDetailSource).toContain('testID="medical-detail.load-error"');
  });

  it('guards async medical record loading against stale effects and array route params', () => {
    expect(medicalDetailSource).toContain(
      'const medicalRecordId = Array.isArray(id) ? id[0] : id;',
    );
    expect(medicalDetailSource).toContain('void load(() => mounted);');
    expect(medicalDetailSource).toContain('mounted = false;');
    expect(medicalDetailSource).toContain('if (shouldApply()) setLoading(false);');
    expect(medicalDetailSource).toContain(
      'setRecord((current) => (current?.id === medicalRecordId ? current : null));',
    );
    expect(
      (medicalDetailSource.match(/if \(!shouldApply\(\)\) return;/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('locks medical detail editing, saving, deletion, and return actions together', () => {
    expect(medicalDetailSource).toContain(
      'const interactionLocked = busy || loading || contextUnavailable;',
    );
    expect(medicalDetailSource).toContain(
      'const canSave = canEdit && !interactionLocked && isDirty && Boolean(form.title.trim());',
    );
    expect(medicalDetailSource).toContain(
      'if (!record || !session || !activeFamily || !canSave) return;',
    );
    expect(medicalDetailSource).toContain(
      'if (!record || !session || !activeFamily || !canEdit || interactionLocked) return;',
    );
    expect(medicalDetailSource).toContain('editable={canEdit && !interactionLocked}');
    expect(
      (medicalDetailSource.match(/disabled={interactionLocked}/g) ?? []).length,
    ).toBeGreaterThanOrEqual(4);
  });

  it('routes missing or failed medical detail loads back to the medical record list', () => {
    expect(medicalDetailSource).toContain("onPress={() => router.replace('/medical-records')}");
    expect(medicalDetailSource).toContain('testID="medical-detail.context-empty.back"');
    expect(medicalDetailSource).toContain('testID="medical-detail.error.back"');
  });
});
