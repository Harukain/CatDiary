import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { authApi, type PetSummary, type PhotoSummary } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import {
  enqueueOfflineOperation,
  isNetworkFailure,
} from '../../src/features/offline/offline-queue';
import {
  discardPhotoUpload,
  enqueuePhotoUpload,
  listPhotoUploads,
  processPhotoUpload,
  type PhotoUploadQueueItem,
} from '../../src/features/photos/photo-upload-queue';
import {
  buildGroupedPhotoRecordInputs,
  isPhotoUploadDraftDirty,
  photoUploadPreviewStatus,
  photoUploadSubmitBlockMessage,
  remainingPhotoSlots,
  resolveInitialPhotoPetIds,
  resolvePhotoUploadSubmitState,
  restorePhotoUploadQueueOwnership,
} from '../../src/features/photos/photo-form';
import { resolvePhotoRecordReadiness } from '../../src/features/photos/photo-record';
import {
  ErrorText,
  Field,
  PrimaryButton,
  Screen,
  TextButton,
} from '../../src/shared/ui/primitives';
import { resolveDraftExitDecision } from '../../src/shared/navigation/draft-exit';

type UploadItem = {
  id: string;
  uri: string;
  name: string;
  width: number;
  height: number;
  state: 'READY' | 'UPLOADING' | 'DONE' | 'FAILED';
  progress: number;
  error?: string;
  photo?: PhotoSummary;
  queued?: PhotoUploadQueueItem;
};

