import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { authApi, type ManualRecordType, type PetSummary } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import { Card, ErrorText, Field, PrimaryButton, Screen } from '../../src/shared/ui/primitives';
import {
  enqueueOfflineOperation,
  isNetworkFailure,
} from '../../src/features/offline/offline-queue';
import {
  buildRecordData,
  datePart,
  fieldConfig,
  parseOccurredAt,
  recordTitle,
  recordTypes,
  stoolOptions,
  timePart,
  vomitOptions,
  type RecordFormValue,
} from '../../src/features/records/record-form';

export default function NewRecordScreen() {
  const router = useRouter();
  const { session, activeFamily } = useSession();
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [petId, setPetId] = useState('');
  const [type, setType] = useState<ManualRecordType>('FOOD');
  const [form, setForm] = useState<RecordFormValue>({ first: '', second: '', blood: false });
  const [occurredDate, setOccurredDate] = useState(datePart());
  const [occurredTime, setOccurredTime] = useState(timePart());
  const [note, setNote] = useState('');
  const [abnormal, setAbnormal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!session || !activeFamily) return;
    void authApi
      .listPets(session.accessToken, activeFamily.id)
      .then((items) => {
        setPets(items);
        setPetId(items[0]?.id ?? '');
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : '猫咪加载失败'));
  }, [activeFamily, session]);
  useEffect(() => {
    setForm({
      first: '',
      second: type === 'STOOL' || type === 'VOMIT' ? 'UNKNOWN' : '',
      blood: false,
    });
    setError('');
  }, [type]);
  const fields = useMemo(() => fieldConfig(type), [type]);
  const choices = type === 'STOOL' ? stoolOptions : type === 'VOMIT' ? vomitOptions : null;
  async function submit() {
    if (!session || !activeFamily || !petId) return setError('请选择猫咪');
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
      petId,
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
      router.back();
    } catch (cause) {
      if (isNetworkFailure(cause)) {
        await enqueueOfflineOperation(operation);
        Alert.alert('已保存到本机', '联网后会自动同步到家庭时间线');
        router.back();
      } else setError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View>
            <Text style={styles.title}>新增记录</Text>
            <Text style={styles.subtitle}>记录实际发生的情况，不会生成待办任务</Text>
          </View>
          <Card>
            <Text style={styles.section}>选择猫咪</Text>
            <View style={styles.chips}>
              {pets.map((pet) => (
                <Chip
                  key={pet.id}
                  active={pet.id === petId}
                  label={pet.name}
                  onPress={() => setPetId(pet.id)}
                />
              ))}
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
            <PrimaryButton
              label="保存记录"
              busy={busy}
              disabled={!petId || !form.first.trim()}
              onPress={submit}
            />
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
const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: spacing.xl, paddingBottom: 80 },
  title: { ...typography.h1, color: colors.ink },
  subtitle: { ...typography.secondary, color: colors.textSecondary, marginTop: spacing.xs },
  section: { ...typography.h3, color: colors.ink, marginTop: spacing.sm },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.ink },
  optionBlock: { gap: spacing.sm, marginTop: spacing.sm },
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
  dangerRow: { backgroundColor: '#FBE4D9' },
  switchCopy: { flex: 1 },
  switchTitle: { ...typography.h3, color: colors.ink },
  switchBody: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
});
