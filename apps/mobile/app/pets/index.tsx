import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { authApi, type PetSummary } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import { AuthenticatedImage } from '../../src/features/photos/authenticated-image';
import { photoSource } from '../../src/features/photos/photo-source';
import {
  Body,
  Card,
  ErrorText,
  PrimaryButton,
  Screen,
  TextButton,
  Title,
} from '../../src/shared/ui/primitives';

export default function PetsRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { restoring, session, activeFamily } = useSession();
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const contextUnavailable = !restoring && (!session || !activeFamily);
  const canManage = activeFamily?.role === 'OWNER' || activeFamily?.role === 'ADMIN';
  const canAdd = !!session && !!activeFamily && canManage && pets.length < 5 && !loading;

  const load = useCallback(
    async (shouldApply: () => boolean = () => true) => {
      if (restoring) return;
      if (!session || !activeFamily) {
        if (!shouldApply()) return;
        setPets([]);
        setLoading(false);
        setError('');
        return;
      }
      if (!shouldApply()) return;
      setLoading(true);
      setError('');
      try {
        const nextPets = await authApi.listPets(session.accessToken, activeFamily.id);
        if (!shouldApply()) return;
        setPets(nextPets);
      } catch (cause) {
        if (!shouldApply()) return;
        setError(cause instanceof Error ? cause.message : '档案加载失败');
      } finally {
        if (shouldApply()) setLoading(false);
      }
    },
    [activeFamily, restoring, session],
  );
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void load(() => active);
      return () => {
        active = false;
      };
    }, [load]),
  );

  function openAddPet() {
    if (!canAdd) return;
    router.push({ pathname: '/onboarding/pet', params: { returnTo: 'pets' } });
  }

  return (
    <Screen>
      <View style={styles.flex}>
        <View style={styles.nav}>
          <Pressable
            testID="pets.back.button"
            accessibilityRole="button"
            accessibilityLabel="返回"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
          <Text testID="pets.title" style={styles.navTitle}>
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
          <Card testID="pets.list.card">
            <Title>{activeFamily?.name ?? '猫咪档案'}</Title>
            {restoring || loading ? (
              <View testID="pets.loading" style={styles.stateCard}>
                <ActivityIndicator color={colors.brand} />
                <Body>正在整理猫咪档案。</Body>
              </View>
            ) : contextUnavailable ? (
              <View testID="pets.context-empty" style={styles.stateCard}>
                <Title>缺少家庭上下文</Title>
                <Body>请返回首页确认当前账号和家庭，再重新进入猫咪档案。</Body>
              </View>
            ) : error ? (
              <View testID="pets.error.card" style={styles.stateCard}>
                <ErrorText testID="pets.error.text">{error}</ErrorText>
                <Body>可以重新加载档案列表。已保存的猫咪资料不会因为本次加载失败而丢失。</Body>
              </View>
            ) : pets.length ? (
              pets.map((pet) => (
                <Pressable
                  key={pet.id}
                  testID="pets.item"
                  accessibilityRole="button"
                  accessibilityLabel={`查看${pet.name}的猫咪档案`}
                  onPress={() => router.push({ pathname: '/pets/[id]', params: { id: pet.id } })}
                  style={({ pressed }) => [styles.pet, pressed && styles.pressed]}
                >
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
                  <View style={styles.petBody}>
                    <Text style={styles.petName}>{pet.name}</Text>
                    <Text style={styles.meta}>档案版本 {pet.version}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                </Pressable>
              ))
            ) : (
              <View testID="pets.empty" style={styles.stateCard}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="paw-outline" size={26} color={colors.brand} />
                </View>
                <Title>还没有猫咪档案</Title>
                <Body>先添加第一只猫，之后饮食、体重、健康事件和相册都会归到对应档案里。</Body>
              </View>
            )}
            {!loading && !error && pets.length >= 5 ? (
              <Body testID="pets.limit.text">已达到每个家庭 5 只猫咪的上限。</Body>
            ) : null}
          </Card>
        </ScrollView>
        <View
          testID="pets.footer"
          style={[
            styles.footer,
            { paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm) },
          ]}
        >
          {error && !contextUnavailable ? (
            <PrimaryButton
              label="重新加载档案"
              testID="pets.reload.button"
              busy={loading}
              onPress={() => void load()}
            />
          ) : (
            <PrimaryButton
              label={pets.length >= 5 ? '已达 5 只上限' : '添加猫咪'}
              testID="pets.add.button"
              disabled={!canAdd}
              onPress={openAddPet}
            />
          )}
          <TextButton
            label="返回上一页"
            testID="pets.return.button"
            onPress={() => router.back()}
          />
        </View>
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  scroll: { flex: 1 },
  content: { paddingBottom: spacing.xl },
  pet: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: colors.brand },
  avatarImage: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandSoft },
  petBody: { flex: 1 },
  petName: { ...typography.h3, color: colors.ink },
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  stateCard: { gap: spacing.md, paddingVertical: spacing.md },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.navigation,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.page,
    gap: spacing.xs,
  },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
