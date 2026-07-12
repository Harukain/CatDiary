import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { Screen } from '../../src/shared/ui/primitives';

export default function AddTab() {
  const router = useRouter();
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.title}>快速新增</Text>
          <Text style={styles.subtitle}>选择要记录或管理的内容</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/plans/new')}
          style={({ pressed }) => [styles.item, pressed && styles.pressed]}
        >
          <View style={styles.icon}>
            <Ionicons name="notifications-outline" size={20} color={colors.brand} />
          </View>
          <View style={styles.body}>
            <Text style={styles.itemTitle}>新建照顾计划</Text>
            <Text style={styles.itemBody}>疫苗、驱虫、用药或铲屎提醒</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/onboarding/pet')}
          style={({ pressed }) => [styles.item, pressed && styles.pressed]}
        >
          <View style={styles.icon}>
            <Ionicons name="paw-outline" size={20} color={colors.brand} />
          </View>
          <View style={styles.body}>
            <Text style={styles.itemTitle}>添加猫咪档案</Text>
            <Text style={styles.itemBody}>创建新猫咪，家庭最多 5 只</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/records/new')}
          style={({ pressed }) => [styles.item, pressed && styles.pressed]}
        >
          <View style={styles.icon}>
            <Ionicons name="create-outline" size={20} color={colors.brand} />
          </View>
          <View style={styles.body}>
            <Text style={styles.itemTitle}>新增生活或健康记录</Text>
            <Text style={styles.itemBody}>饮食、体重、排便、呕吐等日常情况</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/photos/new')}
          style={({ pressed }) => [styles.item, pressed && styles.pressed]}
        >
          <View style={styles.icon}>
            <Ionicons name="camera-outline" size={20} color={colors.brand} />
          </View>
          <View style={styles.body}>
            <Text style={styles.itemTitle}>上传猫咪照片</Text>
            <Text style={styles.itemBody}>支持多图、备注和同时绑定多只猫咪</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: 104 },
  title: { ...typography.h1, color: colors.ink },
  subtitle: { ...typography.secondary, color: colors.textSecondary, marginBottom: spacing.md },
  item: {
    minHeight: 76,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  disabledItem: {
    minHeight: 76,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    opacity: 0.55,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  iconMuted: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.divider,
  },
  body: { flex: 1, gap: spacing.xs },
  itemTitle: { ...typography.h3, color: colors.ink },
  itemBody: { ...typography.caption, color: colors.textSecondary },
  pressed: { transform: [{ scale: 0.98 }] },
});
