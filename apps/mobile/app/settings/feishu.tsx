import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { authApi, type NotificationChannelSummary } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import { isFamilyManagerRole } from '../../src/features/family/member-actions';
import {
  feishuChannelStatusCopy,
  isFeishuWebhookDraftDirty,
  normalizeFeishuWebhookUrl,
  resolveFeishuChannelStatus,
  validateFeishuWebhookUrl,
} from '../../src/features/notifications/feishu-channel';
import {
  Body,
  Card,
  ErrorText,
  Field,
  PrimaryButton,
  Screen,
  SuccessText,
  TextButton,
  Title,
} from '../../src/shared/ui/primitives';

type Operation = '' | 'save' | 'test' | 'remove';

export default function FeishuSettingsRoute() {
  const router = useRouter();
  const { session, activeFamily } = useSession();
  const [channels, setChannels] = useState<NotificationChannelSummary[]>([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState<Operation>('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const canManage = isFamilyManagerRole(activeFamily?.role);
  const feishuChannel = useMemo(
    () => channels.find((channel) => channel.type === 'FEISHU'),
    [channels],
  );
  const channelStatus = resolveFeishuChannelStatus(feishuChannel);
  const statusCopy = feishuChannelStatusCopy(channelStatus);
  const draftDirty = isFeishuWebhookDraftDirty(webhookUrl);
  const webhookError = validateFeishuWebhookUrl(webhookUrl);
  const showWebhookError = touched && webhookError ? webhookError : '';
  const busy = Boolean(operation);

  const load = useCallback(async () => {
    if (!session || !activeFamily) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      setChannels(await authApi.listNotificationChannels(session.accessToken, activeFamily.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '飞书通知配置加载失败');
    } finally {
      setLoading(false);
    }
  }, [activeFamily, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const requestReturn = useCallback(() => {
    if (busy) {
      Alert.alert('飞书通知正在处理', '请等待当前操作完成，避免配置状态与服务器不一致。', [
        { text: '继续等待', style: 'cancel' },
      ]);
      return;
    }
    if (draftDirty) {
      Alert.alert('放弃未保存的 Webhook？', '离开后，当前输入的飞书 Webhook 不会保存。', [
        { text: '继续编辑', style: 'cancel' },
        { text: '放弃并返回', style: 'destructive', onPress: () => router.back() },
      ]);
      return;
    }
    router.back();
  }, [busy, draftDirty, router]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!busy && !draftDirty) return false;
      requestReturn();
      return true;
    });
    return () => subscription.remove();
  }, [busy, draftDirty, requestReturn]);

  async function saveWebhook() {
    if (!session || !activeFamily || !canManage || busy) return;
    setTouched(true);
    if (webhookError) return;
    setOperation('save');
    setError('');
    setSuccess('');
    try {
      const channel = await authApi.configureFeishuChannel(
        session.accessToken,
        activeFamily.id,
        normalizeFeishuWebhookUrl(webhookUrl),
      );
      setChannels((current) => [channel, ...current.filter((item) => item.type !== 'FEISHU')]);
      setWebhookUrl('');
      setTouched(false);
      setSuccess('飞书通知已保存。建议发送测试通知确认群内可收到。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '飞书通知保存失败');
    } finally {
      setOperation('');
    }
  }

  async function testWebhook() {
    if (!session || !activeFamily || !canManage || !feishuChannel || busy) return;
    setOperation('test');
    setError('');
    setSuccess('');
    try {
      await authApi.testFeishuChannel(session.accessToken, activeFamily.id);
      setSuccess('测试通知已发送，请在飞书群中确认。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '飞书测试发送失败');
    } finally {
      setOperation('');
    }
  }

  function confirmRemoveWebhook() {
    if (!canManage || !feishuChannel || busy) return;
    Alert.alert('移除飞书通知？', '移除后，家庭任务提醒不会再发送到当前飞书群。', [
      { text: '取消', style: 'cancel' },
      { text: '移除', style: 'destructive', onPress: () => void removeWebhook() },
    ]);
  }

  async function removeWebhook() {
    if (!session || !activeFamily || !canManage || !feishuChannel || busy) return;
    setOperation('remove');
    setError('');
    setSuccess('');
    try {
      await authApi.removeFeishuChannel(session.accessToken, activeFamily.id);
      setChannels((current) => current.filter((item) => item.type !== 'FEISHU'));
      setWebhookUrl('');
      setTouched(false);
      setSuccess('飞书通知已移除。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '飞书通知移除失败');
    } finally {
      setOperation('');
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <View style={styles.nav}>
        <Pressable
          accessibilityLabel="返回"
          accessibilityHint={busy || draftDirty ? '返回前会提示当前飞书配置状态' : '返回上一页'}
          onPress={requestReturn}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.navTitle}>飞书通知</Text>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.title}>家庭飞书群提醒</Text>
          <Text style={styles.subtitle}>配置后，家庭级照顾任务可通过飞书机器人同步提醒。</Text>
        </View>

        <Card>
          <View style={styles.cardHeader}>
            <Title>当前状态</Title>
            <View style={[styles.statusPill, channelStatus === 'configured' && styles.statusOn]}>
              <Text
                style={[styles.statusText, channelStatus === 'configured' && styles.statusTextOn]}
              >
                {statusCopy.title}
              </Text>
            </View>
          </View>
          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.brand} />
              <Text style={styles.loadingText}>正在加载飞书通知配置…</Text>
            </View>
          ) : (
            <>
              <Body>{statusCopy.detail}</Body>
              {feishuChannel?.maskedHint ? (
                <Text style={styles.meta}>Webhook 尾号：{feishuChannel.maskedHint}</Text>
              ) : null}
              {feishuChannel?.updatedAt ? (
                <Text style={styles.meta}>
                  最近更新：{new Date(feishuChannel.updatedAt).toLocaleString('zh-CN')}
                </Text>
              ) : null}
            </>
          )}
          {success ? <SuccessText>{success}</SuccessText> : null}
          {error ? <ErrorText>{error}</ErrorText> : null}
          {!loading && error ? <TextButton label="重新加载" onPress={() => void load()} /> : null}
        </Card>

        {canManage ? (
          <Card>
            <Title>配置 Webhook</Title>
            <Body>
              在飞书群添加“自定义机器人”后，复制 Webhook
              地址粘贴到这里。完整地址只会加密保存，不会在 App 中回显。
            </Body>
            <Field
              label="飞书机器人 Webhook"
              value={webhookUrl}
              error={showWebhookError}
              placeholder="https://open.feishu.cn/open-apis/bot/..."
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={!busy}
              onBlur={() => setTouched(true)}
              onChangeText={(value) => {
                setWebhookUrl(value);
                if (!touched && value.trim()) setTouched(true);
              }}
            />
            <PrimaryButton
              label="保存飞书 Webhook"
              busy={operation === 'save'}
              disabled={loading || busy || webhookError.length > 0}
              onPress={() => void saveWebhook()}
            />
            {webhookError ? (
              <Text style={styles.helper}>
                粘贴有效的飞书或 Lark 自定义机器人 Webhook 后即可保存。
              </Text>
            ) : null}
            <View style={styles.actionRow}>
              <TextButton
                label="发送测试通知"
                disabled={loading || busy || !feishuChannel}
                onPress={() => void testWebhook()}
              />
              <TextButton
                label="移除飞书通知"
                danger
                disabled={loading || busy || !feishuChannel}
                onPress={confirmRemoveWebhook}
              />
            </View>
            {!feishuChannel ? (
              <Text style={styles.helper}>保存 Webhook 后才能发送测试通知或移除。</Text>
            ) : null}
          </Card>
        ) : (
          <Card>
            <Title>只读状态</Title>
            <Body>
              当前账号不是家庭管理员，可以查看飞书通知状态，但不能配置、测试或移除 Webhook。
            </Body>
          </Card>
        )}

        <View style={styles.notice}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.successDark} />
          <Body>
            飞书 Webhook 会作为家庭级通知渠道保存；个人是否接收手机推送仍由“通知偏好”里的开关控制。
          </Body>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navTitle: { ...typography.h3, color: colors.ink },
  content: { gap: spacing.xl, paddingBottom: 104 },
  title: { ...typography.h1, color: colors.ink },
  subtitle: { ...typography.secondary, color: colors.textSecondary, marginTop: spacing.xs },
  cardHeader: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  statusPill: {
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusOn: { backgroundColor: colors.successSoft },
  statusText: { ...typography.caption, color: colors.warningDark, fontWeight: '600' },
  statusTextOn: { color: colors.successDark },
  loading: { minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadingText: { ...typography.caption, color: colors.textSecondary },
  meta: { ...typography.caption, color: colors.textSecondary },
  helper: { ...typography.caption, color: colors.textSecondary },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.successSoft,
    borderRadius: radii.input,
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
