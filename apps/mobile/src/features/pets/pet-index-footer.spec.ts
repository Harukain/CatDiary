import { describe, expect, it } from 'vitest';
import petsIndexSource from '../../../app/pets/index.tsx?raw';

describe('pet index bottom actions and loading states', () => {
  it('keeps pet management actions fixed and safe-area aware', () => {
    expect(petsIndexSource).toContain('useSafeAreaInsets');
    expect(petsIndexSource).toContain('testID="pets.footer"');
    expect(petsIndexSource).toContain('testID="pets.add.button"');
    expect(petsIndexSource).toContain('testID="pets.reload.button"');
    expect(petsIndexSource).toContain('testID="pets.return.button"');
    expect(petsIndexSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
  });

  it('exits loading cleanly when session or family context is unavailable', () => {
    expect(petsIndexSource).toContain('const { restoring, session, activeFamily } = useSession();');
    expect(petsIndexSource).toContain(
      'const contextUnavailable = !restoring && (!session || !activeFamily);',
    );
    expect(petsIndexSource).toContain('if (restoring) return;');
    expect(petsIndexSource).toContain('setPets([]);');
    expect(petsIndexSource).toContain('setLoading(false);');
    expect(petsIndexSource).not.toContain('if (!session || !activeFamily) return;');
    expect(petsIndexSource).toContain('testID="pets.context-empty"');
  });

  it('locks add actions until pet data is ready and preserves the five-cat limit', () => {
    expect(petsIndexSource).toContain(
      'const canAdd = !!session && !!activeFamily && canManage && pets.length < 5 && !loading;',
    );
    expect(petsIndexSource).toContain('if (!canAdd) return;');
    expect(petsIndexSource).toContain('disabled={!canAdd}');
    expect(petsIndexSource).toContain('testID="pets.limit.text"');
    expect(petsIndexSource).toContain("label={pets.length >= 5 ? '已达 5 只上限' : '添加猫咪'}");
  });
});
