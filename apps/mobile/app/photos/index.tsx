import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, shadows, spacing, typography } from '@cat-diary/design-tokens';
import { authApi, type PetSummary, type PhotoSummary } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import {
  photoAlbumGridLayout,
  resolvePhotoFilterPetId,
} from '../../src/features/photos/photo-form';
import { AuthenticatedImage } from '../../src/features/photos/authenticated-image';
import { photoThumbnailSource } from '../../src/features/photos/photo-source';
import {
  Body,
  Card,
  ErrorText,
  PrimaryButton,
  Screen,
  TextButton,
  Title,
} from '../../src/shared/ui/primitives';

export default function PhotosRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ pet?: string; petId?: string }>();
  const { width: screenWidth } = useWindowDimensions();
  const { restoring, session, activeFamily } = useSession();
  const routePetId = useMemo(
    () => paramValue(params.petId) ?? paramValue(params.pet),
    [params.pet, params.petId],
  );
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [photos, setPhotos] = useState<PhotoSummary[]>([]);
  const [petId, setPetId] = useState(routePetId ?? '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const contextUnavailable = !restoring && (!session || !activeFamily);
  const canUpload = !!session && !!activeFamily && !loading;
  const gridLayout = useMemo(
    () =>
      photoAlbumGridLayout({
        screenWidth,
        horizontalPadding: spacing.xl,
        gap: spacing.md,
      }),
    [screenWidth],
  );
  const load = useCallback(async () => {
    if (restoring) return;
    if (!session || !activeFamily) {
      setPets([]);
      setPhotos([]);
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const petRows = await authApi.listPets(session.accessToken, activeFamily.id);
      const effectivePetId = resolvePhotoFilterPetId(petRows, petId);
      if (effectivePetId !== petId) setPetId(effectivePetId);
      const result = await authApi.listPhotos(
        session.accessToken,
        activeFamily.id,
        effectivePetId || undefined,
      );
      setPets(petRows);
      setPhotos(result.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '相册加载失败');
    } finally {
      setLoading(false);
    }
  }, [activeFamily, petId, restoring, session]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  function openUpload() {
    if (!canUpload) return;
    router.push({ pathname: '/photos/new', params: petId ? { petId } : undefined });
  }

  return (
    <Screen>
      <View style={styles.flex}>
        <View style={styles.nav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
          <View style={styles.headingCopy}>
            <Text testID="photos.title" style={styles.title}>
              猫咪相册
            </Text>
            <Text style={styles.subtitle}>把一起生活的小片段收好</Text>
          </View>
          <View style={styles.navButton} />
        </View>
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
          >
            <Filter
              label="全部"
              active={!petId}
              disabled={loading || contextUnavailable}
              testID="photos.filter.all"
              onPress={() => setPetId('')}
            />
            {pets.map((pet) => (
              <Filter
                key={pet.id}
                label={pet.name}
                active={petId === pet.id}
                disabled={loading || contextUnavailable}
                testID="photos.filter.pet"
                onPress={() => setPetId(pet.id)}
              />
            ))}
          </ScrollView>
          {restoring || loading ? (
            <View testID="photos.loading" style={styles.stateCard}>
              <ActivityIndicator color={colors.brand} />
              <Body>正在整理相册。</Body>
            </View>
          ) : contextUnavailable ? (
            <Card testID="photos.context-empty">
              <Title>缺少家庭上下文</Title>
              <Body>请返回首页确认当前账号和家庭，再重新进入相册。</Body>
            </Card>
          ) : error ? (
            <Card testID="photos.error.card">
              <ErrorText testID="photos.error.text">{error}</ErrorText>
              <Body>可以重新加载相册。已上传的照片不会因为本次加载失败而丢失。</Body>
            </Card>
          ) : session && activeFamily && photos.length ? (
            <View style={styles.grid}>
              {photos.map((photo, index) => (
                <Pressable
                  key={photo.id}
                  testID="photos.item"
                  accessibilityRole="button"
                  accessibilityLabel={`${photo.pets.map((entry) => entry.pet.name).join('、')}的照片`}
                  onPress={() =>
                    router.push({ pathname: '/photos/[id]', params: { id: photo.id } })
                  }
                  style={({ pressed }) => [
                    styles.tile,
                    { width: gridLayout.columnWidth },
                    index % 5 === 0 && styles.tileWide,
                    index % 5 === 0 && { width: gridLayout.contentWidth },
                    pressed && styles.pressed,
                  ]}
                >
                  <AuthenticatedImage
                    source={photoThumbnailSource(photo, session.accessToken, activeFamily.id)}
                    style={styles.image}
                    resizeMode="cover"
                  />
                  <View style={styles.caption}>
                    <Text numberOfLines={1} style={styles.petNames}>
                      {photo.pets.map((entry) => entry.pet.name).join(' · ')}
                    </Text>
                    {photo.note ? (
                      <Text numberOfLines={1} style={styles.note}>
                        {photo.note}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="images-outline" size={30} color={colors.brand} />
              </View>
              <Text style={styles.emptyTitle}>还没有照片</Text>
              <Body>
                {petId ? '这只猫咪还没有绑定照片。' : '上传第一张照片，开始记录你们的生活。'}
              </Body>
            </View>
          )}
        </ScrollView>
        <View
          testID="photos.footer"
          style={[
            styles.footer,
            { paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm) },
          ]}
        >
          {error && !contextUnavailable ? (
            <PrimaryButton
              label="重新加载相册"
              testID="photos.reload.button"
              busy={loading}
              onPress={() => void load()}
            />
          ) : (
            <PrimaryButton
              label="上传照片"
              testID="photos.upload.button"
              disabled={!canUpload}
              onPress={openUpload}
            />
          )}
          <TextButton
            label="返回上一页"
            testID="photos.return.button"
            onPress={() => router.back()}
          />
        </View>
      </View>
    </Screen>
  );
}

function Filter({
  label,
  active,
  disabled,
  testID,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  testID?: string;
  onPress(): void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.filter, active && styles.filterActive, disabled && styles.disabled]}
    >
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
    </Pressable>
  );
}
function paramValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  nav: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  navButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headingCopy: { flex: 1 },
  title: { ...typography.h2, color: colors.ink },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  scroll: { flex: 1 },
  content: { paddingBottom: spacing.xl, gap: spacing.lg },
  filters: { gap: spacing.sm, paddingVertical: spacing.sm },
  filter: {
    minHeight: 38,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  filterTextActive: { color: colors.surface },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    aspectRatio: 0.82,
    borderRadius: radii.card,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  tileWide: { aspectRatio: 1.6 },
  image: { width: '100%', flex: 1, backgroundColor: colors.brandSoft },
  caption: { padding: spacing.md, gap: spacing.xs },
  petNames: { ...typography.caption, color: colors.ink, fontWeight: '700' },
  note: { fontSize: 12, color: colors.textSecondary },
  stateCard: {
    padding: spacing.xl,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    alignItems: 'center',
    gap: spacing.md,
  },
  empty: {
    marginTop: spacing.huge,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.surface,
    padding: spacing.xxl,
    borderRadius: radii.card,
    gap: spacing.md,
    alignItems: 'center',
    ...shadows.card,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { ...typography.h2, color: colors.ink },
  footer: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.page,
    gap: spacing.xs,
  },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
