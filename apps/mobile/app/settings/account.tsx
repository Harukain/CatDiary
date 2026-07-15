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
import {
  AuthApiError,
  authApi,
  type AccountDeletionStatus,
} from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import {
  isAccountDeletionDraftDirty,
  sanitizeDeletionCode,
} from '../../src/features/account/account-deletion-form';
import {
  Body,
  Card,
  ErrorText,
  Field,
  PrimaryButton,
  Screen,
  TextButton,
  Title,
} from '../../src/shared/ui/primitives';

export default function AccountSettingsRoute() {
  const router = useRouter();
  const { session, signOut } = useSession();
  const [status, setStatus] = useState<AccountDeletionStatus>();
  const [code, setCode] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const draftDirty = useMemo(
    () => isAccountDeletionDraftDirty({ code, maskedPhone }),
    [code, maskedPhone],
  );
  useEffect(() => {
    if (session)
      void authApi
        .getAccountDeletionStatus(session.accessToken)
        .then(setStatus)
        .catch((cause) => setError(cause instanceof Error ? cause.message : '账号状态加载失败'));
  }, [session]);
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((value) => Math.max(value - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);
  const requestReturn = useCallback(() => {
    if (busy) return;
    if (!draftDirty) {
      router.back();
      return;
    }
    Alert.alert('离开账号注销流程？', '当前验证码或已发送状态不会保留，离开后需要重新操作。', [
      { text: '继续处理', style: 'cancel' },
      {
        text: '放弃并返回',
        style: 'destructive',
        onPress: () => router.back(),
      },
    ]);
  }, [busy, draftDirty, router]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (busy) return true;
      if (!draftDirty) return false;
      requestReturn();
      return true;
    });
    return () => subscription.remove();
  }, [busy, draftDirty, requestReturn]);
  async function sendCode() {
    if (!session || busy || cooldownSeconds > 0) return;
    setBusy(true);
    setError('');
    try {
      const result = await authApi.sendAccountDeletionCode(session.accessToken);
      setMaskedPhone(result.maskedPhone);
      setCooldownSeconds(result.cooldownSeconds);
      Alert.alert('验证码已发送', `验证码已发送至 ${result.maskedPhone}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '验证码发送失败');
    } finally {
      setBusy(false);
    }
  }
  function confirmRequest() {
    const normalizedCode = sanitizeDeletionCode(code);
    if (normalizedCode.length !== 6) return setError('请输入 6 位验证码');
    Alert.alert(
      '申请注销账号？',
      '提交后将退出所有设备，并进入 7 天冷静期。冷静期内重新登录可以取消注销。',
      [
        { text: '取消', style: 'cancel' },
        { text: '申请注销', style: 'destructive', onPress: () => void requestDeletion() },
      ],
    );
  }
  async function requestDeletion() {
    if (!session) return;
    const normalizedCode = sanitizeDeletionCode(code);
    setBusy(true);
    setError('');
    try {
      await authApi.requestAccountDeletion(session.accessToken, normalizedCode);
      await signOut();
      router.replace('/(auth)/login');
    } catch (cause) {
      const message =
        cause instanceof AuthApiError && cause.code === 'ADMIN_TRANSFER_REQUIRED'
          ? '你仍是某个家庭的最后管理员，请先添加或指定另一位管理员。'
          : cause instanceof Error
            ? cause.message
            : '注销申请失败';
      setError(message);
      setBusy(false);
    }
  }
  async function cancelDeletion() {
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      const next = await authApi.cancelAccountDeletion(session.accessToken);
      setStatus(next);
      Alert.alert('已取消注销', '账号和家庭访问已经恢复。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '取消失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <View style={styles.nav}>
        <Pressable
          accessibilityLabel="返回"
          disabled={busy}
          onPress={requestReturn}
          style={({ pressed }) => [
            styles.back,
            busy && styles.backDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.navTitle}>账号与注销</Text>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {!status && !error ? (
          <ActivityIndicator color={colors.brand} />
        ) : status?.status === 'PENDING_DELETION' ? (
          <>
            <View style={styles.pendingHero}>
              <View style={styles.pendingIcon}>
                <Ionicons name="time-outline" size={28} color={colors.warningDark} />
              </View>
              <Text style={styles.title}>账号处于注销冷静期</Text>
              <Body>
                计划注销时间：
                {status.coolingEndsAt
                  ? new Date(status.coolingEndsAt).toLocaleString('zh-CN')
                  : '处理中'}
              </Body>
            </View>
            <Card>
              <Title>还想继续使用猫伴日记？</Title>
              <Body>在冷静期结束前取消，猫咪档案、记录和家庭关系都会保留。</Body>
              <PrimaryButton
                label="取消账号注销"
                busy={busy}
                disabled={!status.canCancel}
                onPress={() => void cancelDeletion()}
              />
            </Card>
          </>
        ) : status ? (
          <>
            <View>
              <Text style={styles.title}>账号安全与数据权利</Text>
              <Text style={styles.subtitle}>
                你可以申请注销；我们会保留 7 天冷静期，避免误操作。
              </Text>
            </View>
            <Card>
              <Title>申请注销账号</Title>
              <Body>
                注销前需要验证码。若你是家庭最后一位管理员，需要先添加或指定另一位管理员。
              </Body>
              <View style={styles.codeRow}>
                <View style={styles.codeField}>
                  <Field
                    label="短信验证码"
                    value={code}
                    onChangeText={(value) => {
                      setCode(sanitizeDeletionCode(value));
                      setError('');
                    }}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="6 位验证码"
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy || cooldownSeconds > 0 }}
                  disabled={busy || cooldownSeconds > 0}
                  onPress={() => void sendCode()}
                  style={({ pressed }) => [
                    styles.codeButton,
                    (busy || cooldownSeconds > 0) && styles.codeButtonDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.codeButtonText}>
                    {cooldownSeconds > 0 ? `${cooldownSeconds}s 后重发` : '获取验证码'}
                  </Text>
                </Pressable>
              </View>
              {maskedPhone ? <Text style={styles.hint}>已发送至 {maskedPhone}</Text> : null}
              <TextButton
                label="申请注销账号"
                danger
                disabled={busy || code.length !== 6}
                onPress={confirmRequest}
              />
            </Card>
            <View style={styles.notice}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.brand} />
              <Body>注销到期后手机号会被不可逆匿名化；历史照顾记录仅保留匿名署名。</Body>
            </View>
          </>
        ) : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
      </ScrollView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backDisabled: { opacity: 0.45 },
  navTitle: { ...typography.h3, color: colors.ink },
  content: { gap: spacing.xl, paddingBottom: 104 },
  title: { ...typography.h1, color: colors.ink },
  subtitle: { ...typography.secondary, color: colors.textSecondary, marginTop: spacing.xs },
  codeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  codeField: { flex: 1 },
  codeButton: {
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  codeButtonDisabled: { opacity: 0.5 },
  codeButtonText: { ...typography.caption, color: colors.brand, fontWeight: '700' },
  hint: { ...typography.caption, color: colors.textSecondary },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radii.input,
    backgroundColor: colors.brandSoft,
    padding: spacing.lg,
  },
  pendingHero: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  pendingIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
