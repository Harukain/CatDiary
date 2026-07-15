import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { authApi, type ExportJobSummary } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import {
  canEditDataExportOptions,
  dataExportButtonLabel,
  dataExportPhaseFromStatus,
  type DataExportPhase,
} from '../../src/features/exports/export-flow';
import { shareDataExport } from '../../src/features/exports/share-export';
import { Body, Card, ErrorText, Screen, Title } from '../../src/shared/ui/primitives';

export default function ExportSettingsRoute() {
  const router = useRouter();
  const { session, activeFamily } = useSession();
  const isAdmin = activeFamily?.role === 'OWNER' || activeFamily?.role === 'ADMIN';
  const [format, setFormat] = useState<'JSON' | 'CSV'>('JSON');
  const [scope, setScope] = useState<'FAMILY' | 'PERSONAL'>(isAdmin ? 'FAMILY' : 'PERSONAL');
  const [job, setJob] = useState<ExportJobSummary>();
  const [phase, setPhase] = useState<DataExportPhase>('idle');
  const [error, setError] = useState('');
  const busy = phase !== 'idle';
  const canEditOptions = canEditDataExportOptions(phase);
  const requestReturn = useCallback(() => {
    if (!busy) {
      router.back();
      return;
    }
    Alert.alert(
      '导出正在进行',
      '当前导出会在本页生成完成后打开系统分享。请等待完成，避免重复申请或丢失分享入口。',
      [{ text: '继续等待', style: 'cancel' }],
    );
  }, [busy, router]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!busy) return false;
      requestReturn();
      return true;
    });
    return () => subscription.remove();
  }, [busy, requestReturn]);
  async function start() {
    if (!session || !activeFamily || busy) return;
    const selectedFormat = format;
    const selectedScope = scope;
    setPhase('queued');
    setError('');
    try {
      let current = await authApi.createExport(
        session.accessToken,
        activeFamily.id,
        selectedFormat,
        selectedScope,
        `export-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      );
      setJob(current);
      setPhase(dataExportPhaseFromStatus(current.status));
      for (
        let attempt = 0;
        attempt < 90 && ['QUEUED', 'PROCESSING'].includes(current.status);
        attempt += 1
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        current = await authApi.getExport(session.accessToken, activeFamily.id, current.id);
        setJob(current);
        setPhase(dataExportPhaseFromStatus(current.status));
      }
      if (current.status !== 'READY')
        throw new Error(
          current.status === 'FAILED'
            ? '导出生成失败，请稍后重试'
            : '导出仍在处理中，请稍后返回查看',
        );
      setPhase('sharing');
      await shareDataExport(
        session.accessToken,
        activeFamily.id,
        current.id,
        activeFamily.name,
        selectedFormat,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导出失败');
    } finally {
      setPhase('idle');
    }
  }
  return (
    <Screen>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <View style={styles.nav}>
        <Pressable
          accessibilityLabel="返回"
          accessibilityHint={busy ? '导出进行中，点击会提示继续等待' : '返回上一页'}
          onPress={requestReturn}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
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
              disabled={!canEditOptions}
              onPress={() => setFormat('JSON')}
            />
            <Option
              label="CSV"
              detail="可使用表格工具查看"
              active={format === 'CSV'}
              disabled={!canEditOptions}
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
                disabled={!canEditOptions}
                onPress={() => setScope('FAMILY')}
              />
            ) : null}
            <Option
              label="仅我的数据"
              detail="个人资料、本人记录、照片和通知偏好"
              active={scope === 'PERSONAL'}
              disabled={!canEditOptions}
              onPress={() => setScope('PERSONAL')}
            />
          </View>
          {!canEditOptions ? (
            <Text style={styles.lockedHint}>导出生成中，格式和范围已锁定。</Text>
          ) : null}
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
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || !session || !activeFamily }}
            disabled={busy || !session || !activeFamily}
            onPress={() => void start()}
            style={({ pressed }) => [
              styles.exportButton,
              (busy || !session || !activeFamily) && styles.exportButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            {busy ? <ActivityIndicator color={colors.surface} /> : null}
            <Text style={styles.exportButtonText}>{dataExportButtonLabel(phase)}</Text>
          </Pressable>
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
  disabled,
  onPress,
}: {
  label: string;
  detail: string;
  active: boolean;
  disabled?: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        active && styles.optionActive,
        disabled && styles.optionDisabled,
        pressed && styles.pressed,
      ]}
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
  optionDisabled: { opacity: 0.62 },
  optionIcon: { width: 24 },
  optionBody: { flex: 1, gap: spacing.xs },
  optionTitle: { ...typography.h3, color: colors.ink },
  optionDetail: { ...typography.caption, color: colors.textSecondary },
  lockedHint: { ...typography.caption, color: colors.warningDark },
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
  exportButton: {
    minHeight: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  exportButtonDisabled: { opacity: 0.72 },
  exportButtonText: { ...typography.body, color: colors.surface, fontWeight: '700' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
