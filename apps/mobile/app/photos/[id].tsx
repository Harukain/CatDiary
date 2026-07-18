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
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import {
  AuthApiError,
  authApi,
  type PetSummary,
  type PhotoSummary,
} from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import { AuthenticatedImage } from '../../src/features/photos/authenticated-image';
import { isPhotoDetailDraftDirty } from '../../src/features/photos/photo-form';
import { photoSource } from '../../src/features/photos/photo-source';
import {
  Body,
  Card,
  ErrorText,
  Field,
  PrimaryButton,
  Screen,
  TextButton,
  Title,
} from '../../src/shared/ui/primitives';

export default function PhotoDetailRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const photoId = Array.isArray(id) ? id[0] : id;
  const { restoring, session, activeFamily } = useSession();
  const allowLeave = useRef(false);
  const [photo, setPhoto] = useState<PhotoSummary | null>(null);
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [petIds, setPetIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const originalPetIds = useMemo(() => photo?.pets.map((entry) => entry.petId) ?? [], [photo]);

  const load = useCallback(
    async (shouldApply: () => boolean = () => true) => {
      if (restoring) {
        if (shouldApply()) setLoading(true);
        return;
      }

      if (!session || !activeFamily || !photoId) {
        if (!shouldApply()) return;
        setPhoto(null);
        setPets([]);
        setPetIds([]);
        setNote('');
        setLoading(false);
        setError('');
        return;
      }

      setLoading(true);
      setError('');
      setPhoto((current) => (current?.id === photoId ? current : null));

      try {
        const [value, rows] = await Promise.all([
          authApi.getPhoto(session.accessToken, activeFamily.id, photoId),
          authApi.listPets(session.accessToken, activeFamily.id),
        ]);
        if (!shouldApply()) return;
        setPhoto(value);
        setPets(rows);
        setPetIds(value.pets.map((entry) => entry.petId));
        setNote(value.note ?? '');
        allowLeave.current = false;
      } catch (cause) {
        if (!shouldApply()) return;
        setPhoto(null);
        setPets([]);
        setPetIds([]);
        setNote('');
        setError(cause instanceof Error ? cause.message : '照片加载失败');
      } finally {
        if (shouldApply()) setLoading(false);
      }
    },
    [activeFamily, photoId, restoring, session],
  );

  useEffect(() => {
    let mounted = true;
    void load(() => mounted);
    return () => {
      mounted = false;
    };
  }, [load]);

  const contextUnavailable = !restoring && (!session || !activeFamily || !photoId);
  const loadingInitial = restoring || (loading && !photo);
  const interactionLocked = busy || loading || contextUnavailable;
  const canManageAvatar = activeFamily?.role === 'OWNER' || activeFamily?.role === 'ADMIN';
  const changed =
    !!photo &&
    isPhotoDetailDraftDirty({
      note,
      originalNote: photo.note,
      petIds,
      originalPetIds,
    });
  const canSave = changed && !!petIds.length && !busy && !loading && !contextUnavailable;
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
  function togglePet(petId: string) {
    if (interactionLocked) return;
    setPetIds((current) =>
      current.includes(petId)
        ? current.length > 1
          ? current.filter((value) => value !== petId)
          : current
        : [...current, petId],
    );
  }
  async function save() {
    if (!session || !activeFamily || !photo || !canSave) return;
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
    if (!session || !activeFamily || !photo || interactionLocked || !canManageAvatar) return;
    setBusy(true);
    setError('');
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
    if (interactionLocked || !photo) return;
    Alert.alert('删除照片', '照片会先进入软删除状态，不会立即从存储中永久清除。', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => void remove() },
    ]);
  }
  async function remove() {
    if (!session || !activeFamily || !photo || interactionLocked) return;
    setBusy(true);
    setError('');
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
      <Stack.Screen options={{ gestureEnabled: false }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
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
          <Text testID="photo-detail.title" style={styles.title}>
            照片详情
          </Text>
          <View style={styles.navButton} />
        </View>
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          {loadingInitial ? (
            <Card testID="photo-detail.loading.card">
              <ActivityIndicator color={colors.brand} />
              <Body>正在加载照片详情…</Body>
            </Card>
          ) : null}
          {!loadingInitial && contextUnavailable ? (
            <Card testID="photo-detail.context-empty.card">
              <Title>需要先选择家庭和照片</Title>
              <Body>当前没有可用的登录、家庭或照片参数，先回到相册重新进入照片详情。</Body>
              <TextButton
                label="返回相册"
                testID="photo-detail.context-empty.back"
                onPress={() => router.replace('/photos')}
              />
            </Card>
          ) : null}
          {!loadingInitial && !contextUnavailable && error && !photo ? (
            <Card testID="photo-detail.error.card">
              <Title>照片加载失败</Title>
              <ErrorText testID="photo-detail.load-error">{error}</ErrorText>
              <TextButton
                label="重新加载"
                disabled={loading}
                testID="photo-detail.reload.button"
                onPress={() => void load()}
              />
              <TextButton
                label="返回相册"
                testID="photo-detail.error.back"
                onPress={() => router.replace('/photos')}
              />
            </Card>
          ) : null}
          {photo && session && activeFamily ? (
            <>
              <AuthenticatedImage
                testID="photo-detail.image"
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
                      testID="photo-detail.pet.item"
                      accessibilityRole="button"
                      accessibilityState={{
                        selected: petIds.includes(pet.id),
                        disabled: interactionLocked,
                      }}
                      disabled={interactionLocked}
                      onPress={() => togglePet(pet.id)}
                      style={[
                        styles.chip,
                        petIds.includes(pet.id) && styles.chipActive,
                        interactionLocked && styles.disabled,
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
                  editable={!interactionLocked}
                  placeholder="写下这一刻"
                  testID="photo-detail.note.input"
                />
                {error && keyboardVisible ? (
                  <ErrorText testID="photo-detail.error">{error}</ErrorText>
                ) : null}
                {keyboardVisible ? (
                  <>
                    <PrimaryButton
                      label="保存修改"
                      disabled={!canSave}
                      busy={busy}
                      testID="photo-detail.save.inline-button"
                      onPress={() => void save()}
                    />
                    <TextButton
                      label="删除照片"
                      danger
                      disabled={interactionLocked}
                      testID="photo-detail.delete.inline-button"
                      onPress={confirmDelete}
                    />
                    <TextButton
                      label="返回相册"
                      disabled={interactionLocked}
                      testID="photo-detail.return.inline-button"
                      onPress={requestBack}
                    />
                  </>
                ) : null}
                {canManageAvatar ? (
                  <View style={styles.avatarArea}>
                    <Text style={styles.label}>设置档案头像</Text>
                    <Text style={styles.hint}>照片绑定的猫咪可以使用它作为头像</Text>
                    {petIds.map((petId) => (
                      <TextButton
                        key={petId}
                        label={`设为 ${pets.find((pet) => pet.id === petId)?.name ?? '猫咪'} 的头像`}
                        disabled={interactionLocked}
                        testID="photo-detail.set-avatar.button"
                        onPress={() => void setAvatar(petId)}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            </>
          ) : null}
        </ScrollView>
        {photo && !keyboardVisible ? (
          <View
            testID="photo-detail.footer"
            style={[
              styles.footer,
              { paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm) },
            ]}
          >
            {error ? <ErrorText testID="photo-detail.error">{error}</ErrorText> : null}
            <PrimaryButton
              label="保存修改"
              disabled={!canSave}
              busy={busy}
              testID="photo-detail.save.button"
              onPress={() => void save()}
            />
            <TextButton
              label="删除照片"
              danger
              disabled={interactionLocked}
              testID="photo-detail.delete.button"
              onPress={confirmDelete}
            />
            <TextButton
              label="返回相册"
              disabled={interactionLocked}
              testID="photo-detail.return.button"
              onPress={requestBack}
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  nav: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h2, color: colors.ink },
  scroll: { flex: 1 },
  content: { gap: spacing.lg, paddingBottom: spacing.xl },
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
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.page,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
});
