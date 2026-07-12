import { Linking, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { spacing } from '@cat-diary/design-tokens';
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
  const configured = Boolean(legalLinks.privacyPolicy && legalLinks.terms);
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card>
          <Title>协议与隐私</Title>
          <Body>了解猫伴日记如何提供服务、处理数据，以及如何导出或删除账号数据。</Body>
          {!configured ? <ErrorText>当前开发构建尚未配置正式法律文档地址。</ErrorText> : null}
          <PrimaryButton
            label="查看用户协议"
            disabled={!legalLinks.terms}
            onPress={() => void Linking.openURL(legalLinks.terms!)}
          />
          <PrimaryButton
            label="查看隐私政策"
            disabled={!legalLinks.privacyPolicy}
            onPress={() => void Linking.openURL(legalLinks.privacyPolicy!)}
          />
        </Card>
        <Card>
          <Title>你的数据权利</Title>
          <Body>你可以在“我的－数据导出”申请副本，在“账号与注销”申请删除账号。</Body>
        </Card>
        <TextButton label="返回" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({ content: { gap: spacing.xxl, paddingBottom: spacing.xxxl } });
