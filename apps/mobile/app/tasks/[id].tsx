import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { authApi, AuthApiError, type TaskSummary } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import { Body, Card, ErrorText, Screen, TextButton, Title } from '../../src/shared/ui/primitives';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, activeFamily } = useSession();
  const [task, setTask] = useState<TaskSummary>();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id || !session || !activeFamily) return;
    setError('');
    void authApi
      .getTask(session.accessToken, activeFamily.id, id)
      .then(setTask)
      .catch((cause) =>
        setError(cause instanceof AuthApiError ? cause.message : '任务详情加载失败'),
      );
  }, [activeFamily, id, session]);

  if (!task && !error)
    return (
      <Screen>
        <ActivityIndicator color={colors.brand} />
      </Screen>
    );
  if (!task)
    return (
      <Screen>
        <ErrorText>{error}</ErrorText>
        <TextButton label="返回任务列表" onPress={() => router.replace('/(tabs)/tasks')} />
      </Screen>
    );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>照顾任务 · {typeLabel(task.type)}</Text>
          <Text style={styles.title}>{task.title}</Text>
          <View style={[styles.badge, statusStyle(task.status)]}>
            <Text style={styles.badgeText}>{statusLabel(task.status)}</Text>
          </View>
        </View>
        <Card>
          <Title>任务信息</Title>
          <Info label="猫咪" value={task.pet?.name ?? '家庭公共任务'} />
          <Info
            label="计划时间"
            value={new Date(task.scheduledAt).toLocaleString('zh-CN', { hour12: false })}
          />
          <Info label="负责人" value={task.assignee?.displayName ?? '家庭成员共同负责'} />
          {task.detail ? <Info label="说明" value={task.detail} /> : null}
          {task.completedAt ? (
            <Info
              label="完成时间"
              value={new Date(task.completedAt).toLocaleString('zh-CN', { hour12: false })}
            />
          ) : null}
        </Card>
        <Card>
          <Title>{task.status === 'PENDING' ? '处理任务' : '查看任务记录'}</Title>
          <Body>
            {task.status === 'PENDING'
              ? '进入任务列表完成或跳过；疫苗、驱虫和用药仍会要求二次确认。'
              : '如需撤销完成或跳过结果，请进入任务列表操作。'}
          </Body>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/(tabs)/tasks')}
            style={styles.primary}
          >
            <Text style={styles.primaryText}>前往任务列表</Text>
          </Pressable>
        </Card>
        <TextButton label="返回" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.info}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}
function typeLabel(type: string) {
  return (
    (
      { VACCINE: '疫苗', DEWORMING: '驱虫', MEDICATION: '用药', LITTER: '铲屎' } as Record<
        string,
        string
      >
    )[type] ?? '照顾'
  );
}
function statusLabel(status: TaskSummary['status']) {
  return { PENDING: '待处理', COMPLETED: '已完成', SKIPPED: '已跳过', CANCELLED: '已取消' }[status];
}
function statusStyle(status: TaskSummary['status']) {
  return status === 'PENDING'
    ? styles.pending
    : status === 'COMPLETED'
      ? styles.completed
      : styles.inactive;
}

const styles = StyleSheet.create({
  content: { gap: spacing.xxl, paddingBottom: spacing.xxxl },
  heading: { gap: spacing.sm, alignItems: 'flex-start' },
  eyebrow: { ...typography.secondary, color: colors.brand, fontWeight: '600' },
  title: { ...typography.h1, color: colors.ink },
  badge: { borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  pending: { backgroundColor: colors.brandSoft },
  completed: { backgroundColor: colors.successSoft },
  inactive: { backgroundColor: colors.divider },
  badgeText: { fontSize: 12, fontWeight: '600', color: colors.ink },
  info: { gap: spacing.xs, paddingTop: spacing.md },
  label: { ...typography.secondary, color: colors.textSecondary },
  value: { ...typography.body, color: colors.ink },
  primary: {
    minHeight: 48,
    borderRadius: radii.input,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  primaryText: { color: colors.surface, fontWeight: '700' },
});
