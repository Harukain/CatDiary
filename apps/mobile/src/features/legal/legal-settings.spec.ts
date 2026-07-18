import { describe, expect, it } from 'vitest';
import legalSettingsSource from '../../../app/settings/legal.tsx?raw';

describe('legal settings route', () => {
  it('keeps legal links as guarded real actions with user-visible failures', () => {
    expect(legalSettingsSource).toContain('const [openingLink, setOpeningLink] = useState');
    expect(legalSettingsSource).toContain(
      "async function openLegalLink(kind: 'terms' | 'privacy', url: string | undefined)",
    );
    expect(legalSettingsSource).toContain('Linking.canOpenURL(url)');
    expect(legalSettingsSource).toContain('await Linking.openURL(url);');
    expect(legalSettingsSource).toContain("kind === 'terms' ? '用户协议打开失败，请稍后重试。'");
    expect(legalSettingsSource).toContain('testID="legal.open.error"');
    expect(legalSettingsSource).toContain('testID="legal.terms.button"');
    expect(legalSettingsSource).toContain('testID="legal.privacy.button"');
    expect(legalSettingsSource).toContain('busy={openingLink ===');
    expect(legalSettingsSource).toContain('disabled={!canOpenTerms}');
    expect(legalSettingsSource).toContain('disabled={!canOpenPrivacy}');
  });

  it('keeps the return action fixed and safe-area aware', () => {
    expect(legalSettingsSource).toContain('useSafeAreaInsets');
    expect(legalSettingsSource).toContain('keyboardShouldPersistTaps="handled"');
    expect(legalSettingsSource).toContain('testID="legal.footer"');
    expect(legalSettingsSource).toContain('testID="legal.return.button"');
    expect(legalSettingsSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
    expect(legalSettingsSource).toContain("label={openingLink ? '正在打开链接…' : '返回'}");
    expect(legalSettingsSource).toContain('disabled={!!openingLink}');
    expect(legalSettingsSource).toContain('borderTopColor: colors.divider');
    expect(legalSettingsSource).toContain('backgroundColor: colors.page');
  });
});
