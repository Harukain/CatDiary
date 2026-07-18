import { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { colors } from '@cat-diary/design-tokens';
import { authApi, AuthApiError } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import {
  Body,
  BrandHeader,
  Card,
  Field,
  PrimaryButton,
  Screen,
  Title,
} from '../../src/shared/ui/primitives';

export default function CreateFamilyRoute() {
  const router = useRouter();
  const { restoring, session, addFamily } = useSession();
  const [name, setName] = useState('我的猫咪家庭');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const trimmedName = name.trim();
  const nameTooLong = trimmedName.length > 40;
  const canSubmit = !!session && !!trimmedName && !nameTooLong && !busy;
  if (restoring) {
    return (
      <Screen>
        <BrandHeader title="创建家庭" subtitle="正在恢复登录状态" />
        <Card testID="onboarding.family.restoring.card">
          <Title>正在确认账号</Title>
          <Body>恢复完成后再创建家庭，避免把家庭建到错误账号下。</Body>
          <ActivityIndicator color={colors.brand} />
        </Card>
      </Screen>
    );
  }
  if (!session) return <Redirect href="/(auth)/login" />;

  async function submit() {
    if (!session || !canSubmit) return;
    setBusy(true);
    setError('');
    try {
      const family = await authApi.createFamily(session.accessToken, trimmedName);
      addFamily(family);
      router.replace('/onboarding/pet');
    } catch (cause) {
      setError(cause instanceof AuthApiError ? cause.message : '家庭创建失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <BrandHeader title="创建家庭" subtitle="家庭用于归档猫咪、任务和所有成员的照顾记录" />
      <Card>
        <Title>先给家庭起个名字</Title>
        <Body>之后可以在“我的”中修改，也可以邀请家人共同照顾。</Body>
        <Field
          testID="onboarding.family.name.input"
          label="家庭名称"
          value={name}
          maxLength={40}
          autoFocus
          placeholder="例如：团子和年糕的家"
          error={error}
          editable={!busy}
          onChangeText={(value) => {
            setName(value);
            setError('');
          }}
        />
        <PrimaryButton
          testID="onboarding.family.submit.button"
          label="创建家庭"
          busy={busy}
          disabled={!canSubmit}
          onPress={submit}
        />
      </Card>
    </Screen>
  );
}
