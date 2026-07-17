import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import type { TaskSummary } from '../auth/auth-api';

const UNDO_WINDOW_MS = 5_000;

export function TaskUndoBanner({
  task,
  busy,
  recordId,
  onUndo,
  onDismiss,
  onViewRecord,
}: {
  task: TaskSummary;
  busy: boolean;
  recordId?: string | null;
  onUndo?: () => void;
  onDismiss(): void;
  onViewRecord?: (recordId: string) => void;
}) {
  useEffect(() => {
    if (busy) return;
    const timer = setTimeout(onDismiss, UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [busy, onDismiss, task.id, task.version]);

  const recordToViewId = typeof recordId === 'string' && recordId ? recordId : null;
  const canViewRecord = !!recordToViewId && !!onViewRecord;

  return (
    <View testID="tasks.undo.banner" accessibilityLiveRegion="polite" style={styles.banner}>
      <View style={styles.icon}>
        <Ionicons name="checkmark" size={17} color={colors.surface} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>已完成「{task.title}」</Text>
        <Text style={styles.detail}>
          {canViewRecord ? '已生成一条实际记录，可直接查看' : '已生成一条实际记录'}
        </Text>
      </View>
      <View style={styles.actions}>
        {canViewRecord ? (
          <Pressable
            testID="tasks.undo.banner.view-record.button"
            accessibilityRole="button"
            accessibilityLabel={`查看${task.title}生成的记录`}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => recordToViewId && onViewRecord(recordToViewId)}
            style={({ pressed }) => [
              styles.action,
              busy && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.actionText}>{busy ? '处理中' : '查看'}</Text>
          </Pressable>
        ) : null}
        {onUndo ? (
          <Pressable
            testID="tasks.undo.banner.undo.button"
            accessibilityRole="button"
            accessibilityLabel={`撤销完成${task.title}`}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={onUndo}
            style={({ pressed }) => [
              styles.action,
              busy && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.actionText}>{busy ? '处理中' : '撤销'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    minHeight: 64,
    borderRadius: radii.banner,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: spacing.xs },
  title: { ...typography.h3, color: colors.surface },
  detail: { ...typography.caption, color: colors.textTertiary },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  action: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  actionText: { ...typography.secondary, color: colors.navActive, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
