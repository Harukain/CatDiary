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
      'const canGenerateExport = !busy && !!session && !!activeFamily;',
    );
    expect(exportSettingsSource).toContain('const canShareExport = !busy && !!readyJob;');
    expect(exportSettingsSource).toContain("label={busy ? '处理中，请等待' : '重新生成导出文件'}");
    expect(exportSettingsSource).toContain("label={busy ? '处理中，请等待' : '返回上一页'}");
    expect(exportSettingsSource).toContain('disabled={!canGenerateExport}');
    expect(exportSettingsSource).toContain('disabled={!canShareExport}');
  });
});
