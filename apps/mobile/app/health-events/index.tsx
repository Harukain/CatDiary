import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { authApi, type HealthEventSummary } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import { Body, Card, ErrorText, Screen, Title } from '../../src/shared/ui/primitives';

export default function HealthEventsScreen() {
  const router = useRouter();
  const { session, activeFamily } = useSession();
  const [events, setEvents] = useState<HealthEventSummary[]>([]);
  const [status, setStatus] = useState<'ACTIVE' | 'RECOVERED'>('ACTIVE');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!session || !activeFamily) return;
    setLoading(true);
    setError('');
    try {
      setEvents(await authApi.listHealthEvents(session.accessToken, activeFamily.id, status));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '健康事件加载失败');
    } finally {
      setLoading(false);
    }
  }, [activeFamily, session, status]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heading}>
          <View>
            <Text style={styles.title}>健康事件</Text>
            <Text style={styles.subtitle}>把零散异常串成一段可追溯过程</Text>
          </View>
          <Pressable onPress={() => router.back()} style={styles.close}>
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
        </View>
        <View style={styles.tabs}>
          <Tab active={status === 'ACTIVE'} label="观察中" onPress={() => setStatus('ACTIVE')} />
          <Tab
            active={status === 'RECOVERED'}
            label="已恢复"
            onPress={() => setStatus('RECOVERED')}
          />
        </View>
        {loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : error ? (
          <ErrorText>{error}</ErrorText>
        ) : events.length ? (
          events.map((event) => (
            <Pressable
              key={event.id}
              onPress={() =>
                router.push({ pathname: '/health-events/[id]', params: { id: event.id } })
              }
              style={styles.event}
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
    </Screen>
  );
}
function Tab({ active, label, onPress }: { active: boolean; label: string; onPress(): void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: 80 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
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
  recoveredDot: { backgroundColor: '#54796A' },
  eventBody: { flex: 1, gap: spacing.xs },
  pet: { ...typography.caption, color: colors.brand, fontWeight: '700' },
  eventTitle: { ...typography.h3, color: colors.ink },
  meta: { ...typography.caption, color: colors.textTertiary },
  summary: { ...typography.secondary, color: colors.textSecondary, marginTop: spacing.xs },
});
