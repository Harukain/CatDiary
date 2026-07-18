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

  it('shows explicit restoration, missing context, and load failure states', () => {
    expect(photoDetailSource).toContain(
      'const { restoring, session, activeFamily } = useSession();',
    );
    expect(photoDetailSource).toContain('const [loading, setLoading] = useState(true);');
    expect(photoDetailSource).toContain(
      'const contextUnavailable = !restoring && (!session || !activeFamily || !photoId);',
    );
    expect(photoDetailSource).toContain('const loadingInitial = restoring || (loading && !photo);');
    expect(photoDetailSource).toContain('testID="photo-detail.loading.card"');
    expect(photoDetailSource).toContain('testID="photo-detail.context-empty.card"');
    expect(photoDetailSource).toContain('testID="photo-detail.error.card"');
    expect(photoDetailSource).toContain('testID="photo-detail.reload.button"');
    expect(photoDetailSource).toContain('testID="photo-detail.load-error"');
  });

  it('guards async photo loading against stale effects and array route params', () => {
    expect(photoDetailSource).toContain('const photoId = Array.isArray(id) ? id[0] : id;');
    expect(photoDetailSource).toContain('void load(() => mounted);');
    expect(photoDetailSource).toContain('mounted = false;');
    expect(photoDetailSource).toContain('if (shouldApply()) setLoading(false);');
    expect(photoDetailSource).toContain(
      'setPhoto((current) => (current?.id === photoId ? current : null));',
    );
    expect(
      (photoDetailSource.match(/if \(!shouldApply\(\)\) return;/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('locks photo bindings, note editing, avatar setting, and destructive actions together', () => {
    expect(photoDetailSource).toContain(
      'const interactionLocked = busy || loading || contextUnavailable;',
    );
    expect(photoDetailSource).toContain('if (interactionLocked) return;');
    expect(photoDetailSource).toContain(
      'const canSave = changed && !!petIds.length && !busy && !loading && !contextUnavailable;',
    );
    expect(photoDetailSource).toContain('editable={!interactionLocked}');
    expect(
      (photoDetailSource.match(/disabled={interactionLocked}/g) ?? []).length,
    ).toBeGreaterThanOrEqual(5);
    expect(photoDetailSource).toContain('interactionLocked && styles.disabled');
  });

  it('keeps save actions single-bound to avoid duplicate submissions', () => {
    expect((photoDetailSource.match(/onPress=\{\(\) => void save\(\)\}/g) ?? []).length).toBe(2);
  });
});
