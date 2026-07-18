import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@cat-diary/design-tokens';
import {
  Body,
  Card,
  ErrorText,
  PrimaryButton,
  Screen,
  TextButton,
  Title,
} from '../../src/shared/ui/primitives';
import { legalLinks } from '../../src/features/legal/legal-links';

export default function LegalSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [openingLink, setOpeningLink] = useState<'terms' | 'privacy' | null>(null);
  const [error, setError] = useState('');
  const configured = Boolean(legalLinks.privacyPolicy && legalLinks.terms);
  const canOpenTerms = Boolean(legalLinks.terms) && !openingLink;
  const canOpenPrivacy = Boolean(legalLinks.privacyPolicy) && !openingLink;

  async function openLegalLink(kind: 'terms' | 'privacy', url: string | undefined) {
    if (!url || openingLink) return;
    setOpeningLink(kind);
    setError('');
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error('unsupported-url');
      await Linking.openURL(url);
    } catch {
      setError(
        kind === 'terms' ? '用户协议打开失败，请稍后重试。' : '隐私政策打开失败，请稍后重试。',
      );
    } finally {
      setOpeningLink(null);
    }
  }

  return (
    <Screen>
      <View style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Card testID="legal.links.card">
            <Title>协议与隐私</Title>
            <Body>了解猫伴日记如何提供服务、处理数据，以及如何导出或删除账号数据。</Body>
            {!configured ? (
              <ErrorText testID="legal.config.error">
                当前开发构建尚未配置正式法律文档地址。
              </ErrorText>
            ) : null}
            {error ? <ErrorText testID="legal.open.error">{error}</ErrorText> : null}
            <PrimaryButton
              testID="legal.terms.button"
              label="查看用户协议"
              busy={openingLink === 'terms'}
              disabled={!canOpenTerms}
              onPress={() => void openLegalLink('terms', legalLinks.terms)}
            />
            <PrimaryButton
              testID="legal.privacy.button"
              label="查看隐私政策"
              busy={openingLink === 'privacy'}
              disabled={!canOpenPrivacy}
              onPress={() => void openLegalLink('privacy', legalLinks.privacyPolicy)}
            />
          </Card>
          <Card>
            <Title>你的数据权利</Title>
            <Body>你可以在“我的－数据导出”申请副本，在“账号与注销”申请删除账号。</Body>
          </Card>
        </ScrollView>
        <View
          testID="legal.footer"
          style={[
            styles.footer,
            { paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm) },
          ]}
        >
          <TextButton
            testID="legal.return.button"
            label={openingLink ? '正在打开链接…' : '返回'}
            disabled={!!openingLink}
            onPress={() => router.back()}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: spacing.xxl, paddingBottom: spacing.xl },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.page,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
});
