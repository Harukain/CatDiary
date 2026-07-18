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
    expect(petDetailSource).toContain('disabled: busy');
    expect(petDetailSource).toContain('disabled={busy}');
    expect(petDetailSource).toContain('editable={!busy}');
  });

  it('shows explicit restoration, missing context, and load failure states', () => {
    expect(petDetailSource).toContain('const { restoring, session, activeFamily } = useSession();');
    expect(petDetailSource).toContain('const [loading, setLoading] = useState(true);');
    expect(petDetailSource).toContain(
      'const contextUnavailable = !restoring && (!session || !activeFamily || !petId);',
    );
    expect(petDetailSource).toContain('const loadingInitial = restoring || (loading && !pet);');
    expect(petDetailSource).toContain('testID="pet-detail.loading.card"');
    expect(petDetailSource).toContain('testID="pet-detail.context-empty.card"');
    expect(petDetailSource).toContain('testID="pet-detail.error.card"');
    expect(petDetailSource).toContain('testID="pet-detail.reload.button"');
    expect(petDetailSource).toContain('testID="pet-detail.load-error"');
  });

  it('guards async profile loading against stale focus effects', () => {
    expect(petDetailSource).toContain('void load(() => mounted);');
    expect(petDetailSource).toContain('mounted = false;');
    expect(petDetailSource).toContain('if (shouldApply()) setLoading(false);');
    expect(petDetailSource).toContain(
      'setPet((current) => (current?.id === petId ? current : null));',
    );
    expect(
      (petDetailSource.match(/if \(!shouldApply\(\)\) return;/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('locks quick actions while the profile context is not stable', () => {
    expect(petDetailSource).toContain(
      'const interactionLocked = busy || loading || contextUnavailable;',
    );
    expect(petDetailSource).toContain('if (interactionLocked) return;');
    expect(
      (petDetailSource.match(/accessibilityState={{ disabled: interactionLocked }}/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      (petDetailSource.match(/disabled={interactionLocked}/g) ?? []).length,
    ).toBeGreaterThanOrEqual(5);
    expect(petDetailSource).toContain('pressed && !interactionLocked && styles.pressed');
  });

  it('locks recent records and photos instead of leaving tappable stale rows', () => {
    expect(petDetailSource).toMatch(/<RecentRecords[\s\S]*disabled={interactionLocked}/);
    expect(petDetailSource).toMatch(/<RecentPhotos[\s\S]*disabled={interactionLocked}/);
    expect(petDetailSource).toMatch(/function RecentRecords\(\{[\s\S]*disabled = false/);
    expect(petDetailSource).toMatch(/function RecentPhotos\(\{[\s\S]*disabled = false/);
    expect(
      (petDetailSource.match(/accessibilityState={{ disabled }}/g) ?? []).length,
    ).toBeGreaterThanOrEqual(2);
    expect(petDetailSource).toContain('pressed && !disabled && styles.pressed');
  });
});
