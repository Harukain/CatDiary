import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@cat-diary/design-tokens';
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
  const { token } = useLocalSearchParams<{ token?: string | string[] }>();
  const { restoring, session, addFamily } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inviteToken = Array.isArray(token) ? token[0] : token;
  const invitePath = inviteToken ? `/family-invites/${encodeURIComponent(inviteToken)}` : '/';
  const canAccept = !!session && !!inviteToken && !busy;
  if (restoring) {
    return (
      <Screen>
        <BrandHeader title="家庭邀请" subtitle="正在恢复登录状态" />
        <Card testID="family-invite.restoring.card">
          <Title>正在确认账号</Title>
          <Body>恢复完成后再处理家庭邀请，避免把邀请接受到错误账号下。</Body>
          <ActivityIndicator color={colors.brand} />
        </Card>
      </Screen>
    );
  }
  if (!inviteToken) {
    return (
      <Screen>
        <BrandHeader title="家庭邀请" subtitle="加入后可共同完成任务并记录猫咪日常" />
        <Card testID="family-invite.invalid-token.card">
          <Title>邀请链接不可用</Title>
          <Body>当前链接缺少邀请码。请让家庭管理员重新发送邀请链接。</Body>
          <TextButton
            testID="family-invite.invalid-token.return.button"
            label="返回首页"
            onPress={() => router.replace('/')}
          />
        </Card>
      </Screen>
    );
  }
  if (!session)
    return <Redirect href={{ pathname: '/(auth)/login', params: { next: invitePath } }} />;

  async function accept() {
    if (!session) {
      setError('登录状态已失效，请重新登录后再试');
      return;
    }
    if (!canAccept) return;
    setBusy(true);
    setError('');
    try {
      const family = await authApi.acceptInvite(session.accessToken, inviteToken);
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
        <View testID="family-invite.title">
          <Title>确认加入家庭</Title>
        </View>
        <Body>系统会校验邀请绑定的手机号。加入后可以查看该家庭的猫咪、任务和记录。</Body>
        {error ? (
          <View testID="family-invite.error.text">
            <ErrorText>{error}</ErrorText>
          </View>
        ) : null}
        <PrimaryButton
          testID="family-invite.accept.button"
          label="接受邀请"
          busy={busy}
          disabled={!canAccept}
          onPress={accept}
        />
        <TextButton
          testID="family-invite.dismiss.button"
          label="暂不加入"
          disabled={busy}
          onPress={() => router.replace('/')}
        />
      </Card>
    </Screen>
  );
}
