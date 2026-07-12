import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { colors, typography } from '@cat-diary/design-tokens';
import { otpSchema, phoneSchema } from '@cat-diary/validation';
import { authApi, AuthApiError } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import { getOrCreateDeviceId } from '../../src/features/auth/session-store';
import { legalLinks } from '../../src/features/legal/legal-links';
import {
  Body,
  BrandHeader,
  Card,
  Field,
  PrimaryButton,
  Screen,
  TextButton,
  Title,
} from '../../src/shared/ui/primitives';

export default function LoginRoute() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { restoring, session, signIn } = useSession();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const phoneValid = useMemo(() => phoneSchema.safeParse(phone).success, [phone]);
  const codeValid = useMemo(() => otpSchema.safeParse(code).success, [code]);

  useEffect(() => {
    if (!cooldown) return;
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);
  if (!restoring && session) return <Redirect href="/" />;

  async function sendCode() {
    if (!phoneValid || busy) return;
    setBusy(true);
    setError('');
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
    if (!codeValid || busy) return;
    setBusy(true);
    setError('');
    try {
      const deviceId = await getOrCreateDeviceId();
      const nextSession = await authApi.verifyCode(phone, code, deviceId);
      await signIn(nextSession);
      router.replace(next?.startsWith('/family-invites/') ? (next as Href) : '/');
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
        <Card>
          <Title>{step === 'phone' ? '手机号登录' : '输入验证码'}</Title>
          <Body>
            {step === 'phone'
              ? '登录后可与家人共同记录和照顾猫咪。'
              : `验证码已发送至 ${phone.slice(0, 3)}****${phone.slice(-4)}`}
          </Body>
          <Field
            label={step === 'phone' ? '手机号' : '验证码'}
            keyboardType="number-pad"
            maxLength={step === 'phone' ? 11 : 6}
            autoFocus
            value={step === 'phone' ? phone : code}
            placeholder={step === 'phone' ? '请输入 11 位手机号' : '请输入 6 位验证码'}
            error={error}
            onChangeText={(value) => {
              setError('');
              if (step === 'phone') setPhone(value.replace(/\D/g, ''));
              else setCode(value.replace(/\D/g, ''));
            }}
          />
          <PrimaryButton
            label={step === 'phone' ? '获取验证码' : '登录'}
            busy={busy}
            disabled={step === 'phone' ? !phoneValid : !codeValid}
            onPress={step === 'phone' ? sendCode : verify}
          />
          <View style={styles.legal}>
            <Text style={styles.legalText}>继续即表示你已阅读并同意</Text>
            {legalLinks.terms && legalLinks.privacyPolicy ? (
              <View style={styles.legalLinks}>
                <Pressable
                  accessibilityRole="link"
                  onPress={() => void Linking.openURL(legalLinks.terms!)}
                >
                  <Text style={styles.legalLink}>《用户协议》</Text>
                </Pressable>
                <Text style={styles.legalText}>与</Text>
                <Pressable
                  accessibilityRole="link"
                  onPress={() => void Linking.openURL(legalLinks.privacyPolicy!)}
                >
                  <Text style={styles.legalLink}>《隐私政策》</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.legalText}>《用户协议》与《隐私政策》</Text>
            )}
          </View>
          {step === 'code' ? (
            <View style={styles.actions}>
              <TextButton
                label="更换手机号"
                onPress={() => {
                  setStep('phone');
                  setCode('');
                  setError('');
                }}
              />
              <TextButton
                label={cooldown ? `${cooldown} 秒后重发` : '重新发送'}
                disabled={cooldown > 0}
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
  legal: { alignItems: 'center' },
  legalLinks: { flexDirection: 'row', alignItems: 'center' },
  legalText: { ...typography.caption, color: colors.textSecondary },
  legalLink: { ...typography.caption, color: colors.brand, fontWeight: '600' },
});
