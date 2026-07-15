import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { authApi, type ManualRecordType, type PetSummary } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import {
  Card,
  ErrorText,
  Field,
  PrimaryButton,
  Screen,
  TextButton,
} from '../../src/shared/ui/primitives';
import {
  enqueueOfflineOperation,
  isNetworkFailure,
} from '../../src/features/offline/offline-queue';
import {
  blankRecordFormValue,
  buildRecordData,
  datePart,
  fieldConfig,
  isRecordDraftDirty,
  isRecordDraftReady,
  parseOccurredAt,
  recordDraftOwnerLabel,
  recordRequiresPet,
  recordTitle,
  recordTypes,
  resolveInitialRecordPetId,
  resolveInitialRecordType,
  stoolOptions,
  timePart,
  vomitOptions,
  type RecordFormValue,
} from '../../src/features/records/record-form';
import { resolveDraftExitDecision } from '../../src/shared/navigation/draft-exit';

export default function NewRecordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ pet?: string; petId?: string; type?: string }>();
  const { session, activeFamily } = useSession();
  const initialOccurredDate = useRef(datePart()).current;
  const initialOccurredTime = useRef(timePart()).current;
  const initialType = useRef(resolveInitialRecordType(paramValue(params.type))).current;
  const allowLeave = useRef(false);
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [petId, setPetId] = useState<string | null>(null);
  const [type, setType] = useState<ManualRecordType>(initialType);
  const [form, setForm] = useState<RecordFormValue>(blankRecordFormValue(initialType));
  const [occurredDate, setOccurredDate] = useState(initialOccurredDate);
  const [occurredTime, setOccurredTime] = useState(initialOccurredTime);
  const [note, setNote] = useState('');
  const [abnormal, setAbnormal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const routePetId = useMemo(
    () => paramValue(params.petId) ?? paramValue(params.pet),
    [params.pet, params.petId],
  );
  useEffect(() => {
    if (!session || !activeFamily) return;
    void authApi
      .listPets(session.accessToken, activeFamily.id)
      .then((items) => {
        setPets(items);
        setPetId(resolveInitialRecordPetId(items, routePetId));
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : '猫咪加载失败'));
  }, [activeFamily, routePetId, session]);
  useEffect(() => {
    setForm(blankRecordFormValue(type));
    setError('');
  }, [type]);
  useEffect(() => {
    if (type !== 'LITTER' && !petId) setPetId(pets[0]?.id ?? null);
  }, [petId, pets, type]);
  const fields = useMemo(() => fieldConfig(type), [type]);
  const choices = type === 'STOOL' ? stoolOptions : type === 'VOMIT' ? vomitOptions : null;
  const canSubmit = isRecordDraftReady(type, form, petId);
  const ownerLabel = useMemo(() => recordDraftOwnerLabel(type, pets, petId), [petId, pets, type]);
  const isDirty = useMemo(
    () =>
      isRecordDraftDirty({
        type,
        value: form,
        note,
        abnormal,
        occurredDate,
        occurredTime,
        initialType,
        initialOccurredDate,
        initialOccurredTime,
      }),
    [
      abnormal,
      form,
      initialOccurredDate,
      initialOccurredTime,
      note,
      occurredDate,
      occurredTime,
      initialType,
      type,
    ],
  );
  const requestClose = useCallback(() => {
    const decision = resolveDraftExitDecision({
      busy,
      isDirty,
      allowLeave: allowLeave.current,
    });
    if (decision === 'wait') {
      Alert.alert('记录正在保存', '请等待当前记录保存完成，避免重复提交或丢失同步状态。', [
        { text: '继续等待', style: 'cancel' },
      ]);
      return;
    }
    if (decision === 'continue') return router.back();
    Alert.alert('放弃未保存的记录？', '当前填写内容尚未保存，离开后需要重新填写。', [
      { text: '继续填写', style: 'cancel' },
      {
        text: '放弃',
        style: 'destructive',
        onPress: () => {
          allowLeave.current = true;
          router.back();
        },
      },
    ]);
  }, [busy, isDirty, router]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const decision = resolveDraftExitDecision({
        busy,
        isDirty,
        allowLeave: allowLeave.current,
      });
      if (decision === 'continue') return false;
      requestClose();
      return true;
    });
    return () => subscription.remove();
  }, [busy, isDirty, requestClose]);
  async function submit() {
    if (!session || !activeFamily) return setError('登录状态已失效，请重新登录');
    if (recordRequiresPet(type) && !petId) return setError('请选择猫咪');
    if (!canSubmit)
      return setError(type === 'LITTER' ? '请填写猫砂盆或观察内容' : '请完整填写必填内容');
    let data: Record<string, unknown>;
    let occurredAt: string;
    try {
      data = buildRecordData(type, form);
      occurredAt = parseOccurredAt(occurredDate, occurredTime);
    } catch (cause) {
      return setError(cause instanceof Error ? cause.message : '请检查填写内容');
    }
    const input = {
      clientId: uuid(),
      petId: type === 'LITTER' ? petId : petId!,
      type,
      title: recordTitle(type, form.first),
      occurredAt,
      abnormal: abnormal || ((type === 'STOOL' || type === 'VOMIT') && form.blood),
      data,
      note: note.trim() || undefined,
    };
    const operation = authApi.createRecordOperation(activeFamily.id, input);
    setBusy(true);
    setError('');
    try {
      await authApi.createRecord(session.accessToken, activeFamily.id, input);
      Alert.alert('记录成功', '已经加入记录时间线');
      allowLeave.current = true;
      router.back();
    } catch (cause) {
      if (isNetworkFailure(cause)) {
        await enqueueOfflineOperation(operation);
        Alert.alert('已保存到本机', '联网后会自动同步到家庭时间线');
        allowLeave.current = true;
        router.back();
      } else setError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.nav}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭新增记录"
              disabled={busy}
              onPress={requestClose}
              style={({ pressed }) => [
                styles.navButton,
                busy && styles.navButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="close" size={23} color={colors.ink} />
            </Pressable>
            <View style={styles.navCopy}>
              <Text style={styles.title}>新增记录</Text>
              <Text style={styles.subtitle}>记录实际发生的情况，不会生成待办任务</Text>
            </View>
          </View>
          <Card>
            <Text style={styles.section}>{type === 'LITTER' ? '选择归属' : '选择猫咪'}</Text>
            {type === 'LITTER' ? (
              <Text style={styles.sectionHint}>不确定是哪只猫时，选择公共猫砂盆。</Text>
            ) : null}
            <View style={styles.chips}>
              {type === 'LITTER' ? (
                <Chip active={petId === null} label="公共猫砂盆" onPress={() => setPetId(null)} />
              ) : null}
              {pets.map((pet) => (
                <Chip
                  key={pet.id}
                  active={pet.id === petId}
                  label={pet.name}
                  onPress={() => setPetId(pet.id)}
                />
              ))}
            </View>
            <View style={styles.ownerNotice}>
              <Text style={styles.ownerNoticeLabel}>提交归属</Text>
              <Text style={styles.ownerNoticeValue}>{ownerLabel}</Text>
            </View>
            <Text style={styles.section}>记录类型</Text>
            <View style={styles.chips}>
              {recordTypes.map((item) => (
                <Chip
                  key={item.value}
                  active={item.value === type}
                  label={item.label}
                  onPress={() => setType(item.value)}
                />
              ))}
            </View>
            <View style={styles.dateRow}>
              <View style={styles.dateField}>
                <Field
                  label="发生日期"
                  value={occurredDate}
                  onChangeText={setOccurredDate}
                  placeholder="YYYY-MM-DD"
                  maxLength={10}
                />
              </View>
              <View style={styles.timeField}>
                <Field
                  label="时间"
                  value={occurredTime}
                  onChangeText={setOccurredTime}
                  placeholder="HH:mm"
                  maxLength={5}
                />
              </View>
            </View>
            <Field
              label={fields.firstLabel}
              value={form.first}
              onChangeText={(first) => setForm((current) => ({ ...current, first }))}
              placeholder={fields.firstPlaceholder}
              keyboardType={fields.firstNumeric ? 'decimal-pad' : 'default'}
            />
            {choices ? (
              <View style={styles.optionBlock}>
                <Text style={styles.fieldLabel}>{fields.secondLabel}</Text>
                <View style={styles.chips}>
                  {choices.map((item) => (
                    <Chip
                      key={item.value}
                      active={form.second === item.value}
                      label={item.label}
                      onPress={() => setForm((current) => ({ ...current, second: item.value }))}
                    />
                  ))}
                </View>
              </View>
            ) : fields.secondLabel ? (
              <Field
                label={fields.secondLabel}
                value={form.second}
                onChangeText={(second) => setForm((current) => ({ ...current, second }))}
                placeholder={fields.secondPlaceholder}
                keyboardType={fields.secondNumeric ? 'decimal-pad' : 'default'}
              />
            ) : null}
            {type === 'STOOL' || type === 'VOMIT' ? (
              <SwitchRow
                title="发现血迹"
                body="建议标记为异常并持续观察，必要时及时就医"
                value={form.blood}
                onChange={(blood) => {
                  setForm((current) => ({ ...current, blood }));
                  if (blood) setAbnormal(true);
                }}
                danger
              />
            ) : null}
            <Field
              label="备注（选填）"
              value={note}
              onChangeText={setNote}
              maxLength={500}
              placeholder="补充品牌、反应或观察情况"
            />
            <SwitchRow
              title="标记为异常"
              body="会在时间线和健康摘要中醒目标识"
              value={abnormal}
              onChange={setAbnormal}
            />
            {error ? <ErrorText>{error}</ErrorText> : null}
            <PrimaryButton label="保存记录" busy={busy} disabled={!canSubmit} onPress={submit} />
            <TextButton label="取消" disabled={busy} onPress={requestClose} />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
function Chip({ active, label, onPress }: { active: boolean; label: string; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}
function SwitchRow({
  title,
  body,
  value,
  onChange,
  danger,
}: {
  title: string;
  body: string;
  value: boolean;
  onChange(value: boolean): void;
  danger?: boolean;
}) {
  return (
    <View style={[styles.switchRow, danger && value && styles.dangerRow]}>
      <View style={styles.switchCopy}>
        <Text style={styles.switchTitle}>{title}</Text>
        <Text style={styles.switchBody}>{body}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: danger ? colors.danger : colors.brand }}
      />
    </View>
  );
}
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = (Math.random() * 16) | 0;
    return (char === 'x' ? value : (value & 3) | 8).toString(16);
  });
}
function paramValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: spacing.xl, paddingBottom: 80 },
  nav: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  navButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navButtonDisabled: { opacity: 0.45 },
  navCopy: { flex: 1 },
  title: { ...typography.h1, color: colors.ink },
  subtitle: { ...typography.secondary, color: colors.textSecondary, marginTop: spacing.xs },
  section: { ...typography.h3, color: colors.ink, marginTop: spacing.sm },
  sectionHint: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.ink },
  optionBlock: { gap: spacing.sm, marginTop: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  ownerNotice: {
    minHeight: 48,
    borderRadius: radii.input,
    backgroundColor: colors.brandSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  ownerNoticeLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  ownerNoticeValue: { ...typography.secondary, color: colors.ink, fontWeight: '700' },
  chip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { ...typography.caption, color: colors.textSecondary },
  chipTextActive: { color: colors.surface },
  dateRow: { flexDirection: 'row', gap: spacing.md },
  dateField: { flex: 1.45 },
  timeField: { flex: 0.8 },
  switchRow: {
    minHeight: 68,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.input,
  },
  dangerRow: { backgroundColor: colors.dangerSoft },
  switchCopy: { flex: 1 },
  switchTitle: { ...typography.h3, color: colors.ink },
  switchBody: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
