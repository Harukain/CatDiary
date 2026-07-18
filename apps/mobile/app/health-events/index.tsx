import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { authApi, type HealthEventSummary } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import { recordTimelineRoute } from '../../src/features/records/record-form';
import {
  Body,
  Card,
  ErrorText,
  PrimaryButton,
  Screen,
  TextButton,
  Title,
} from '../../src/shared/ui/primitives';

export default function HealthEventsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { restoring, session, activeFamily } = useSession();
  const mountedRef = useRef(true);
  const [events, setEvents] = useState<HealthEventSummary[]>([]);
  const [status, setStatus] = useState<'ACTIVE' | 'RECOVERED'>('ACTIVE');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );
  const load = useCallback(
    async (shouldApply: () => boolean = () => true) => {
      if (restoring) {
        if (shouldApply()) setLoading(true);
        return;
      }
      if (!session || !activeFamily) {
        if (!shouldApply()) return;
        setEvents([]);
        setError('');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const nextEvents = await authApi.listHealthEvents(
          session.accessToken,
          activeFamily.id,
          status,
        );
        if (!shouldApply()) return;
        setEvents(nextEvents);
      } catch (cause) {
        if (!shouldApply()) return;
        setEvents([]);
        setError(cause instanceof Error ? cause.message : '健康事件加载失败');
      } finally {
        if (shouldApply()) setLoading(false);
      }
    },
    [activeFamily, restoring, session, status],
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
  const contextUnavailable = !restoring && (!session || !activeFamily);
  const loadingInitial = restoring || loading;
  const interactionLocked = loading || contextUnavailable;
  const canRecordSymptom = !interactionLocked && !!session && !!activeFamily;
  const canOpenTimeline = !interactionLocked;
  function openHealthEvent(eventId: string) {
    if (interactionLocked) return;
    router.push({ pathname: '/health-events/[id]', params: { id: eventId } });
  }
  function openRecordSymptom() {
    if (!canRecordSymptom) return;
    router.push({ pathname: '/records/new', params: { type: 'VOMIT' } });
  }
  function openTimeline() {
    if (!canOpenTimeline) return;
    router.push(recordTimelineRoute);
  }
  async function reload() {
    if (!mountedRef.current) return;
    await load(() => mountedRef.current);
  }
  return (
    <Screen>
      <View style={styles.flex}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heading}>
            <View style={styles.headingCopy}>
              <Text testID="health-events.title" style={styles.title}>
                健康事件
              </Text>
              <Text style={styles.subtitle}>把零散异常串成一段可追溯过程</Text>
            </View>
            <Pressable
              testID="health-events.close.button"
              accessibilityRole="button"
              accessibilityLabel="关闭健康事件列表"
              onPress={() => router.back()}
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>
          <View style={styles.notice}>
            <Ionicons name="medical-outline" size={20} color={colors.warningDark} />
            <Text style={styles.noticeText}>
              健康事件需要绑定明确猫咪和真实记录。先记录呕吐、排便或用药等异常，再从记录详情建立事件。
            </Text>
          </View>
          <View style={styles.tabs}>
            <Tab
              active={status === 'ACTIVE'}
              label="观察中"
              value="ACTIVE"
              disabled={interactionLocked}
              onPress={() => setStatus('ACTIVE')}
            />
            <Tab
              active={status === 'RECOVERED'}
              label="已恢复"
              value="RECOVERED"
              disabled={interactionLocked}
              onPress={() => setStatus('RECOVERED')}
            />
          </View>
          {loadingInitial ? (
            <Card testID="health-events.loading.card">
              <ActivityIndicator color={colors.brand} />
              <Body>正在整理健康事件…</Body>
            </Card>
          ) : contextUnavailable ? (
            <Card testID="health-events.context-empty.card">
              <Title>需要先完成家庭设置</Title>
              <Body>登录并选择家庭后，才能查看健康事件或记录异常。</Body>
              <TextButton label="去我的页面检查家庭" onPress={() => router.push('/(tabs)/me')} />
            </Card>
          ) : error ? (
            <Card testID="health-events.error.card">
              <Title>健康事件加载失败</Title>
              <ErrorText testID="health-events.error.text">{error}</ErrorText>
              <TextButton
                testID="health-events.reload.inline-button"
                label="重新加载"
                disabled={loading}
                onPress={() => void reload()}
              />
            </Card>
          ) : events.length ? (
            events.map((event) => (
              <Pressable
                key={event.id}
                testID="health-events.item"
                accessibilityRole="button"
                accessibilityState={{ disabled: interactionLocked }}
                disabled={interactionLocked}
                onPress={() => openHealthEvent(event.id)}
                style={({ pressed }) => [
                  styles.event,
                  interactionLocked && styles.disabled,
                  pressed && !interactionLocked && styles.pressed,
                ]}
              >
                <View
                  style={[styles.statusDot, event.status === 'RECOVERED' && styles.recoveredDot]}
                />
                <View style={styles.eventBody}>
                  <Text style={styles.pet}>
                    {event.pet.name} · {event.status === 'ACTIVE' ? '观察中' : '已恢复'}
                  </Text>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.meta}>
                    {new Date(event.startedAt).toLocaleDateString('zh-CN')} 开始 ·{' '}
                    {event.records.length} 条关联记录
                  </Text>
                  {event.summary ? <Text style={styles.summary}>{event.summary}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </Pressable>
            ))
          ) : (
            <Card>
              <Title>{status === 'ACTIVE' ? '没有观察中的健康事件' : '还没有已恢复事件'}</Title>
              <Body>在异常记录详情中可以建立健康事件，并持续关联后续症状和治疗记录。</Body>
            </Card>
          )}
        </ScrollView>
        <View
          testID="health-events.footer"
          style={[
            styles.footer,
            { paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm) },
          ]}
        >
          {error ? (
            <PrimaryButton
              testID="health-events.retry.button"
              label="重新加载健康事件"
              disabled={loading}
              onPress={() => void reload()}
            />
          ) : (
            <PrimaryButton
              testID="health-events.record-symptom.button"
              label="记录一次异常"
              disabled={!canRecordSymptom}
              onPress={openRecordSymptom}
            />
          )}
          <TextButton
            testID="health-events.timeline.button"
            label="查看记录时间线"
            disabled={!canOpenTimeline}
            onPress={openTimeline}
          />
          <TextButton
            testID="health-events.return.button"
            label="返回上一页"
            onPress={() => router.back()}
          />
        </View>
      </View>
    </Screen>
  );
}
function Tab({
  active,
  label,
  value,
  disabled,
  onPress,
}: {
  active: boolean;
  label: string;
  value: 'ACTIVE' | 'RECOVERED';
  disabled?: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      testID={`health-events.status.${value}`}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive, disabled && styles.disabled]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1 },
  content: { gap: spacing.lg, paddingBottom: spacing.xl },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headingCopy: { flex: 1, paddingRight: spacing.md },
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
  notice: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.input,
    backgroundColor: colors.brandSoft,
  },
  noticeText: { ...typography.caption, color: colors.warningDark, flex: 1 },
  tabs: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  tab: {
    flex: 1,
    minHeight: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: colors.ink },
  tabText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  tabTextActive: { color: colors.surface },
  disabled: { opacity: 0.55 },
  event: {
    minHeight: 112,
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  recoveredDot: { backgroundColor: colors.successDark },
  eventBody: { flex: 1, gap: spacing.xs },
  pet: { ...typography.caption, color: colors.brand, fontWeight: '700' },
  eventTitle: { ...typography.h3, color: colors.ink },
  meta: { ...typography.caption, color: colors.textTertiary },
  summary: { ...typography.secondary, color: colors.textSecondary, marginTop: spacing.xs },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.page,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
