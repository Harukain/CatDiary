import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { authApi, type PetSummary, type RecordSummary } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import { Body, Card, ErrorText, Screen, Title } from '../../src/shared/ui/primitives';
import {
  cacheRecords,
  flushOfflineOperations,
  getCachedRecords,
  getOfflineConflicts,
  getOfflineOperationCount,
  isNetworkFailure,
} from '../../src/features/offline/offline-queue';
import {
  isPendingLocalRecord,
  recordOwnerLabel,
  recordTimelineNoticeState,
} from '../../src/features/records/record-form';
import { AuthenticatedImage } from '../../src/features/photos/authenticated-image';
import { photoThumbnailSource } from '../../src/features/photos/photo-source';
import { recordSummaryText, recordTypeLabel } from '../../src/features/records/record-display';
import { bottomTabScrollPadding } from '../../src/shared/ui/bottom-tab-layout';

export default function RecordsTab() {
  const router = useRouter();
  const params = useLocalSearchParams<{ notice?: string }>();
  const insets = useSafeAreaInsets();
  const { session, activeFamily } = useSession();
  const [records, setRecords] = useState<RecordSummary[]>([]);
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [petId, setPetId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncNote, setSyncNote] = useState('');
  const routeNotice = recordTimelineNoticeState(paramValue(params.notice));
  const effectiveRouteNotice =
    routeNotice?.tone === 'warning' && syncNote.startsWith('已同步') ? null : routeNotice;

  const load = useCallback(async () => {
    if (!session || !activeFamily) return;
    setLoading(true);
    setError('');
    try {
      const pending = await getOfflineOperationCount();
      if (pending) {
        const result = await flushOfflineOperations(
          session.accessToken,
          authApi.sendOfflineOperation,
        );
        setSyncNote(
          result.conflicts
            ? `${result.conflicts} 条记录需要处理冲突`
            : result.synced
              ? `已同步 ${result.synced} 条离线记录`
              : `${pending} 条记录等待同步`,
        );
      }
      const conflicts = await getOfflineConflicts(activeFamily.id);
      if (conflicts.length) setSyncNote(`${conflicts.length} 条离线操作需要处理冲突`);
      const [recordPage, nextPets] = await Promise.all([
        authApi.listRecords(session.accessToken, activeFamily.id, petId),
        authApi.listPets(session.accessToken, activeFamily.id),
      ]);
      setRecords(recordPage.items);
      setPets(nextPets);
      await cacheRecords(activeFamily.id, recordPage.items);
    } catch (cause) {
      if (isNetworkFailure(cause)) {
        const cached = await getCachedRecords(activeFamily.id, petId);
        setRecords(cached);
        setSyncNote('当前离线，展示本机最近记录');
      } else setError(cause instanceof Error ? cause.message : '记录加载失败');
    } finally {
      setLoading(false);
    }
  }, [activeFamily, petId, session]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomTabScrollPadding(insets.bottom) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heading}>
          <View>
            <Text testID="records.title" style={styles.title}>
              记录时间线
            </Text>
            <Text style={styles.subtitle}>实际发生的生活与健康情况</Text>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          <Filter active={!petId} label="全部猫咪" onPress={() => setPetId(undefined)} />
          {pets.map((pet) => (
            <Filter
              key={pet.id}
              active={petId === pet.id}
              label={pet.name}
              onPress={() => setPetId(pet.id)}
            />
          ))}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/health-events')}
          style={styles.healthLink}
        >
          <View>
            <Text style={styles.healthLinkTitle}>健康事件</Text>
            <Text style={styles.healthLinkBody}>连续追踪异常、治疗与恢复</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.brand} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/medical-records')}
          style={styles.medicalLink}
        >
          <View>
            <Text style={styles.healthLinkTitle}>医疗档案</Text>
            <Text style={styles.healthLinkBody}>疫苗、驱虫与用药的结构化记录</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.brand} />
        </Pressable>
        {effectiveRouteNotice ? (
          <View
            testID="records.route-notice"
            style={[
              styles.routeNotice,
              effectiveRouteNotice.tone === 'success'
                ? styles.routeNoticeSuccess
                : styles.routeNoticeWarn,
            ]}
          >
            <Ionicons
              name={
                effectiveRouteNotice.tone === 'success'
                  ? 'checkmark-circle-outline'
                  : 'cloud-outline'
              }
              size={16}
              color={
                effectiveRouteNotice.tone === 'success' ? colors.successDark : colors.warningDark
              }
            />
            <Text
              testID="records.route-notice.text"
              style={[
                styles.routeNoticeText,
                effectiveRouteNotice.tone === 'success'
                  ? styles.routeNoticeTextSuccess
                  : styles.routeNoticeTextWarn,
              ]}
            >
              {effectiveRouteNotice.text}
            </Text>
          </View>
        ) : null}
        {syncNote ? (
          <Pressable
            testID="records.sync.note"
            disabled={!syncNote.includes('冲突')}
            onPress={() => router.push('/sync-conflicts')}
            style={styles.sync}
          >
            <Ionicons name="cloud-done-outline" size={16} color={colors.warningDark} />
            <View testID={syncStatusTestId(syncNote)} style={styles.syncCopy}>
              <Text testID="records.sync.note.text" style={styles.syncText}>
                {syncNote}
                {syncNote.includes('冲突') ? ' · 点击处理' : ''}
              </Text>
            </View>
          </Pressable>
        ) : null}
        {!loading && records.length ? <Insights records={records} /> : null}
        {loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : error ? (
          <ErrorText>{error}</ErrorText>
        ) : records.length ? (
          <View style={styles.timeline}>
            {records.map((record) => (
              <RecordItem
                key={record.id}
                record={record}
                accessToken={session?.accessToken ?? ''}
                familyId={activeFamily?.id ?? ''}
                onPress={() =>
                  router.push({ pathname: '/records/[id]', params: { id: record.id } })
                }
              />
            ))}
          </View>
        ) : (
          <Card>
            <Title>还没有历史记录</Title>
            <Body>从“＋”记录饮食、体重或健康情况，完成照顾任务后也会自动出现在这里。</Body>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

function paramValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function syncStatusTestId(note: string) {
  if (note.startsWith('已同步')) return 'records.sync.synced';
  if (note.includes('冲突')) return 'records.sync.conflict';
  if (note.includes('离线')) return 'records.sync.offline';
  return 'records.sync.pending';
}

function Filter({ active, label, onPress }: { active: boolean; label: string; onPress(): void }) {
  return (
    <Pressable onPress={onPress} style={[styles.filter, active && styles.filterActive]}>
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
    </Pressable>
  );
}
function RecordItem({
  record,
  accessToken,
  familyId,
  onPress,
}: {
  record: RecordSummary;
  accessToken: string;
  familyId: string;
  onPress(): void;
}) {
  const when = new Date(record.occurredAt);
  const photos = record.type === 'PHOTO' ? (record.photos ?? []).slice(0, 3) : [];
  return (
    <View style={styles.record}>
      <View style={[styles.dot, record.abnormal && styles.dotAbnormal]} />
      <Pressable
        testID="records.item"
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.recordCard, pressed && styles.pressed]}
      >
        <View style={styles.recordTop}>
          <View style={styles.recordTypeRow}>
            <Text style={styles.recordType}>{recordTypeLabel(record.type)}</Text>
            {isPendingLocalRecord(record) ? (
              <View testID="records.pending.badge" style={styles.pendingPill}>
                <Ionicons name="cloud-upload-outline" size={12} color={colors.warningDark} />
                <Text testID="records.pending.badge.text" style={styles.pendingText}>
                  本机待同步
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            testID="records.item.time"
            style={styles.recordTime}
          >{`${when.getMonth() + 1}月${when.getDate()}日 ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`}</Text>
        </View>
        <Text testID="records.item.title" style={styles.recordTitle}>
          {record.title}
        </Text>
        <Text testID="records.item.meta" style={styles.recordMeta}>
          {recordOwnerLabel(record)} · {recordSummaryText(record)}
        </Text>
        {photos.length ? (
          <View style={styles.photoStrip}>
            {photos.map((photo) => (
              <AuthenticatedImage
                key={photo.id}
                accessibilityLabel={photo.note ? `照片：${photo.note}` : '照片记录缩略图'}
                resizeMode="cover"
                source={photoThumbnailSource(photo, accessToken, familyId)}
                style={styles.photoThumb}
              />
            ))}
            {(record.photos?.length ?? 0) > photos.length ? (
              <View style={styles.morePhotos}>
                <Text style={styles.morePhotosText}>
                  +{(record.photos?.length ?? 0) - photos.length}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {record.note ? <Text style={styles.note}>{record.note}</Text> : null}
        {record.abnormal ? <Text style={styles.abnormal}>已标记异常</Text> : null}
      </Pressable>
    </View>
  );
}
function Insights({ records }: { records: RecordSummary[] }) {
  const abnormal = records.filter((record) => record.abnormal).length;
  const weights = records
    .filter((record) => record.type === 'WEIGHT')
    .slice(0, 7)
    .reverse();
  const values = weights.map((record) => Number(record.data.weightKg));
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (
    <View style={styles.insights}>
      <View style={styles.insightTop}>
        <View>
          <Text style={styles.insightEyebrow}>近期概览</Text>
          <Text style={styles.insightTitle}>
            {abnormal ? `${abnormal} 条异常需要留意` : '近期状态平稳'}
          </Text>
        </View>
        <View style={[styles.healthPill, abnormal ? styles.healthWarn : null]}>
          <Text style={styles.healthText}>{abnormal ? '留意' : '正常'}</Text>
        </View>
      </View>
      {weights.length >= 2 ? (
        <View>
          <Text style={styles.chartLabel}>体重趋势 · 最近 {weights.length} 次</Text>
          <View style={styles.chart}>
            {weights.map((record) => {
              const value = Number(record.data.weightKg);
              const height = 12 + ((value - min) / Math.max(max - min, 0.1)) * 42;
              return (
                <View key={record.id} style={styles.barSlot}>
                  <View style={[styles.bar, { height }]} />
                  <Text style={styles.barText}>{value}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : (
        <Text style={styles.chartEmpty}>再记录一次体重后，这里会展示变化趋势。</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  heading: { gap: spacing.xs },
  title: { ...typography.h1, color: colors.ink },
  subtitle: { ...typography.secondary, color: colors.textSecondary, marginTop: spacing.xs },
  filters: { gap: spacing.sm },
  filter: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  filterActive: { backgroundColor: colors.ink },
  filterText: { ...typography.caption, color: colors.textSecondary },
  filterTextActive: { color: colors.surface },
  healthLink: {
    minHeight: 68,
    borderRadius: radii.card,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.brandSoft,
  },
  medicalLink: {
    minHeight: 68,
    borderRadius: radii.card,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  healthLinkTitle: { ...typography.h3, color: colors.ink },
  healthLinkBody: { ...typography.caption, color: colors.textSecondary, marginTop: 3 },
  routeNotice: {
    minHeight: 52,
    borderRadius: radii.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  routeNoticeSuccess: { backgroundColor: colors.successSoft },
  routeNoticeWarn: { backgroundColor: colors.warningSoft },
  routeNoticeText: { ...typography.caption, flex: 1 },
  routeNoticeTextSuccess: { color: colors.successDark },
  routeNoticeTextWarn: { color: colors.warningDark },
  sync: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  syncCopy: { flex: 1 },
  syncText: { ...typography.caption, color: colors.warningDark },
  insights: {
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.lg,
    backgroundColor: colors.ink,
  },
  insightTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  insightEyebrow: { ...typography.caption, color: colors.textTertiary },
  insightTitle: { ...typography.h2, color: colors.surface, marginTop: spacing.xs },
  healthPill: {
    borderRadius: radii.pill,
    backgroundColor: colors.successDark,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  healthWarn: { backgroundColor: colors.dangerDark },
  healthText: { ...typography.caption, color: colors.surface, fontWeight: '700' },
  chartLabel: { ...typography.caption, color: colors.textTertiary, marginBottom: spacing.md },
  chart: { height: 76, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  barSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: '72%', minHeight: 12, borderRadius: 5, backgroundColor: colors.brand },
  barText: { fontSize: 9, color: colors.textTertiary },
  chartEmpty: { ...typography.caption, color: colors.textTertiary },
  timeline: { gap: spacing.md },
  record: { flexDirection: 'row', gap: spacing.md },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: spacing.xl,
    backgroundColor: colors.brand,
  },
  dotAbnormal: { backgroundColor: colors.danger },
  recordCard: {
    flex: 1,
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  recordTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  recordTypeRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  recordType: { ...typography.caption, color: colors.brand, fontWeight: '700' },
  recordTime: { ...typography.caption, color: colors.textTertiary },
  pendingPill: {
    minHeight: 24,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warningSoft,
  },
  pendingText: { ...typography.caption, color: colors.warningDark, fontWeight: '600' },
  recordTitle: { ...typography.h3, color: colors.ink },
  recordMeta: { ...typography.secondary, color: colors.textSecondary },
  photoStrip: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: radii.input,
    backgroundColor: colors.divider,
  },
  morePhotos: {
    width: 72,
    height: 72,
    borderRadius: radii.input,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  morePhotosText: { ...typography.h3, color: colors.brand },
  note: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  abnormal: { ...typography.caption, color: colors.dangerDark, fontWeight: '600' },
});
