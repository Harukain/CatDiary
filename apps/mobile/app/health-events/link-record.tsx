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
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import {
  authApi,
  type HealthEventSummary,
  type RecordSummary,
} from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import { resolveDraftExitDecision } from '../../src/shared/navigation/draft-exit';
import { ErrorText, Screen, TextButton } from '../../src/shared/ui/primitives';

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
  const { session, activeFamily } = useSession();
  const [event, setEvent] = useState<HealthEventSummary>();
  const [records, setRecords] = useState<RecordSummary[]>([]);
  const [relation, setRelation] = useState<Relation>('OBSERVATION');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const busy = !!busyId;
  useEffect(() => {
    if (!session || !activeFamily || !eventId) return;
    void (async () => {
      try {
        const nextEvent = await authApi.getHealthEvent(
          session.accessToken,
          activeFamily.id,
          eventId,
        );
        const page = await authApi.listRecords(
          session.accessToken,
          activeFamily.id,
          nextEvent.petId,
        );
        const linked = new Set(nextEvent.records.map((item) => item.record.id));
        setEvent(nextEvent);
        setRecords(page.items.filter((record) => !linked.has(record.id)));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '记录加载失败');
      }
    })();
  }, [activeFamily, eventId, session]);
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
    if (!session || !activeFamily || !event || busy) return;
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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <View>
            <Text style={styles.title}>关联后续记录</Text>
            <Text style={styles.subtitle}>
              {event ? `${event.pet.name} · ${event.title}` : '只显示同一只猫的有效记录'}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="关闭"
            accessibilityHint={busy ? '记录关联中，点击会提示继续等待' : '返回健康事件详情'}
            onPress={requestClose}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
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
                accessibilityState={{ selected: relation === option.value, disabled: busy }}
                disabled={busy}
                onPress={() => setRelation(option.value)}
                style={[
                  styles.relation,
                  relation === option.value && styles.relationActive,
                  busy && styles.relationDisabled,
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
        {error ? <ErrorText>{error}</ErrorText> : null}
        {!event ? (
          <ActivityIndicator color={colors.brand} />
        ) : records.length ? (
          <View>
            <Text style={styles.section}>选择记录</Text>
            <View style={styles.list}>
              {records.map((record) => (
                <Pressable
                  key={record.id}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={() => void link(record)}
                  style={({ pressed }) => [
                    styles.record,
                    busy && record.id !== busyId && styles.recordDisabled,
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
            <Text style={styles.emptyBody}>先在记录中心新增观察或治疗结果，再回到这里关联。</Text>
          </View>
        )}
        <TextButton label={busy ? '关联中，请等待' : '取消'} onPress={requestClose} />
      </ScrollView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { gap: spacing.xl, paddingBottom: 70 },
  heading: { flexDirection: 'row', justifyContent: 'space-between' },
  title: { ...typography.h1, color: colors.ink },
  subtitle: { ...typography.secondary, color: colors.textSecondary, marginTop: spacing.xs },
  close: {
    width: 42,
    height: 42,
    borderRadius: 21,
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
  relationDisabled: { opacity: 0.55 },
  relationLabel: { ...typography.h3, color: colors.ink },
  relationLabelActive: { color: colors.surface },
  relationHint: { ...typography.caption, color: colors.textSecondary, marginTop: 3 },
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
  recordDisabled: { opacity: 0.55 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand },
  dotAbnormal: { backgroundColor: colors.danger },
  recordBody: { flex: 1, gap: 3 },
  recordType: { ...typography.caption, color: colors.brand, fontWeight: '700' },
  recordTitle: { ...typography.h3, color: colors.ink },
  recordMeta: { ...typography.caption, color: colors.textTertiary },
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
});
