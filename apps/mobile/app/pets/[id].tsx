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
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, shadows, spacing, typography } from '@cat-diary/design-tokens';
import {
  authApi,
  AuthApiError,
  type PetProfileMedicalRecordSummary,
  type PetProfileRecordSummary,
  type PetProfileSummary,
  type PetSummary,
  type PetWeightPoint,
  type PhotoSummary,
  type PlanType,
} from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import {
  isPetProfileDraftDirty,
  isValidBirthDate,
  type PetProfileDraft,
} from '../../src/features/pets/pet-form';
import { AuthenticatedImage } from '../../src/features/photos/authenticated-image';
import { photoSource, photoThumbnailSource } from '../../src/features/photos/photo-source';
import {
  Body,
  Card,
  ErrorText,
  Field,
  PrimaryButton,
  Screen,
  SuccessText,
  TextButton,
  Title,
} from '../../src/shared/ui/primitives';

type PetDetail = PetSummary & {
  sex?: string | null;
  breed?: string | null;
  birthDate?: string | null;
  neutered?: boolean | null;
  chipNumber?: string | null;
};

const sexLabels: Record<string, string> = {
  MALE: '公猫',
  FEMALE: '母猫',
  UNKNOWN: '未知',
};
const recordLabels: Record<PlanType, string> = {
  VACCINE: '疫苗',
  DEWORMING: '驱虫',
  MEDICATION: '用药',
  LITTER: '铲屎',
  FOOD: '饮食',
  WATER: '饮水',
  WEIGHT: '体重',
  STOOL: '排便',
  VOMIT: '呕吐',
  PHOTO: '照片',
  HEALTH_NOTE: '健康备注',
};
const medicalLabels = { VACCINE: '疫苗', DEWORMING: '驱虫', MEDICATION: '用药' } as const;

