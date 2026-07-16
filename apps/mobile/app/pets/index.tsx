import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@cat-diary/design-tokens';
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
  Title,
} from '../../src/shared/ui/primitives';

export default function PetsRoute() {
  const router = useRouter();
  const { session, activeFamily } = useSession();
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useFocusEffect(
    useCallback(() => {
      if (!session || !activeFamily) return;
      let mounted = true;
      setLoading(true);
      void authApi
        .listPets(session.accessToken, activeFamily.id)
        .then((data) => mounted && setPets(data))
        .catch(() => mounted && setError('档案加载失败'))
        .finally(() => mounted && setLoading(false));
      return () => {
        mounted = false;
      };
    }, [activeFamily, session]),
  );
  const canManage = activeFamily?.role === 'OWNER' || activeFamily?.role === 'ADMIN';

  return (
    <Screen>
      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={() => router.back()}
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text testID="pets.title" style={styles.navTitle}>
          猫咪档案
        </Text>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Title>{activeFamily?.name}</Title>
          {loading ? (
            <ActivityIndicator color={colors.brand} />
          ) : error ? (
            <ErrorText>{error}</ErrorText>
          ) : pets.length ? (
            pets.map((pet) => (
              <Pressable
                key={pet.id}
                testID="pets.item"
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/pets/[id]', params: { id: pet.id } })}
                style={styles.pet}
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
            <Body>这个家庭还没有猫咪档案。</Body>
          )}
          {canManage && pets.length < 5 ? (
            <PrimaryButton
              label="添加猫咪"
              testID="pets.add.button"
              onPress={() =>
                router.push({ pathname: '/onboarding/pet', params: { returnTo: 'pets' } })
              }
            />
          ) : null}
          {pets.length >= 5 ? <Body>已达到每个家庭 5 只猫咪的上限。</Body> : null}
        </Card>
      </ScrollView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  content: { paddingBottom: spacing.huge },
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
});
