import { useCallback, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, shadows, spacing, typography } from '@cat-diary/design-tokens';
import { authApi, type PetSummary, type TaskSummary } from '../../src/features/auth/auth-api';
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
import { bottomTabScrollPadding } from '../../src/shared/ui/bottom-tab-layout';

export default function HomeTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { restoring, session, activeFamily } = useSession();
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [todayTasks, setTodayTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const contextUnavailable = !restoring && (!session || !activeFamily);
  const interactionLocked = loading || contextUnavailable;

  const load = useCallback(
    async (shouldApply: () => boolean = () => true) => {
      if (restoring) return;
      if (!session || !activeFamily) {
        if (!shouldApply()) return;
        setPets([]);
        setTodayTasks([]);
        setLoading(false);
        setError('');
        return;
      }
      setLoading(true);
      setError('');
      try {
        const [nextPets, nextTasks] = await Promise.all([
          authApi.listPets(session.accessToken, activeFamily.id),
          authApi.listTasks(session.accessToken, activeFamily.id, 'today'),
        ]);
        if (!shouldApply()) return;
        setPets(nextPets);
        setTodayTasks(nextTasks.items);
      } catch {
        if (!shouldApply()) return;
        setPets([]);
        setTodayTasks([]);
        setError('首页数据加载失败');
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

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomTabScrollPadding(insets.bottom) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>
            {formatToday()} · {activeFamily?.name ?? '尚未选择家庭'}
          </Text>
          <Text testID="home.title" style={styles.title}>
            今天，先照顾好它们
          </Text>
          <Text style={styles.date}>照顾任务和重要变化会优先出现在这里</Text>
        </View>
        <View style={styles.taskPanel}>
          <View style={styles.taskPanelTop}>
            <View style={styles.taskPanelTitleGroup}>
              <View style={styles.taskIcon}>
                <Ionicons name="sunny-outline" size={20} color={colors.warningDark} />
              </View>
              <View>
                <Text style={styles.taskPanelEyebrow}>今日照顾</Text>
                <Text style={styles.taskPanelTitle}>
                  {contextUnavailable
                    ? '需要先完成家庭设置'
                    : error
                      ? '今天安排暂时无法加载'
                      : loading
                        ? '正在整理今天的安排'
                        : todayTasks.length
                          ? `有 ${todayTasks.length} 项需要留意`
                          : '今天没有待办任务'}
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="查看今日任务"
              accessibilityState={{ disabled: interactionLocked }}
              disabled={interactionLocked}
              onPress={() => router.push('/(tabs)/tasks')}
              style={({ pressed }) => [
                styles.taskPanelAction,
                interactionLocked && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.taskPanelActionText}>查看任务</Text>
              <Ionicons name="arrow-forward" size={15} color={colors.warningDark} />
            </Pressable>
          </View>
          {!loading && todayTasks.length ? (
            <View style={styles.taskPreviewList}>
              {todayTasks.slice(0, 2).map((task) => (
                <View key={task.id} style={styles.taskPreview}>
                  <View style={styles.taskDot} />
                  <View style={styles.taskPreviewBody}>
                    <Text numberOfLines={1} style={styles.taskPreviewTitle}>
                      {task.title}
                    </Text>
                    <Text style={styles.taskPreviewMeta}>
                      {task.pet?.name ?? '公共任务'} · {formatTime(task.scheduledAt)}
                    </Text>
                  </View>
                </View>
              ))}
              {todayTasks.length > 2 ? (
                <Text style={styles.moreTasks}>还有 {todayTasks.length - 2} 项任务</Text>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={styles.quickSection}>
          <View style={styles.profileHeader}>
            <Title>快捷记录</Title>
            <Text style={styles.quickHint}>写入前仍需确认猫咪归属</Text>
          </View>
          <View style={styles.quickGrid}>
            <QuickAction
              icon="restaurant-outline"
              label="饮食"
              detail="记录吃了什么"
              disabled={interactionLocked}
              onPress={() => router.push({ pathname: '/records/new', params: { type: 'FOOD' } })}
            />
            <QuickAction
              icon="scale-outline"
              label="体重"
              detail="记录 kg 和时间"
              disabled={interactionLocked}
              onPress={() => router.push({ pathname: '/records/new', params: { type: 'WEIGHT' } })}
            />
            <QuickAction
              icon="sparkles-outline"
              label="铲屎"
              detail="公共猫砂盆也可记"
              disabled={interactionLocked}
              onPress={() => router.push({ pathname: '/records/new', params: { type: 'LITTER' } })}
            />
            <QuickAction
              icon="camera-outline"
              label="照片"
              detail="上传并备注"
              disabled={interactionLocked}
              onPress={() => router.push('/photos/new')}
            />
          </View>
        </View>
        <Card>
          <View style={styles.profileHeader}>
            <Title>猫咪档案</Title>
            {pets.length ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="管理猫咪档案"
                accessibilityState={{ disabled: interactionLocked }}
                disabled={interactionLocked}
                onPress={() => router.push('/pets')}
                style={({ pressed }) => [
                  styles.managePets,
                  interactionLocked && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.managePetsText}>管理</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.brand} />
              </Pressable>
            ) : null}
          </View>
          {loading ? (
            <View testID="home.loading.card" style={styles.inlineState}>
              <ActivityIndicator color={colors.brand} />
              <Body>正在加载首页数据…</Body>
            </View>
          ) : contextUnavailable ? (
            <View testID="home.context-empty.card" style={styles.inlineState}>
              <Title>需要先完成家庭设置</Title>
              <Body>登录并选择家庭后，首页会显示今日任务、快捷记录和猫咪档案。</Body>
              <TextButton
                label="去我的页面检查家庭"
                onPress={() => router.push('/(tabs)/me')}
                testID="home.context-empty.action"
              />
            </View>
          ) : error ? (
            <View testID="home.error.card" style={styles.inlineState}>
              <Title>首页数据加载失败</Title>
              <ErrorText testID="home.error.text">{error}</ErrorText>
              <TextButton
                label="重新加载"
                onPress={() => void load()}
                testID="home.reload.button"
              />
            </View>
          ) : pets.length ? (
            <View style={styles.petList}>
              {pets.map((pet) => (
                <Pressable
                  key={pet.id}
                  accessibilityRole="button"
                  accessibilityLabel={`查看${pet.name}的档案`}
                  accessibilityState={{ disabled: interactionLocked }}
                  disabled={interactionLocked}
                  onPress={() => router.push({ pathname: '/pets/[id]', params: { id: pet.id } })}
                  style={({ pressed }) => [
                    styles.petChip,
                    interactionLocked && styles.disabled,
                    pressed && styles.pressed,
                  ]}
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
      </ScrollView>
    </Screen>
  );
}

function QuickAction({
  icon,
  label,
  detail,
  disabled,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  detail: string;
  disabled?: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}快捷记录`}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.quickIcon}>
        <Ionicons name={icon} size={20} color={colors.brand} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
      <Text style={styles.quickDetail}>{detail}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xxl },
  heading: { gap: spacing.xs },
  eyebrow: { ...typography.caption, color: colors.brand, fontWeight: '600' },
  title: { ...typography.h1, color: colors.ink },
  date: { ...typography.secondary, color: colors.textSecondary },
  taskPanel: {
    borderRadius: radii.banner,
    backgroundColor: colors.warningSoft,
    padding: spacing.lg,
    gap: spacing.md,
  },
  taskPanelTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  taskPanelTitleGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  taskIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  taskPanelEyebrow: { ...typography.caption, color: colors.warningDark, fontWeight: '600' },
  taskPanelTitle: { ...typography.h3, color: colors.ink, marginTop: 2 },
  taskPanelAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  taskPanelActionText: { ...typography.caption, color: colors.warningDark, fontWeight: '600' },
  taskPreviewList: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  taskPreview: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  taskDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.warningDark },
  taskPreviewBody: { flex: 1 },
  taskPreviewTitle: { ...typography.secondary, color: colors.ink, fontWeight: '600' },
  taskPreviewMeta: { ...typography.caption, color: colors.warningDark, marginTop: 1 },
  moreTasks: { ...typography.caption, color: colors.warningDark, paddingLeft: spacing.md },
  quickSection: { gap: spacing.md },
  quickHint: { ...typography.caption, color: colors.textSecondary },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  quickAction: {
    flexBasis: '47%',
    minHeight: 112,
    borderRadius: radii.input,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadows.small,
  },
  quickIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
    marginBottom: spacing.xs,
  },
  quickLabel: { ...typography.h3, color: colors.ink },
  quickDetail: { ...typography.caption, color: colors.textSecondary },
  profileHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inlineState: { gap: spacing.md, alignItems: 'flex-start' },
  managePets: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  managePetsText: { ...typography.caption, color: colors.brand, fontWeight: '600' },
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
  avatarImage: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandSoft },
  petName: { ...typography.secondary, color: colors.ink, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
});

function formatToday() {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date());
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}