export default function PetDetailRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, activeFamily } = useSession();
  const [pet, setPet] = useState<PetDetail | null>(null);
  const [profile, setProfile] = useState<PetProfileSummary | null>(null);
  const [name, setName] = useState('');
  const [sex, setSex] = useState('UNKNOWN');
  const [birthDate, setBirthDate] = useState('');
  const [breed, setBreed] = useState('');
  const [chipNumber, setChipNumber] = useState('');
  const [neutered, setNeutered] = useState<boolean | null>(null);
  const [initialDraft, setInitialDraft] = useState<PetProfileDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const allowLeave = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!session || !activeFamily || !id) return;
      let mounted = true;
      setError('');
      void Promise.all([
        authApi.getPet(session.accessToken, activeFamily.id, id),
        authApi.getPetProfileSummary(session.accessToken, activeFamily.id, id),
      ])
        .then(([detail, summary]) => {
          if (!mounted) return;
          setPet(detail);
          setProfile(summary);
          setName(detail.name);
          setSex(detail.sex ?? 'UNKNOWN');
          setBirthDate(detail.birthDate?.slice(0, 10) ?? '');
          setBreed(detail.breed ?? '');
          setChipNumber(detail.chipNumber ?? '');
          setNeutered(detail.neutered ?? null);
          setInitialDraft(petDraftFromDetail(detail));
          allowLeave.current = false;
        })
        .catch((cause) => {
          if (!mounted) return;
          setError(cause instanceof Error ? cause.message : '猫咪档案加载失败');
        });
      return () => {
        mounted = false;
      };
    }, [activeFamily, id, session]),
  );

  const canManage = activeFamily?.role === 'OWNER' || activeFamily?.role === 'ADMIN';
  const currentDraft = useMemo<PetProfileDraft>(
    () => ({
      name,
      sex,
      birthDate,
      breed,
      chipNumber,
      neutered,
    }),
    [birthDate, breed, chipNumber, name, neutered, sex],
  );
  const changed = !!initialDraft && isPetProfileDraftDirty(currentDraft, initialDraft);
  const birthValid =
    !birthDate ||
    isValidBirthDate(birthDate, new Date(), activeFamily?.timezone ?? 'Asia/Shanghai');
  const canSave = canManage && !!name.trim() && birthValid && changed && !busy;
  const requestReturn = useCallback(() => {
    if (busy) {
      Alert.alert('猫咪档案正在处理', '请等待当前保存或删除操作完成，避免档案状态不一致。', [
        { text: '继续等待', style: 'cancel' },
      ]);
      return;
    }
    if (!changed || allowLeave.current) {
      router.back();
      return;
    }
    Alert.alert('放弃未保存的猫咪档案修改？', '当前基础资料尚未保存，离开后会丢失修改。', [
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
  }, [busy, changed, router]);
  const guardedNavigate = useCallback(
    (navigate: () => void, actionLabel = '前往') => {
      if (busy) return;
      if (!changed || allowLeave.current) {
        navigate();
        return;
      }
      Alert.alert('先处理未保存修改？', '继续离开会丢失当前猫咪基础资料修改。', [
        { text: '继续编辑', style: 'cancel' },
        {
          text: `放弃并${actionLabel}`,
          style: 'destructive',
          onPress: () => {
            allowLeave.current = true;
            navigate();
          },
        },
      ]);
    },
    [busy, changed],
  );
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!busy && (!changed || allowLeave.current)) return false;
      requestReturn();
      return true;
    });
    return () => subscription.remove();
  }, [busy, changed, requestReturn]);

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
    if (!session || !activeFamily || !pet || !canSave) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const updated = await authApi.updatePet(session.accessToken, activeFamily.id, pet.id, {
        name: name.trim(),
        sex,
        birthDate: birthDate || null,
        breed: breed.trim() || null,
        chipNumber: chipNumber.trim() || null,
        neutered,
        version: pet.version,
      });
      const nextPet = {
        ...pet,
        ...updated,
        name: name.trim(),
        sex,
        birthDate: birthDate || null,
        breed: breed.trim() || null,
        chipNumber: chipNumber.trim() || null,
        neutered,
      };
      setPet(nextPet);
      setProfile((current) =>
        current ? { ...current, pet: { ...current.pet, ...nextPet } } : current,
      );
      setInitialDraft(petDraftFromDetail(nextPet));
      setSuccess('猫咪档案已保存。');
    } catch (cause) {
      setError(cause instanceof AuthApiError ? cause.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (busy) return;
    Alert.alert('删除猫咪档案', '档案将进入 30 天软删除期。相关历史记录不会立即永久删除。', [
      { text: '取消', style: 'cancel' },
      { text: '确认删除', style: 'destructive', onPress: () => void remove() },
    ]);
  }

  async function remove() {
    if (!session || !activeFamily || !pet || busy) return;
    setBusy(true);
    setError('');
    try {
      await authApi.deletePet(session.accessToken, activeFamily.id, pet.id, pet.version);
      allowLeave.current = true;
      router.replace('/pets');
    } catch (cause) {
      setError(cause instanceof AuthApiError ? cause.message : '删除失败');
      setBusy(false);
    }
  }

  useEffect(() => {
    if (changed) setSuccess('');
  }, [changed]);

  return (
    <Screen>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.nav}>
          <Pressable
            testID="pet-detail.back.button"
            accessibilityRole="button"
            accessibilityLabel="返回"
            accessibilityHint={busy ? '猫咪档案正在处理，点击会提示继续等待' : '返回上一页'}
            onPress={requestReturn}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
          <Text testID="pet-detail.title" style={styles.navTitle}>
            猫咪档案
          </Text>
          <View style={styles.back} />
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {!pet && !error ? <ActivityIndicator color={colors.brand} /> : null}
          {error && !pet ? (
            <Card>
              <Title>档案加载失败</Title>
              <ErrorText>{error}</ErrorText>
            </Card>
          ) : null}
          {pet ? (
            <>
              <Card elevated>
                <View style={styles.profileTop}>
                  {pet.avatarUrl && session && activeFamily ? (
                    <AuthenticatedImage
                      accessibilityLabel={`${pet.name}的头像`}
                      source={photoSource(
                        { downloadUrl: pet.avatarUrl },
                        session.accessToken,
                        activeFamily.id,
                      )}
                      style={styles.avatarImage}
                    />
                  ) : (
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{pet.name.slice(0, 1)}</Text>
                    </View>
                  )}
                  <View style={styles.profileBody}>
                    <Text style={styles.petName}>{pet.name}</Text>
                    <Text style={styles.profileMeta}>
                      {sexLabel(pet.sex)} · {pet.breed || '未填写品种'}
                    </Text>
                  </View>
                </View>
                <View style={styles.quickActions}>
                  <Pressable
                    testID="pet-detail.quick-record.button"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy }}
                    disabled={busy}
                    onPress={() =>
                      guardedNavigate(
                        () => router.push({ pathname: '/records/new', params: { petId: pet.id } }),
                        '记录',
                      )
                    }
                    style={({ pressed }) => [
                      styles.quickAction,
                      busy && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons name="create-outline" size={18} color={colors.brand} />
                    <Text style={styles.quickActionText}>记录</Text>
                  </Pressable>
                  <Pressable
                    testID="pet-detail.quick-photos.button"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy }}
                    disabled={busy}
                    onPress={() =>
                      guardedNavigate(
                        () => router.push({ pathname: '/photos', params: { petId: pet.id } }),
                        '相册',
                      )
                    }
                    style={({ pressed }) => [
                      styles.quickAction,
                      busy && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons name="images-outline" size={18} color={colors.brand} />
                    <Text style={styles.quickActionText}>相册</Text>
                  </Pressable>
                  <Pressable
                    testID="pet-detail.quick-medical.button"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy }}
                    disabled={busy}
                    onPress={() =>
                      guardedNavigate(
                        () =>
                          router.push({ pathname: '/medical-records', params: { petId: pet.id } }),
                        '医疗档案',
                      )
                    }
                    style={({ pressed }) => [
                      styles.quickAction,
                      busy && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons name="medkit-outline" size={18} color={colors.brand} />
                    <Text style={styles.quickActionText}>医疗档案</Text>
                  </Pressable>
                </View>
              </Card>

              {profile && session && activeFamily ? (
                <>
                  <CareOverview profile={profile} />
                  <WeightOverview points={profile.weight.trend} latest={profile.weight.latest} />
                  <MedicalOverview medical={profile.medical} />
                  <HealthOverview profile={profile} />
                  <RecentRecords
                    records={profile.recentRecords}
                    onRecordPress={(recordId) =>
                      guardedNavigate(
                        () => router.push({ pathname: '/records/[id]', params: { id: recordId } }),
                        '查看记录',
                      )
                    }
                  />
                  <RecentPhotos
                    photos={profile.photos}
                    accessToken={session.accessToken}
                    familyId={activeFamily.id}
                    onPhotoPress={(photoId) =>
                      guardedNavigate(
                        () => router.push({ pathname: '/photos/[id]', params: { id: photoId } }),
                        '查看照片',
                      )
                    }
                  />
                </>
              ) : pet && !error ? (
                <Card>
                  <ActivityIndicator color={colors.brand} />
                  <Body>正在加载照顾概览。</Body>
                </Card>
              ) : null}

              <Card>
                <Title>基础资料</Title>
                <Body>基础资料会用于记录归属、任务提醒和就医摘要。</Body>
                {error && keyboardVisible ? (
                  <ErrorText testID="pet-detail.error">{error}</ErrorText>
                ) : null}
                {success && keyboardVisible ? (
                  <SuccessText testID="pet-detail.success">{success}</SuccessText>
                ) : null}
                {canManage ? (
                  <>
                    <Field
                      label="猫咪名字"
                      value={name}
                      maxLength={30}
                      editable={!busy}
                      onChangeText={(value) => {
                        setName(value);
                        setError('');
                        setSuccess('');
                      }}
                    />
                    <View style={styles.field}>
                      <Text style={styles.label}>性别</Text>
                      <View style={styles.options}>
                        {(
                          [
                            ['MALE', '公猫'],
                            ['FEMALE', '母猫'],
                            ['UNKNOWN', '未知'],
                          ] as const
                        ).map(([value, label]) => (
                          <Pressable
                            key={value}
                            accessibilityRole="button"
                            accessibilityState={{ selected: sex === value, disabled: busy }}
                            disabled={busy}
                            onPress={() => {
                              setSex(value);
                              setSuccess('');
                            }}
                            style={[
                              styles.option,
                              sex === value && styles.optionActive,
                              busy && styles.disabled,
                            ]}
                          >
                            <Text
                              style={[styles.optionText, sex === value && styles.optionTextActive]}
                            >
                              {label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                    <Field
                      label="出生日期"
                      value={birthDate}
                      placeholder="YYYY-MM-DD"
                      maxLength={10}
                      editable={!busy}
                      error={!birthValid ? '请输入有效且不晚于今天的 YYYY-MM-DD 日期' : undefined}
                      onChangeText={(value) => {
                        setBirthDate(value);
                        setError('');
                        setSuccess('');
                      }}
                    />
                    <Field
                      label="品种"
                      value={breed}
                      placeholder="例如：英短"
                      maxLength={60}
                      editable={!busy}
                      onChangeText={(value) => {
                        setBreed(value);
                        setError('');
                        setSuccess('');
                      }}
                    />
                    <View style={styles.field}>
                      <Text style={styles.label}>是否绝育</Text>
                      <View style={styles.options}>
                        {[
                          [true, '已绝育'],
                          [false, '未绝育'],
                          [null, '未知'],
                        ].map(([value, label]) => (
                          <Pressable
                            key={String(value)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: neutered === value, disabled: busy }}
                            disabled={busy}
                            onPress={() => {
                              setNeutered(value as boolean | null);
                              setSuccess('');
                            }}
                            style={[
                              styles.option,
                              neutered === value && styles.optionActive,
                              busy && styles.disabled,
                            ]}
                          >
                            <Text
                              style={[
                                styles.optionText,
                                neutered === value && styles.optionTextActive,
                              ]}
                            >
                              {label as string}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                    <Field
                      label="芯片编号"
                      value={chipNumber}
                      placeholder="选填"
                      maxLength={50}
                      editable={!busy}
                      onChangeText={(value) => {
                        setChipNumber(value);
                        setError('');
                        setSuccess('');
                      }}
                    />
                    {keyboardVisible ? (
                      <>
                        <PrimaryButton
                          label="保存修改"
                          busy={busy}
                          disabled={!canSave}
                          testID="pet-detail.save.inline-button"
                          onPress={() => void save()}
                        />
                        <TextButton
                          label="删除猫咪档案"
                          danger
                          disabled={busy}
                          testID="pet-detail.delete.inline-button"
                          onPress={confirmDelete}
                        />
                        <TextButton
                          label="返回猫咪列表"
                          disabled={busy}
                          testID="pet-detail.return.inline-button"
                          onPress={requestReturn}
                        />
                      </>
                    ) : null}
                  </>
                ) : (
                  <ReadonlyFacts pet={pet} />
                )}
              </Card>
            </>
          ) : null}
        </ScrollView>
        {pet && canManage && !keyboardVisible ? (
          <View
            testID="pet-detail.footer"
            style={[
              styles.footer,
              { paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm) },
            ]}
          >
            {error ? <ErrorText testID="pet-detail.error">{error}</ErrorText> : null}
            {success ? <SuccessText testID="pet-detail.success">{success}</SuccessText> : null}
            <PrimaryButton
              label="保存修改"
              busy={busy}
              disabled={!canSave}
              testID="pet-detail.save.button"
              onPress={() => void save()}
            />
            <TextButton
              label="删除猫咪档案"
              danger
              disabled={busy}
              testID="pet-detail.delete.button"
              onPress={confirmDelete}
            />
            <TextButton
              label="返回猫咪列表"
              disabled={busy}
              testID="pet-detail.return.button"
              onPress={requestReturn}
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

function CareOverview({ profile }: { profile: PetProfileSummary }) {
  const overdue = profile.care.overdueTaskCount;
  return (
    <Card>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.eyebrow}>照顾概况</Text>
          <Title>{overdue ? `${overdue} 个任务已逾期` : '当前照顾节奏正常'}</Title>
        </View>
        <View style={[styles.statusPill, overdue ? styles.statusDanger : styles.statusSuccess]}>
          <Text style={styles.statusText}>{overdue ? '需处理' : '正常'}</Text>
        </View>
      </View>
      <View style={styles.stats}>
        <Stat label="启用计划" value={profile.care.activePlanCount} />
        <Stat label="待完成" value={profile.care.pendingTaskCount} />
        <Stat label="逾期" value={profile.care.overdueTaskCount} danger={overdue > 0} />
      </View>
    </Card>
  );
}

function WeightOverview({
  points,
  latest,
}: {
  points: PetWeightPoint[];
  latest: PetWeightPoint | null;
}) {
  const recent = points.slice(-7);
  const values = recent.map((point) => point.weightKg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (
    <View testID="pet-detail.weight.card">
      <Card>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.eyebrow}>体重趋势</Text>
            <Text testID="pet-detail.weight.latest" style={styles.weightLatest}>
              {latest ? `${latest.weightKg.toFixed(2)} kg` : '暂无体重记录'}
            </Text>
          </View>
          {latest ? <Text style={styles.sectionDate}>{formatDate(latest.occurredAt)}</Text> : null}
        </View>
        {recent.length >= 2 ? (
          <View style={styles.chart}>
            {recent.map((point) => {
              const height = 14 + ((point.weightKg - min) / Math.max(max - min, 0.1)) * 46;
              return (
                <View key={point.recordId} testID="pet-detail.weight.bar" style={styles.barSlot}>
                  <View style={[styles.bar, { height }]} />
                  <Text style={styles.barText}>{point.weightKg.toFixed(1)}</Text>
                  <Text style={styles.barDate}>{point.bucket.slice(5)}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <Body>再记录一次体重后，这里会展示按天聚合的变化趋势。</Body>
        )}
      </Card>
    </View>
  );
}

function MedicalOverview({ medical }: { medical: PetProfileSummary['medical'] }) {
  return (
    <View testID="pet-detail.medical.card">
      <Card>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.eyebrow}>医疗档案</Text>
            <Title>
              疫苗 {medical.counts.vaccines} · 驱虫 {medical.counts.deworming} · 用药{' '}
              {medical.counts.medications}
            </Title>
          </View>
        </View>
        {medical.nextDue.length ? (
          <View testID="pet-detail.medical.next-due.section" style={styles.block}>
            <Text style={styles.blockTitle}>下次日期</Text>
            {medical.nextDue.slice(0, 3).map((record) => (
              <MedicalRow
                key={record.id}
                record={record}
                mode="due"
                testID="pet-detail.medical.next-due.item"
              />
            ))}
          </View>
        ) : (
          <Body>暂时没有即将到期的疫苗、驱虫或用药事项。</Body>
        )}
        {medical.latestRecords.length ? (
          <View testID="pet-detail.medical.latest.section" style={styles.block}>
            <Text style={styles.blockTitle}>最近记录</Text>
            {medical.latestRecords.slice(0, 3).map((record) => (
              <MedicalRow
                key={record.id}
                record={record}
                mode="occurred"
                testID="pet-detail.medical.latest.item"
              />
            ))}
          </View>
        ) : null}
      </Card>
    </View>
  );
}

function MedicalRow({
  record,
  mode,
  testID,
}: {
  record: PetProfileMedicalRecordSummary;
  mode: 'due' | 'occurred';
  testID?: string;
}) {
  const date = mode === 'due' ? record.nextDueAt : record.occurredAt;
  return (
    <View testID={testID} style={styles.row}>
      <View style={styles.rowBody}>
        <Text style={styles.rowType}>{medicalLabels[record.type]}</Text>
        <Text style={styles.rowTitle}>{record.title}</Text>
        <Text style={styles.rowMeta}>
          {[record.brand, record.dose, record.provider].filter(Boolean).join(' · ') || '未填写详情'}
        </Text>
      </View>
      <Text style={styles.rowDate}>{formatDate(date)}</Text>
    </View>
  );
}

function HealthOverview({ profile }: { profile: PetProfileSummary }) {
  return (
    <Card>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.eyebrow}>健康观察</Text>
          <Title>
            {profile.health.activeEvents.length
              ? `${profile.health.activeEvents.length} 个事件跟踪中`
              : '暂无进行中的健康事件'}
          </Title>
        </View>
        <View
          style={[
            styles.statusPill,
            profile.health.abnormalRecordCount30d ? styles.statusDanger : styles.statusSuccess,
          ]}
        >
          <Text style={styles.statusText}>30 天异常 {profile.health.abnormalRecordCount30d}</Text>
        </View>
      </View>
      {profile.health.activeEvents.length ? (
        profile.health.activeEvents.map((event) => (
          <View key={event.id} style={styles.event}>
            <Text style={styles.rowTitle}>{event.title}</Text>
            <Text style={styles.rowMeta}>
              开始于 {formatDate(event.startedAt)}
              {event.summary ? ` · ${event.summary}` : ''}
            </Text>
          </View>
        ))
      ) : (
        <Body>呕吐、排便异常和用药记录会在这里形成健康线索。</Body>
      )}
    </Card>
  );
}

function RecentRecords({
  records,
  onRecordPress,
}: {
  records: PetProfileRecordSummary[];
  onRecordPress(recordId: string): void;
}) {
  return (
    <Card>
      <Text style={styles.eyebrow}>最近记录</Text>
      {records.length ? (
        records.slice(0, 5).map((record) => (
          <Pressable
            key={record.id}
            accessibilityRole="button"
            onPress={() => onRecordPress(record.id)}
            style={({ pressed }) => [styles.recordRow, pressed && styles.pressed]}
          >
            <View style={[styles.recordDot, record.abnormal && styles.recordDotDanger]} />
            <View style={styles.rowBody}>
              <Text style={styles.rowType}>{recordLabels[record.type]}</Text>
              <Text style={styles.rowTitle}>{record.title}</Text>
              <Text style={styles.rowMeta}>{recordSummary(record)}</Text>
            </View>
            <Text style={styles.rowDate}>{formatShortDateTime(record.occurredAt)}</Text>
          </Pressable>
        ))
      ) : (
        <Body>还没有饮食、体重、排便、呕吐或用药记录。</Body>
      )}
    </Card>
  );
}

function RecentPhotos({
  photos,
  accessToken,
  familyId,
  onPhotoPress,
}: {
  photos: PhotoSummary[];
  accessToken: string;
  familyId: string;
  onPhotoPress(photoId: string): void;
}) {
  return (
    <Card>
      <Text style={styles.eyebrow}>最近照片</Text>
      {photos.length ? (
        <View style={styles.photoGrid}>
          {photos.slice(0, 6).map((photo) => (
            <Pressable
              key={photo.id}
              accessibilityRole="button"
              accessibilityLabel="查看照片"
              onPress={() => onPhotoPress(photo.id)}
              style={({ pressed }) => [styles.photoTile, pressed && styles.pressed]}
            >
              <AuthenticatedImage
                source={photoThumbnailSource(photo, accessToken, familyId)}
                style={styles.photo}
                resizeMode="cover"
              />
            </Pressable>
          ))}
        </View>
      ) : (
        <Body>这只猫咪还没有绑定照片。</Body>
      )}
    </Card>
  );
}

function ReadonlyFacts({ pet }: { pet: PetDetail }) {
  return (
    <View style={styles.facts}>
      <Fact label="名字" value={pet.name} />
      <Fact label="性别" value={sexLabel(pet.sex)} />
      <Fact label="出生日期" value={pet.birthDate ? formatDate(pet.birthDate) : '未填写'} />
      <Fact label="品种" value={pet.breed || '未填写'} />
      <Fact
        label="绝育"
        value={
          pet.neutered === null || pet.neutered === undefined
            ? '未知'
            : pet.neutered
              ? '已绝育'
              : '未绝育'
        }
      />
      <Fact label="芯片编号" value={pet.chipNumber || '未填写'} />
    </View>
  );
}

function petDraftFromDetail(pet: PetDetail): PetProfileDraft {
  return {
    name: pet.name,
    sex: pet.sex ?? 'UNKNOWN',
    birthDate: pet.birthDate?.slice(0, 10) ?? '',
    breed: pet.breed ?? '',
    chipNumber: pet.chipNumber ?? '',
    neutered: pet.neutered ?? null,
  };
}

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <View style={[styles.stat, danger && styles.statDanger]}>
      <Text style={[styles.statValue, danger && styles.statValueDanger]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

function sexLabel(value?: string | null) {
  return sexLabels[value ?? 'UNKNOWN'] ?? '未知';
}

function recordSummary(record: PetProfileRecordSummary) {
  const data = record.data;
  if (record.type === 'WEIGHT') return `${textValue(data.weightKg, '—')} kg`;
  if (record.type === 'FOOD') {
    return compactText([textValue(data.foodName), textValue(data.amount), textValue(data.unit)]);
  }
  if (record.type === 'WATER') return `${textValue(data.amountMl, '—')} ml`;
  if (record.type === 'STOOL' || record.type === 'VOMIT') {
    return compactText([textValue(data.count), textValue(data.condition)]);
  }
  if (record.type === 'MEDICATION') {
    return compactText([textValue(data.drugName), textValue(data.dose)]);
  }
  return record.note || '已记录';
}

function textValue(value: unknown, fallback = '') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function compactText(parts: string[]) {
  return parts.filter(Boolean).join(' ') || '已记录';
}

function formatDate(value?: string | null) {
  if (!value) return '未填写';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间异常';
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function formatShortDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间异常';
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  scroll: { flex: 1 },
  content: { gap: spacing.lg, paddingBottom: spacing.xl },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '700', color: colors.brand },
  avatarImage: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.brandSoft },
  profileBody: { flex: 1 },
  petName: { ...typography.h1, color: colors.ink },
  profileMeta: { ...typography.secondary, color: colors.textSecondary, marginTop: spacing.xs },
  quickActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  quickAction: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.brandSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  quickActionText: { ...typography.caption, color: colors.brand, fontWeight: '700' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  eyebrow: { ...typography.caption, color: colors.brand, fontWeight: '700', marginBottom: 2 },
  weightLatest: { ...typography.h2, color: colors.ink },
  sectionDate: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm },
  statusPill: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  statusSuccess: { backgroundColor: colors.successSoft },
  statusDanger: { backgroundColor: colors.dangerSoft },
  statusText: { ...typography.caption, color: colors.ink, fontWeight: '700' },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1,
    borderRadius: radii.input,
    padding: spacing.md,
    backgroundColor: colors.page,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statDanger: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  statValue: { ...typography.h2, color: colors.ink },
  statValueDanger: { color: colors.dangerDark },
  statLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  chart: { height: 100, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  barSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: '72%', minHeight: 14, borderRadius: 6, backgroundColor: colors.brand },
  barText: { fontSize: 10, color: colors.ink, fontWeight: '700' },
  barDate: { fontSize: 9, color: colors.textTertiary },
  block: { gap: spacing.sm },
  blockTitle: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowBody: { flex: 1, gap: 2 },
  rowType: { ...typography.caption, color: colors.brand, fontWeight: '700' },
  rowTitle: { ...typography.h3, color: colors.ink },
  rowMeta: { ...typography.caption, color: colors.textSecondary },
  rowDate: { ...typography.caption, color: colors.textTertiary, textAlign: 'right' },
  event: {
    padding: spacing.md,
    borderRadius: radii.input,
    backgroundColor: colors.warningSoft,
    gap: 2,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 62,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  recordDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand },
  recordDotDanger: { backgroundColor: colors.danger },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoTile: {
    width: '31.8%',
    aspectRatio: 1,
    borderRadius: radii.input,
    overflow: 'hidden',
    backgroundColor: colors.brandSoft,
    ...shadows.small,
  },
  photo: { width: '100%', height: '100%' },
  facts: { gap: spacing.sm },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  factLabel: { ...typography.caption, color: colors.textSecondary },
  factValue: { ...typography.secondary, color: colors.ink, fontWeight: '600' },
  field: { gap: spacing.sm, marginTop: spacing.sm },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink },
  options: { flexDirection: 'row', gap: spacing.sm },
  option: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.selector,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionActive: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  optionText: { ...typography.secondary, color: colors.textSecondary },
  optionTextActive: { color: colors.brand, fontWeight: '600' },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.page,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
});
