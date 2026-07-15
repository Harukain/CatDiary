import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { authApi, type MedicalRecordType, type PetSummary } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import { isMedicalRecordDraftDirty } from '../../src/features/medical/medical-form';
import { resolveDraftExitDecision } from '../../src/shared/navigation/draft-exit';
import {
  Card,
  ErrorText,
  Field,
  PrimaryButton,
  Screen,
  TextButton,
} from '../../src/shared/ui/primitives';
const types: Array<{ value: MedicalRecordType; label: string }> = [
  { value: 'VACCINE', label: '疫苗' },
  { value: 'DEWORMING', label: '驱虫' },
  { value: 'MEDICATION', label: '用药' },
];
export default function NewMedicalRecordScreen() {
  const router = useRouter();
  const { session, activeFamily } = useSession();
  const initialOccurredDate = useRef(today()).current;
  const allowLeave = useRef(false);
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [petId, setPetId] = useState('');
  const [initialPetId, setInitialPetId] = useState('');
  const [type, setType] = useState<MedicalRecordType>('VACCINE');
  const [title, setTitle] = useState('');
  const [occurredDate, setOccurredDate] = useState(initialOccurredDate);
  const [nextDate, setNextDate] = useState('');
  const [brand, setBrand] = useState('');
  const [batch, setBatch] = useState('');
  const [dose, setDose] = useState('');
  const [provider, setProvider] = useState('');
  const [reaction, setReaction] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!session || !activeFamily) return;
    void authApi.listPets(session.accessToken, activeFamily.id).then((items) => {
      setPets(items);
      const nextPetId = items[0]?.id ?? '';
      setPetId(nextPetId);
      setInitialPetId(nextPetId);
    });
  }, [activeFamily, session]);
  const isDirty = useMemo(
    () =>
      isMedicalRecordDraftDirty(
        {
          petId,
          type,
          title,
          occurredDate,
          nextDate,
          brand,
          batch,
          dose,
          provider,
          reaction,
          note,
        },
        { petId: initialPetId, type: 'VACCINE', occurredDate: initialOccurredDate },
      ),
    [
      batch,
      brand,
      dose,
      initialOccurredDate,
      initialPetId,
      nextDate,
      note,
      occurredDate,
      petId,
      provider,
      reaction,
      title,
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
      Alert.alert('医疗档案正在保存', '请等待当前医疗档案保存完成，避免重复提交。', [
        { text: '继续等待', style: 'cancel' },
      ]);
      return;
    }
    if (decision === 'continue') return router.back();
    Alert.alert('放弃未保存的医疗档案？', '当前填写的医疗信息尚未保存，离开后需要重新填写。', [
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
    if (!session || !activeFamily || !petId) return setError('请选择猫咪');
    let occurredAt: string;
    let nextDueAt: string | undefined;
    try {
      occurredAt = parseDate(occurredDate, true);
      nextDueAt = nextDate.trim() ? parseDate(nextDate) : undefined;
      if (nextDueAt && new Date(nextDueAt) <= new Date(occurredAt))
        throw new Error('下次日期必须晚于发生日期');
    } catch (cause) {
      return setError(cause instanceof Error ? cause.message : '日期格式不正确');
    }
    setBusy(true);
    setError('');
    try {
      await authApi.createMedicalRecord(session.accessToken, activeFamily.id, {
        petId,
        type,
        title: title.trim(),
        occurredAt,
        nextDueAt,
        brand: brand.trim() || undefined,
        batchNumber: batch.trim() || undefined,
        dose: dose.trim() || undefined,
        provider: provider.trim() || undefined,
        reaction: reaction.trim() || undefined,
        note: note.trim() || undefined,
      });
      Alert.alert('已保存', '医疗档案已加入猫咪记录');
      allowLeave.current = true;
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.nav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭新增医疗档案"
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
            <Text style={styles.eyebrow}>管理员维护</Text>
            <Text style={styles.title}>新增医疗档案</Text>
          </View>
        </View>
        <Card>
          <Text style={styles.section}>猫咪</Text>
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
          <Text style={styles.section}>类型</Text>
          <View style={styles.chips}>
            {types.map((item) => (
              <Chip
                key={item.value}
                active={item.value === type}
                label={item.label}
                onPress={() => setType(item.value)}
              />
            ))}
          </View>
          <Field
            label="项目名称"
            value={title}
            onChangeText={setTitle}
            placeholder={
              type === 'VACCINE'
                ? '例如：猫三联加强针'
                : type === 'DEWORMING'
                  ? '例如：体内驱虫'
                  : '例如：抗生素疗程'
            }
          />
          <Field
            label="发生日期"
            value={occurredDate}
            onChangeText={setOccurredDate}
            keyboardType="numbers-and-punctuation"
            placeholder="YYYY-MM-DD"
            maxLength={10}
          />
          <Field
            label="下次日期（选填）"
            value={nextDate}
            onChangeText={setNextDate}
            keyboardType="numbers-and-punctuation"
            placeholder="YYYY-MM-DD"
            maxLength={10}
          />
          <Field label="品牌/药品" value={brand} onChangeText={setBrand} placeholder="选填" />
          <Field label="批次号" value={batch} onChangeText={setBatch} placeholder="疫苗建议填写" />
          <Field
            label="剂量"
            value={dose}
            onChangeText={setDose}
            placeholder="例如：0.5 ml / 1 片"
          />
          <Field
            label="医院或服务机构"
            value={provider}
            onChangeText={setProvider}
            placeholder="选填"
          />
          <Field
            label="反应"
            value={reaction}
            onChangeText={setReaction}
            placeholder="例如：接种后轻微嗜睡"
          />
          <Field label="备注" value={note} onChangeText={setNote} placeholder="选填" />
          {error ? <ErrorText>{error}</ErrorText> : null}
          <PrimaryButton
            label="保存医疗档案"
            busy={busy}
            disabled={!petId || !title.trim()}
            onPress={submit}
          />
        </Card>
        <TextButton label="取消" disabled={busy} onPress={requestClose} />
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
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function parseDate(value: string, todayAsNow = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日期请按 YYYY-MM-DD 填写');
  if (todayAsNow && value === today()) return new Date().toISOString();
  const date = new Date(`${value}T12:00:00+08:00`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new Error('请输入有效日期');
  return date.toISOString();
}
const styles = StyleSheet.create({
  content: { gap: spacing.xl, paddingBottom: 70 },
  nav: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  navButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navButtonDisabled: { opacity: 0.45 },
  navCopy: { flex: 1 },
  eyebrow: { ...typography.caption, color: colors.brand, fontWeight: '700' },
  title: { ...typography.h1, color: colors.ink, marginTop: spacing.xs },
  section: { ...typography.h3, color: colors.ink, marginTop: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { ...typography.caption, color: colors.textSecondary },
  chipTextActive: { color: colors.surface },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
