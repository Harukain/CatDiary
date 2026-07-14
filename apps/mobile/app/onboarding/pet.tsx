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
  TextButton,
  Title,
} from '../../src/shared/ui/primitives';

export default function CreateFirstPetRoute() {
  const router = useRouter();
  const { session, activeFamily } = useSession();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!activeFamily) return <Redirect href="/onboarding/family" />;
  const canManage = activeFamily.role === 'OWNER' || activeFamily.role === 'ADMIN';

  if (!canManage) {
    return (
      <Screen>
        <BrandHeader title="添加猫咪" subtitle={`当前家庭：${activeFamily.name}`} />
        <Card>
          <Title>需要管理员权限</Title>
          <Body>只有家庭创建者或管理员可以添加猫咪档案。</Body>
          <TextButton label="返回猫咪档案" onPress={() => router.replace('/pets')} />
        </Card>
      </Screen>
    );
  }

  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await authApi.createPet(session!.accessToken, activeFamily!.id, name.trim());
      router.replace('/(tabs)');
    } catch (cause) {
      setError(cause instanceof AuthApiError ? cause.message : '猫咪档案创建失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <BrandHeader title="添加猫咪" subtitle={`档案将保存到「${activeFamily.name}」`} />
      <Card>
        <Title>它叫什么名字？</Title>
        <Body>先创建基础档案，生日、品种和头像可以稍后补充。</Body>
        <Field
          label="猫咪名字"
          value={name}
          maxLength={30}
          autoFocus
          placeholder="请输入猫咪名字"
          error={error}
          onChangeText={(value) => {
            setName(value);
            setError('');
          }}
        />
        <PrimaryButton
          label="创建猫咪档案"
          busy={busy}
          disabled={!name.trim() || name.trim().length > 30}
          onPress={submit}
        />
        <TextButton label="稍后添加" onPress={() => router.replace('/(tabs)')} />
      </Card>
    </Screen>
  );
}
