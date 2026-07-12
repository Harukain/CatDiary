import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { authApi, type HealthEventSummary } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import {
  Card,
  ErrorText,
  Field,
  PrimaryButton,
  Screen,
  TextButton,
} from '../../src/shared/ui/primitives';

export default function HealthEventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, activeFamily } = useSession();
  const [event, setEvent] = useState<HealthEventSummary>();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!session || !activeFamily || !id) return;
    setError('');
    try {
      const next = await authApi.getHealthEvent(session.accessToken, activeFamily.id, id);
      setEvent(next);
      setTitle(next.title);
      setSummary(next.summary ?? '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载失败');
    }
  }, [activeFamily, id, session]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  const canEdit =
    !!event &&
    (event.createdById === session?.user.id ||
      activeFamily?.role === 'OWNER' ||
      activeFamily?.role === 'ADMIN');
  async function save() {
    if (!event || !session || !activeFamily) return;
    setBusy(true);
    setError('');
    try {
      const next = await authApi.updateHealthEvent(session.accessToken, activeFamily.id, event.id, {
        title: title.trim(),
        summary: summary.trim(),
        version: event.version,
      });
      setEvent(next);
      Alert.alert('已保存', '健康事件摘要已经更新');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }
  async function recover() {
    if (!event || !session || !activeFamily) return;
    setBusy(true);
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
    if (!event || !session || !activeFamily) return;
    Alert.alert('解除记录关联？', `“${recordTitle}”不会被删除，只会从当前健康事件中移除。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '解除关联',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
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
  if (!event && !error)
    return (
      <Screen>
        <ActivityIndicator color={colors.brand} />
      </Screen>
    );
  if (!event)
    return (
      <Screen>
        <ErrorText>{error}</ErrorText>
        <TextButton label="返回" onPress={() => router.back()} />
      </Screen>
    );
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View>
          <Text style={[styles.status, event.status === 'RECOVERED' && styles.recovered]}>
            {event.status === 'ACTIVE' ? '观察中' : '已恢复'}
          </Text>
          <Text style={styles.title}>{event.title}</Text>
          <Text style={styles.meta}>
            {event.pet.name} ·{' '}
            {new Date(event.startedAt).toLocaleString('zh-CN', { hour12: false })} 开始
          </Text>
        </View>
        <Card>
          <Field
            label="事件标题"
            editable={canEdit}
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />
          <Field
            label="情况摘要"
            editable={canEdit}
            value={summary}
            onChangeText={setSummary}
            maxLength={1000}
            multiline
            placeholder="记录症状变化、就诊和处理结果"
          />
          {error ? <ErrorText>{error}</ErrorText> : null}
          {canEdit ? (
            <PrimaryButton
              label="保存事件信息"
              busy={busy}
              disabled={!title.trim()}
              onPress={save}
            />
          ) : (
            <Text style={styles.readonly}>只有事件创建人或家庭管理员可以修改。</Text>
          )}
        </Card>
        <View>
          <View style={styles.sectionHeading}>
            <Text style={styles.section}>关联记录</Text>
            {canEdit ? (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/health-events/link-record',
                    params: { eventId: event.id },
                  })
                }
                style={styles.linkButton}
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
                    style={styles.recordMain}
                    onPress={() =>
                      router.push({ pathname: '/records/[id]', params: { id: record.id } })
                    }
                  >
                    <Text style={styles.relation}>{relationLabel(relationType)}</Text>
                    <Text style={styles.recordTitle}>{record.title}</Text>
                    <Text style={styles.recordTime}>
                      {new Date(record.occurredAt).toLocaleString('zh-CN', { hour12: false })}
                    </Text>
                  </Pressable>
                  {canEdit ? (
                    <Pressable
                      accessibilityLabel="解除关联"
                      onPress={() => unlink(record.id, record.title)}
                      style={styles.unlink}
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
        {event.status === 'ACTIVE' && canEdit ? (
          <PrimaryButton label="标记为已恢复" busy={busy} onPress={recover} />
        ) : event.status === 'RECOVERED' ? (
          <View style={styles.done}>
            <Text style={styles.doneText}>
              恢复于{' '}
              {event.recoveredAt
                ? new Date(event.recoveredAt).toLocaleString('zh-CN', { hour12: false })
                : '—'}
            </Text>
          </View>
        ) : null}
        <TextButton label="返回健康事件" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}
function relationLabel(relation: string) {
  return relation === 'SYMPTOM' ? '症状' : relation === 'TREATMENT' ? '治疗' : '观察';
}
const styles = StyleSheet.create({
  content: { gap: spacing.xl, paddingBottom: 70 },
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
});
