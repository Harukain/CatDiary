import { describe, expect, it } from 'vitest';
import exportSettingsSource from '../../../app/settings/export.tsx?raw';

describe('data export bottom actions', () => {
  it('keeps export actions fixed and safe-area aware', () => {
    expect(exportSettingsSource).toContain('useSafeAreaInsets');
    expect(exportSettingsSource).toContain('keyboardShouldPersistTaps="handled"');
    expect(exportSettingsSource).toContain('testID="export.footer"');
    expect(exportSettingsSource).toContain('testID="export.generate.button"');
    expect(exportSettingsSource).toContain('testID="export.share.button"');
    expect(exportSettingsSource).toContain('testID="export.return.button"');
    expect(exportSettingsSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
  });

  it('uses explicit guards for generating, sharing, and returning', () => {
    expect(exportSettingsSource).toContain(
      'const { restoring, session, activeFamily } = useSession();',
    );
    expect(exportSettingsSource).toContain(
      'const contextUnavailable = !restoring && (!session || !activeFamily);',
    );
    expect(exportSettingsSource).toContain(
      'const canEditOptions = !restoring && !contextUnavailable && canEditDataExportOptions(phase);',
    );
    expect(exportSettingsSource).toMatch(
      /const canGenerateExport\s*=\s*!restoring && !contextUnavailable && !busy && !!session && !!activeFamily;/,
    );
    expect(exportSettingsSource).toContain(
      'const canShareExport = !restoring && !contextUnavailable && !busy && !!readyJob;',
    );
    expect(exportSettingsSource).toContain(
      'const showExportActions = !restoring && !contextUnavailable;',
    );
    expect(exportSettingsSource).toContain(
      'const readyExportAvailable = showExportActions && !!readyJob;',
    );
    expect(exportSettingsSource).toContain("label={busy ? '处理中，请等待' : '重新生成导出文件'}");
    expect(exportSettingsSource).toContain("label={busy ? '处理中，请等待' : '返回上一页'}");
    expect(exportSettingsSource).toContain('{showExportActions ? (');
    expect(exportSettingsSource).toContain('{readyExportAvailable ? (');
    expect(exportSettingsSource).toContain('disabled={!canGenerateExport}');
    expect(exportSettingsSource).toContain('disabled={!canShareExport}');
  });

  it('keeps export scope and stale jobs safe during session restoration', () => {
    expect(exportSettingsSource).toContain('testID="export.restoring.card"');
    expect(exportSettingsSource).toContain('testID="export.context-unavailable.card"');
    expect(exportSettingsSource).toContain('if (restoring) return;');
    expect(exportSettingsSource).toContain('setScopeFamilyId(null);');
    expect(exportSettingsSource).toContain("setScope('PERSONAL');");
    expect(exportSettingsSource).toContain("setScope(isAdmin ? 'FAMILY' : 'PERSONAL');");
    expect(exportSettingsSource).toContain("const selectedScope = isAdmin ? scope : 'PERSONAL';");
    expect(exportSettingsSource).toContain(
      'if (restoring || contextUnavailable || !session || !activeFamily || busy) return;',
    );
    expect(exportSettingsSource).toContain(
      'if (restoring || contextUnavailable || !session || !activeFamily || !readyJob || busy) return;',
    );
  });
});
