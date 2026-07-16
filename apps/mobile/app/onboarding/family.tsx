import { useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
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
  const { session, addFamily } = useSession();
  const [name, setName] = useState('我的猫咪家庭');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!session) return <Redirect href="/(auth)/login" />;

  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const family = await authApi.createFamily(session!.accessToken, name.trim());
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
          onChangeText={(value) => {
            setName(value);
            setError('');
          }}
        />
        <PrimaryButton
          testID="onboarding.family.submit.button"
          label="创建家庭"
          busy={busy}
          disabled={!name.trim() || name.trim().length > 40}
          onPress={submit}
        />
      </Card>
    </Screen>
  );
}
