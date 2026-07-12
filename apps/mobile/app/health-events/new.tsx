import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, spacing, typography } from '@cat-diary/design-tokens';
import { authApi } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import {
  Card,
  ErrorText,
  Field,
  PrimaryButton,
  Screen,
  TextButton,
} from '../../src/shared/ui/primitives';

export default function NewHealthEventScreen() {
  const params = useLocalSearchParams<{ recordId?: string; petId?: string; title?: string }>();
  const router = useRouter();
  const { session, activeFamily } = useSession();
  const [title, setTitle] = useState(params.title ? `持续观察：${params.title}` : '');
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    if (!session || !activeFamily || !params.petId)
      return setError('缺少猫咪信息，请从异常记录进入');
    setBusy(true);
    setError('');
    try {
      const event = await authApi.createHealthEvent(session.accessToken, activeFamily.id, {
        petId: params.petId,
        title: title.trim(),
        startedAt: new Date().toISOString(),
        summary: summary.trim() || undefined,
        recordIds: params.recordId ? [params.recordId] : [],
        clientId: uuid(),
      });
      Alert.alert('健康事件已建立', '后续可以继续关联观察和治疗记录');
      router.replace({ pathname: '/health-events/[id]', params: { id: event.id } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.eyebrow}>异常追踪</Text>
          <Text style={styles.title}>建立健康事件</Text>
          <Text style={styles.subtitle}>健康事件用于整理事实，不提供诊断或医疗建议。</Text>
        </View>
        <Card>
          <Field
            label="事件标题"
            value={title}
            onChangeText={setTitle}
            maxLength={100}
            placeholder="例如：连续呕吐观察"
          />
          <Field
            label="目前情况（选填）"
            value={summary}
            onChangeText={setSummary}
            maxLength={1000}
            multiline
            placeholder="描述频率、精神状态和已采取的处理"
          />
          {params.recordId ? <Text style={styles.linked}>已关联当前异常记录</Text> : null}
          {error ? <ErrorText>{error}</ErrorText> : null}
          <PrimaryButton label="开始追踪" busy={busy} disabled={!title.trim()} onPress={submit} />
        </Card>
        <TextButton label="取消" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = (Math.random() * 16) | 0;
    return (char === 'x' ? value : (value & 3) | 8).toString(16);
  });
}
const styles = StyleSheet.create({
  content: { gap: spacing.xl, paddingBottom: 70 },
  eyebrow: { ...typography.caption, color: colors.dangerDark, fontWeight: '700' },
  title: { ...typography.h1, color: colors.ink, marginTop: spacing.xs },
  subtitle: { ...typography.secondary, color: colors.textSecondary, marginTop: spacing.sm },
  linked: { ...typography.caption, color: colors.warningDark, marginTop: spacing.sm },
});
