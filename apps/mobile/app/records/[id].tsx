import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import {
  authApi,
  type ManualRecordType,
  type RecordSummary,
} from '../../src/features/auth/auth-api';
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
  buildRecordData,
  datePart,
  fieldConfig,
  initialRecordForm,
  parseOccurredAt,
  recordTitle,
  stoolOptions,
  timePart,
  vomitOptions,
  type RecordFormValue,
} from '../../src/features/records/record-form';

const typeLabels: Record<string, string> = {
  FOOD: '饮食',
  WATER: '饮水',
  WEIGHT: '体重',
  STOOL: '排便',
  VOMIT: '呕吐',
  MEDICATION: '用药',
  VACCINE: '疫苗',
  DEWORMING: '驱虫',
  LITTER: '铲屎',
};
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, activeFamily } = useSession();
  const [record, setRecord] = useState<RecordSummary>();
  const [form, setForm] = useState<RecordFormValue>({ first: '', second: '', blood: false });
  const [occurredDate, setOccurredDate] = useState('');
  const [occurredTime, setOccurredTime] = useState('');
  const [note, setNote] = useState('');
  const [abnormal, setAbnormal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!session || !activeFamily || !id) return;
    void authApi
      .getRecord(session.accessToken, activeFamily.id, id)
      .then((item) => {
        setRecord(item);
        setForm(initialRecordForm(item));
        setOccurredDate(datePart(item.occurredAt));
        setOccurredTime(timePart(item.occurredAt));
        setNote(item.note ?? '');
        setAbnormal(item.abnormal);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : '记录加载失败'));
  }, [activeFamily, id, session]);
  const type = record && manualTypes.has(record.type) ? (record.type as ManualRecordType) : null;
  const fields = useMemo(() => (type ? fieldConfig(type) : null), [type]);
  const choices = type === 'STOOL' ? stoolOptions : type === 'VOMIT' ? vomitOptions : null;
  async function save() {
    if (!record || !session || !activeFamily || !type) return;
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
      setRecord(next);
      setForm(initialRecordForm(next));
      setAbnormal(next.abnormal);
      Alert.alert('已保存', '记录已经更新');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }
  function remove() {
    if (!record || !session || !activeFamily) return;
    Alert.alert('删除这条记录？', '删除后将进入 30 天恢复期，家庭管理员可以恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await authApi.deleteRecord(
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
    ]);
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
  const editable = record.source === 'MANUAL' && !!type;
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View>
          <Text style={styles.eyebrow}>
            {typeLabels[record.type] ?? record.type} · {record.pet?.name ?? '家庭'}
          </Text>
          <Text style={styles.title}>{record.title}</Text>
          <Text style={styles.time}>
            {new Date(record.occurredAt).toLocaleString('zh-CN', { hour12: false })}
          </Text>
        </View>
        {record.abnormal ? (
          <View style={styles.healthAction}>
            <Text style={styles.healthActionTitle}>持续观察这个异常</Text>
            <Text style={styles.healthActionBody}>
              建立健康事件后，可以继续关联症状、治疗和恢复状态。
            </Text>
            <PrimaryButton
              label="建立健康事件"
              onPress={() =>
                router.push({
                  pathname: '/health-events/new',
                  params: { recordId: record.id, petId: record.petId ?? '', title: record.title },
                })
              }
            />
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
                    placeholder="YYYY-MM-DD"
                  />
                </View>
                <View style={styles.timeField}>
                  <Field
                    label="时间"
                    value={occurredTime}
                    onChangeText={setOccurredTime}
                    maxLength={5}
                    placeholder="HH:mm"
                  />
                </View>
              </View>
              <Field
                label={fields.firstLabel}
                value={form.first}
                onChangeText={(first) => setForm((current) => ({ ...current, first }))}
                keyboardType={fields.firstNumeric ? 'decimal-pad' : 'default'}
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
                  danger
                />
              ) : null}
              <SwitchRow
                title="异常标记"
                body="会进入健康摘要并在时间线突出显示"
                value={abnormal}
                onChange={setAbnormal}
              />
              <Field
                label="备注"
                value={note}
                onChangeText={setNote}
                maxLength={500}
                multiline
                placeholder="补充观察或反应"
              />
              {error ? <ErrorText>{error}</ErrorText> : null}
              <PrimaryButton label="保存修改" busy={busy} onPress={save} />
            </>
          ) : (
            <>
              <Text style={styles.sectionTitle}>记录内容</Text>
              {Object.entries(record.data).map(([key, value]) => (
                <View key={key} style={styles.dataRow}>
                  <Text style={styles.dataLabel}>{key}</Text>
                  <Text style={styles.dataValue}>
                    {typeof value === 'boolean' ? (value ? '是' : '否') : String(value)}
                  </Text>
                </View>
              ))}
              <View style={styles.locked}>
                <Text style={styles.lockedText}>
                  任务生成的记录不可直接改写。如需修正，请撤销对应任务并重新完成。
                </Text>
              </View>
            </>
          )}
        </Card>
        {editable ? (
          <TextButton label="删除这条记录" danger disabled={busy} onPress={remove} />
        ) : null}
        <TextButton label="返回时间线" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}
function Chip({ active, label, onPress }: { active: boolean; label: string; onPress(): void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
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
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.hint}>{body}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: danger ? colors.danger : colors.brand }}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  content: { gap: spacing.xl, paddingBottom: 72 },
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
  dangerRow: { backgroundColor: '#FBE4D9' },
  switchCopy: { flex: 1 },
  hint: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  locked: {
    padding: spacing.md,
    borderRadius: radii.input,
    backgroundColor: colors.brandSoft,
    marginTop: spacing.md,
  },
  lockedText: { ...typography.caption, color: colors.warningDark },
});
