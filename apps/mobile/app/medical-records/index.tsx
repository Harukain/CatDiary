import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import {
  authApi,
  type MedicalRecordSummary,
  type PetSummary,
} from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import {
  prepareMedicalSummary,
  sharePreparedMedicalSummary,
  type PreparedMedicalSummary,
} from '../../src/features/medical/share-summary';
import {
  Body,
  Card,
  ErrorText,
  PrimaryButton,
  Screen,
  SuccessText,
  TextButton,
  Title,
} from '../../src/shared/ui/primitives';

const labels = { VACCINE: '疫苗', DEWORMING: '驱虫', MEDICATION: '用药' } as const;

export default function MedicalRecordsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ petId?: string }>();
  const { session, activeFamily } = useSession();
  const [records, setRecords] = useState<MedicalRecordSummary[]>([]);
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [petId, setPetId] = useState(params.petId ?? '');
  const [loading, setLoading] = useState(true);
  const [summaryOperation, setSummaryOperation] = useState<'' | 'generate' | 'share'>('');
  const [preparedSummary, setPreparedSummary] = useState<PreparedMedicalSummary>();
  const [summarySuccess, setSummarySuccess] = useState('');
  const [summaryError, setSummaryError] = useState('');
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
    setPreparedSummary(undefined);
    setSummarySuccess('');
    setSummaryError('');
    setLoading(true);
    try {
      setRecords(await authApi.listMedicalRecords(session.accessToken, activeFamily.id, nextPetId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }
  async function generateSummary() {
    if (!session || !activeFamily || !petId) return;
    const pet = pets.find((item) => item.id === petId);
    if (!pet) return;
    setSummaryOperation('generate');
    setPreparedSummary(undefined);
    setSummarySuccess('');
    setSummaryError('');
    try {
      const summary = await prepareMedicalSummary(
        session.accessToken,
        activeFamily.id,
        pet.id,
        pet.name,
      );
      setPreparedSummary(summary);
      setSummarySuccess('就医摘要已生成，可点击分享摘要保存或转发。');
    } catch (cause) {
      setSummaryError(cause instanceof Error ? cause.message : '就医摘要生成失败，请稍后重试');
    } finally {
      setSummaryOperation('');
    }
  }
  async function shareSummary() {
    if (!preparedSummary) return;
    setSummaryOperation('share');
    setSummaryError('');
    try {
      await sharePreparedMedicalSummary(preparedSummary);
      setSummarySuccess('已打开系统分享。');
    } catch (cause) {
      setSummaryError(cause instanceof Error ? cause.message : '系统分享打开失败，请稍后重试');
    } finally {
      setSummaryOperation('');
    }
  }
  function openNewMedicalRecord() {
    router.push({
      pathname: '/medical-records/new',
      params: petId ? { petId } : {},
    });
  }
  const canEdit = activeFamily?.role === 'OWNER' || activeFamily?.role === 'ADMIN';
  const summaryBusy = summaryOperation !== '';
  const canGenerateSummary = !summaryBusy && !!session && !!activeFamily && !!petId;
  const canShareSummary = !summaryBusy && !!preparedSummary;
  const canAddMedicalRecord = canEdit && !summaryBusy;
  return (
    <Screen>
      <View style={styles.flex}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heading}>
            <View>
              <Text testID="medical-records.title" style={styles.title}>
                医疗档案
              </Text>
              <Text style={styles.subtitle}>结构化保存疫苗、驱虫和用药事实</Text>
            </View>
            <Pressable
              testID="medical-records.close.button"
              accessibilityLabel="关闭"
              disabled={summaryBusy}
              onPress={() => router.back()}
              style={[styles.close, summaryBusy && styles.closeDisabled]}
            >
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
                testID="medical-records.pet.filter"
                disabled={summaryBusy}
                onPress={() => void selectPet(pet.id)}
                style={[
                  styles.filter,
                  pet.id === petId && styles.filterActive,
                  summaryBusy && styles.filterDisabled,
                ]}
              >
                <Text style={[styles.filterText, pet.id === petId && styles.filterTextActive]}>
                  {pet.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {preparedSummary || summarySuccess || summaryError ? (
            <Card>
              <Title>就医摘要</Title>
              {summarySuccess ? (
                <View testID="medical-records.summary-ready.text">
                  <SuccessText>{summarySuccess}</SuccessText>
                </View>
              ) : null}
              {summaryError ? <ErrorText>{summaryError}</ErrorText> : null}
              {preparedSummary ? (
                <Body>
                  摘要已在本机准备好。请使用底部“分享就医摘要”打开系统分享面板保存或转发。
                </Body>
              ) : null}
            </Card>
          ) : null}
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
                testID="medical-records.item"
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
                {record.provider ? (
                  <Text style={styles.detail}>机构：{record.provider}</Text>
                ) : null}
                {record.nextDueAt ? (
                  <Text testID="medical-records.next-date" style={styles.next}>
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
        <View
          testID="medical-records.footer"
          style={[
            styles.footer,
            { paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm) },
          ]}
        >
          {preparedSummary ? (
            <PrimaryButton
              testID="medical-records.summary-share.button"
              label="分享就医摘要"
              busy={summaryOperation === 'share'}
              disabled={!canShareSummary}
              onPress={() => void shareSummary()}
            />
          ) : canEdit ? (
            <PrimaryButton
              testID="medical-records.add.button"
              label="新增医疗档案"
              disabled={!canAddMedicalRecord}
              onPress={openNewMedicalRecord}
            />
          ) : (
            <PrimaryButton
              testID="medical-records.export.button"
              label={summaryOperation === 'generate' ? '正在生成摘要' : '生成就医摘要'}
              busy={summaryOperation === 'generate'}
              disabled={!canGenerateSummary}
              onPress={() => void generateSummary()}
            />
          )}
          {preparedSummary ? (
            <TextButton
              testID="medical-records.export.button"
              label={summaryOperation === 'generate' ? '正在生成摘要' : '重新生成摘要'}
              disabled={!canGenerateSummary}
              onPress={() => void generateSummary()}
            />
          ) : canEdit ? (
            <TextButton
              testID="medical-records.export.button"
              label={summaryOperation === 'generate' ? '正在生成摘要' : '生成就医摘要'}
              disabled={!canGenerateSummary}
              onPress={() => void generateSummary()}
            />
          ) : null}
          {preparedSummary && canEdit ? (
            <TextButton
              testID="medical-records.add.button"
              label="新增医疗档案"
              disabled={!canAddMedicalRecord}
              onPress={openNewMedicalRecord}
            />
          ) : null}
          <TextButton
            testID="medical-records.return.button"
            label={summaryBusy ? '处理中，请等待' : '返回上一页'}
            disabled={summaryBusy}
            onPress={() => router.back()}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1 },
  content: { gap: spacing.lg, paddingBottom: spacing.xl },
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
  closeDisabled: { opacity: 0.45 },
  filters: { gap: spacing.sm },
  filter: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  filterActive: { backgroundColor: colors.ink },
  filterDisabled: { opacity: 0.62 },
  filterText: { ...typography.caption, color: colors.textSecondary },
  filterTextActive: { color: colors.surface },
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
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.page,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
});
