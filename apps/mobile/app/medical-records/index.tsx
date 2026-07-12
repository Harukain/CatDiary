import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import {
  authApi,
  type MedicalRecordSummary,
  type PetSummary,
} from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import { shareMedicalSummary } from '../../src/features/medical/share-summary';
import { Body, Card, ErrorText, Screen, Title } from '../../src/shared/ui/primitives';

const labels = { VACCINE: '疫苗', DEWORMING: '驱虫', MEDICATION: '用药' } as const;

export default function MedicalRecordsScreen() {
  const router = useRouter();
  const { session, activeFamily } = useSession();
  const [records, setRecords] = useState<MedicalRecordSummary[]>([]);
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [petId, setPetId] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!session || !activeFamily) return;
    setLoading(true);
    setError('');
    try {
      const nextPets = await authApi.listPets(session.accessToken, activeFamily.id);
      const selected = nextPets.some((pet) => pet.id === petId) ? petId : (nextPets[0]?.id ?? '');
      setPets(nextPets);
      setPetId(selected);
      setRecords(
        await authApi.listMedicalRecords(
          session.accessToken,
          activeFamily.id,
          selected || undefined,
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [activeFamily, petId, session]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  async function selectPet(nextPetId: string) {
    if (!session || !activeFamily) return;
    setPetId(nextPetId);
    setLoading(true);
    try {
      setRecords(await authApi.listMedicalRecords(session.accessToken, activeFamily.id, nextPetId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }
  async function exportSummary() {
    if (!session || !activeFamily || !petId) return;
    const pet = pets.find((item) => item.id === petId);
    if (!pet) return;
    setExporting(true);
    try {
      await shareMedicalSummary(session.accessToken, activeFamily.id, pet.id, pet.name);
    } catch (cause) {
      Alert.alert('导出失败', cause instanceof Error ? cause.message : '请稍后重试');
    } finally {
      setExporting(false);
    }
  }
  const canEdit = activeFamily?.role === 'OWNER' || activeFamily?.role === 'ADMIN';
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <View>
            <Text style={styles.title}>医疗档案</Text>
            <Text style={styles.subtitle}>结构化保存疫苗、驱虫和用药事实</Text>
          </View>
          <Pressable accessibilityLabel="关闭" onPress={() => router.back()} style={styles.close}>
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {pets.map((pet) => (
            <Pressable
              key={pet.id}
              onPress={() => void selectPet(pet.id)}
              style={[styles.filter, pet.id === petId && styles.filterActive]}
            >
              <Text style={[styles.filterText, pet.id === petId && styles.filterTextActive]}>
                {pet.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.actions}>
          {canEdit ? (
            <Pressable onPress={() => router.push('/medical-records/new')} style={styles.action}>
              <Ionicons name="add-circle-outline" size={20} color={colors.brand} />
              <Text style={styles.actionText}>新增档案</Text>
            </Pressable>
          ) : null}
          <Pressable
            disabled={!petId || exporting}
            onPress={() => void exportSummary()}
            style={[styles.action, (!petId || exporting) && styles.disabled]}
          >
            {exporting ? (
              <ActivityIndicator size="small" color={colors.brand} />
            ) : (
              <Ionicons name="document-text-outline" size={20} color={colors.brand} />
            )}
            <Text style={styles.actionText}>导出摘要</Text>
          </Pressable>
        </View>
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            医疗档案不代替兽医诊断或处方。紧急情况请及时联系执业兽医。
          </Text>
        </View>
        {loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : error ? (
          <ErrorText>{error}</ErrorText>
        ) : records.length ? (
          records.map((record) => (
            <Pressable
              accessibilityRole="button"
              key={record.id}
              onPress={() =>
                router.push({ pathname: '/medical-records/[id]', params: { id: record.id } })
              }
              style={({ pressed }) => [styles.record, pressed && styles.pressed]}
            >
              <View style={styles.recordTop}>
                <Text style={styles.type}>{labels[record.type]}</Text>
                <Text style={styles.date}>
                  {new Date(record.occurredAt).toLocaleDateString('zh-CN')}
                </Text>
              </View>
              <Text style={styles.recordTitle}>{record.title}</Text>
              <Text style={styles.meta}>
                {record.pet.name}
                {record.brand ? ` · ${record.brand}` : ''}
                {record.dose ? ` · ${record.dose}` : ''}
              </Text>
              {record.provider ? <Text style={styles.detail}>机构：{record.provider}</Text> : null}
              {record.nextDueAt ? (
                <Text style={styles.next}>
                  下次日期：{new Date(record.nextDueAt).toLocaleDateString('zh-CN')}
                </Text>
              ) : null}
              {record.reaction ? (
                <Text style={styles.reaction}>反应：{record.reaction}</Text>
              ) : null}
            </Pressable>
          ))
        ) : (
          <Card>
            <Title>还没有医疗档案</Title>
            <Body>接种疫苗、完成驱虫或用药后，在这里保存品牌、批次、剂量和下次日期。</Body>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: 80 },
  heading: { flexDirection: 'row', justifyContent: 'space-between' },
  title: { ...typography.h1, color: colors.ink },
  subtitle: { ...typography.secondary, color: colors.textSecondary, marginTop: spacing.xs },
  close: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filters: { gap: spacing.sm },
  filter: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  filterActive: { backgroundColor: colors.ink },
  filterText: { ...typography.caption, color: colors.textSecondary },
  filterTextActive: { color: colors.surface },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: {
    flex: 1,
    minHeight: 50,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  actionText: { ...typography.h3, color: colors.brand },
  disabled: { opacity: 0.45 },
  notice: { padding: spacing.md, borderRadius: radii.input, backgroundColor: colors.brandSoft },
  noticeText: { ...typography.caption, color: colors.warningDark },
  record: {
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  recordTop: { flexDirection: 'row', justifyContent: 'space-between' },
  type: { ...typography.caption, color: colors.brand, fontWeight: '700' },
  date: { ...typography.caption, color: colors.textTertiary },
  recordTitle: { ...typography.h3, color: colors.ink },
  meta: { ...typography.secondary, color: colors.textSecondary },
  detail: { ...typography.caption, color: colors.textSecondary },
  next: {
    ...typography.caption,
    color: colors.warningDark,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  reaction: { ...typography.caption, color: colors.dangerDark },
});
