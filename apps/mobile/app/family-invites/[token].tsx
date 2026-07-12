import { useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { authApi, AuthApiError } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import {
  Body,
  BrandHeader,
  Card,
  ErrorText,
  PrimaryButton,
  Screen,
  TextButton,
  Title,
} from '../../src/shared/ui/primitives';

export default function AcceptInviteRoute() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session, addFamily } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!session)
    return (
      <Redirect
        href={{ pathname: '/(auth)/login', params: { next: `/family-invites/${token}` } }}
      />
    );

  async function accept() {
    if (!token || busy) return;
    setBusy(true);
    setError('');
    try {
      const family = await authApi.acceptInvite(session!.accessToken, token);
      addFamily(family);
      router.replace('/(tabs)');
    } catch (cause) {
      setError(cause instanceof AuthApiError ? cause.message : '接受邀请失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <BrandHeader title="家庭邀请" subtitle="加入后可共同完成任务并记录猫咪日常" />
      <Card>
        <Title>确认加入家庭</Title>
        <Body>系统会校验邀请绑定的手机号。加入后可以查看该家庭的猫咪、任务和记录。</Body>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <PrimaryButton label="接受邀请" busy={busy} onPress={accept} />
        <TextButton label="暂不加入" onPress={() => router.replace('/')} />
      </Card>
    </Screen>
  );
}
