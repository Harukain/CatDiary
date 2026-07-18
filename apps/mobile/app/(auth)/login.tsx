import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { colors, spacing, typography } from '@cat-diary/design-tokens';
import { otpSchema, phoneSchema } from '@cat-diary/validation';
import { authApi, AuthApiError } from '../../src/features/auth/auth-api';
import { resolveLoginRedirect } from '../../src/features/auth/login-flow';
import { useSession } from '../../src/features/auth/session-provider';
import { getOrCreateDeviceId } from '../../src/features/auth/session-store';
import { legalLinks } from '../../src/features/legal/legal-links';
import {
  Body,
  BrandHeader,
  Card,
  ErrorText,
  Field,
  PrimaryButton,
  Screen,
  TextButton,
  Title,
} from '../../src/shared/ui/primitives';

export default function LoginRoute() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string | string[] }>();
  const { restoring, session, signIn } = useSession();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [legalOpening, setLegalOpening] = useState<'terms' | 'privacy' | null>(null);
  const [legalError, setLegalError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const phoneValid = useMemo(() => phoneSchema.safeParse(phone).success, [phone]);
  const codeValid = useMemo(() => otpSchema.safeParse(code).success, [code]);
  const redirectAfterLogin = resolveLoginRedirect(next);
  const canSendCode = !restoring && !session && phoneValid && !busy;
  const canVerify = !restoring && !session && phoneValid && codeValid && !busy;
  const canChangePhone = !busy;
  const canResendCode = canSendCode && cooldown === 0;
  const canOpenLegalLinks = !busy && !legalOpening;

  useEffect(() => {
    if (!cooldown) return;
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);
  if (restoring) {
    return (
      <Screen>
        <BrandHeader title="猫伴日记" subtitle="正在恢复登录状态" />
        <Card testID="login.restoring.card" elevated>
          <Title>正在确认账号</Title>
          <Body>恢复完成后再进入登录流程，避免重复发送验证码或覆盖当前会话。</Body>
          <ActivityIndicator color={colors.brand} />
        </Card>
      </Screen>
    );
  }
  if (session) return <Redirect href={redirectAfterLogin} />;

  async function openLegalLink(kind: 'terms' | 'privacy', url: string | undefined) {
    if (!url || !canOpenLegalLinks) return;
    setLegalOpening(kind);
    setLegalError('');
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error('unsupported-url');
      await Linking.openURL(url);
    } catch {
      setLegalError(
        kind === 'terms' ? '用户协议打开失败，请稍后重试。' : '隐私政策打开失败，请稍后重试。',
      );
    } finally {
      setLegalOpening(null);
    }
  }

  async function sendCode() {
    if (!canSendCode) return;
    setBusy(true);
    setError('');
    setLegalError('');
    try {
      const result = await authApi.sendCode(phone);
      setCooldown(result.cooldownSeconds);
      setStep('code');
    } catch (cause) {
      setError(cause instanceof AuthApiError ? cause.message : '暂时无法获取验证码，请检查网络');
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!canVerify) return;
    setBusy(true);
    setError('');
    setLegalError('');
    try {
      const deviceId = await getOrCreateDeviceId();
      const nextSession = await authApi.verifyCode(phone, code, deviceId);
      await signIn(nextSession);
      router.replace(redirectAfterLogin);
    } catch (cause) {
      setError(cause instanceof AuthApiError ? cause.message : '登录失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <BrandHeader subtitle="把每一次照顾，变成安心可追溯的日常" />
        <View style={styles.spacer} />
        <Card elevated>
          <Title>{step === 'phone' ? '手机号登录' : '输入验证码'}</Title>
          <Body>
            {step === 'phone'
              ? '登录后可与家人共同记录和照顾猫咪。'
              : `验证码已发送至 ${phone.slice(0, 3)}****${phone.slice(-4)}`}
          </Body>
          <Field
            testID={step === 'phone' ? 'login.phone.input' : 'login.code.input'}
            label={step === 'phone' ? '手机号' : '验证码'}
            keyboardType="number-pad"
            maxLength={step === 'phone' ? 11 : 6}
            autoFocus
            value={step === 'phone' ? phone : code}
            placeholder={step === 'phone' ? '请输入 11 位手机号' : '请输入 6 位验证码'}
            error={error}
            onChangeText={(value) => {
              setError('');
              if (step === 'phone') {
                setPhone(value.replace(/\D/g, ''));
                setCode('');
              } else setCode(value.replace(/\D/g, ''));
            }}
          />
          <PrimaryButton
            testID={step === 'phone' ? 'login.send-code.button' : 'login.verify.button'}
            label={step === 'phone' ? '获取验证码' : '登录'}
            busy={busy}
            disabled={step === 'phone' ? !canSendCode : !canVerify}
            onPress={step === 'phone' ? sendCode : verify}
          />
          <View style={styles.legal}>
            <Text style={styles.legalText}>继续即表示你已阅读并同意</Text>
            {legalError ? <ErrorText testID="login.legal.error">{legalError}</ErrorText> : null}
            {legalLinks.terms && legalLinks.privacyPolicy ? (
              <View testID="login.legal.links" style={styles.legalLinks}>
                <Pressable
                  testID="login.terms.link"
                  accessibilityRole="link"
                  accessibilityState={{ disabled: !canOpenLegalLinks }}
                  disabled={!canOpenLegalLinks}
                  onPress={() => void openLegalLink('terms', legalLinks.terms)}
                  style={({ pressed }) => [styles.legalLinkButton, pressed && styles.legalPressed]}
                >
                  <Text style={[styles.legalLink, !canOpenLegalLinks && styles.legalLinkDisabled]}>
                    《用户协议》
                  </Text>
                </Pressable>
                <Text style={styles.legalText}>与</Text>
                <Pressable
                  testID="login.privacy.link"
                  accessibilityRole="link"
                  accessibilityState={{ disabled: !canOpenLegalLinks }}
                  disabled={!canOpenLegalLinks}
                  onPress={() => void openLegalLink('privacy', legalLinks.privacyPolicy)}
                  style={({ pressed }) => [styles.legalLinkButton, pressed && styles.legalPressed]}
                >
                  <Text style={[styles.legalLink, !canOpenLegalLinks && styles.legalLinkDisabled]}>
                    《隐私政策》
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.legalText}>《用户协议》与《隐私政策》</Text>
            )}
          </View>
          {step === 'code' ? (
            <View style={styles.actions}>
              <TextButton
                testID="login.change-phone.button"
                label="更换手机号"
                disabled={!canChangePhone}
                onPress={() => {
                  setStep('phone');
                  setCode('');
                  setError('');
                }}
              />
              <TextButton
                testID="login.resend-code.button"
                label={cooldown ? `${cooldown} 秒后重发` : '重新发送'}
                disabled={!canResendCode}
                onPress={sendCode}
              />
            </View>
          ) : null}
          {__DEV__ && step === 'code' ? (
            <Text style={styles.dev}>开发环境验证码：123456</Text>
          ) : null}
        </Card>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  spacer: { flex: 1 },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
  dev: { ...typography.caption, color: colors.textTertiary, textAlign: 'center' },
  legal: { alignItems: 'center', gap: spacing.xs },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    columnGap: spacing.xs,
  },
  legalText: { ...typography.caption, color: colors.textSecondary },
  legalLink: { ...typography.caption, color: colors.brand, fontWeight: '600' },
  legalLinkButton: { minHeight: 44, justifyContent: 'center' },
  legalLinkDisabled: { color: colors.textTertiary },
  legalPressed: { opacity: 0.72 },
});
