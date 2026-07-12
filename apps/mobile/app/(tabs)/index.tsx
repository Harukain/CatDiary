import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { authApi, type PetSummary } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import {
  Body,
  Card,
  ErrorText,
  PrimaryButton,
  Screen,
  Title,
} from '../../src/shared/ui/primitives';

export default function HomeTab() {
  const router = useRouter();
  const { session, activeFamily } = useSession();
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useFocusEffect(
    useCallback(() => {
      if (!session || !activeFamily) return;
      let active = true;
      setLoading(true);
      setError('');
      void authApi
        .listPets(session.accessToken, activeFamily.id)
        .then((data) => active && setPets(data))
        .catch(() => active && setError('猫咪档案加载失败'))
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }, [activeFamily, session]),
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>{activeFamily?.name ?? '尚未选择家庭'}</Text>
          <Text style={styles.title}>今天也照顾好它们</Text>
          <Text style={styles.date}>任务与异常会在这里优先显示</Text>
        </View>
        <Card>
          <Title>猫咪档案</Title>
          {loading ? (
            <ActivityIndicator color={colors.brand} />
          ) : error ? (
            <ErrorText>{error}</ErrorText>
          ) : pets.length ? (
            <View style={styles.petList}>
              {pets.map((pet) => (
                <Pressable
                  key={pet.id}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/pets/[id]', params: { id: pet.id } })}
                  style={styles.petChip}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{pet.name.slice(0, 1)}</Text>
                  </View>
                  <Text style={styles.petName}>{pet.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <>
              <Body>还没有猫咪档案，添加后即可开始记录饮食、体重和健康情况。</Body>
              <PrimaryButton
                label="添加第一只猫咪"
                onPress={() => router.push('/onboarding/pet')}
              />
            </>
          )}
        </Card>
        <View style={styles.banner}>
          <View>
            <Text style={styles.bannerTitle}>今日任务</Text>
            <Text style={styles.bannerBody}>任务模块正在进入下一阶段开发</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(tabs)/tasks')}
            style={styles.bannerAction}
          >
            <Text style={styles.bannerActionText}>查看</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xxl, paddingBottom: 104 },
  heading: { gap: spacing.xs },
  eyebrow: { ...typography.caption, color: colors.brand, fontWeight: '600' },
  title: { ...typography.h1, color: colors.ink },
  date: { ...typography.secondary, color: colors.textSecondary },
  petList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  petChip: { minWidth: 72, alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: colors.brand },
  petName: { ...typography.secondary, color: colors.ink, fontWeight: '600' },
  banner: {
    minHeight: 84,
    borderRadius: radii.banner,
    backgroundColor: colors.warningSoft,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerTitle: { ...typography.h3, color: colors.ink },
  bannerBody: { ...typography.caption, color: colors.warningDark, marginTop: spacing.xs },
  bannerAction: { minWidth: 56, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  bannerActionText: { fontSize: 13, fontWeight: '600', color: colors.warningDark },
});
