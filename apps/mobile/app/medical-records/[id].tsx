import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { authApi, type MedicalRecordSummary } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import {
  Card,
  ErrorText,
  Field,
  PrimaryButton,
  Screen,
  TextButton,
} from '../../src/shared/ui/primitives';
const labels = { VACCINE: '疫苗', DEWORMING: '驱虫', MEDICATION: '用药' } as const;
export default function MedicalRecordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, activeFamily } = useSession();
  const [record, setRecord] = useState<MedicalRecordSummary>();
  const [form, setForm] = useState({
    title: '',
    occurredDate: '',
    nextDate: '',
    brand: '',
    batchNumber: '',
    dose: '',
    provider: '',
    reaction: '',
    note: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canEdit = activeFamily?.role === 'OWNER' || activeFamily?.role === 'ADMIN';
  useEffect(() => {
    if (!session || !activeFamily || !id) return;
    void authApi
      .getMedicalRecord(session.accessToken, activeFamily.id, id)
      .then((item) => {
        setRecord(item);
        setForm({
          title: item.title,
          occurredDate: localDate(item.occurredAt),
          nextDate: item.nextDueAt ? localDate(item.nextDueAt) : '',
          brand: item.brand ?? '',
          batchNumber: item.batchNumber ?? '',
          dose: item.dose ?? '',
          provider: item.provider ?? '',
          reaction: item.reaction ?? '',
          note: item.note ?? '',
        });
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : '医疗档案加载失败'));
  }, [activeFamily, id, session]);
  const field = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  async function save() {
    if (!record || !session || !activeFamily) return;
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
      Alert.alert('已保存', '医疗档案已经更新');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }
  function remove() {
    if (!record || !session || !activeFamily) return;
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
        <ActivityIndicator color={colors.brand} />
      </Screen>
    );
  if (!record)
    return (
      <Screen>
        <ErrorText>{error}</ErrorText>
        <TextButton label="返回" onPress={() => router.back()} />
      </Screen>
    );
  return (
    <Screen>
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
            editable={canEdit}
            value={form.title}
            onChangeText={field('title')}
          />
          <Field
            label="发生日期"
            editable={canEdit}
            value={form.occurredDate}
            onChangeText={field('occurredDate')}
            placeholder="YYYY-MM-DD"
            maxLength={10}
          />
          <Field
            label="下次日期（选填）"
            editable={canEdit}
            value={form.nextDate}
            onChangeText={field('nextDate')}
            placeholder="YYYY-MM-DD"
            maxLength={10}
          />
          <Field
            label="品牌/药品"
            editable={canEdit}
            value={form.brand}
            onChangeText={field('brand')}
          />
          <Field
            label="批次号"
            editable={canEdit}
            value={form.batchNumber}
            onChangeText={field('batchNumber')}
          />
          <Field label="剂量" editable={canEdit} value={form.dose} onChangeText={field('dose')} />
          <Field
            label="医院或服务机构"
            editable={canEdit}
            value={form.provider}
            onChangeText={field('provider')}
          />
          <Field
            label="反应"
            editable={canEdit}
            value={form.reaction}
            onChangeText={field('reaction')}
          />
          <Field
            label="备注"
            editable={canEdit}
            value={form.note}
            onChangeText={field('note')}
            multiline
          />
          {error ? <ErrorText>{error}</ErrorText> : null}
          {canEdit ? (
            <PrimaryButton
              label="保存修改"
              busy={busy}
              disabled={!form.title.trim()}
              onPress={save}
            />
          ) : (
            <Text style={styles.readonly}>你当前为普通家庭成员，可以查看但不能修改医疗档案。</Text>
          )}
        </Card>
        {canEdit ? (
          <TextButton label="删除这条医疗档案" danger disabled={busy} onPress={remove} />
        ) : null}
        <TextButton label="返回医疗档案" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
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
  content: { gap: spacing.xl, paddingBottom: 70 },
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
});
