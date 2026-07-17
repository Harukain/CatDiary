import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import {
  authApi,
  AuthApiError,
  type MemberSummary,
  type PetSummary,
  type PlanSummary,
  type PlanType,
} from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import { resolveDraftExitDecision } from '../../src/shared/navigation/draft-exit';
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

const planTypes: Array<{ value: PlanType; label: string; title: string }> = [
  { value: 'VACCINE', label: '疫苗', title: '疫苗接种' },
  { value: 'DEWORMING', label: '驱虫', title: '定期驱虫' },
  { value: 'MEDICATION', label: '用药', title: '按时用药' },
  { value: 'LITTER', label: '铲屎', title: '清理猫砂盆' },
];
const frequencies = [
  { value: 'once', label: '仅一次' },
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'intervalMonths', label: '每 3 个月' },
] as const;
type Frequency = (typeof frequencies)[number]['value'];

export default function NewPlanRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { planId } = useLocalSearchParams<{ planId?: string }>();
  const { session, activeFamily } = useSession();
  const scrollRef = useRef<ScrollView>(null);
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [petId, setPetId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [type, setType] = useState<PlanType>('VACCINE');
  const [title, setTitle] = useState('疫苗接种');
  const [detail, setDetail] = useState('');
  const [localTime, setLocalTime] = useState(defaultTime());
  const initialLocalTime = useRef(localTime).current;
  const [frequency, setFrequency] = useState<Frequency>('once');
  const [existingPlan, setExistingPlan] = useState<PlanSummary>();
  const [futureTaskPolicy, setFutureTaskPolicy] = useState<'keep' | 'regenerate'>('keep');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState('');
  const allowLeave = useRef(false);
  const canManage = activeFamily?.role === 'OWNER' || activeFamily?.role === 'ADMIN';

  useEffect(() => {
    if (!session || !activeFamily) return;
    setLoading(true);
    setLoadError('');
    setError('');
    setInitialSnapshot('');
    allowLeave.current = false;
    if (planId) setExistingPlan(undefined);
    void Promise.all([
      authApi.listPets(session.accessToken, activeFamily.id),
      authApi.listMembers(session.accessToken, activeFamily.id),
      planId
        ? authApi.getPlan(session.accessToken, activeFamily.id, planId)
        : Promise.resolve(undefined),
    ])
      .then(([data, nextMembers, plan]) => {
        setPets(data);
        setMembers(nextMembers);
        if (plan) {
          setExistingPlan(plan);
          setPetId(plan.petId);
          setAssigneeId(plan.assigneeId ?? null);
          setType(plan.recordType);
          setTitle(plan.title);
          setDetail(plan.detail ?? '');
          setLocalTime(plan.localTime);
          setFrequency(plan.recurrenceRule?.frequency ?? 'once');
          setInitialSnapshot(
            formSnapshot({
              petId: plan.petId,
              assigneeId: plan.assigneeId ?? null,
              type: plan.recordType,
              title: plan.title,
              detail: plan.detail ?? '',
              localTime: plan.localTime,
              frequency: plan.recurrenceRule?.frequency ?? 'once',
              futureTaskPolicy: 'keep',
            }),
          );
        } else {
          const firstPetId = data[0]?.id ?? null;
          setPetId(firstPetId);
          setInitialSnapshot(
            formSnapshot({
              petId: firstPetId,
              assigneeId: null,
              type: 'VACCINE',
              title: '疫苗接种',
              detail: '',
              localTime: initialLocalTime,
              frequency: 'once',
              futureTaskPolicy: 'keep',
            }),
          );
        }
      })
      .catch(() => setLoadError(planId ? '照顾计划加载失败' : '建档信息加载失败'))
      .finally(() => setLoading(false));
  }, [activeFamily, initialLocalTime, planId, reloadKey, session]);

  const valid = useMemo(
    () =>
      !!title.trim() &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(localTime) &&
      (type === 'LITTER' || !!petId),
    [localTime, petId, title, type],
  );
  const submitHint = useMemo(() => {
    if (!title.trim()) return '填写计划名称后才能保存';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime))
      return '提醒时间需使用 24 小时格式，例如 08:30';
    if (type !== 'LITTER' && !petId) {
      return pets.length ? '请选择归属猫咪' : '先添加猫咪后才能创建单猫计划';
    }
    return '';
  }, [localTime, petId, pets.length, title, type]);
  const currentSnapshot = formSnapshot({
    petId,
    assigneeId,
    type,
    title,
    detail,
    localTime,
    frequency,
    futureTaskPolicy,
  });
  const isDirty = !!initialSnapshot && currentSnapshot !== initialSnapshot;

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const decision = resolveDraftExitDecision({
        busy,
        isDirty,
        allowLeave: allowLeave.current,
      });
      if (decision === 'continue') return false;
      requestReturn();
      return true;
    });
    return () => subscription.remove();
  });
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
  function scrollToFieldOffset(y: number) {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y, animated: true });
    }, 120);
  }
  async function submit() {
    if (!session || !activeFamily || !valid || busy) return;
    setBusy(true);
    setError('');
    const now = new Date();
    const weekday = now.getDay() === 0 ? 7 : now.getDay();
    try {
      const recurrenceRule =
        frequency === 'weekly'
          ? { frequency, weekdays: [weekday] }
          : frequency === 'monthly'
            ? { frequency, dayOfMonth: now.getDate() }
            : frequency === 'intervalMonths'
              ? { frequency, interval: 3, dayOfMonth: now.getDate() }
              : { frequency };
      if (existingPlan) {
        await authApi.updatePlan(session.accessToken, activeFamily.id, existingPlan.id, {
          petId: type === 'LITTER' ? petId : petId!,
          assigneeId,
          type,
          title: title.trim(),
          detail: detail.trim(),
          startAt: existingPlan.startAt ?? now.toISOString(),
          localTime,
          recurrenceRule,
          version: existingPlan.version,
          futureTaskPolicy,
        });
        allowLeave.current = true;
        returnToPlans();
      } else {
        await authApi.createPlan(session.accessToken, activeFamily.id, {
          petId: type === 'LITTER' ? petId : petId!,
          assigneeId,
          type,
          title: title.trim(),
          detail: detail.trim() || undefined,
          startAt: now.toISOString(),
          localTime,
          recurrenceRule,
        });
        allowLeave.current = true;
        router.replace('/(tabs)/tasks');
      }
    } catch (cause) {
      setError(cause instanceof AuthApiError ? cause.message : '计划创建失败');
    } finally {
      setBusy(false);
    }
  }
  function confirmDelete() {
    if (!existingPlan || !session || !activeFamily) return;
    Alert.alert('删除照顾计划？', '未来待完成任务会被取消；已经发生的记录不会删除。', [
      { text: '取消', style: 'cancel' },
      {
        text: '确认删除',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          setError('');
          try {
            await authApi.deletePlan(
              session.accessToken,
              activeFamily.id,
              existingPlan.id,
              existingPlan.version,
            );
            allowLeave.current = true;
            returnToPlans();
          } catch (cause) {
            setError(cause instanceof AuthApiError ? cause.message : '计划删除失败');
            setBusy(false);
          }
        },
      },
    ]);
  }
  function returnToPlans() {
    if (router.canGoBack()) router.back();
    else router.replace('/plans');
  }
  function requestReturn() {
    const decision = resolveDraftExitDecision({
      busy,
      isDirty,
      allowLeave: allowLeave.current,
    });
    if (decision === 'wait') {
      Alert.alert('照顾计划正在处理', '请等待当前保存或删除操作完成，避免未来任务状态不一致。', [
        { text: '继续等待', style: 'cancel' },
      ]);
      return;
    }
    if (decision === 'continue') {
      returnToPlans();
      return;
    }
    Alert.alert('放弃未保存的修改？', '当前填写内容尚未保存，离开后需要重新填写。', [
      { text: '继续编辑', style: 'cancel' },
      {
        text: '放弃修改',
        style: 'destructive',
        onPress: () => {
          allowLeave.current = true;
          returnToPlans();
        },
      },
    ]);
  }

  return (
    <Screen>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={requestReturn}
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.navTitle}>{planId ? '编辑照顾计划' : '新建照顾计划'}</Text>
        <View style={styles.back} />
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!canManage ? (
            <Card>
              <Title>无管理权限</Title>
              <Body>只有家庭管理员可以创建长期照顾计划。</Body>
            </Card>
          ) : loading ? (
            <ActivityIndicator color={colors.brand} />
          ) : loadError ? (
            <Card>
              <Title>{planId ? '计划无法打开' : '建档信息加载失败'}</Title>
              <ErrorText>{loadError}</ErrorText>
              <PrimaryButton label="重新加载" onPress={() => setReloadKey((value) => value + 1)} />
              <TextButton label="返回" onPress={returnToPlans} />
            </Card>
          ) : (
            <Card>
              <Title>要提醒什么？</Title>
              <View style={styles.grid}>
                {planTypes.map((item) => (
                  <Pressable
                    key={item.value}
                    testID={`plan.type.${item.value}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: type === item.value }}
                    onPress={() => {
                      setType(item.value);
                      setTitle(item.title);
                    }}
                    style={[styles.choice, type === item.value && styles.choiceActive]}
                  >
                    <Text
                      style={[styles.choiceText, type === item.value && styles.choiceTextActive]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>负责人</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.petRow}
                >
                  <Pressable
                    testID="plan.assignee.all"
                    accessibilityRole="button"
                    accessibilityState={{ selected: assigneeId === null }}
                    onPress={() => setAssigneeId(null)}
                    style={[styles.petChip, assigneeId === null && styles.petChipActive]}
                  >
                    <Text
                      style={[styles.petChipText, assigneeId === null && styles.petChipTextActive]}
                    >
                      家庭成员共同负责
                    </Text>
                  </Pressable>
                  {members.map((member) => (
                    <Pressable
                      key={member.id}
                      testID="plan.assignee.member"
                      accessibilityRole="button"
                      accessibilityState={{ selected: assigneeId === member.user.id }}
                      onPress={() => setAssigneeId(member.user.id)}
                      style={[
                        styles.petChip,
                        assigneeId === member.user.id && styles.petChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.petChipText,
                          assigneeId === member.user.id && styles.petChipTextActive,
                        ]}
                      >
                        {member.user.displayName ?? '家庭成员'}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>归属猫咪</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.petRow}
                >
                  {type === 'LITTER' ? (
                    <Pressable
                      testID="plan.pet.public"
                      accessibilityRole="button"
                      accessibilityState={{ selected: petId === null }}
                      onPress={() => setPetId(null)}
                      style={[styles.petChip, petId === null && styles.petChipActive]}
                    >
                      <Text
                        style={[styles.petChipText, petId === null && styles.petChipTextActive]}
                      >
                        公共任务
                      </Text>
                    </Pressable>
                  ) : null}
                  {pets.map((pet) => (
                    <Pressable
                      key={pet.id}
                      testID="plan.pet.item"
                      accessibilityRole="button"
                      accessibilityState={{ selected: petId === pet.id }}
                      onPress={() => setPetId(pet.id)}
                      style={[styles.petChip, petId === pet.id && styles.petChipActive]}
                    >
                      <Text
                        style={[styles.petChipText, petId === pet.id && styles.petChipTextActive]}
                      >
                        {pet.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              <Field
                testID="plan.title.input"
                label="计划名称"
                value={title}
                maxLength={80}
                onFocus={() => scrollToFieldOffset(260)}
                onChangeText={setTitle}
              />
              <Field
                testID="plan.detail.input"
                label="说明"
                value={detail}
                maxLength={500}
                placeholder="选填，例如剂量或注意事项"
                onFocus={() => scrollToFieldOffset(380)}
                onChangeText={setDetail}
              />
              <Field
                testID="plan.local-time.input"
                label="提醒时间"
                value={localTime}
                maxLength={5}
                keyboardType="numbers-and-punctuation"
                placeholder="HH:mm"
                onFocus={() => scrollToFieldOffset(500)}
                onChangeText={setLocalTime}
              />
              <View style={styles.field}>
                <Text style={styles.label}>重复</Text>
                <View style={styles.grid}>
                  {frequencies.map((item) => (
                    <Pressable
                      key={item.value}
                      testID={`plan.frequency.${item.value}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: frequency === item.value }}
                      onPress={() => setFrequency(item.value)}
                      style={[styles.choice, frequency === item.value && styles.choiceActive]}
                    >
                      <Text
                        style={[
                          styles.choiceText,
                          frequency === item.value && styles.choiceTextActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              {existingPlan ? (
                <View style={styles.field}>
                  <Text style={styles.label}>保存后的未来任务</Text>
                  <View style={styles.grid}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: futureTaskPolicy === 'keep' }}
                      onPress={() => setFutureTaskPolicy('keep')}
                      style={[styles.choice, futureTaskPolicy === 'keep' && styles.choiceActive]}
                    >
                      <Text
                        style={[
                          styles.choiceText,
                          futureTaskPolicy === 'keep' && styles.choiceTextActive,
                        ]}
                      >
                        保留已有任务
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: futureTaskPolicy === 'regenerate' }}
                      onPress={() => setFutureTaskPolicy('regenerate')}
                      style={[
                        styles.choice,
                        futureTaskPolicy === 'regenerate' && styles.choiceActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.choiceText,
                          futureTaskPolicy === 'regenerate' && styles.choiceTextActive,
                        ]}
                      >
                        重新生成未来任务
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={styles.policyHint}>
                    仅当修改时间或重复规则时需要重新生成；已完成的历史不会受影响。
                  </Text>
                </View>
              ) : null}
              {existingPlan ? (
                <TextButton label="删除照顾计划" danger disabled={busy} onPress={confirmDelete} />
              ) : null}
            </Card>
          )}
        </ScrollView>
        {canManage && !loading && !loadError && !keyboardVisible ? (
          <View
            style={[
              styles.footer,
              { paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm) },
            ]}
          >
            {error ? <ErrorText testID="plan.error">{error}</ErrorText> : null}
            {submitHint ? <Text style={styles.footerHint}>{submitHint}</Text> : null}
            <PrimaryButton
              testID="plan.submit.button"
              label={existingPlan ? '保存计划' : '保存并生成任务'}
              busy={busy}
              disabled={!valid}
              onPress={submit}
            />
            <TextButton
              label={busy ? '保存中，请等待' : '取消'}
              disabled={busy}
              onPress={requestReturn}
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

function defaultTime() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function formSnapshot(input: {
  petId: string | null;
  assigneeId: string | null;
  type: PlanType;
  title: string;
  detail: string;
  localTime: string;
  frequency: Frequency;
  futureTaskPolicy: 'keep' | 'regenerate';
}) {
  return JSON.stringify(input);
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  content: { paddingBottom: 148 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: {
    minWidth: '22%',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.selector,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceActive: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  choiceText: { ...typography.secondary, color: colors.textSecondary },
  choiceTextActive: { color: colors.brand, fontWeight: '600' },
  field: { gap: spacing.sm, marginTop: spacing.sm },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink },
  petRow: { gap: spacing.sm },
  petChip: {
    height: 44,
    borderRadius: 22,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  petChipText: { fontSize: 13, color: colors.textSecondary },
  petChipTextActive: { color: colors.surface, fontWeight: '600' },
  policyHint: { ...typography.caption, color: colors.textSecondary },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.page,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  footerHint: { ...typography.caption, color: colors.warningDark },
});
