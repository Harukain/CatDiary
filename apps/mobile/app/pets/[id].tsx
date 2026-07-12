import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { authApi, AuthApiError, type PetSummary } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
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

type PetDetail = PetSummary & {
  sex?: string | null;
  breed?: string | null;
  birthDate?: string | null;
  neutered?: boolean | null;
  chipNumber?: string | null;
};

export default function PetDetailRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, activeFamily } = useSession();
  const [pet, setPet] = useState<PetDetail | null>(null);
  const [name, setName] = useState('');
  const [sex, setSex] = useState('UNKNOWN');
  const [birthDate, setBirthDate] = useState('');
  const [breed, setBreed] = useState('');
  const [chipNumber, setChipNumber] = useState('');
  const [neutered, setNeutered] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!session || !activeFamily || !id) return;
    void authApi
      .getPet(session.accessToken, activeFamily.id, id)
      .then((data) => {
        setPet(data);
        setName(data.name);
        setSex(data.sex ?? 'UNKNOWN');
        setBirthDate(data.birthDate?.slice(0, 10) ?? '');
        setBreed(data.breed ?? '');
        setChipNumber(data.chipNumber ?? '');
        setNeutered(data.neutered ?? null);
      })
      .catch(() => setError('猫咪档案加载失败'));
  }, [activeFamily, id, session]);
  const canManage = activeFamily?.role === 'OWNER' || activeFamily?.role === 'ADMIN';

  async function save() {
    if (!session || !activeFamily || !pet || !name.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const updated = await authApi.updatePet(session.accessToken, activeFamily.id, pet.id, {
        name: name.trim(),
        sex,
        birthDate: birthDate || null,
        breed: breed.trim() || null,
        chipNumber: chipNumber.trim() || null,
        neutered,
        version: pet.version,
      });
      setPet({
        ...pet,
        ...updated,
        name: name.trim(),
        sex,
        birthDate: birthDate || null,
        breed: breed.trim() || null,
        chipNumber: chipNumber.trim() || null,
        neutered,
      });
    } catch (cause) {
      setError(cause instanceof AuthApiError ? cause.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert('删除猫咪档案', '档案将进入 30 天软删除期。相关历史记录不会立即永久删除。', [
      { text: '取消', style: 'cancel' },
      { text: '确认删除', style: 'destructive', onPress: () => void remove() },
    ]);
  }
  async function remove() {
    if (!session || !activeFamily || !pet) return;
    setBusy(true);
    setError('');
    try {
      await authApi.deletePet(session.accessToken, activeFamily.id, pet.id, pet.version);
      router.replace('/pets');
    } catch (cause) {
      setError(cause instanceof AuthApiError ? cause.message : '删除失败');
      setBusy(false);
    }
  }

  const changed =
    !!pet &&
    (name.trim() !== pet.name ||
      sex !== (pet.sex ?? 'UNKNOWN') ||
      birthDate !== (pet.birthDate?.slice(0, 10) ?? '') ||
      breed.trim() !== (pet.breed ?? '') ||
      chipNumber.trim() !== (pet.chipNumber ?? '') ||
      neutered !== (pet.neutered ?? null));
  const birthValid = !birthDate || /^\d{4}-\d{2}-\d{2}$/.test(birthDate);

  return (
    <Screen>
      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={() => router.back()}
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.navTitle}>猫咪档案</Text>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {!pet && !error ? (
          <ActivityIndicator color={colors.brand} />
        ) : (
          <Card>
            <Title>{pet?.name ?? '档案不可用'}</Title>
            <Body>基础资料会用于记录归属、任务提醒和就医摘要。</Body>
            {error ? <ErrorText>{error}</ErrorText> : null}
            {pet && canManage ? (
              <>
                <Field
                  label="猫咪名字"
                  value={name}
                  maxLength={30}
                  onChangeText={(value) => {
                    setName(value);
                    setError('');
                  }}
                />
                <View style={styles.field}>
                  <Text style={styles.label}>性别</Text>
                  <View style={styles.options}>
                    {(
                      [
                        ['MALE', '公猫'],
                        ['FEMALE', '母猫'],
                        ['UNKNOWN', '未知'],
                      ] as const
                    ).map(([value, label]) => (
                      <Pressable
                        key={value}
                        accessibilityRole="button"
                        accessibilityState={{ selected: sex === value }}
                        onPress={() => setSex(value)}
                        style={[styles.option, sex === value && styles.optionActive]}
                      >
                        <Text style={[styles.optionText, sex === value && styles.optionTextActive]}>
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <Field
                  label="出生日期"
                  value={birthDate}
                  placeholder="YYYY-MM-DD"
                  maxLength={10}
                  error={!birthValid ? '请使用 YYYY-MM-DD 格式' : undefined}
                  onChangeText={setBirthDate}
                />
                <Field
                  label="品种"
                  value={breed}
                  placeholder="例如：英短"
                  maxLength={60}
                  onChangeText={setBreed}
                />
                <View style={styles.field}>
                  <Text style={styles.label}>是否绝育</Text>
                  <View style={styles.options}>
                    {[
                      [true, '已绝育'],
                      [false, '未绝育'],
                      [null, '未知'],
                    ].map(([value, label]) => (
                      <Pressable
                        key={String(value)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: neutered === value }}
                        onPress={() => setNeutered(value as boolean | null)}
                        style={[styles.option, neutered === value && styles.optionActive]}
                      >
                        <Text
                          style={[styles.optionText, neutered === value && styles.optionTextActive]}
                        >
                          {label as string}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <Field
                  label="芯片编号"
                  value={chipNumber}
                  placeholder="选填"
                  maxLength={50}
                  onChangeText={setChipNumber}
                />
                <PrimaryButton
                  label="保存修改"
                  busy={busy}
                  disabled={!name.trim() || !birthValid || !changed}
                  onPress={save}
                />
                <TextButton
                  label="查看猫咪相册"
                  disabled={busy}
                  onPress={() => router.push({ pathname: '/photos', params: { petId: pet.id } })}
                />
                <TextButton label="删除猫咪档案" danger disabled={busy} onPress={confirmDelete} />
              </>
            ) : null}
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  content: { paddingBottom: spacing.huge },
  field: { gap: spacing.sm, marginTop: spacing.sm },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink },
  options: { flexDirection: 'row', gap: spacing.sm },
  option: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.selector,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionActive: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  optionText: { ...typography.secondary, color: colors.textSecondary },
  optionTextActive: { color: colors.brand, fontWeight: '600' },
});
