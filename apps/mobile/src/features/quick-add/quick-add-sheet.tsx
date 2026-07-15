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
import { colors, radii, shadows, spacing, typography } from '@cat-diary/design-tokens';
import {
  hasHiddenManagementQuickAddActions,
  type QuickAddAction,
  type QuickAddActionPath,
  visibleQuickAddActionsByPlacement,
} from './quick-add-actions';

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
  function navigate(path: QuickAddActionPath) {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    onClose(false);
    router.push(path);
  }
  const cardActions = visibleQuickAddActionsByPlacement(canManage, 'card');
  const rowActions = visibleQuickAddActionsByPlacement(canManage, 'row');
  const showPermissionNote = hasHiddenManagementQuickAddActions(canManage);
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
              <Text style={styles.subtitle}>先选类型，再确认猫咪归属和发生时间</Text>
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
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>常用记录</Text>
              <Text style={styles.sectionHint}>保存前会再次确认归属</Text>
            </View>
            <View style={styles.cardGrid}>
              {cardActions.map((action) => (
                <QuickAddCard key={action.title} action={action} onPress={navigate} />
              ))}
            </View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>更多操作</Text>
            </View>
            <View style={styles.rowList}>
              {rowActions.map((action) => (
                <QuickAddRow key={action.title} action={action} onPress={navigate} />
              ))}
            </View>
            {showPermissionNote ? (
              <View style={styles.permissionNote}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.warningDark} />
                <Text style={styles.permissionNoteText}>
                  当前账号可以新增记录和照片；照顾计划与猫咪档案由家庭管理员维护。
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function QuickAddCard({
  action,
  onPress,
}: {
  action: QuickAddAction;
  onPress(path: QuickAddActionPath): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${action.title}快捷新增`}
      onPress={() => onPress(action.path)}
      style={({ pressed }) => [styles.cardAction, pressed && styles.pressed]}
    >
      <View style={styles.cardIcon}>
        <Ionicons name={action.icon} size={21} color={colors.brand} />
      </View>
      <Text style={styles.cardTitle}>{action.title}</Text>
      <Text style={styles.cardDetail}>{action.detail}</Text>
    </Pressable>
  );
}

function QuickAddRow({
  action,
  onPress,
}: {
  action: QuickAddAction;
  onPress(path: QuickAddActionPath): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(action.path)}
      style={({ pressed }) => [styles.rowAction, pressed && styles.pressed]}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={action.icon} size={20} color={colors.brand} />
      </View>
      <View style={styles.actionBody}>
        <Text style={styles.actionTitle}>{action.title}</Text>
        <Text style={styles.actionDetail}>{action.detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
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
  actions: { gap: spacing.md, paddingTop: spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: { ...typography.caption, color: colors.ink, fontWeight: '700' },
  sectionHint: { ...typography.caption, color: colors.textSecondary },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  cardAction: {
    minHeight: 104,
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: radii.input,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadows.small,
  },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
    marginBottom: spacing.xs,
  },
  cardTitle: { ...typography.h3, color: colors.ink },
  cardDetail: { ...typography.caption, color: colors.textSecondary },
  rowList: { gap: spacing.sm },
  rowAction: {
    minHeight: 68,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.input,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowIcon: {
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
  permissionNote: {
    minHeight: 52,
    borderRadius: radii.input,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  permissionNoteText: { ...typography.caption, color: colors.warningDark, flex: 1 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
