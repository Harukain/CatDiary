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
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { authApi, type MedicalRecordSummary } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import {
  isMedicalRecordDetailDraftDirty,
  type MedicalRecordDetailDraft,
} from '../../src/features/medical/medical-form';
import { resolveDraftExitDecision } from '../../src/shared/navigation/draft-exit';
import {
  Card,
  ErrorText,
  Field,
  PrimaryButton,
  Screen,
  TextButton,
} from '../../src/shared/ui/primitives';
const labels = { VACCINE: '疫苗', DEWORMING: '驱虫', MEDICATION: '用药' } as const;
const emptyForm: MedicalRecordDetailDraft = {
  title: '',
  occurredDate: '',
  nextDate: '',
  brand: '',
  batchNumber: '',
  dose: '',
  provider: '',
  reaction: '',
  note: '',
};
export default function MedicalRecordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, activeFamily } = useSession();
  const allowLeave = useRef(false);
  const [record, setRecord] = useState<MedicalRecordSummary>();
  const [form, setForm] = useState<MedicalRecordDetailDraft>(emptyForm);
  const [initialForm, setInitialForm] = useState<MedicalRecordDetailDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const canEdit = activeFamily?.role === 'OWNER' || activeFamily?.role === 'ADMIN';
  useEffect(() => {
    if (!session || !activeFamily || !id) return;
    void authApi
      .getMedicalRecord(session.accessToken, activeFamily.id, id)
      .then((item) => {
        setRecord(item);
        const nextForm = medicalFormFromRecord(item);
        setForm(nextForm);
        setInitialForm(nextForm);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : '医疗档案加载失败'));
  }, [activeFamily, id, session]);
  const field = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const isDirty = useMemo(
    () => canEdit && !!initialForm && isMedicalRecordDetailDraftDirty(form, initialForm),
    [canEdit, form, initialForm],
  );
  const canSave = canEdit && !busy && isDirty && Boolean(form.title.trim());
  const requestReturn = useCallback(() => {
    const decision = resolveDraftExitDecision({
      busy,
      isDirty,
      allowLeave: allowLeave.current,
    });
    if (decision === 'wait') {
      Alert.alert('医疗档案正在处理', '请等待当前保存或删除操作完成，避免档案状态不一致。', [
        { text: '继续等待', style: 'cancel' },
      ]);
      return;
    }
    if (decision === 'continue') {
      router.back();
      return;
    }
    Alert.alert('放弃未保存的医疗档案修改？', '当前医疗信息尚未保存，离开后本次修改不会生效。', [
      { text: '继续编辑', style: 'cancel' },
      {
        text: '放弃修改',
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
      requestReturn();
      return true;
    });
    return () => subscription.remove();
  }, [busy, isDirty, requestReturn]);
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
    if (!record || !session || !activeFamily || !canEdit || busy || !isDirty) return;
    let occurredAt: string;
    let nextDueAt: string | null;
    try {
      occurredAt = parseDate(form.occurredDate, true);
      nextDueAt = form.nextDate.trim() ? parseDate(form.nextDate) : null;
      if (nextDueAt && new Date(nextDueAt) <= new Date(occurredAt))
        throw new Error('下次日期必须晚于发生日期');
    } catch (cause) {
      return setError(cause instanceof Error ? cause.message : '日期格式不正确');
    }
    setBusy(true);
    setError('');
    try {
      const next = await authApi.updateMedicalRecord(
        session.accessToken,
        activeFamily.id,
        record.id,
        {
          title: form.title.trim(),
          occurredAt,
          nextDueAt,
          brand: form.brand.trim(),
          batchNumber: form.batchNumber.trim(),
          dose: form.dose.trim(),
          provider: form.provider.trim(),
          reaction: form.reaction.trim(),
          note: form.note.trim(),
          version: record.version,
        },
      );
      setRecord(next);
      const nextForm = medicalFormFromRecord(next);
      setForm(nextForm);
      setInitialForm(nextForm);
      Alert.alert('已保存', '医疗档案已经更新');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }
  function remove() {
    if (!record || !session || !activeFamily || busy) return;
    Alert.alert(
      '删除医疗档案？',
      '记录将被软删除并保留审计信息。此操作不会删除已经生成的历史摘要文件。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await authApi.deleteMedicalRecord(
                session.accessToken,
                activeFamily.id,
                record.id,
                record.version,
              );
              allowLeave.current = true;
              router.back();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : '删除失败');
              setBusy(false);
            }
          },
        },
      ],
    );
  }
  if (!record && !error)
    return (
      <Screen>
        <Stack.Screen options={{ gestureEnabled: false }} />
        <TopBar busy={busy} onBack={requestReturn} />
        <ActivityIndicator color={colors.brand} />
      </Screen>
    );
  if (!record)
    return (
      <Screen>
        <Stack.Screen options={{ gestureEnabled: false }} />
        <TopBar busy={busy} onBack={requestReturn} />
        <ErrorText>{error}</ErrorText>
        <TextButton label="返回" onPress={requestReturn} />
      </Screen>
    );
  return (
    <Screen>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TopBar busy={busy} onBack={requestReturn} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View>
            <Text style={styles.eyebrow}>
              {labels[record.type]} · {record.pet.name}
            </Text>
            <Text style={styles.title}>{record.title}</Text>
            <Text style={styles.subtitle}>由家庭管理员维护的结构化医疗事实</Text>
          </View>
          <View style={styles.notice}>
            <Text style={styles.noticeText}>本档案不构成诊断、处方或医疗建议。</Text>
          </View>
          <Card>
            <Field
              label="项目名称"
              editable={canEdit && !busy}
              value={form.title}
              onChangeText={field('title')}
            />
            <Field
              label="发生日期"
              editable={canEdit && !busy}
              value={form.occurredDate}
              onChangeText={field('occurredDate')}
              placeholder="YYYY-MM-DD"
              maxLength={10}
            />
            <Field
              label="下次日期（选填）"
              editable={canEdit && !busy}
              value={form.nextDate}
              onChangeText={field('nextDate')}
              placeholder="YYYY-MM-DD"
              maxLength={10}
            />
            <Field
              label="品牌/药品"
              editable={canEdit && !busy}
              value={form.brand}
              onChangeText={field('brand')}
            />
            <Field
              label="批次号"
              editable={canEdit && !busy}
              value={form.batchNumber}
              onChangeText={field('batchNumber')}
            />
            <Field
              label="剂量"
              editable={canEdit && !busy}
              value={form.dose}
              onChangeText={field('dose')}
            />
            <Field
              label="医院或服务机构"
              editable={canEdit && !busy}
              value={form.provider}
              onChangeText={field('provider')}
            />
            <Field
              label="反应"
              editable={canEdit && !busy}
              value={form.reaction}
              onChangeText={field('reaction')}
            />
            <Field
              label="备注"
              editable={canEdit && !busy}
              value={form.note}
              onChangeText={field('note')}
              multiline
            />
            {canEdit ? null : (
              <Text style={styles.readonly}>
                你当前为普通家庭成员，可以查看但不能修改医疗档案。
              </Text>
            )}
          </Card>
          {error && keyboardVisible ? (
            <ErrorText testID="medical-detail.error">{error}</ErrorText>
          ) : null}
          {canEdit && keyboardVisible ? (
            <>
              <PrimaryButton
                label="保存修改"
                busy={busy}
                disabled={!canSave}
                onPress={save}
                testID="medical-detail.save.inline-button"
              />
              <TextButton
                label="删除这条医疗档案"
                danger
                disabled={busy}
                onPress={remove}
                testID="medical-detail.delete.inline-button"
              />
              <TextButton
                label={busy ? '处理中，请等待' : '返回医疗档案'}
                onPress={requestReturn}
                testID="medical-detail.return.inline-button"
              />
            </>
          ) : null}
          {!canEdit ? (
            <TextButton
              label="返回医疗档案"
              onPress={requestReturn}
              testID="medical-detail.return.button"
            />
          ) : null}
        </ScrollView>
        {canEdit && !keyboardVisible ? (
          <View
            testID="medical-detail.footer"
            style={[
              styles.footer,
              { paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm) },
            ]}
          >
            {error ? <ErrorText testID="medical-detail.error">{error}</ErrorText> : null}
            <PrimaryButton
              label="保存修改"
              busy={busy}
              disabled={!canSave}
              onPress={save}
              testID="medical-detail.save.button"
            />
            <TextButton
              label="删除这条医疗档案"
              danger
              disabled={busy}
              onPress={remove}
              testID="medical-detail.delete.button"
            />
            <TextButton
              label={busy ? '处理中，请等待' : '返回医疗档案'}
              onPress={requestReturn}
              testID="medical-detail.return.button"
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}
function TopBar({ busy, onBack }: { busy: boolean; onBack(): void }) {
  return (
    <View style={styles.nav}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="返回"
        accessibilityHint={busy ? '医疗档案处理中，点击会提示继续等待' : '返回上一页'}
        onPress={onBack}
        style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
      >
        <Ionicons name="chevron-back" size={22} color={colors.ink} />
      </Pressable>
      <Text style={styles.navTitle}>医疗档案详情</Text>
      <View style={styles.navButton} />
    </View>
  );
}
function medicalFormFromRecord(item: MedicalRecordSummary): MedicalRecordDetailDraft {
  return {
    title: item.title,
    occurredDate: localDate(item.occurredAt),
    nextDate: item.nextDueAt ? localDate(item.nextDueAt) : '',
    brand: item.brand ?? '',
    batchNumber: item.batchNumber ?? '',
    dose: item.dose ?? '',
    provider: item.provider ?? '',
    reaction: item.reaction ?? '',
    note: item.note ?? '',
  };
}
function localDate(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function parseDate(value: string, todayAsNow = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日期请按 YYYY-MM-DD 填写');
  if (todayAsNow && value === localDate(new Date().toISOString())) return new Date().toISOString();
  const date = new Date(`${value}T12:00:00+08:00`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new Error('请输入有效日期');
  return date.toISOString();
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  nav: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navTitle: { ...typography.h2, color: colors.ink },
  content: { gap: spacing.xl, paddingBottom: 148 },
  eyebrow: { ...typography.caption, color: colors.brand, fontWeight: '700' },
  title: { ...typography.h1, color: colors.ink, marginTop: spacing.xs },
  subtitle: { ...typography.secondary, color: colors.textSecondary, marginTop: spacing.sm },
  notice: { padding: spacing.md, borderRadius: radii.input, backgroundColor: colors.brandSoft },
  noticeText: { ...typography.caption, color: colors.warningDark },
  readonly: {
    ...typography.caption,
    color: colors.textSecondary,
    padding: spacing.md,
    textAlign: 'center',
  },
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
