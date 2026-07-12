import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import {
  authApi,
  AuthApiError,
  type PetSummary,
  type PlanSummary,
  type PlanType,
} from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
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
] as const;

export default function NewPlanRoute() {
  const router = useRouter();
  const { planId } = useLocalSearchParams<{ planId?: string }>();
  const { session, activeFamily } = useSession();
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [petId, setPetId] = useState<string | null>(null);
  const [type, setType] = useState<PlanType>('VACCINE');
  const [title, setTitle] = useState('疫苗接种');
  const [detail, setDetail] = useState('');
  const [localTime, setLocalTime] = useState(defaultTime());
  const [frequency, setFrequency] = useState<'once' | 'daily' | 'weekly' | 'monthly'>('once');
  const [existingPlan, setExistingPlan] = useState<PlanSummary>();
  const [futureTaskPolicy, setFutureTaskPolicy] = useState<'keep' | 'regenerate'>('keep');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const canManage = activeFamily?.role === 'OWNER' || activeFamily?.role === 'ADMIN';

  useEffect(() => {
    if (!session || !activeFamily) return;
    void Promise.all([
      authApi.listPets(session.accessToken, activeFamily.id),
      planId
        ? authApi.getPlan(session.accessToken, activeFamily.id, planId)
        : Promise.resolve(undefined),
    ])
      .then(([data, plan]) => {
        setPets(data);
        if (plan) {
          setExistingPlan(plan);
          setPetId(plan.petId);
          setType(plan.recordType);
          setTitle(plan.title);
          setDetail(plan.detail ?? '');
          setLocalTime(plan.localTime);
          setFrequency(plan.recurrenceRule?.frequency ?? 'once');
        } else setPetId(data[0]?.id ?? null);
      })
      .catch(() => setError(planId ? '照顾计划加载失败' : '猫咪档案加载失败'))
      .finally(() => setLoading(false));
  }, [activeFamily, planId, session]);

  const valid = useMemo(
    () =>
      !!title.trim() &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(localTime) &&
      (type === 'LITTER' || !!petId),
    [localTime, petId, title, type],
  );
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
            : { frequency };
      if (existingPlan) {
        await authApi.updatePlan(session.accessToken, activeFamily.id, existingPlan.id, {
          petId: type === 'LITTER' ? petId : petId!,
          type,
          title: title.trim(),
          detail: detail.trim(),
          startAt: existingPlan.startAt ?? now.toISOString(),
          localTime,
          recurrenceRule,
          version: existingPlan.version,
          futureTaskPolicy,
        });
        router.replace('/plans');
      } else {
        await authApi.createPlan(session.accessToken, activeFamily.id, {
          petId: type === 'LITTER' ? petId : petId!,
          type,
          title: title.trim(),
          detail: detail.trim() || undefined,
          startAt: now.toISOString(),
          localTime,
          recurrenceRule,
        });
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
            router.replace('/plans');
          } catch (cause) {
            setError(cause instanceof AuthApiError ? cause.message : '计划删除失败');
            setBusy(false);
          }
        },
      },
    ]);
  }

  return (
    <Screen>
      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={() => router.back()}
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.navTitle}>{existingPlan ? '编辑照顾计划' : '新建照顾计划'}</Text>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!canManage ? (
          <Card>
            <Title>无管理权限</Title>
            <Body>只有家庭管理员可以创建长期照顾计划。</Body>
          </Card>
        ) : loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : (
          <Card>
            <Title>要提醒什么？</Title>
            <View style={styles.grid}>
              {planTypes.map((item) => (
                <Pressable
                  key={item.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: type === item.value }}
                  onPress={() => {
                    setType(item.value);
                    setTitle(item.title);
                  }}
                  style={[styles.choice, type === item.value && styles.choiceActive]}
                >
                  <Text style={[styles.choiceText, type === item.value && styles.choiceTextActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
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
                    accessibilityRole="button"
                    accessibilityState={{ selected: petId === null }}
                    onPress={() => setPetId(null)}
                    style={[styles.petChip, petId === null && styles.petChipActive]}
                  >
                    <Text style={[styles.petChipText, petId === null && styles.petChipTextActive]}>
                      公共任务
                    </Text>
                  </Pressable>
                ) : null}
                {pets.map((pet) => (
                  <Pressable
                    key={pet.id}
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
            <Field label="计划名称" value={title} maxLength={80} onChangeText={setTitle} />
            <Field
              label="说明"
              value={detail}
              maxLength={500}
              placeholder="选填，例如剂量或注意事项"
              onChangeText={setDetail}
            />
            <Field
              label="提醒时间"
              value={localTime}
              maxLength={5}
              keyboardType="numbers-and-punctuation"
              placeholder="HH:mm"
              onChangeText={setLocalTime}
            />
            <View style={styles.field}>
              <Text style={styles.label}>重复</Text>
              <View style={styles.grid}>
                {frequencies.map((item) => (
                  <Pressable
                    key={item.value}
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
            {error ? <ErrorText>{error}</ErrorText> : null}
            <PrimaryButton
              label={existingPlan ? '保存计划' : '保存并生成任务'}
              busy={busy}
              disabled={!valid}
              onPress={submit}
            />
            {existingPlan ? (
              <TextButton label="删除照顾计划" danger disabled={busy} onPress={confirmDelete} />
            ) : null}
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

function defaultTime() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
const styles = StyleSheet.create({
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  content: { paddingBottom: spacing.huge },
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
});
