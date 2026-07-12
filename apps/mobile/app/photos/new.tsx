import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { authApi, type PetSummary } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import {
  discardPhotoUpload,
  enqueuePhotoUpload,
  listPhotoUploads,
  processPhotoUpload,
  type PhotoUploadQueueItem,
} from '../../src/features/photos/photo-upload-queue';
import {
  ErrorText,
  Field,
  PrimaryButton,
  Screen,
  TextButton,
} from '../../src/shared/ui/primitives';

type UploadItem = {
  id: string;
  uri: string;
  name: string;
  width: number;
  height: number;
  state: 'READY' | 'UPLOADING' | 'DONE' | 'FAILED';
  progress: number;
  error?: string;
  queued?: PhotoUploadQueueItem;
};

export default function NewPhotoRoute() {
  const router = useRouter();
  const { session, activeFamily } = useSession();
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [petIds, setPetIds] = useState<string[]>([]);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!session || !activeFamily) return;
    void Promise.all([
      authApi.listPets(session.accessToken, activeFamily.id),
      listPhotoUploads(activeFamily.id),
    ])
      .then(([rows, queued]) => {
        setPets(rows);
        if (queued[0]) {
          setPetIds(queued[0].petIds);
          setNote(queued[0].note);
          setItems(
            queued.map((item) => ({
              id: item.id,
              uri: item.fileUri,
              name: item.fileName,
              width: item.width,
              height: item.height,
              state: 'FAILED' as const,
              progress: 0,
              error: item.lastError ?? '等待恢复上传',
              queued: item,
            })),
          );
        } else if (rows[0]) setPetIds([rows[0].id]);
      })
      .catch(() => setError('照片上传队列加载失败'));
  }, [activeFamily, session]);
  function addAssets(assets: ImagePicker.ImagePickerAsset[]) {
    setItems((current) => [
      ...current,
      ...assets.slice(0, 9 - current.length).map((asset) => ({
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
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('需要相册权限才能选择照片');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, 9 - items.length),
      quality: 1,
    });
    if (!result.canceled) addAssets(result.assets);
  }
  async function takePhoto() {
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
    if (!session || !activeFamily) return false;
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
      await processPhotoUpload(session.accessToken, queued, (progress) =>
        update(item.id, { progress }),
      );
      update(item.id, { state: 'DONE', progress: 100 });
      return true;
    } catch (cause) {
      update(item.id, {
        state: 'FAILED',
        error: cause instanceof Error ? cause.message : '上传失败',
      });
      return false;
    }
  }
  async function removeItem(item: UploadItem) {
    if (item.queued) await discardPhotoUpload(item.queued);
    setItems((current) => current.filter((entry) => entry.id !== item.id));
  }
  async function upload() {
    if (!items.length || !petIds.length || busy) return;
    setBusy(true);
    setError('');
    const pending = items.filter((item) => item.state !== 'DONE');
    const results = [];
    for (const item of pending) results.push(await uploadOne(item));
    setBusy(false);
    if (results.length && results.every(Boolean)) router.replace('/photos');
    else setError('部分照片没有上传成功，可以点击重试失败项。');
  }
  function togglePet(id: string) {
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
      <View style={styles.nav}>
        <Pressable
          accessibilityLabel="关闭"
          disabled={busy}
          onPress={() => router.back()}
          style={styles.navButton}
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
            onPress={() => void chooseLibrary()}
          />
          <PickerButton icon="camera-outline" label="拍一张" onPress={() => void takePhoto()} />
        </View>
        {items.length ? (
          <View style={styles.previews}>
            {items.map((item) => (
              <View key={item.id} style={styles.preview}>
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
            ))}
          </View>
        ) : null}
        <View style={styles.section}>
          <Text style={styles.label}>照片里有谁</Text>
          <Text style={styles.hint}>可以同时绑定多只猫咪</Text>
          <View style={styles.chips}>
            {pets.map((pet) => (
              <Pressable
                key={pet.id}
                accessibilityRole="button"
                accessibilityState={{ selected: petIds.includes(pet.id) }}
                onPress={() => togglePet(pet.id)}
                style={[styles.chip, petIds.includes(pet.id) && styles.chipActive]}
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
        />
        {error ? <ErrorText>{error}</ErrorText> : null}
        <PrimaryButton
          label={
            items.some((item) => item.state === 'FAILED')
              ? '重试失败照片'
              : `上传 ${items.length || ''} 张照片`
          }
          disabled={!items.length || !petIds.length}
          busy={busy}
          onPress={() => void upload()}
        />
        <TextButton label="取消" disabled={busy} onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}
function PickerButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress(): void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.picker}>
      <View style={styles.pickerIcon}>
        <Ionicons name={icon} size={22} color={colors.brand} />
      </View>
      <Text style={styles.pickerText}>{label}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  nav: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  navButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h2, color: colors.ink },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  content: { gap: spacing.xl, paddingBottom: 110 },
  pickerRow: { flexDirection: 'row', gap: spacing.md },
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
  pickerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerText: { ...typography.caption, color: colors.ink, fontWeight: '700' },
  previews: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  preview: {
    width: '31.5%',
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
  section: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.lg,
  },
  label: { ...typography.h3, color: colors.ink },
  hint: { ...typography.caption, color: colors.textSecondary },
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
  chipText: { ...typography.caption, color: colors.brand, fontWeight: '700' },
  chipTextActive: { color: colors.surface },
});
