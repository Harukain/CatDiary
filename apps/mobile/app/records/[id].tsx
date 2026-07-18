import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Switch,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import {
  authApi,
  type ManualRecordType,
  type RecordSummary,
} from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import { AuthenticatedImage } from '../../src/features/photos/authenticated-image';
import {
  Card,
  Body,
  ErrorText,
  Field,
  PrimaryButton,
  Screen,
  TextButton,
  Title,
} from '../../src/shared/ui/primitives';
import {
  buildRecordData,
  datePart,
  fieldConfig,
  initialRecordForm,
  isRecordDetailDraftDirty,
  isRecordDraftReady,
  parseOccurredAt,
  recordOwnerLabel,
  recordTitle,
  stoolOptions,
  timePart,
  vomitOptions,
  type RecordFormValue,
} from '../../src/features/records/record-form';
import { getRecordActionPermissions } from '../../src/features/records/record-permissions';
import { photoThumbnailSource } from '../../src/features/photos/photo-source';
import { recordDataRows, recordTypeLabel } from '../../src/features/records/record-display';
const manualTypes = new Set<string>([
  'FOOD',
  'WATER',
  'WEIGHT',
  'STOOL',
  'VOMIT',
  'MEDICATION',
  'LITTER',
]);

export default function RecordDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id ?? '');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { restoring, session, activeFamily } = useSession();
  const mountedRef = useRef(true);
  const [record, setRecord] = useState<RecordSummary>();
  const [form, setForm] = useState<RecordFormValue>({ first: '', second: '', blood: false });
  const [occurredDate, setOccurredDate] = useState('');
  const [occurredTime, setOccurredTime] = useState('');
  const [note, setNote] = useState('');
  const [abnormal, setAbnormal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );
  const applyRecord = useCallback((item: RecordSummary) => {
    setRecord(item);
    setForm(initialRecordForm(item));
    setOccurredDate(datePart(item.occurredAt));
    setOccurredTime(timePart(item.occurredAt));
    setNote(item.note ?? '');
    setAbnormal(item.abnormal);
  }, []);
  const clearRecordState = useCallback(() => {
    setRecord(undefined);
    setForm({ first: '', second: '', blood: false });
    setOccurredDate('');
    setOccurredTime('');
    setNote('');
    setAbnormal(false);
  }, []);
  const load = useCallback(
    async (shouldApply: () => boolean = () => true) => {
      if (restoring) {
        if (shouldApply()) setLoading(true);
        return;
      }
      if (!session || !activeFamily || !id) {
        if (!shouldApply()) return;
        clearRecordState();
        setError('');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const item = await authApi.getRecord(session.accessToken, activeFamily.id, id);
        if (!shouldApply()) return;
        applyRecord(item);
      } catch (cause) {
        if (!shouldApply()) return;
        clearRecordState();
        setError(cause instanceof Error ? cause.message : '记录加载失败');
      } finally {
        if (shouldApply()) setLoading(false);
      }
    },
    [activeFamily, applyRecord, clearRecordState, id, restoring, session],
  );
  useEffect(() => {
    let mounted = true;
    void load(() => mounted);
    return () => {
      mounted = false;
    };
  }, [load]);
  const type = record && manualTypes.has(record.type) ? (record.type as ManualRecordType) : null;
  const fields = useMemo(() => (type ? fieldConfig(type) : null), [type]);
  const choices = type === 'STOOL' ? stoolOptions : type === 'VOMIT' ? vomitOptions : null;
  const permissions = record
    ? getRecordActionPermissions(record, session?.user.id, activeFamily?.role)
    : null;
  const originalForm = useMemo(() => (record ? initialRecordForm(record) : null), [record]);
  const detailDirty =
    !!record &&
    !!type &&
    !!originalForm &&
    isRecordDetailDraftDirty({
      value: form,
      originalValue: originalForm,
      note,
      originalNote: record.note,
      abnormal,
      originalAbnormal: record.abnormal,
      occurredDate,
      originalOccurredDate: datePart(record.occurredAt),
      occurredTime,
      originalOccurredTime: timePart(record.occurredAt),
    });
  const contextUnavailable = !restoring && (!session || !activeFamily || !id);
  const loadingInitial = restoring || (loading && !record);
  const interactionLocked = busy || loading || contextUnavailable;
  const editable = !!permissions?.edit.allowed && !!type;
  const readOnlyReason =
    permissions?.edit.reason ?? '此记录类型需要在对应的猫咪档案中维护，当前页面仅提供查看。';
  const showSeparateDeleteReason =
    !permissions?.delete.allowed && permissions?.delete.reason !== readOnlyReason;
  const canSave =
    !!record &&
    editable &&
    !interactionLocked &&
    !!type &&
    detailDirty &&
    isRecordDraftReady(type, form, record.petId);
  const requestReturn = useCallback(() => {
    if (busy || loading) {
      Alert.alert('记录正在处理', '请等待当前操作完成，避免记录状态与服务器不一致。', [
        { text: '继续等待', style: 'cancel' },
      ]);
      return;
    }
    if (!detailDirty) {
      router.back();
      return;
    }
    Alert.alert('放弃未保存的修改？', '记录内容尚未保存，离开后本次修改不会生效。', [
      { text: '继续编辑', style: 'cancel' },
      {
        text: '放弃修改',
        style: 'destructive',
        onPress: () => router.back(),
      },
    ]);
  }, [busy, detailDirty, loading, router]);
  const requestNavigate = useCallback(
    (action: () => void) => {
      if (busy || loading) {
        Alert.alert('记录正在处理', '请等待当前操作完成，避免记录状态与服务器不一致。', [
          { text: '继续等待', style: 'cancel' },
        ]);
        return;
      }
      if (!detailDirty) {
        action();
        return;
      }
      Alert.alert('先处理未保存的修改？', '当前记录修改尚未保存。继续跳转会放弃本次修改。', [
        { text: '继续编辑', style: 'cancel' },
        {
          text: '放弃并继续',
          style: 'destructive',
          onPress: action,
        },
      ]);
    },
    [busy, detailDirty, loading],
  );
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!busy && !loading && !detailDirty) return false;
      requestReturn();
      return true;
    });
    return () => subscription.remove();
  }, [busy, detailDirty, loading, requestReturn]);
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
  async function save() {
    if (!record || !session || !activeFamily || !type || !canSave) return;
    if (!permissions?.edit.allowed) {
      setError(permissions?.edit.reason ?? '你当前无权修改这条记录');
      return;
    }
    let data: Record<string, unknown>;
    let occurredAt: string;
    try {
      data = buildRecordData(type, form);
      occurredAt = parseOccurredAt(occurredDate, occurredTime);
    } catch (cause) {
      return setError(cause instanceof Error ? cause.message : '请检查填写内容');
    }
    setBusy(true);
    setError('');
    try {
      const next = await authApi.updateRecord(session.accessToken, activeFamily.id, record.id, {
        title: recordTitle(type, form.first),
        occurredAt,
        data,
        note: note.trim(),
        abnormal: abnormal || ((type === 'STOOL' || type === 'VOMIT') && form.blood),
        version: record.version,
      });
      if (!mountedRef.current) return;
      setRecord(next);
      setForm(initialRecordForm(next));
      setOccurredDate(datePart(next.occurredAt));
      setOccurredTime(timePart(next.occurredAt));
      setNote(next.note ?? '');
      setAbnormal(next.abnormal);
      Alert.alert('已保存', '记录已经更新');
    } catch (cause) {
      if (!mountedRef.current) return;
      setError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }
  function remove() {
    if (!record || !session || !activeFamily || interactionLocked) return;
    if (!permissions?.delete.allowed) {
      setError(permissions?.delete.reason ?? '你当前无权删除这条记录');
      return;
    }
    Alert.alert('删除这条记录？', '删除后将进入 30 天恢复期，家庭管理员可以恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          setError('');
          try {
            await authApi.deleteRecord(
              session.accessToken,
              activeFamily.id,
              record.id,
              record.version,
            );
            if (mountedRef.current) router.back();
          } catch (cause) {
            if (!mountedRef.current) return;
            setError(cause instanceof Error ? cause.message : '删除失败');
            setBusy(false);
          }
        },
      },
    ]);
  }
  if (loadingInitial)
    return (
      <Screen>
        <Stack.Screen options={{ gestureEnabled: false }} />
        <Card testID="record-detail.loading.card">
          <ActivityIndicator color={colors.brand} />
          <Body>正在整理记录详情…</Body>
        </Card>
      </Screen>
    );
  if (contextUnavailable)
    return (
      <Screen>
        <Stack.Screen options={{ gestureEnabled: false }} />
        <Card testID="record-detail.context-empty.card">
          <Title>需要先完成家庭设置</Title>
          <Body>登录并选择家庭后，才能查看、编辑或删除这条记录。</Body>
          <TextButton label="去我的页面检查家庭" onPress={() => router.push('/(tabs)/me')} />
          <TextButton label="返回时间线" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  if (!record)
    return (
      <Screen>
        <Stack.Screen options={{ gestureEnabled: false }} />
        <Card testID="record-detail.error.card">
          <Title>记录加载失败</Title>
          <ErrorText testID="record-detail.load-error">{error}</ErrorText>
          <TextButton
            label="重新加载"
            testID="record-detail.reload.button"
            disabled={loading}
            onPress={() => void load()}
          />
          <TextButton label="返回时间线" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  return (
    <Screen>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.content, !keyboardVisible && styles.contentWithFooter]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View>
            <Text style={styles.eyebrow}>
              {recordTypeLabel(record.type)} · {recordOwnerLabel(record)}
            </Text>
            <Text testID="record-detail.title" style={styles.title}>
              {record.title}
            </Text>
            <Text style={styles.time}>
              {new Date(record.occurredAt).toLocaleString('zh-CN', { hour12: false })}
            </Text>
          </View>
          {record.abnormal && record.petId ? (
            <View style={styles.healthAction}>
              <Text style={styles.healthActionTitle}>持续观察这个异常</Text>
              <Text style={styles.healthActionBody}>
                建立健康事件后，可以继续关联症状、治疗和恢复状态。
              </Text>
              <PrimaryButton
                label="建立健康事件"
                testID="record-detail.create-health-event.button"
                disabled={interactionLocked}
                onPress={() =>
                  requestNavigate(() =>
                    router.push({
                      pathname: '/health-events/new',
                      params: {
                        recordId: record.id,
                        petId: record.petId ?? '',
                        title: record.title,
                      },
                    }),
                  )
                }
              />
            </View>
          ) : record.abnormal ? (
            <View style={styles.healthAction}>
              <Text style={styles.healthActionTitle}>公共猫砂盆异常观察</Text>
              <Text style={styles.healthActionBody}>
                这条记录暂未确认具体猫咪，不能直接建立单猫健康事件。确认归属后请新增对应症状记录。
              </Text>
            </View>
          ) : null}
          <Card>
            {editable && fields ? (
              <>
                <View style={styles.dateRow}>
                  <View style={styles.dateField}>
                    <Field
                      label="发生日期"
                      value={occurredDate}
                      onChangeText={setOccurredDate}
                      maxLength={10}
                      editable={!interactionLocked}
                      placeholder="YYYY-MM-DD"
                    />
                  </View>
                  <View style={styles.timeField}>
                    <Field
                      label="时间"
                      value={occurredTime}
                      onChangeText={setOccurredTime}
                      maxLength={5}
                      editable={!interactionLocked}
                      placeholder="HH:mm"
                    />
                  </View>
                </View>
                <Field
                  label={fields.firstLabel}
                  value={form.first}
                  onChangeText={(first) => setForm((current) => ({ ...current, first }))}
                  keyboardType={fields.firstNumeric ? 'decimal-pad' : 'default'}
                  editable={!interactionLocked}
                />
                {choices ? (
                  <View style={styles.optionBlock}>
                    <Text style={styles.fieldLabel}>{fields.secondLabel}</Text>
                    <View style={styles.chips}>
                      {choices.map((item) => (
                        <Chip
                          key={item.value}
                          label={item.label}
                          active={form.second === item.value}
                          disabled={interactionLocked}
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
                    keyboardType={fields.secondNumeric ? 'decimal-pad' : 'default'}
                    editable={!interactionLocked}
                  />
                ) : null}
                {type === 'STOOL' || type === 'VOMIT' ? (
                  <SwitchRow
                    title="发现血迹"
                    body="带血情况会自动标记为异常"
                    value={form.blood}
                    onChange={(blood) => {
                      setForm((current) => ({ ...current, blood }));
                      if (blood) setAbnormal(true);
                    }}
                    disabled={interactionLocked}
                    danger
                  />
                ) : null}
                <SwitchRow
                  title="异常标记"
                  body="会进入健康摘要并在时间线突出显示"
                  value={abnormal}
                  onChange={setAbnormal}
                  disabled={interactionLocked}
                />
                <Field
                  label="备注"
                  value={note}
                  onChangeText={setNote}
                  maxLength={500}
                  multiline
                  editable={!interactionLocked}
                  placeholder="补充观察或反应"
                />
                {error && keyboardVisible ? <ErrorText>{error}</ErrorText> : null}
                {keyboardVisible ? (
                  <PrimaryButton
                    label="保存修改"
                    busy={busy}
                    disabled={!canSave}
                    testID="record-detail.save.inline-button"
                    onPress={save}
                  />
                ) : null}
              </>
            ) : (
              <>
                <Text style={styles.sectionTitle}>记录内容</Text>
                {record.type === 'PHOTO' && record.photos?.length ? (
                  <View style={styles.photoGrid}>
                    {record.photos.map((photo) => (
                      <Pressable
                        key={photo.id}
                        accessibilityRole="button"
                        accessibilityLabel={photo.note ? `查看照片：${photo.note}` : '查看照片详情'}
                        accessibilityState={{ disabled: interactionLocked }}
                        disabled={interactionLocked}
                        onPress={() =>
                          requestNavigate(() =>
                            router.push({ pathname: '/photos/[id]', params: { id: photo.id } }),
                          )
                        }
                        style={({ pressed }) => [
                          styles.photoTile,
                          interactionLocked && styles.disabled,
                          pressed && !interactionLocked && styles.pressed,
                        ]}
                      >
                        <AuthenticatedImage
                          accessibilityLabel={photo.note ? `照片：${photo.note}` : '照片缩略图'}
                          resizeMode="cover"
                          source={photoThumbnailSource(
                            photo,
                            session?.accessToken ?? '',
                            activeFamily?.id ?? '',
                          )}
                          style={styles.photoImage}
                        />
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {recordDataRows(record).map((row) => (
                  <View key={row.label} style={styles.dataRow}>
                    <Text style={styles.dataLabel}>{row.label}</Text>
                    <Text style={styles.dataValue}>{row.value}</Text>
                  </View>
                ))}
                {record.note ? (
                  <View style={styles.noteBlock}>
                    <Text style={styles.dataLabel}>备注</Text>
                    <Text style={styles.noteText}>{record.note}</Text>
                  </View>
                ) : null}
                <PermissionNotice title="只读记录" body={readOnlyReason} />
              </>
            )}
          </Card>
          {!editable && error ? <ErrorText>{error}</ErrorText> : null}
          {keyboardVisible && permissions?.delete.allowed ? (
            <TextButton label="删除这条记录" danger disabled={interactionLocked} onPress={remove} />
          ) : null}
          {showSeparateDeleteReason && permissions?.delete.reason ? (
            <PermissionNotice title="删除权限" body={permissions.delete.reason} />
          ) : null}
          {keyboardVisible && (
            <TextButton label="返回时间线" disabled={interactionLocked} onPress={requestReturn} />
          )}
        </ScrollView>
        {!keyboardVisible ? (
          <View
            testID="record-detail.footer"
            style={[
              styles.footer,
              { paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm) },
            ]}
          >
            {error ? <ErrorText testID="record-detail.error">{error}</ErrorText> : null}
            {editable ? (
              <PrimaryButton
                label="保存修改"
                busy={busy}
                disabled={!canSave}
                testID="record-detail.save.button"
                onPress={save}
              />
            ) : null}
            <View style={styles.footerActions}>
              {permissions?.delete.allowed ? (
                <TextButton
                  label="删除这条记录"
                  danger
                  disabled={interactionLocked}
                  testID="record-detail.delete.button"
                  onPress={remove}
                />
              ) : null}
              <TextButton
                label="返回时间线"
                disabled={interactionLocked}
                testID="record-detail.back-timeline.button"
                onPress={requestReturn}
              />
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}
function PermissionNotice({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.locked}>
      <Text style={styles.lockedTitle}>{title}</Text>
      <Text style={styles.lockedText}>{body}</Text>
    </View>
  );
}
function Chip({
  active,
  label,
  disabled,
  onPress,
}: {
  active: boolean;
  label: string;
  disabled?: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive, disabled && styles.disabled]}
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
  disabled,
}: {
  title: string;
  body: string;
  value: boolean;
  onChange(value: boolean): void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <View
      style={[styles.switchRow, danger && value && styles.dangerRow, disabled && styles.disabled]}
    >
      <View style={styles.switchCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.hint}>{body}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: danger ? colors.danger : colors.brand }}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: spacing.xl, paddingBottom: 72 },
  contentWithFooter: { paddingBottom: 164 },
  eyebrow: { ...typography.caption, color: colors.brand, fontWeight: '700' },
  title: { ...typography.h1, color: colors.ink, marginTop: spacing.xs },
  time: { ...typography.secondary, color: colors.textSecondary, marginTop: spacing.sm },
  sectionTitle: { ...typography.h3, color: colors.ink },
  dateRow: { flexDirection: 'row', gap: spacing.md },
  dateField: { flex: 1.45 },
  timeField: { flex: 0.8 },
  optionBlock: { gap: spacing.sm, marginTop: spacing.sm },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
  disabled: { opacity: 0.45 },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  photoTile: {
    width: '31%',
    minWidth: 88,
    aspectRatio: 1,
    borderRadius: radii.input,
    overflow: 'hidden',
    backgroundColor: colors.divider,
  },
  photoImage: { width: '100%', height: '100%' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  dataRow: {
    minHeight: 42,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  dataLabel: { ...typography.secondary, color: colors.textSecondary },
  dataValue: { ...typography.body, color: colors.ink, fontWeight: '600' },
  noteBlock: { gap: spacing.xs, paddingTop: spacing.md },
  noteText: { ...typography.body, color: colors.ink },
  healthAction: { padding: spacing.xl, borderRadius: radii.card, backgroundColor: colors.ink },
  healthActionTitle: { ...typography.h2, color: colors.surface },
  healthActionBody: {
    ...typography.secondary,
    color: colors.textTertiary,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  switchRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.input,
  },
  dangerRow: { backgroundColor: colors.dangerSoft },
  switchCopy: { flex: 1 },
  hint: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  locked: {
    padding: spacing.md,
    borderRadius: radii.input,
    backgroundColor: colors.brandSoft,
    marginTop: spacing.md,
  },
  lockedTitle: { ...typography.h3, color: colors.ink, marginBottom: spacing.xs },
  lockedText: { ...typography.caption, color: colors.warningDark },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.page,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    gap: spacing.sm,
  },
});
