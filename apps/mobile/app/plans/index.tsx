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
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { authApi, type PetSummary, type PlanSummary } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import { resolveDraftExitDecision } from '../../src/shared/navigation/draft-exit';
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
  const insets = useSafeAreaInsets();
  const { restoring, session, activeFamily } = useSession();
  const [scope, setScope] = useState<Scope>('enabled');
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const contextUnavailable = !restoring && (!session || !activeFamily);
  const canManage = activeFamily?.role === 'OWNER' || activeFamily?.role === 'ADMIN';
  const actionBusy = !!busyId;
  const interactionDisabled = actionBusy || loading || contextUnavailable;
  const canCreate = !!session && !!activeFamily && canManage && !loading && !actionBusy;

  const load = useCallback(
    async (shouldApply: () => boolean = () => true) => {
      if (restoring) return;
      if (!session || !activeFamily) {
        if (!shouldApply()) return;
        setPlans([]);
        setPets([]);
        setLoading(false);
        setError('');
        return;
      }
      if (!shouldApply()) return;
      setLoading(true);
      setError('');
      try {
        const [nextPlans, nextPets] = await Promise.all([
          authApi.listPlans(session.accessToken, activeFamily.id, scope === 'enabled'),
          authApi.listPets(session.accessToken, activeFamily.id),
        ]);
        if (!shouldApply()) return;
        setPlans(nextPlans);
        setPets(nextPets);
      } catch (cause) {
        if (!shouldApply()) return;
        setError(cause instanceof Error ? cause.message : '照顾计划加载失败');
      } finally {
        if (shouldApply()) setLoading(false);
      }
    },
    [activeFamily, restoring, scope, session],
  );
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void load(() => active);
      return () => {
        active = false;
      };
    }, [load]),
  );

  const requestReturn = useCallback(() => {
    const decision = resolveDraftExitDecision({ busy: actionBusy, isDirty: false });
    if (decision === 'wait') {
      Alert.alert('照顾计划正在处理', '请等待当前暂停或恢复操作完成，避免未来任务状态不一致。', [
        { text: '继续等待', style: 'cancel' },
      ]);
      return;
    }
    router.back();
  }, [actionBusy, router]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const decision = resolveDraftExitDecision({ busy: actionBusy, isDirty: false });
      if (decision === 'continue') return false;
      requestReturn();
      return true;
    });
    return () => subscription.remove();
  }, [actionBusy, requestReturn]);

  function requestScope(nextScope: Scope) {
    if (loading || contextUnavailable) return;
    if (actionBusy) {
      Alert.alert('照顾计划正在处理', '请等待当前暂停或恢复操作完成，再切换计划列表。', [
        { text: '继续等待', style: 'cancel' },
      ]);
      return;
    }
    setScope(nextScope);
  }
  function requestCreate() {
    if (!canManage || loading || contextUnavailable) return;
    if (actionBusy) {
      Alert.alert('照顾计划正在处理', '请等待当前暂停或恢复操作完成，再新建照顾计划。', [
        { text: '继续等待', style: 'cancel' },
      ]);
      return;
    }
    router.push('/plans/new');
  }
  function requestEdit(plan: PlanSummary) {
    if (!canManage) return;
    if (actionBusy) {
      Alert.alert('照顾计划正在处理', '请等待当前暂停或恢复操作完成，再编辑照顾计划。', [
        { text: '继续等待', style: 'cancel' },
      ]);
      return;
    }
    router.push({ pathname: '/plans/new', params: { planId: plan.id } });
  }

  function requestToggle(plan: PlanSummary) {
    if (actionBusy) {
      Alert.alert('照顾计划正在处理', '请等待当前暂停或恢复操作完成，再处理其它计划。', [
        { text: '继续等待', style: 'cancel' },
      ]);
      return;
    }
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
      <Stack.Screen options={{ gestureEnabled: false }} />
      <View style={styles.flex}>
        <View style={styles.nav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回"
            onPress={requestReturn}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
          <Text testID="plans.title" style={styles.navTitle}>
            照顾计划
          </Text>
          <View style={styles.back} />
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View>
            <Text style={styles.title}>长期照顾计划</Text>
            <Text style={styles.subtitle}>暂停只影响未来任务，不会删除已经发生的记录。</Text>
          </View>
          <View style={styles.segment}>
            <ScopeButton
              active={scope === 'enabled'}
              label="进行中"
              testID="plans.scope.enabled"
              disabled={interactionDisabled}
              onPress={() => requestScope('enabled')}
            />
            <ScopeButton
              active={scope === 'paused'}
              label="已暂停"
              testID="plans.scope.paused"
              disabled={interactionDisabled}
              onPress={() => requestScope('paused')}
            />
          </View>
          {restoring || loading ? (
            <View testID="plans.loading" style={styles.stateCard}>
              <ActivityIndicator color={colors.brand} />
              <Body>正在整理照顾计划。</Body>
            </View>
          ) : contextUnavailable ? (
            <Card testID="plans.context-empty">
              <Title>缺少家庭上下文</Title>
              <Body>请返回首页确认当前账号和家庭，再重新进入照顾计划。</Body>
            </Card>
          ) : error ? (
            <Card testID="plans.error.card">
              <ErrorText testID="plans.error.text">{error}</ErrorText>
              <Body>可以重新加载计划列表。暂停、恢复等操作不会因为本次加载失败而自动重试。</Body>
            </Card>
          ) : plans.length ? (
            <View style={styles.list}>
              {plans.map((plan) => (
                <Card key={plan.id}>
                  <View style={styles.planTop}>
                    <Pressable
                      accessibilityRole={canManage ? 'button' : undefined}
                      accessibilityLabel={canManage ? `编辑${plan.title}` : undefined}
                      accessibilityHint={
                        actionBusy ? '照顾计划处理中，点击会提示继续等待' : undefined
                      }
                      accessibilityState={{ disabled: !canManage || actionBusy }}
                      disabled={!canManage || actionBusy}
                      onPress={() => requestEdit(plan)}
                      style={({ pressed }) => [
                        styles.planHeading,
                        actionBusy && styles.planHeadingBusy,
                        pressed && styles.pressed,
                      ]}
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
                        accessibilityState={{ disabled: actionBusy }}
                        disabled={actionBusy}
                        onPress={() => requestToggle(plan)}
                        style={({ pressed }) => [
                          styles.toggle,
                          actionBusy && styles.muted,
                          pressed && styles.pressed,
                        ]}
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
            <Card testID="plans.empty.card">
              <Title>{scope === 'enabled' ? '还没有进行中的计划' : '没有已暂停的计划'}</Title>
              <Body>
                {scope === 'enabled'
                  ? '创建疫苗、驱虫、用药或铲屎计划后，系统会生成未来 7 天任务。'
                  : '暂停中的计划会保留在这里，随时可以恢复。'}
              </Body>
              {!canManage ? <Body>家庭成员可以查看任务和完成任务，计划由管理员维护。</Body> : null}
            </Card>
          )}
        </ScrollView>
        <View
          testID="plans.footer"
          style={[
            styles.footer,
            { paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm) },
          ]}
        >
          {error && !contextUnavailable ? (
            <PrimaryButton
              label="重新加载计划"
              testID="plans.reload.button"
              busy={loading}
              disabled={actionBusy}
              onPress={() => void load()}
            />
          ) : (
            <PrimaryButton
              label={canManage ? '新建照顾计划' : '仅管理员可新建计划'}
              testID="plans.create.button"
              disabled={!canCreate}
              onPress={requestCreate}
            />
          )}
          <TextButton
            label={actionBusy ? '处理中，请等待' : '返回任务'}
            testID="plans.return.button"
            onPress={requestReturn}
          />
        </View>
      </View>
    </Screen>
  );
}

function ScopeButton({
  active,
  label,
  testID,
  disabled,
  onPress,
}: {
  active: boolean;
  label: string;
  testID?: string;
  disabled?: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !!disabled }}
      accessibilityHint={disabled ? '照顾计划暂不可切换' : undefined}
      disabled={disabled}
      onPress={onPress}
      style={[styles.segmentButton, active && styles.segmentButtonActive, disabled && styles.muted]}
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
  if (rule.frequency === 'intervalMonths') return `每 ${rule.interval ?? 3} 个月重复`;
  return '每月重复';
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navTitle: { ...typography.h3, color: colors.ink },
  scroll: { flex: 1 },
  content: { gap: spacing.xl, paddingBottom: spacing.xl },
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
  stateCard: {
    padding: spacing.xl,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    alignItems: 'center',
    gap: spacing.md,
  },
  list: { gap: spacing.md },
  muted: { opacity: 0.55 },
  planTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  planHeading: { flex: 1, minHeight: 44, justifyContent: 'center', gap: spacing.xs },
  planHeadingBusy: { opacity: 0.72 },
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
  footer: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.page,
    gap: spacing.xs,
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
