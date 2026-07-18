import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import {
  authApi,
  type HealthEventSummary,
  type RecordSummary,
} from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import { resolveDraftExitDecision } from '../../src/shared/navigation/draft-exit';
import { ErrorText, PrimaryButton, Screen, TextButton } from '../../src/shared/ui/primitives';

type Relation = 'SYMPTOM' | 'OBSERVATION' | 'TREATMENT';
const relationOptions: Array<{ value: Relation; label: string; hint: string }> = [
  { value: 'SYMPTOM', label: '症状', hint: '异常表现和身体变化' },
  { value: 'OBSERVATION', label: '观察', hint: '饮食、排便和精神状态' },
  { value: 'TREATMENT', label: '治疗', hint: '用药、就诊和护理结果' },
];
const typeLabels: Record<string, string> = {
  FOOD: '饮食',
  WATER: '饮水',
  WEIGHT: '体重',
  STOOL: '排便',
  VOMIT: '呕吐',
  MEDICATION: '用药',
  VACCINE: '疫苗',
  DEWORMING: '驱虫',
  LITTER: '铲屎',
};

export default function LinkHealthEventRecordScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { restoring, session, activeFamily } = useSession();
  const [event, setEvent] = useState<HealthEventSummary>();
  const [records, setRecords] = useState<RecordSummary[]>([]);
  const [relation, setRelation] = useState<Relation>('OBSERVATION');
  const [busyId, setBusyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const busy = !!busyId;
  const contextUnavailable = !restoring && (!session || !activeFamily || !eventId);
  const loadingInitial = restoring || (loading && !event);
  const interactionDisabled = busy || loading || contextUnavailable;
  const load = useCallback(async () => {
    if (restoring) return;
    if (!session || !activeFamily || !eventId) {
      setEvent(undefined);
      setRecords([]);
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    setEvent(undefined);
    setRecords([]);
    try {
      const nextEvent = await authApi.getHealthEvent(session.accessToken, activeFamily.id, eventId);
      const page = await authApi.listRecords(session.accessToken, activeFamily.id, nextEvent.petId);
      const linked = new Set(nextEvent.records.map((item) => item.record.id));
      setEvent(nextEvent);
      setRecords(page.items.filter((record) => !linked.has(record.id)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '记录加载失败');
    } finally {
      setLoading(false);
    }
  }, [activeFamily, eventId, restoring, session]);
  useEffect(() => {
    void load();
  }, [load]);
  const requestClose = useCallback(() => {
    const decision = resolveDraftExitDecision({ busy, isDirty: false });
    if (decision === 'wait') {
      Alert.alert('记录正在关联', '请等待当前关联操作完成，避免健康事件和记录状态不一致。', [
        { text: '继续等待', style: 'cancel' },
      ]);
      return;
    }
    router.back();
  }, [busy, router]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const decision = resolveDraftExitDecision({ busy, isDirty: false });
      if (decision === 'continue') return false;
      requestClose();
      return true;
    });
    return () => subscription.remove();
  }, [busy, requestClose]);
  async function link(record: RecordSummary) {
    if (!session || !activeFamily || !event || interactionDisabled) return;
    const selectedRelation = relation;
    setBusyId(record.id);
    setError('');
    try {
      await authApi.addHealthEventRecord(
        session.accessToken,
        activeFamily.id,
        event.id,
        record.id,
        selectedRelation,
      );
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '关联失败');
      setBusyId('');
    }
  }
  return (
    <Screen>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <View style={styles.flex}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heading}>
            <View style={styles.headingCopy}>
              <Text style={styles.title}>关联后续记录</Text>
              <Text style={styles.subtitle}>
                {event ? `${event.pet.name} · ${event.title}` : '只显示同一只猫的有效记录'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭"
              accessibilityHint={busy ? '记录关联中，请等待完成' : '返回健康事件详情'}
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={requestClose}
              style={({ pressed }) => [
                styles.close,
                busy && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>
          <View>
            <Text style={styles.section}>这条记录在事件中的作用</Text>
            <View style={styles.relations}>
              {relationOptions.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: relation === option.value,
                    disabled: interactionDisabled,
                  }}
                  disabled={interactionDisabled}
                  onPress={() => setRelation(option.value)}
                  style={[
                    styles.relation,
                    relation === option.value && styles.relationActive,
                    interactionDisabled && styles.disabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.relationLabel,
                      relation === option.value && styles.relationLabelActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                  <Text
                    style={[
                      styles.relationHint,
                      relation === option.value && styles.relationHintActive,
                    ]}
                  >
                    {option.hint}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          {error ? <ErrorText testID="health-event-link.error.text">{error}</ErrorText> : null}
          {contextUnavailable ? (
            <View testID="health-event-link.context-empty" style={styles.empty}>
              <Text style={styles.emptyTitle}>缺少健康事件上下文</Text>
              <Text style={styles.emptyBody}>请返回健康事件详情页，再重新进入关联记录流程。</Text>
            </View>
          ) : loadingInitial ? (
            <ActivityIndicator color={colors.brand} />
          ) : event ? (
            records.length ? (
              <View>
                <Text style={styles.section}>选择记录</Text>
                <View style={styles.list}>
                  {records.map((record) => (
                    <Pressable
                      key={record.id}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: interactionDisabled }}
                      disabled={interactionDisabled}
                      onPress={() => void link(record)}
                      style={({ pressed }) => [
                        styles.record,
                        interactionDisabled && record.id !== busyId && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={[styles.dot, record.abnormal && styles.dotAbnormal]} />
                      <View style={styles.recordBody}>
                        <Text style={styles.recordType}>
                          {typeLabels[record.type] ?? record.type}
                          {record.abnormal ? ' · 异常' : ''}
                        </Text>
                        <Text style={styles.recordTitle}>{record.title}</Text>
                        <Text style={styles.recordMeta}>
                          {new Date(record.occurredAt).toLocaleString('zh-CN', { hour12: false })}
                        </Text>
                      </View>
                      {busyId === record.id ? (
                        <ActivityIndicator size="small" color={colors.brand} />
                      ) : (
                        <Ionicons name="add-circle-outline" size={22} color={colors.brand} />
                      )}
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>没有可关联的新记录</Text>
                <Text style={styles.emptyBody}>
                  先在记录中心新增观察或治疗结果，再回到这里关联。
                </Text>
              </View>
            )
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>没有读取到健康事件</Text>
              <Text style={styles.emptyBody}>
                可以重新加载记录，或返回详情页确认事件是否仍然存在。
              </Text>
            </View>
          )}
        </ScrollView>
        <View
          testID="health-event-link.footer"
          style={[
            styles.footer,
            { paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm) },
          ]}
        >
          {error && !contextUnavailable ? (
            <PrimaryButton
              testID="health-event-link.reload.button"
              label="重新加载记录"
              busy={loading}
              disabled={busy}
              onPress={() => void load()}
            />
          ) : null}
          <TextButton
            testID="health-event-link.return.button"
            label={busy ? '关联中，请等待' : '返回详情'}
            disabled={busy}
            onPress={requestClose}
          />
        </View>
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1 },
  content: { gap: spacing.xl, paddingBottom: spacing.xl },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headingCopy: { flex: 1, paddingRight: spacing.md },
  title: { ...typography.h1, color: colors.ink },
  subtitle: { ...typography.secondary, color: colors.textSecondary, marginTop: spacing.xs },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { ...typography.h3, color: colors.ink, marginBottom: spacing.md },
  relations: { gap: spacing.sm },
  relation: {
    padding: spacing.md,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  relationActive: { borderColor: colors.ink, backgroundColor: colors.ink },
  relationLabel: { ...typography.h3, color: colors.ink },
  relationLabelActive: { color: colors.surface },
  relationHint: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  relationHintActive: { color: colors.textTertiary },
  list: { gap: spacing.md },
  record: {
    minHeight: 82,
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  dotAbnormal: { backgroundColor: colors.danger },
  recordBody: { flex: 1, gap: spacing.xs },
  recordType: { ...typography.caption, color: colors.brand, fontWeight: '700' },
  recordTitle: { ...typography.h3, color: colors.ink },
  recordMeta: { ...typography.caption, color: colors.textTertiary, fontVariant: ['tabular-nums'] },
  empty: {
    padding: spacing.xl,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  emptyTitle: { ...typography.h3, color: colors.ink },
  emptyBody: {
    ...typography.secondary,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  footer: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.page,
    gap: spacing.xs,
  },
});
