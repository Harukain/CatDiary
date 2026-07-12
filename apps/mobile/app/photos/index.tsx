import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, shadows, spacing, typography } from '@cat-diary/design-tokens';
import { authApi, type PetSummary, type PhotoSummary } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import { photoThumbnailSource } from '../../src/features/photos/photo-source';
import { Body, ErrorText, PrimaryButton, Screen } from '../../src/shared/ui/primitives';

export default function PhotosRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ petId?: string }>();
  const { session, activeFamily } = useSession();
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [photos, setPhotos] = useState<PhotoSummary[]>([]);
  const [petId, setPetId] = useState(params.petId ?? '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!session || !activeFamily) return;
    setLoading(true);
    setError('');
    try {
      const [petRows, result] = await Promise.all([
        authApi.listPets(session.accessToken, activeFamily.id),
        authApi.listPhotos(session.accessToken, activeFamily.id, petId || undefined),
      ]);
      setPets(petRows);
      setPhotos(result.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '相册加载失败');
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
      <View style={styles.nav}>
        <Pressable accessibilityLabel="返回" onPress={() => router.back()} style={styles.navButton}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <View>
          <Text style={styles.title}>猫咪相册</Text>
          <Text style={styles.subtitle}>把一起生活的小片段收好</Text>
        </View>
        <Pressable
          accessibilityLabel="上传照片"
          onPress={() => router.push('/photos/new')}
          style={styles.add}
        >
          <Ionicons name="add" size={23} color={colors.surface} />
        </Pressable>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          <Filter label="全部" active={!petId} onPress={() => setPetId('')} />
          {pets.map((pet) => (
            <Filter
              key={pet.id}
              label={pet.name}
              active={petId === pet.id}
              onPress={() => setPetId(pet.id)}
            />
          ))}
        </ScrollView>
        {loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : error ? (
          <ErrorText>{error}</ErrorText>
        ) : photos.length ? (
          <View style={styles.grid}>
            {photos.map((photo, index) => (
              <Pressable
                key={photo.id}
                accessibilityRole="button"
                accessibilityLabel={`${photo.pets.map((entry) => entry.pet.name).join('、')}的照片`}
                onPress={() => router.push({ pathname: '/photos/[id]', params: { id: photo.id } })}
                style={[styles.tile, index % 5 === 0 && styles.tileWide]}
              >
                <Image
                  source={photoThumbnailSource(photo, session!.accessToken, activeFamily!.id)}
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
            <PrimaryButton label="上传照片" onPress={() => router.push('/photos/new')} />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function Filter({ label, active, onPress }: { label: string; active: boolean; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.filter, active && styles.filterActive]}
    >
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  nav: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  navButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h2, color: colors.ink },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  add: {
    marginLeft: 'auto',
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingBottom: 110, gap: spacing.lg },
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
    width: '47.8%',
    aspectRatio: 0.82,
    borderRadius: radii.card,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  tileWide: { width: '100%', aspectRatio: 1.6 },
  image: { width: '100%', flex: 1, backgroundColor: colors.brandSoft },
  caption: { padding: spacing.md, gap: 3 },
  petNames: { ...typography.caption, color: colors.ink, fontWeight: '700' },
  note: { fontSize: 12, color: colors.textSecondary },
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
});
