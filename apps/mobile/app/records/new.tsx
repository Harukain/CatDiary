import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  parseOccurredAt,
  recordDraftSubmitBlockMessage,
  recordDraftOwnerLabel,
  recordRequiresPet,
  recordSaveFailureMessage,
  recordSubmitSuccessNotice,
  recordTimelineRoute,
  recordTitle,
  recordTypes,
  resolveInitialRecordPetId,
  resolveInitialRecordType,
  resolveRecordDraftSubmitState,
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
  const [petsLoading, setPetsLoading] = useState(true);
  const [petLoadError, setPetLoadError] = useState('');
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
  const loadPets = useCallback(() => {
    if (!session || !activeFamily) return;
    setPetsLoading(true);
    setPetLoadError('');
    setPets([]);
    void authApi
      .listPets(session.accessToken, activeFamily.id)
      .then((items) => {
        setPets(items);
        setPetId(resolveInitialRecordPetId(items, routePetId));
      })
      .catch((cause) => {
        setPetLoadError(cause instanceof Error ? cause.message : '猫咪加载失败');
        setPetId(null);
      })
      .finally(() => setPetsLoading(false));
  }, [activeFamily, routePetId, session]);
  useEffect(() => {
    loadPets();
  }, [loadPets]);
  useEffect(() => {
    setForm(blankRecordFormValue(type));
    setError('');
  }, [type]);
  useEffect(() => {
    if (type !== 'LITTER' && !petId) setPetId(pets[0]?.id ?? null);
  }, [petId, pets, type]);
  const fields = useMemo(() => fieldConfig(type), [type]);
  const choices = type === 'STOOL' ? stoolOptions : type === 'VOMIT' ? vomitOptions : null;
  const submitState = useMemo(
    () =>
      resolveRecordDraftSubmitState({
        type,
        value: form,
        petId,
        petCount: pets.length,
        petsLoading,
        petLoadError,
      }),
    [form, petId, petLoadError, pets.length, petsLoading, type],
  );
  const canSubmit = submitState.canSubmit;
  const noSelectablePet = submitState.reason === 'NO_PETS';
  const fieldsDisabled =
    busy || petsLoading || (recordRequiresPet(type) && (Boolean(petLoadError) || noSelectablePet));
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
    if (!canSubmit) return setError(recordDraftSubmitBlockMessage(submitState.reason, type));
    if (recordRequiresPet(type) && !petId) return setError('请选择猫咪');
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
      allowLeave.current = true;
      router.replace({
        pathname: recordTimelineRoute,
        params: { notice: recordSubmitSuccessNotice('server') },
      });
    } catch (cause) {
      if (isNetworkFailure(cause)) {
        try {
          await enqueueOfflineOperation(operation);
          allowLeave.current = true;
          router.replace({
            pathname: recordTimelineRoute,
            params: { notice: recordSubmitSuccessNotice('offlineQueue') },
          });
        } catch {
          setError(recordSaveFailureMessage('offlineQueue'));
        }
      } else setError(recordSaveFailureMessage('server', cause));
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
            {petsLoading ? (
              <View style={styles.inlineState}>
                <ActivityIndicator color={colors.brand} />
                <Text style={styles.inlineStateText}>正在确认可记录的猫咪档案</Text>
              </View>
            ) : petLoadError ? (
              <View style={styles.inlineState}>
                <ErrorText>{petLoadError}</ErrorText>
                <TextButton label="重新加载猫咪" disabled={busy} onPress={loadPets} />
              </View>
            ) : noSelectablePet ? (
              <View style={styles.inlineState}>
                <Text style={styles.inlineStateTitle}>还没有可写入的猫咪档案</Text>
                <Text style={styles.inlineStateText}>
                  单猫记录必须明确归属。你仍可以切换到“铲屎”记录公共猫砂盆观察。
                </Text>
              </View>
            ) : null}
            <View style={styles.chips}>
              {type === 'LITTER' ? (
                <Chip
                  active={petId === null}
                  disabled={busy || petsLoading}
                  label="公共猫砂盆"
                  onPress={() => setPetId(null)}
                />
              ) : null}
              {pets.map((pet) => (
                <Chip
                  key={pet.id}
                  active={pet.id === petId}
                  disabled={busy || petsLoading}
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
                  disabled={busy || petsLoading}
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
                  editable={!fieldsDisabled}
                />
              </View>
              <View style={styles.timeField}>
                <Field
                  label="时间"
                  value={occurredTime}
                  onChangeText={setOccurredTime}
                  placeholder="HH:mm"
                  maxLength={5}
                  editable={!fieldsDisabled}
                />
              </View>
            </View>
            <Field
              label={fields.firstLabel}
              value={form.first}
              onChangeText={(first) => setForm((current) => ({ ...current, first }))}
              placeholder={fields.firstPlaceholder}
              keyboardType={fields.firstNumeric ? 'decimal-pad' : 'default'}
              editable={!fieldsDisabled}
            />
            {choices ? (
              <View style={styles.optionBlock}>
                <Text style={styles.fieldLabel}>{fields.secondLabel}</Text>
                <View style={styles.chips}>
                  {choices.map((item) => (
                    <Chip
                      key={item.value}
                      active={form.second === item.value}
                      disabled={fieldsDisabled}
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
                editable={!fieldsDisabled}
              />
            ) : null}
            {type === 'STOOL' || type === 'VOMIT' ? (
              <SwitchRow
                title="发现血迹"
                body="建议标记为异常并持续观察，必要时及时就医"
                value={form.blood}
                disabled={fieldsDisabled}
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
              editable={!fieldsDisabled}
            />
            <SwitchRow
              title="标记为异常"
              body="会在时间线和健康摘要中醒目标识"
              value={abnormal}
              disabled={fieldsDisabled}
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
function Chip({
  active,
  disabled,
  label,
  onPress,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive, disabled && styles.chipDisabled]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}
function SwitchRow({
  title,
  body,
  value,
  disabled,
  onChange,
  danger,
}: {
  title: string;
  body: string;
  value: boolean;
  disabled?: boolean;
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
        disabled={disabled}
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
  inlineState: {
    borderRadius: radii.input,
    backgroundColor: colors.brandSoft,
    padding: spacing.md,
    gap: spacing.sm,
  },
  inlineStateTitle: { ...typography.h3, color: colors.ink },
  inlineStateText: { ...typography.caption, color: colors.textSecondary },
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
  chipDisabled: { opacity: 0.55 },
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
