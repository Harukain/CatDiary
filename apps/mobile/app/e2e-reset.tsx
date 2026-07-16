import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, typography } from '@cat-diary/design-tokens';
import { isE2eLocalResetEnabled } from '../src/features/auth/e2e-reset';
import { useSession } from '../src/features/auth/session-provider';
import { runtimeConfig } from '../src/shared/config/runtime-config';
import { Body, Card, Screen, Title } from '../src/shared/ui/primitives';

export default function E2EResetRoute() {
  const router = useRouter();
  const { restoring, signOut } = useSession();
  const [message, setMessage] = useState('正在清理本机测试状态…');
  const started = useRef(false);

  useEffect(() => {
    if (restoring || started.current) return;
    started.current = true;

    if (!isE2eLocalResetEnabled(runtimeConfig.appEnvironment)) {
      setMessage('当前构建不允许执行 E2E 本机重置。');
      router.replace('/');
      return;
    }

    void signOut()
      .catch(() => {
        setMessage('本机状态已尽力清理，正在返回登录页…');
      })
      .finally(() => {
        router.replace('/(auth)/login');
      });
  }, [restoring, router, signOut]);

  return (
    <Screen>
      <View style={{ paddingTop: spacing.xxxl }}>
        <Card>
          <Title>测试状态重置</Title>
          <Text testID="e2e-reset.status" style={{ ...typography.secondary, color: colors.brand }}>
            {message}
          </Text>
          <Body>该入口仅用于 Development Build 的自动化验收，不会在预览或生产构建中执行。</Body>
        </Card>
      </View>
    </Screen>
  );
}
