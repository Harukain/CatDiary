import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler } from 'react-native';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@cat-diary/design-tokens';
import { authApi, AuthApiError } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import {
  isCreatePetDraftDirty,
  resolveCreatePetReturnTarget,
  shouldOpenCreatedPetProfile,
} from '../../src/features/pets/create-pet-flow';
import { resolveDraftExitDecision } from '../../src/shared/navigation/draft-exit';
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

export default function CreateFirstPetRoute() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { session, activeFamily } = useSession();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [petCount, setPetCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(true);
  const [countError, setCountError] = useState('');
  const returnTarget = resolveCreatePetReturnTarget(returnTo);
  const isDirty = isCreatePetDraftDirty(name);
  const maxPetsReached = typeof petCount === 'number' && petCount >= 5;
  const cancelLabel = returnTarget === 'pets' ? '返回猫咪档案' : '稍后添加';
  const canManage = activeFamily?.role === 'OWNER' || activeFamily?.role === 'ADMIN';
  const goToExitTarget = useCallback(() => {
    router.replace(returnTarget === 'pets' ? '/pets' : '/(tabs)');
  }, [returnTarget, router]);
  const loadPetCount = useCallback(() => {
    if (!session || !activeFamily) return;
    setCountLoading(true);
    setCountError('');
    void authApi
      .listPets(session.accessToken, activeFamily.id)
      .then((pets) => setPetCount(pets.length))
      .catch(() => {
        setCountError('猫咪数量确认失败，请重试后再添加。');
        setPetCount(null);
      })
      .finally(() => setCountLoading(false));
  }, [activeFamily, session]);
  useEffect(() => {
    loadPetCount();
  }, [loadPetCount]);
  const requestExit = useCallback(() => {
    const decision = resolveDraftExitDecision({ busy, isDirty });
    if (decision === 'wait') {
      Alert.alert('猫咪档案正在创建', '请等待当前保存完成，避免重复创建档案。', [
        { text: '继续等待', style: 'cancel' },
      ]);
      return;
    }
    if (decision === 'confirmDiscard') {
      Alert.alert('放弃未保存的猫咪档案？', '当前填写的猫咪名字尚未保存，离开后需要重新填写。', [
        { text: '继续填写', style: 'cancel' },
        { text: '放弃', style: 'destructive', onPress: goToExitTarget },
      ]);
      return;
    }
    goToExitTarget();
  }, [busy, goToExitTarget, isDirty]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      requestExit();
      return true;
    });
    return () => subscription.remove();
  }, [requestExit]);

  if (!session) return <Redirect href="/(auth)/login" />;
  if (!activeFamily) return <Redirect href="/onboarding/family" />;

  if (!canManage) {
    return (
      <Screen>
        <Stack.Screen options={{ gestureEnabled: false }} />
        <BrandHeader title="添加猫咪" subtitle={`当前家庭：${activeFamily.name}`} />
        <Card>
          <Title>需要管理员权限</Title>
          <Body>只有家庭创建者或管理员可以添加猫咪档案。</Body>
          <TextButton label={cancelLabel} onPress={goToExitTarget} />
        </Card>
      </Screen>
    );
  }

  async function submit() {
    if (!name.trim() || busy || countLoading || maxPetsReached || countError) return;
    setBusy(true);
    setError('');
    try {
      const createdPet = await authApi.createPet(
        session!.accessToken,
        activeFamily!.id,
        name.trim(),
      );
      if (shouldOpenCreatedPetProfile(returnTarget)) {
        router.replace({ pathname: '/pets/[id]', params: { id: createdPet.id } });
      } else {
        router.replace('/(tabs)');
      }
    } catch (cause) {
      setError(cause instanceof AuthApiError ? cause.message : '猫咪档案创建失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <BrandHeader title="添加猫咪" subtitle={`档案将保存到「${activeFamily.name}」`} />
      <Card>
        {countLoading ? (
          <>
            <Title>正在确认猫咪数量</Title>
            <Body>每个家庭最多可管理 5 只猫咪，确认后再创建新档案。</Body>
            <ActivityIndicator color={colors.brand} />
            <TextButton label={cancelLabel} onPress={requestExit} />
          </>
        ) : countError ? (
          <>
            <Title>暂时无法添加猫咪</Title>
            <Body>需要先确认当前家庭还没有达到 5 只猫咪上限。</Body>
            <ErrorText>{countError}</ErrorText>
            <PrimaryButton label="重新确认" onPress={loadPetCount} />
            <TextButton label={cancelLabel} onPress={requestExit} />
          </>
        ) : maxPetsReached ? (
          <>
            <Title>已达到 5 只上限</Title>
            <Body>当前家庭已经有 5 只猫咪。可以先整理已有档案，暂时不能继续新增。</Body>
            <PrimaryButton label="查看猫咪档案" onPress={() => router.replace('/pets')} />
          </>
        ) : (
          <>
            <Title>它叫什么名字？</Title>
            <Body>先创建基础档案，生日、品种和头像可以稍后补充。</Body>
            <Field
              testID="onboarding.pet.name.input"
              label="猫咪名字"
              value={name}
              maxLength={30}
              autoFocus
              placeholder="请输入猫咪名字"
              error={error}
              editable={!busy}
              onChangeText={(value) => {
                setName(value);
                setError('');
              }}
            />
            <PrimaryButton
              testID="onboarding.pet.submit.button"
              label="创建猫咪档案"
              busy={busy}
              disabled={!name.trim() || name.trim().length > 30}
              onPress={submit}
            />
            <TextButton label={busy ? '创建中，请等待' : cancelLabel} onPress={requestExit} />
          </>
        )}
      </Card>
    </Screen>
  );
}
