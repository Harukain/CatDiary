import { useCallback, useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';

const actions = [
  {
    icon: 'create-outline' as const,
    title: '新增生活或健康记录',
    detail: '饮食、体重、排便、呕吐等日常情况',
    path: '/records/new' as const,
  },
  {
    icon: 'notifications-outline' as const,
    title: '新建照顾计划',
    detail: '疫苗、驱虫、用药或铲屎提醒',
    path: '/plans/new' as const,
    requiresManagement: true,
  },
  {
    icon: 'camera-outline' as const,
    title: '上传猫咪照片',
    detail: '支持多图、备注和同时绑定多只猫咪',
    path: '/photos/new' as const,
  },
  {
    icon: 'paw-outline' as const,
    title: '添加猫咪档案',
    detail: '创建新猫咪，家庭最多 5 只',
    path: '/onboarding/pet' as const,
    requiresManagement: true,
  },
];

export function QuickAddSheet({
  visible,
  canManage,
  onClose,
}: {
  visible: boolean;
  canManage: boolean;
  onClose(restoreFocus?: boolean): void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const titleRef = useRef<Text>(null);
  const navigatingRef = useRef(false);
  useEffect(() => {
    if (visible) navigatingRef.current = false;
  }, [visible]);
  const focusTitle = useCallback(() => {
    requestAnimationFrame(() => {
      const node = findNodeHandle(titleRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    });
  }, []);
  function navigate(path: (typeof actions)[number]['path']) {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    onClose(false);
    router.push(path);
  }
  const visibleActions = canManage
    ? actions
    : actions.filter((action) => !('requiresManagement' in action));
  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={() => onClose()}
      onShow={focusTitle}
      statusBarTranslucent
    >
      <View accessibilityViewIsModal style={styles.modal}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭快速新增"
          onPress={() => onClose()}
          style={styles.backdrop}
        />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(spacing.huge, insets.bottom + spacing.lg) },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.heading}>
            <View style={styles.headingCopy}>
              <Text
                ref={titleRef}
                accessible
                accessibilityRole="header"
                accessibilityLabel="快速新增。记录已经发生的事，或安排接下来的照顾"
                style={styles.title}
              >
                快速新增
              </Text>
              <Text style={styles.subtitle}>记录已经发生的事，或安排接下来的照顾</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭"
              onPress={() => onClose()}
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={20} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.actions} showsVerticalScrollIndicator={false}>
            {visibleActions.map((action) => (
              <Pressable
                key={action.title}
                accessibilityRole="button"
                onPress={() => navigate(action.path)}
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              >
                <View style={styles.icon}>
                  <Ionicons name={action.icon} size={20} color={colors.brand} />
                </View>
                <View style={styles.actionBody}>
                  <Text style={styles.actionTitle}>{action.title}</Text>
                  <Text style={styles.actionDetail}>{action.detail}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  sheet: {
    maxHeight: '82%',
    borderTopLeftRadius: radii.navigation,
    borderTopRightRadius: radii.navigation,
    backgroundColor: colors.page,
    paddingHorizontal: spacing.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headingCopy: { flex: 1 },
  title: { ...typography.h2, color: colors.ink },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: spacing.sm, paddingTop: spacing.lg },
  action: {
    minHeight: 72,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.input,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  actionBody: { flex: 1, gap: spacing.xs },
  actionTitle: { ...typography.h3, color: colors.ink },
  actionDetail: { ...typography.caption, color: colors.textSecondary },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
