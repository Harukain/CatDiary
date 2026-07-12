import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { authApi, type ExportJobSummary } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import { shareDataExport } from '../../src/features/exports/share-export';
import {
  Body,
  Card,
  ErrorText,
  PrimaryButton,
  Screen,
  Title,
} from '../../src/shared/ui/primitives';

export default function ExportSettingsRoute() {
  const router = useRouter();
  const { session, activeFamily } = useSession();
  const isAdmin = activeFamily?.role === 'OWNER' || activeFamily?.role === 'ADMIN';
  const [format, setFormat] = useState<'JSON' | 'CSV'>('JSON');
  const [scope, setScope] = useState<'FAMILY' | 'PERSONAL'>(isAdmin ? 'FAMILY' : 'PERSONAL');
  const [job, setJob] = useState<ExportJobSummary>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function start() {
    if (!session || !activeFamily || busy) return;
    setBusy(true);
    setError('');
    try {
      let current = await authApi.createExport(
        session.accessToken,
        activeFamily.id,
        format,
        scope,
        `export-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      );
      setJob(current);
      for (
        let attempt = 0;
        attempt < 90 && ['QUEUED', 'PROCESSING'].includes(current.status);
        attempt += 1
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        current = await authApi.getExport(session.accessToken, activeFamily.id, current.id);
        setJob(current);
      }
      if (current.status !== 'READY')
        throw new Error(
          current.status === 'FAILED'
            ? '导出生成失败，请稍后重试'
            : '导出仍在处理中，请稍后返回查看',
        );
      await shareDataExport(
        session.accessToken,
        activeFamily.id,
        current.id,
        activeFamily.name,
        format,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导出失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <View style={styles.nav}>
        <Pressable accessibilityLabel="返回" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.navTitle}>数据导出</Text>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.title}>带走属于你的数据</Text>
          <Text style={styles.subtitle}>导出文件异步生成，完成后通过系统分享保存。</Text>
        </View>
        <Card>
          <Title>导出格式</Title>
          <View style={styles.options}>
            <Option
              label="JSON"
              detail="结构完整，适合备份和迁移"
              active={format === 'JSON'}
              onPress={() => setFormat('JSON')}
            />
            <Option
              label="CSV"
              detail="可使用表格工具查看"
              active={format === 'CSV'}
              onPress={() => setFormat('CSV')}
            />
          </View>
          <Title>导出范围</Title>
          <View style={styles.options}>
            {isAdmin ? (
              <Option
                label="整个家庭"
                detail="猫咪、计划、任务、记录、医疗和照片元数据"
                active={scope === 'FAMILY'}
                onPress={() => setScope('FAMILY')}
              />
            ) : null}
            <Option
              label="仅我的数据"
              detail="个人资料、本人记录、照片和通知偏好"
              active={scope === 'PERSONAL'}
              onPress={() => setScope('PERSONAL')}
            />
          </View>
          {job ? (
            <View style={styles.status}>
              <Ionicons
                name={
                  job.status === 'READY'
                    ? 'checkmark-circle'
                    : job.status === 'FAILED'
                      ? 'alert-circle'
                      : 'time-outline'
                }
                size={20}
                color={
                  job.status === 'READY'
                    ? colors.successDark
                    : job.status === 'FAILED'
                      ? colors.dangerDark
                      : colors.warningDark
                }
              />
              <View>
                <Text style={styles.statusTitle}>{statusLabel(job.status)}</Text>
                {job.expiresAt ? (
                  <Text style={styles.statusBody}>
                    文件保留至 {new Date(job.expiresAt).toLocaleString('zh-CN')}
                  </Text>
                ) : null}
              </View>
              {busy ? <ActivityIndicator color={colors.brand} /> : null}
            </View>
          ) : null}
          {error ? <ErrorText>{error}</ErrorText> : null}
          <PrimaryButton label="生成并分享导出文件" busy={busy} onPress={() => void start()} />
        </Card>
        <View style={styles.notice}>
          <Ionicons name="lock-closed-outline" size={20} color={colors.brand} />
          <Body>普通成员不能导出全家庭数据。文件 7 天后自动删除，下载链接 10 分钟失效。</Body>
        </View>
      </ScrollView>
    </Screen>
  );
}
function Option({
  label,
  detail,
  active,
  onPress,
}: {
  label: string;
  detail: string;
  active: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.option, active && styles.optionActive]}
    >
      <View style={styles.optionIcon}>
        <Ionicons
          name={active ? 'radio-button-on' : 'radio-button-off'}
          size={20}
          color={active ? colors.brand : colors.textTertiary}
        />
      </View>
      <View style={styles.optionBody}>
        <Text style={styles.optionTitle}>{label}</Text>
        <Text style={styles.optionDetail}>{detail}</Text>
      </View>
    </Pressable>
  );
}
function statusLabel(status: ExportJobSummary['status']) {
  return status === 'QUEUED'
    ? '等待生成'
    : status === 'PROCESSING'
      ? '正在整理数据'
      : status === 'READY'
        ? '导出已完成'
        : status === 'FAILED'
          ? '生成失败'
          : '文件已过期';
}
const styles = StyleSheet.create({
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navTitle: { ...typography.h3, color: colors.ink },
  content: { gap: spacing.xl, paddingBottom: 104 },
  title: { ...typography.h1, color: colors.ink },
  subtitle: { ...typography.secondary, color: colors.textSecondary, marginTop: spacing.xs },
  options: { gap: spacing.sm },
  option: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionActive: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  optionIcon: { width: 24 },
  optionBody: { flex: 1, gap: spacing.xs },
  optionTitle: { ...typography.h3, color: colors.ink },
  optionDetail: { ...typography.caption, color: colors.textSecondary },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.input,
    backgroundColor: colors.page,
  },
  statusTitle: { ...typography.h3, color: colors.ink },
  statusBody: { ...typography.caption, color: colors.textSecondary },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radii.input,
    backgroundColor: colors.brandSoft,
    padding: spacing.lg,
  },
});
