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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import {
  AuthApiError,
  authApi,
  type PetSummary,
  type PhotoSummary,
} from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import { isPhotoDetailDraftDirty } from '../../src/features/photos/photo-form';
import { photoSource } from '../../src/features/photos/photo-source';
import {
  ErrorText,
  Field,
  PrimaryButton,
  Screen,
  TextButton,
} from '../../src/shared/ui/primitives';

export default function PhotoDetailRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, activeFamily } = useSession();
  const allowLeave = useRef(false);
  const [photo, setPhoto] = useState<PhotoSummary | null>(null);
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [petIds, setPetIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const originalPetIds = useMemo(() => photo?.pets.map((entry) => entry.petId) ?? [], [photo]);
  useEffect(() => {
    if (!session || !activeFamily || !id) return;
    Promise.all([
      authApi.getPhoto(session.accessToken, activeFamily.id, id),
      authApi.listPets(session.accessToken, activeFamily.id),
    ])
      .then(([value, rows]) => {
        setPhoto(value);
        setPets(rows);
        setPetIds(value.pets.map((entry) => entry.petId));
        setNote(value.note ?? '');
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : '照片加载失败'));
  }, [activeFamily, id, session]);
  const canManageAvatar = activeFamily?.role === 'OWNER' || activeFamily?.role === 'ADMIN';
  const changed =
    !!photo &&
    isPhotoDetailDraftDirty({
      note,
      originalNote: photo.note,
      petIds,
      originalPetIds,
    });
  const requestBack = useCallback(() => {
    if (busy) {
      Alert.alert('照片正在处理', '请等待当前操作完成，避免照片归属或备注状态不一致。', [
        { text: '继续等待', style: 'cancel' },
      ]);
      return;
    }
    if (!changed || allowLeave.current) {
      router.back();
      return;
    }
    Alert.alert('放弃未保存的修改？', '照片备注或绑定猫咪尚未保存，离开后本次修改不会生效。', [
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
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!busy && (!changed || allowLeave.current)) return false;
      requestBack();
      return true;
    });
    return () => subscription.remove();
  }, [busy, changed, requestBack]);
  function togglePet(petId: string) {
    if (busy) return;
    setPetIds((current) =>
      current.includes(petId)
        ? current.length > 1
          ? current.filter((value) => value !== petId)
          : current
        : [...current, petId],
    );
  }
  async function save() {
    if (!session || !activeFamily || !photo || !petIds.length) return;
    setBusy(true);
    setError('');
    try {
      const value = await authApi.updatePhoto(session.accessToken, activeFamily.id, photo.id, {
        note: note.trim() || null,
        petIds,
        version: photo.version,
      });
      setPhoto(value);
      setPetIds(value.pets.map((entry) => entry.petId));
      setNote(value.note ?? '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }
  async function setAvatar(petId: string) {
    if (!session || !activeFamily || !photo) return;
    setBusy(true);
    try {
      await authApi.setPhotoAvatar(session.accessToken, activeFamily.id, photo.id, petId);
      Alert.alert('头像已更新', '猫咪档案将使用这张照片作为头像。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '头像设置失败');
    } finally {
      setBusy(false);
    }
  }
  function confirmDelete() {
    Alert.alert('删除照片', '照片会先进入软删除状态，不会立即从存储中永久清除。', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => void remove() },
    ]);
  }
  async function remove() {
    if (!session || !activeFamily || !photo) return;
    setBusy(true);
    try {
      await authApi.deletePhoto(session.accessToken, activeFamily.id, photo.id, photo.version);
      router.replace('/photos');
    } catch (cause) {
      setError(cause instanceof AuthApiError ? cause.message : '删除失败');
      setBusy(false);
    }
  }
  return (
    <Screen>
      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          accessibilityHint={busy ? '照片操作进行中，点击会提示继续等待' : '返回上一页'}
          onPress={requestBack}
          style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>照片详情</Text>
        <View style={styles.navButton} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {!photo && !error ? (
          <ActivityIndicator color={colors.brand} />
        ) : photo && session && activeFamily ? (
          <>
            <Image
              source={photoSource(photo, session.accessToken, activeFamily.id)}
              style={styles.hero}
              resizeMode="cover"
            />
            <View style={styles.panel}>
              <Text style={styles.label}>照片里有谁</Text>
              <View style={styles.chips}>
                {pets.map((pet) => (
                  <Pressable
                    key={pet.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: petIds.includes(pet.id), disabled: busy }}
                    disabled={busy}
                    onPress={() => togglePet(pet.id)}
                    style={[
                      styles.chip,
                      petIds.includes(pet.id) && styles.chipActive,
                      busy && styles.disabled,
                    ]}
                  >
                    <Text
                      style={[styles.chipText, petIds.includes(pet.id) && styles.chipTextActive]}
                    >
                      {pet.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Field
                label="照片备注"
                value={note}
                onChangeText={setNote}
                maxLength={500}
                multiline
                editable={!busy}
                placeholder="写下这一刻"
              />
              {error ? <ErrorText>{error}</ErrorText> : null}
              <PrimaryButton
                label="保存修改"
                disabled={!changed || !petIds.length}
                busy={busy}
                onPress={() => void save()}
              />
              {canManageAvatar ? (
                <View style={styles.avatarArea}>
                  <Text style={styles.label}>设置档案头像</Text>
                  <Text style={styles.hint}>照片绑定的猫咪可以使用它作为头像</Text>
                  {petIds.map((petId) => (
                    <TextButton
                      key={petId}
                      label={`设为 ${pets.find((pet) => pet.id === petId)?.name ?? '猫咪'} 的头像`}
                      disabled={busy}
                      onPress={() => void setAvatar(petId)}
                    />
                  ))}
                </View>
              ) : null}
              <TextButton label="删除照片" danger disabled={busy} onPress={confirmDelete} />
            </View>
          </>
        ) : error ? (
          <ErrorText>{error}</ErrorText>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  nav: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h2, color: colors.ink },
  content: { gap: spacing.lg, paddingBottom: 110 },
  hero: {
    width: '100%',
    aspectRatio: 0.92,
    borderRadius: radii.card,
    backgroundColor: colors.brandSoft,
  },
  panel: {
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    gap: spacing.md,
  },
  label: { ...typography.h3, color: colors.ink },
  hint: { ...typography.caption, color: colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 38,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  chipActive: { backgroundColor: colors.brand },
  chipText: { ...typography.caption, color: colors.brand, fontWeight: '700' },
  chipTextActive: { color: colors.surface },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
  avatarArea: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.lg,
    gap: spacing.xs,
  },
});
