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
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { authApi, type PetSummary, type PlanSummary } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import {
  Body,
  Card,
  ErrorText,
  PrimaryButton,
  Screen,
  TextButton,
  Title,
} from '../../src/shared/ui/primitives';

type Scope = 'enabled' | 'paused';

export default function PlansRoute() {
  const router = useRouter();
  const { session, activeFamily } = useSession();
  const [scope, setScope] = useState<Scope>('enabled');
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const canManage = activeFamily?.role === 'OWNER' || activeFamily?.role === 'ADMIN';

  const load = useCallback(async () => {
    if (!session || !activeFamily) return;
    setLoading(true);
    setError('');
    try {
      const [nextPlans, nextPets] = await Promise.all([
        authApi.listPlans(session.accessToken, activeFamily.id, scope === 'enabled'),
        authApi.listPets(session.accessToken, activeFamily.id),
      ]);
      setPlans(nextPlans);
      setPets(nextPets);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '照顾计划加载失败');
    } finally {
      setLoading(false);
    }
  }, [activeFamily, scope, session]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function requestToggle(plan: PlanSummary) {
    const pausing = plan.enabled;
    Alert.alert(
      pausing ? '暂停照顾计划？' : '恢复照顾计划？',
      pausing
        ? '未来未完成任务将被取消；已发生的记录不会受影响。'
        : '未来 7 天的照顾任务会重新生成。',
      [
        { text: '取消', style: 'cancel' },
        { text: pausing ? '确认暂停' : '确认恢复', onPress: () => void toggle(plan) },
      ],
    );
  }
  async function toggle(plan: PlanSummary) {
    if (!session || !activeFamily) return;
    setBusyId(plan.id);
    setError('');
    try {
      const next = plan.enabled
        ? await authApi.pausePlan(session.accessToken, activeFamily.id, plan.id, plan.version)
        : await authApi.resumePlan(session.accessToken, activeFamily.id, plan.id, plan.version);
      if (next.enabled !== (scope === 'enabled')) await load();
      else setPlans((current) => current.map((item) => (item.id === next.id ? next : item)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '计划状态更新失败');
    } finally {
      setBusyId('');
    }
  }

  return (
    <Screen>
      <View style={styles.nav}>
        <Pressable accessibilityLabel="返回" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.navTitle}>照顾计划</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="新建照顾计划"
          onPress={() => router.push('/plans/new')}
          style={styles.newButton}
        >
          <Ionicons name="add" size={21} color={colors.brand} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View>
          <Text style={styles.title}>长期照顾计划</Text>
          <Text style={styles.subtitle}>暂停只影响未来任务，不会删除已经发生的记录。</Text>
        </View>
        <View style={styles.segment}>
          <ScopeButton
            active={scope === 'enabled'}
            label="进行中"
            onPress={() => setScope('enabled')}
          />
          <ScopeButton
            active={scope === 'paused'}
            label="已暂停"
            onPress={() => setScope('paused')}
          />
        </View>
        {error ? <ErrorText>{error}</ErrorText> : null}
        {loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : plans.length ? (
          <View style={styles.list}>
            {plans.map((plan) => (
              <Card key={plan.id}>
                <View style={styles.planTop}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`编辑${plan.title}`}
                    onPress={() =>
                      router.push({ pathname: '/plans/new', params: { planId: plan.id } })
                    }
                    style={({ pressed }) => [styles.planHeading, pressed && styles.pressed]}
                  >
                    <Text style={styles.planTitle}>{plan.title}</Text>
                    <Text style={styles.planMeta}>
                      {petName(plan, pets)} · {typeLabel(plan.recordType)} · {plan.localTime}
                    </Text>
                  </Pressable>
                  <View
                    style={[styles.badge, plan.enabled ? styles.activeBadge : styles.pausedBadge]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        plan.enabled ? styles.activeText : styles.pausedText,
                      ]}
                    >
                      {plan.enabled ? '进行中' : '已暂停'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.recurrence}>{recurrenceLabel(plan)}</Text>
                {plan.detail ? <Text style={styles.detail}>{plan.detail}</Text> : null}
                {canManage ? (
                  busyId === plan.id ? (
                    <ActivityIndicator color={colors.brand} />
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => requestToggle(plan)}
                      style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
                    >
                      <Text style={styles.toggleText}>
                        {plan.enabled ? '暂停计划' : '恢复计划'}
                      </Text>
                    </Pressable>
                  )
                ) : null}
              </Card>
            ))}
          </View>
        ) : (
          <Card>
            <Title>{scope === 'enabled' ? '还没有进行中的计划' : '没有已暂停的计划'}</Title>
            <Body>
              {scope === 'enabled'
                ? '创建疫苗、驱虫、用药或铲屎计划后，系统会生成未来 7 天任务。'
                : '暂停中的计划会保留在这里，随时可以恢复。'}
            </Body>
            {canManage && scope === 'enabled' ? (
              <PrimaryButton label="新建照顾计划" onPress={() => router.push('/plans/new')} />
            ) : null}
          </Card>
        )}
        <TextButton label="返回任务" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}

function ScopeButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.segmentButton, active && styles.segmentButtonActive]}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}
function petName(plan: PlanSummary, pets: PetSummary[]) {
  if (!plan.petId) return '公共任务';
  return pets.find((pet) => pet.id === plan.petId)?.name ?? '已删除猫咪';
}
function typeLabel(type: PlanSummary['recordType']) {
  return (
    (
      {
        VACCINE: '疫苗',
        DEWORMING: '驱虫',
        MEDICATION: '用药',
        LITTER: '铲屎',
        FOOD: '饮食',
        WATER: '饮水',
        WEIGHT: '体重',
        STOOL: '排便',
        VOMIT: '呕吐',
        PHOTO: '照片',
        HEALTH_NOTE: '健康观察',
      } as Record<PlanSummary['recordType'], string>
    )[type] ?? '照顾'
  );
}
function recurrenceLabel(plan: PlanSummary) {
  const rule = plan.recurrenceRule;
  if (!rule || rule.frequency === 'once') return '仅提醒一次';
  if (rule.frequency === 'daily') return '每天重复';
  if (rule.frequency === 'weekly') return '每周重复';
  return '每月重复';
}

const styles = StyleSheet.create({
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navTitle: { ...typography.h3, color: colors.ink },
  newButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { gap: spacing.xl, paddingBottom: spacing.huge },
  title: { ...typography.h1, color: colors.ink },
  subtitle: { ...typography.secondary, color: colors.textSecondary, marginTop: spacing.xs },
  segment: {
    height: 44,
    borderRadius: radii.selector,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  segmentButton: {
    flex: 1,
    borderRadius: radii.segment,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonActive: { backgroundColor: colors.brandSoft },
  segmentText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  segmentTextActive: { color: colors.brand },
  list: { gap: spacing.md },
  planTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  planHeading: { flex: 1, minHeight: 44, justifyContent: 'center', gap: spacing.xs },
  planTitle: { ...typography.h3, color: colors.ink },
  planMeta: { ...typography.caption, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  badge: { borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  activeBadge: { backgroundColor: colors.successSoft },
  pausedBadge: { backgroundColor: colors.warningSoft },
  badgeText: { ...typography.caption, fontWeight: '600' },
  activeText: { color: colors.successDark },
  pausedText: { color: colors.warningDark },
  recurrence: { ...typography.caption, color: colors.brand, fontWeight: '600' },
  detail: { ...typography.secondary, color: colors.textSecondary },
  toggle: { minHeight: 44, alignItems: 'flex-start', justifyContent: 'center' },
  toggleText: { ...typography.caption, color: colors.warningDark, fontWeight: '700' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