export default function NewPhotoRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ pet?: string; petId?: string }>();
  const { session, activeFamily } = useSession();
  const routePetId = paramValue(params.petId) ?? paramValue(params.pet);
  const allowLeave = useRef(false);
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [petsLoading, setPetsLoading] = useState(true);
  const [petLoadError, setPetLoadError] = useState('');
  const [petIds, setPetIds] = useState<string[]>([]);
  const [initialPetIds, setInitialPetIds] = useState<string[]>([]);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [restoreOwnershipWarning, setRestoreOwnershipWarning] = useState('');
  const slotsLeft = remainingPhotoSlots(items.length);
  const photoLimitReached = slotsLeft === 0;
  const restoredQueueCount = items.filter((item) => item.queued).length;
  const invalidRestoredPhotoCount = items.filter(
    (item) => item.queued && !item.queued.petIds.length,
  ).length;
  const loadPhotoContext = useCallback(() => {
    if (!session || !activeFamily) return;
    setPetsLoading(true);
    setPetLoadError('');
    setRestoreOwnershipWarning('');
    void Promise.all([
      authApi.listPets(session.accessToken, activeFamily.id),
      listPhotoUploads(activeFamily.id),
    ])
      .then(([rows, queued]) => {
        setPets(rows);
        if (queued[0]) {
          const restoredQueue = restorePhotoUploadQueueOwnership({
            items: queued,
            pets: rows,
            requestedPetId: routePetId,
          });
          const nextPetIds = restoredQueue.initialPetIds;
          const adjustedOnlyCount = Math.max(
            0,
            restoredQueue.trimmedItemCount - restoredQueue.invalidItemCount,
          );
          setPetIds(nextPetIds);
          setInitialPetIds(nextPetIds);
          setRestoreOwnershipWarning(
            adjustedOnlyCount
              ? `${adjustedOnlyCount} 张已恢复照片中已移除当前家庭不可用的猫咪归属。`
              : '',
          );
          setNote(restoredQueue.items.find((item) => item.petIds.length)?.note ?? queued[0].note);
          setItems(
            restoredQueue.items.map((item) => {
              const ownershipError = item.petIds.length
                ? undefined
                : '原绑定猫咪已不可用，请移除后重新选择照片。';
              return {
                id: item.id,
                uri: item.fileUri,
                name: item.fileName,
                width: item.width,
                height: item.height,
                state: 'FAILED' as const,
                progress: 0,
                error: ownershipError ?? item.lastError ?? '等待恢复上传',
                queued: item,
              };
            }),
          );
        } else {
          const nextPetIds = resolveInitialPhotoPetIds(rows, routePetId);
          setPetIds(nextPetIds);
          setInitialPetIds(nextPetIds);
        }
      })
      .catch((cause) => {
        setPets([]);
        setPetIds([]);
        setInitialPetIds([]);
        setRestoreOwnershipWarning('');
        setPetLoadError(cause instanceof Error ? cause.message : '照片归属加载失败');
      })
      .finally(() => setPetsLoading(false));
  }, [activeFamily, routePetId, session]);
  useEffect(() => {
    loadPhotoContext();
  }, [loadPhotoContext]);
  const submitState = useMemo(
    () =>
      resolvePhotoUploadSubmitState({
        itemCount: items.length,
        selectedPetCount: petIds.length,
        petCount: pets.length,
        petsLoading,
        petLoadError,
        invalidRestoredPhotoCount,
      }),
    [
      invalidRestoredPhotoCount,
      items.length,
      petIds.length,
      petLoadError,
      pets.length,
      petsLoading,
    ],
  );
  const canUpload = submitState.canSubmit;
  const fieldsDisabled =
    busy || petsLoading || Boolean(petLoadError) || submitState.reason === 'NO_PETS';
  const canPickPhotos = !fieldsDisabled && !photoLimitReached;
  const isDirty = useMemo(
    () =>
      isPhotoUploadDraftDirty({
        itemCount: items.length,
        note,
        petIds,
        initialPetIds,
      }),
    [initialPetIds, items.length, note, petIds],
  );
  const requestClose = useCallback(() => {
    const decision = resolveDraftExitDecision({
      busy,
      isDirty,
      allowLeave: allowLeave.current,
    });
    if (decision === 'wait') {
      Alert.alert(
        '照片正在处理',
        '请等待当前照片上传或保存完成，避免照片归属与时间线状态不一致。',
        [{ text: '继续等待', style: 'cancel' }],
      );
      return;
    }
    if (decision === 'continue') return router.back();
    Alert.alert('放弃未保存的照片？', '当前选择的照片和备注尚未完成保存，离开后需要重新选择。', [
      { text: '继续编辑', style: 'cancel' },
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
  function addAssets(assets: ImagePicker.ImagePickerAsset[]) {
    setItems((current) => [
      ...current,
      ...assets.slice(0, remainingPhotoSlots(current.length)).map((asset) => ({
        id: `${Date.now()}-${Math.random()}`,
        uri: asset.uri,
        name: asset.fileName ?? `cat-${Date.now()}.jpg`,
        width: asset.width,
        height: asset.height,
        state: 'READY' as const,
        progress: 0,
      })),
    ]);
  }
  async function chooseLibrary() {
    if (petsLoading || petLoadError || !pets.length) {
      setError(photoUploadSubmitBlockMessage(submitState.reason));
      return;
    }
    if (!slotsLeft) {
      setError('最多选择 9 张照片，先移除一张再继续添加。');
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('需要相册权限才能选择照片');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: slotsLeft,
      quality: 1,
    });
    if (!result.canceled) {
      if (result.assets.length > slotsLeft) {
        setError(`本次最多还能添加 ${slotsLeft} 张，已自动保留前 ${slotsLeft} 张。`);
      }
      addAssets(result.assets);
    }
  }
  async function takePhoto() {
    if (petsLoading || petLoadError || !pets.length) {
      setError(photoUploadSubmitBlockMessage(submitState.reason));
      return;
    }
    if (!slotsLeft) {
      setError('最多选择 9 张照片，先移除一张再继续拍摄。');
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('需要相机权限才能拍照');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (!result.canceled) addAssets(result.assets);
  }
  function update(id: string, patch: Partial<UploadItem>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }
  async function uploadOne(item: UploadItem) {
    if (!session || !activeFamily) return null;
    try {
      update(item.id, { state: 'UPLOADING', progress: 10, error: undefined });
      let queued = item.queued;
      if (!queued) {
        const context = ImageManipulator.manipulate(item.uri);
        if (item.width > 2048) context.resize({ width: 2048 });
        const rendered = await context.renderAsync();
        const compressed = await rendered.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
        const originalBlob = await (await fetch(compressed.uri)).blob();
        if (originalBlob.size > 10 * 1024 * 1024) throw new Error('压缩后仍超过 10MB');
        const thumbnailContext = ImageManipulator.manipulate(compressed.uri);
        if (compressed.width > 512) thumbnailContext.resize({ width: 512 });
        const thumbnailRendered = await thumbnailContext.renderAsync();
        const thumbnail = await thumbnailRendered.saveAsync({
          compress: 0.72,
          format: SaveFormat.JPEG,
        });
        queued = await enqueuePhotoUpload({
          familyId: activeFamily.id,
          fileUri: compressed.uri,
          thumbnailUri: thumbnail.uri,
          fileName: item.name.replace(/\.[^.]+$/, '.jpg'),
          width: compressed.width,
          height: compressed.height,
          petIds,
          note: note.trim(),
        });
        update(item.id, { queued, uri: queued.fileUri, progress: 20 });
      }
      const photo = await processPhotoUpload(session.accessToken, queued, (progress) =>
        update(item.id, { progress }),
      );
      update(item.id, { state: 'DONE', progress: 100, photo });
      return photo;
    } catch (cause) {
      update(item.id, {
        state: 'FAILED',
        error: cause instanceof Error ? cause.message : '上传失败',
      });
      return null;
    }
  }
  async function removeItem(item: UploadItem) {
    if (item.queued) await discardPhotoUpload(item.queued);
    setItems((current) => current.filter((entry) => entry.id !== item.id));
  }
  async function upload() {
    if (busy) return;
    if (!canUpload) {
      setError(photoUploadSubmitBlockMessage(submitState.reason));
      return;
    }
    setBusy(true);
    setError('');
    const pending = items.filter((item) => item.state !== 'DONE');
    const results: Array<PhotoSummary | null> = [];
    for (const item of pending) results.push(await uploadOne(item));
    const recordReadiness = resolvePhotoRecordReadiness({
      existingItems: items,
      uploadResults: results,
      pendingCount: pending.length,
    });
    if (recordReadiness.ready) {
      const recordInputs = buildGroupedPhotoRecordInputs({
        clientIdFactory: uuid,
        photos: recordReadiness.photos,
        fallbackPetIds: petIds,
        fallbackNote: note,
        occurredAt: new Date().toISOString(),
      });
      if (!recordInputs.length) {
        setBusy(false);
        setError('照片已上传，但没有可用于生成时间线记录的猫咪归属。请重新选择照片里的猫咪。');
        return;
      }
      if (session && activeFamily) {
        let offlineRecordCount = 0;
        for (const recordInput of recordInputs) {
          const operation = authApi.createRecordOperation(activeFamily.id, recordInput);
          try {
            await authApi.createRecord(session.accessToken, activeFamily.id, recordInput);
          } catch (cause) {
            if (isNetworkFailure(cause)) {
              await enqueueOfflineOperation(operation);
              offlineRecordCount += 1;
            } else {
              setError(cause instanceof Error ? cause.message : '照片已上传，但记录时间线生成失败');
              setBusy(false);
              return;
            }
          }
        }
        if (offlineRecordCount)
          Alert.alert(
            '照片已上传',
            `${offlineRecordCount} 条照片记录已保存到本机，联网后会进入时间线。`,
          );
      }
      setBusy(false);
      allowLeave.current = true;
      router.replace({ pathname: '/photos', params: petIds[0] ? { petId: petIds[0] } : undefined });
    } else {
      setBusy(false);
      setError(
        recordReadiness.reason === 'NO_PHOTOS'
          ? '请先选择照片。'
          : '部分照片没有上传成功，可以点击重试失败项。',
      );
    }
  }
  function togglePet(id: string) {
    if (fieldsDisabled) return;
    setPetIds((current) =>
      current.includes(id)
        ? current.length > 1
          ? current.filter((value) => value !== id)
          : current
        : [...current, id],
    );
  }
  return (
    <Screen>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭"
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
        <View>
          <Text style={styles.title}>添加照片</Text>
          <Text style={styles.subtitle}>最多选择 9 张，上传前会自动压缩</Text>
        </View>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.pickerRow}>
          <PickerButton
            icon="images-outline"
            label="从相册选择"
            disabled={!canPickPhotos}
            onPress={() => void chooseLibrary()}
          />
          <PickerButton
            icon="camera-outline"
            label="拍一张"
            disabled={!canPickPhotos}
            onPress={() => void takePhoto()}
          />
        </View>
        <Text style={[styles.limitHint, photoLimitReached && styles.limitHintFull]}>
          {petsLoading
            ? '正在确认照片归属'
            : petLoadError
              ? '照片归属加载失败，请先重试'
              : !pets.length
                ? '请先添加猫咪档案，再上传照片'
                : photoLimitReached
                  ? '已达到 9 张上限，移除一张后可继续添加'
                  : `还能添加 ${slotsLeft} 张`}
        </Text>
        {restoredQueueCount ? (
          <View style={styles.restoreNotice}>
            <Ionicons
              name={invalidRestoredPhotoCount ? 'alert-circle-outline' : 'cloud-upload-outline'}
              size={18}
              color={colors.warningDark}
            />
            <Text style={styles.restoreNoticeText}>
              {invalidRestoredPhotoCount
                ? `已恢复 ${restoredQueueCount} 张上次未完成的照片，其中 ${invalidRestoredPhotoCount} 张原绑定猫咪已不可用，请先移除后重新选择。`
                : restoreOwnershipWarning
                  ? `已恢复 ${restoredQueueCount} 张上次未完成的照片；${restoreOwnershipWarning}重试时会沿用每张照片当前有效的猫咪归属和备注。`
                  : `已恢复 ${restoredQueueCount} 张上次未完成的照片；重试时会沿用每张照片原本保存的猫咪归属和备注。`}
            </Text>
          </View>
        ) : null}
        {items.length ? (
          <View style={styles.previews}>
            {items.map((item) => {
              const status = photoUploadPreviewStatus({
                state: item.state,
                progress: item.progress,
                error: item.error,
                queued: Boolean(item.queued),
              });
              const shouldShowStatus = item.state !== 'READY' || Boolean(item.error);
              return (
                <View key={item.id} style={styles.previewCard}>
                  <View
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={status.accessibilityLabel}
                    style={styles.preview}
                  >
                    <Image source={{ uri: item.uri }} style={styles.previewImage} />
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressBar, { width: `${item.progress}%` }]} />
                    </View>
                    {item.state === 'FAILED' ? (
                      <View style={styles.failed}>
                        <Ionicons name="alert-circle" size={16} color={colors.surface} />
                      </View>
                    ) : null}
                    {(item.state === 'READY' || item.state === 'FAILED') && !busy ? (
                      <Pressable
                        accessibilityLabel="移除照片"
                        onPress={() => void removeItem(item)}
                        style={styles.remove}
                      >
                        <Ionicons name="close" size={15} color={colors.surface} />
                      </Pressable>
                    ) : null}
                  </View>
                  {shouldShowStatus ? (
                    <Text
                      numberOfLines={2}
                      style={[
                        styles.previewStatus,
                        status.tone === 'brand' && styles.previewStatusBrand,
                        status.tone === 'success' && styles.previewStatusSuccess,
                        status.tone === 'danger' && styles.previewStatusDanger,
                      ]}
                    >
                      {status.text}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}
        <View style={styles.section}>
          <Text style={styles.label}>照片里有谁</Text>
          <Text style={styles.hint}>可以同时绑定多只猫咪</Text>
          {petsLoading ? (
            <View style={styles.inlineState}>
              <ActivityIndicator color={colors.brand} />
              <Text style={styles.inlineStateText}>正在确认可绑定的猫咪档案</Text>
            </View>
          ) : petLoadError ? (
            <View style={styles.inlineState}>
              <ErrorText>{petLoadError}</ErrorText>
              <TextButton label="重新加载猫咪" disabled={busy} onPress={loadPhotoContext} />
            </View>
          ) : !pets.length ? (
            <View style={styles.inlineState}>
              <Text style={styles.inlineStateTitle}>还没有可绑定的猫咪档案</Text>
              <Text style={styles.inlineStateText}>
                照片必须至少绑定一只猫咪，添加猫咪后再上传照片。
              </Text>
            </View>
          ) : null}
          <View style={styles.chips}>
            {pets.map((pet) => (
              <Pressable
                key={pet.id}
                accessibilityRole="button"
                accessibilityState={{
                  selected: petIds.includes(pet.id),
                  disabled: fieldsDisabled,
                }}
                disabled={fieldsDisabled}
                onPress={() => togglePet(pet.id)}
                style={[
                  styles.chip,
                  petIds.includes(pet.id) && styles.chipActive,
                  fieldsDisabled && styles.chipDisabled,
                ]}
              >
                <Ionicons
                  name={petIds.includes(pet.id) ? 'checkmark-circle' : 'ellipse-outline'}
                  size={17}
                  color={petIds.includes(pet.id) ? colors.surface : colors.brand}
                />
                <Text style={[styles.chipText, petIds.includes(pet.id) && styles.chipTextActive]}>
                  {pet.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Field
          label="照片备注"
          value={note}
          onChangeText={setNote}
          placeholder="例如：一起晒太阳的下午"
          maxLength={500}
          multiline
          editable={!fieldsDisabled}
        />
        {error ? <ErrorText>{error}</ErrorText> : null}
        <PrimaryButton
          label={
            items.some((item) => item.state === 'FAILED')
              ? '重试失败照片'
              : `上传 ${items.length || ''} 张照片`
          }
          disabled={!canUpload}
          busy={busy}
          onPress={() => void upload()}
        />
        <TextButton label="取消" disabled={busy} onPress={requestClose} />
      </ScrollView>
    </Screen>
  );
}
function paramValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = (Math.random() * 16) | 0;
    return (char === 'x' ? value : (value & 3) | 8).toString(16);
  });
}
function PickerButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled?: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.picker,
        disabled && styles.pickerDisabled,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.pickerIcon}>
        <Ionicons name={icon} size={22} color={disabled ? colors.textTertiary : colors.brand} />
      </View>
      <Text style={[styles.pickerText, disabled && styles.pickerTextDisabled]}>{label}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  nav: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  navButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  navButtonDisabled: { opacity: 0.45 },
  title: { ...typography.h2, color: colors.ink },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  content: { gap: spacing.xl, paddingBottom: 110 },
  pickerRow: { flexDirection: 'row', gap: spacing.md },
  limitHint: { ...typography.caption, color: colors.textSecondary, marginTop: -spacing.md },
  limitHintFull: { color: colors.warningDark },
  restoreNotice: {
    minHeight: 48,
    borderRadius: radii.input,
    backgroundColor: colors.warningSoft,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  restoreNoticeText: { flex: 1, ...typography.caption, color: colors.warningDark },
  picker: {
    flex: 1,
    minHeight: 100,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  pickerDisabled: { opacity: 0.55 },
  pickerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerText: { ...typography.caption, color: colors.ink, fontWeight: '700' },
  pickerTextDisabled: { color: colors.textSecondary },
  previews: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  previewCard: { width: '31.5%', gap: spacing.xs },
  preview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radii.input,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: colors.brandSoft,
  },
  previewImage: { width: '100%', height: '100%' },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
    backgroundColor: 'rgba(255,255,255,.5)',
  },
  progressBar: { height: 4, backgroundColor: colors.brand },
  remove: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(32,29,27,.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  failed: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(172,65,57,.5)',
  },
  previewStatus: { ...typography.caption, color: colors.textSecondary },
  previewStatusBrand: { color: colors.brand },
  previewStatusSuccess: { color: colors.successDark },
  previewStatusDanger: { color: colors.dangerDark },
  section: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.lg,
  },
  label: { ...typography.h3, color: colors.ink },
  hint: { ...typography.caption, color: colors.textSecondary },
  inlineState: {
    borderRadius: radii.input,
    backgroundColor: colors.brandSoft,
    padding: spacing.md,
    gap: spacing.sm,
  },
  inlineStateTitle: { ...typography.h3, color: colors.ink },
  inlineStateText: { ...typography.caption, color: colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 38,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
    backgroundColor: colors.brandSoft,
  },
  chipActive: { backgroundColor: colors.brand },
  chipDisabled: { opacity: 0.55 },
  chipText: { ...typography.caption, color: colors.brand, fontWeight: '700' },
  chipTextActive: { color: colors.surface },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
