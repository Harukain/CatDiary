import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@cat-diary/design-tokens';
import { authApi } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import { isHealthEventDraftDirty } from '../../src/features/health-events/health-event-form';
import { resolveDraftExitDecision } from '../../src/shared/navigation/draft-exit';
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
  const initialTitle = useRef(params.title ? `持续观察：${params.title}` : '').current;
  const allowLeave = useRef(false);
  const [title, setTitle] = useState(initialTitle);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isDirty = useMemo(
    () =>
      isHealthEventDraftDirty(
        { title, summary },
        {
          title: initialTitle,
          summary: '',
        },
      ),
    [initialTitle, summary, title],
  );
  const requestClose = useCallback(() => {
    const decision = resolveDraftExitDecision({
      busy,
      isDirty,
      allowLeave: allowLeave.current,
    });
    if (decision === 'wait') {
      Alert.alert('健康事件正在创建', '请等待当前健康事件保存完成，避免重复创建。', [
        { text: '继续等待', style: 'cancel' },
      ]);
      return;
    }
    if (decision === 'continue') return router.back();
    Alert.alert(
      '放弃未保存的健康事件？',
      '当前填写的标题或情况摘要尚未保存，离开后需要重新填写。',
      [
        { text: '继续填写', style: 'cancel' },
        {
          text: '放弃',
          style: 'destructive',
          onPress: () => {
            allowLeave.current = true;
            router.back();
          },
        },
      ],
    );
  }, [busy, isDirty, router]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const decision = resolveDraftExitDecision({
        busy,
        isDirty,
        allowLeave: allowLeave.current,
      });
      if (decision === 'continue') return false;
      requestClose();
      return true;
    });
    return () => subscription.remove();
  }, [busy, isDirty, requestClose]);
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
      allowLeave.current = true;
      router.replace({ pathname: '/health-events/[id]', params: { id: event.id } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.nav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭健康事件表单"
            disabled={busy}
            onPress={requestClose}
            style={({ pressed }) => [
              styles.navButton,
              busy && styles.navButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="close" size={23} color={colors.ink} />
          </Pressable>
          <View style={styles.navCopy}>
            <Text style={styles.eyebrow}>异常追踪</Text>
            <Text style={styles.title}>建立健康事件</Text>
            <Text style={styles.subtitle}>健康事件用于整理事实，不提供诊断或医疗建议。</Text>
          </View>
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
        <TextButton label="取消" disabled={busy} onPress={requestClose} />
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
  nav: { minHeight: 54, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  navButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navButtonDisabled: { opacity: 0.45 },
  navCopy: { flex: 1 },
  eyebrow: { ...typography.caption, color: colors.dangerDark, fontWeight: '700' },
  title: { ...typography.h1, color: colors.ink, marginTop: spacing.xs },
  subtitle: { ...typography.secondary, color: colors.textSecondary, marginTop: spacing.sm },
  linked: { ...typography.caption, color: colors.warningDark, marginTop: spacing.sm },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
