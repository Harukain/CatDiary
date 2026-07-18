import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { authApi, type HealthEventSummary } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import {
  healthEventDetailNavigationCopy,
  isHealthEventDraftDirty,
  resolveHealthEventDetailNavigationDecision,
  type HealthEventDetailNavigationTarget,
  type HealthEventDraft,
} from '../../src/features/health-events/health-event-form';
import {
  Body,
  Card,
  ErrorText,
  Field,
  PrimaryButton,
  Screen,
  TextButton,
  Title,
} from '../../src/shared/ui/primitives';

export default function HealthEventDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { restoring, session, activeFamily } = useSession();
  const [event, setEvent] = useState<HealthEventSummary | null>(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [initialDraft, setInitialDraft] = useState<HealthEventDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const load = useCallback(
    async (shouldApply: () => boolean = () => true) => {
      if (restoring) {
        if (shouldApply()) setLoading(true);
        return;
      }
      if (!session || !activeFamily || !eventId) {
        if (!shouldApply()) return;
        setEvent(null);
        setTitle('');
        setSummary('');
        setInitialDraft(null);
        setError('');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      setEvent((current) => (current?.id === eventId ? current : null));
      try {
        const next = await authApi.getHealthEvent(session.accessToken, activeFamily.id, eventId);
        if (!shouldApply()) return;
        setEvent(next);
        setTitle(next.title);
        setSummary(next.summary ?? '');
        setInitialDraft({ title: next.title, summary: next.summary ?? '' });
      } catch (cause) {
        if (!shouldApply()) return;
        setEvent(null);
        setTitle('');
        setSummary('');
        setInitialDraft(null);
        setError(cause instanceof Error ? cause.message : '健康事件加载失败');
      } finally {
        if (shouldApply()) setLoading(false);
      }
    },
    [activeFamily, eventId, restoring, session],
  );
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      void load(() => mounted);
      return () => {
        mounted = false;
      };
    }, [load]),
  );
  const contextUnavailable = !restoring && (!session || !activeFamily || !eventId);
  const loadingInitial = restoring || (loading && !event);
  const interactionLocked = busy || loading || contextUnavailable;
  const canEdit =
    !!event &&
    (event.createdById === session?.user.id ||
      activeFamily?.role === 'OWNER' ||
      activeFamily?.role === 'ADMIN');
  const isDirty = useMemo(
    () =>
      !!initialDraft &&
      isHealthEventDraftDirty(
        {
          title,
          summary,
        },
        initialDraft,
      ),
    [initialDraft, summary, title],
  );
  const canSave = canEdit && !interactionLocked && isDirty && Boolean(title.trim());
  const canRecover = canEdit && !interactionLocked && event?.status === 'ACTIVE';
  const requestGuardedNavigation = useCallback(
    (target: HealthEventDetailNavigationTarget, action: () => void) => {
      const decision = resolveHealthEventDetailNavigationDecision({ busy, isDirty });
      if (decision === 'wait') {
        Alert.alert('健康事件正在处理', '请等待当前操作完成，避免健康事件状态与服务器不一致。', [
          { text: '继续等待', style: 'cancel' },
        ]);
        return;
      }
      if (decision === 'continue') {
        action();
        return;
      }
      const copy = healthEventDetailNavigationCopy(target);
      Alert.alert(copy.title, copy.message, [
        { text: '继续编辑', style: 'cancel' },
        { text: copy.confirmLabel, style: 'destructive', onPress: action },
      ]);
    },
    [busy, isDirty],
  );
  const requestReturn = useCallback(() => {
    requestGuardedNavigation('return', () => router.back());
  }, [requestGuardedNavigation, router]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!busy && !isDirty) return false;
      requestReturn();
      return true;
    });
    return () => subscription.remove();
  }, [busy, isDirty, requestReturn]);
  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);
  const requestLinkRecord = useCallback(() => {
    if (!event || interactionLocked) return;
    requestGuardedNavigation('linkRecord', () =>
      router.push({
        pathname: '/health-events/link-record',
        params: { eventId: event.id },
      }),
    );
  }, [event, interactionLocked, requestGuardedNavigation, router]);
  const requestViewRecord = useCallback(
    (recordId: string) => {
      if (interactionLocked) return;
      requestGuardedNavigation('viewRecord', () =>
        router.push({ pathname: '/records/[id]', params: { id: recordId } }),
      );
    },
    [interactionLocked, requestGuardedNavigation, router],
  );
  async function save() {
    if (!event || !session || !activeFamily || !canSave) return;
    setBusy(true);
    setError('');
    try {
      const next = await authApi.updateHealthEvent(session.accessToken, activeFamily.id, event.id, {
        title: title.trim(),
        summary: summary.trim(),
        version: event.version,
      });
      setEvent(next);
      setTitle(next.title);
      setSummary(next.summary ?? '');
      setInitialDraft({ title: next.title, summary: next.summary ?? '' });
      Alert.alert('已保存', '健康事件摘要已经更新');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }
  async function recover() {
    if (!event || !session || !activeFamily || !canRecover) return;
    setBusy(true);
    setError('');
    try {
      const next = await authApi.recoverHealthEvent(
        session.accessToken,
        activeFamily.id,
        event.id,
        event.version,
      );
      setEvent(next);
      Alert.alert('已标记恢复', '该事件会保留在历史中，方便以后回顾');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新失败');
    } finally {
      setBusy(false);
    }
  }
  function unlink(recordId: string, recordTitle: string) {
    if (!event || !session || !activeFamily || !canEdit || interactionLocked) return;
    Alert.alert('解除记录关联？', `“${recordTitle}”不会被删除，只会从当前健康事件中移除。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '解除关联',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          setError('');
          try {
            await authApi.removeHealthEventRecord(
              session.accessToken,
              activeFamily.id,
              event.id,
              recordId,
            );
            await load();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : '解除关联失败');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }
  if (loadingInitial)
    return (
      <Screen>
        <Stack.Screen options={{ gestureEnabled: false }} />
        <Card testID="health-event-detail.loading.card">
          <ActivityIndicator color={colors.brand} />
          <Body>正在加载健康事件…</Body>
        </Card>
      </Screen>
    );
  if (contextUnavailable)
    return (
      <Screen>
        <Stack.Screen options={{ gestureEnabled: false }} />
        <Card testID="health-event-detail.context-empty.card">
          <Title>需要先选择家庭和健康事件</Title>
          <Body>当前没有可用的登录、家庭或健康事件参数，先回到健康事件列表重新进入。</Body>
          <TextButton
            label="返回健康事件"
            testID="health-event-detail.context-empty.back"
            onPress={() => router.replace('/health-events')}
          />
        </Card>
      </Screen>
    );
  if (!event)
    return (
      <Screen>
        <Stack.Screen options={{ gestureEnabled: false }} />
        <Card testID="health-event-detail.error.card">
          <Title>健康事件加载失败</Title>
          <ErrorText testID="health-event-detail.load-error">
            {error || '健康事件加载失败'}
          </ErrorText>
          <TextButton
            label="重新加载"
            disabled={loading}
            testID="health-event-detail.reload.button"
            onPress={() => void load()}
          />
          <TextButton
            label="返回健康事件"
            testID="health-event-detail.error.back"
            onPress={() => router.replace('/health-events')}
          />
        </Card>
      </Screen>
    );
  return (
    <Screen>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.nav}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="返回健康事件列表"
              disabled={interactionLocked}
              accessibilityState={{ disabled: interactionLocked }}
              onPress={requestReturn}
              style={({ pressed }) => [
                styles.navButton,
                interactionLocked && styles.disabled,
                pressed && !interactionLocked && styles.pressed,
              ]}
            >
              <Ionicons name="chevron-back" size={22} color={colors.ink} />
            </Pressable>
            <View style={styles.navCopy}>
              <Text style={[styles.status, event.status === 'RECOVERED' && styles.recovered]}>
                {event.status === 'ACTIVE' ? '观察中' : '已恢复'}
              </Text>
              <Text testID="health-event-detail.title" style={styles.title}>
                {event.title}
              </Text>
              <Text style={styles.meta}>
                {event.pet.name} ·{' '}
                {new Date(event.startedAt).toLocaleString('zh-CN', { hour12: false })} 开始
              </Text>
            </View>
          </View>
          <Card>
            <Field
              label="事件标题"
              editable={canEdit && !interactionLocked}
              value={title}
              onChangeText={setTitle}
              maxLength={100}
            />
            <Field
              label="情况摘要"
              editable={canEdit && !interactionLocked}
              value={summary}
              onChangeText={setSummary}
              maxLength={1000}
              multiline
              placeholder="记录症状变化、就诊和处理结果"
            />
            {canEdit ? null : (
              <Text style={styles.readonly}>只有事件创建人或家庭管理员可以修改。</Text>
            )}
          </Card>
          {error && keyboardVisible ? (
            <ErrorText testID="health-event-detail.error">{error}</ErrorText>
          ) : null}
          {canEdit && keyboardVisible ? (
            <>
              <PrimaryButton
                label="保存事件信息"
                busy={busy}
                disabled={!canSave}
                testID="health-event-detail.save.inline-button"
                onPress={save}
              />
              <TextButton
                label="返回健康事件"
                disabled={interactionLocked}
                testID="health-event-detail.return.inline-button"
                onPress={requestReturn}
              />
            </>
          ) : null}
          <View>
            <View style={styles.sectionHeading}>
              <Text style={styles.section}>关联记录</Text>
              {canEdit ? (
                <Pressable
                  testID="health-event-detail.link-record.button"
                  onPress={requestLinkRecord}
                  disabled={interactionLocked}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: interactionLocked }}
                  style={[styles.linkButton, interactionLocked && styles.disabled]}
                >
                  <Ionicons name="add" size={17} color={colors.brand} />
                  <Text style={styles.linkButtonText}>继续关联</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.timeline}>
              {event.records.length ? (
                event.records.map(({ record, relationType }) => (
                  <View key={record.id} style={styles.record}>
                    <Pressable
                      testID="health-event-detail.record.item"
                      accessibilityRole="button"
                      accessibilityLabel={`查看关联记录：${record.title}`}
                      accessibilityState={{ disabled: interactionLocked }}
                      disabled={interactionLocked}
                      style={[styles.recordMain, interactionLocked && styles.disabled]}
                      onPress={() => requestViewRecord(record.id)}
                    >
                      <Text style={styles.relation}>{relationLabel(relationType)}</Text>
                      <Text style={styles.recordTitle}>{record.title}</Text>
                      <Text style={styles.recordTime}>
                        {new Date(record.occurredAt).toLocaleString('zh-CN', { hour12: false })}
                      </Text>
                    </Pressable>
                    {canEdit ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="解除关联"
                        accessibilityState={{ disabled: interactionLocked }}
                        disabled={interactionLocked}
                        onPress={() => unlink(record.id, record.title)}
                        style={[styles.unlink, interactionLocked && styles.disabled]}
                      >
                        <Ionicons name="close" size={17} color={colors.dangerDark} />
                      </Pressable>
                    ) : (
                      <Text style={styles.arrow}>›</Text>
                    )}
                  </View>
                ))
              ) : (
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>还没有关联记录</Text>
                </View>
              )}
            </View>
          </View>
          {event.status === 'RECOVERED' ? (
            <View style={styles.done}>
              <Text style={styles.doneText}>
                恢复于{' '}
                {event.recoveredAt
                  ? new Date(event.recoveredAt).toLocaleString('zh-CN', { hour12: false })
                  : '—'}
              </Text>
            </View>
          ) : null}
          {!canEdit ? (
            <TextButton
              label="返回健康事件"
              disabled={interactionLocked}
              testID="health-event-detail.return.button"
              onPress={requestReturn}
            />
          ) : null}
        </ScrollView>
        {canEdit && !keyboardVisible ? (
          <View
            testID="health-event-detail.footer"
            style={[
              styles.footer,
              { paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm) },
            ]}
          >
            {error ? <ErrorText testID="health-event-detail.error">{error}</ErrorText> : null}
            <PrimaryButton
              label="保存事件信息"
              busy={busy}
              disabled={!canSave}
              testID="health-event-detail.save.button"
              onPress={save}
            />
            {event.status === 'ACTIVE' ? (
              <TextButton
                label="标记为已恢复"
                disabled={!canRecover}
                testID="health-event-detail.recover.button"
                onPress={recover}
              />
            ) : null}
            <TextButton
              label="返回健康事件"
              disabled={interactionLocked}
              testID="health-event-detail.return.button"
              onPress={requestReturn}
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}
function relationLabel(relation: string) {
  return relation === 'SYMPTOM' ? '症状' : relation === 'TREATMENT' ? '治疗' : '观察';
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: spacing.xl, paddingBottom: 148 },
  nav: { minHeight: 54, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  navButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navCopy: { flex: 1 },
  status: { ...typography.caption, color: colors.dangerDark, fontWeight: '700' },
  recovered: { color: colors.successDark },
  title: { ...typography.h1, color: colors.ink, marginTop: spacing.xs },
  meta: { ...typography.secondary, color: colors.textSecondary, marginTop: spacing.sm },
  readonly: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    padding: spacing.md,
  },
  sectionHeading: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  section: { ...typography.h3, color: colors.ink },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  linkButtonText: { ...typography.caption, color: colors.brand, fontWeight: '700' },
  timeline: { gap: spacing.md },
  record: {
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recordMain: { flex: 1 },
  relation: { ...typography.caption, color: colors.brand, fontWeight: '700' },
  recordTitle: { ...typography.h3, color: colors.ink, marginTop: spacing.xs },
  recordTime: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  unlink: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: { fontSize: 28, color: colors.textTertiary },
  empty: {
    padding: spacing.xl,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  emptyText: { ...typography.secondary, color: colors.textTertiary },
  done: {
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
  },
  doneText: { ...typography.secondary, color: colors.warningDark },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.page,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
