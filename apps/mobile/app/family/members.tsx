import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { phoneSchema } from '@cat-diary/validation';
import { authApi, AuthApiError, type MemberSummary } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import {
  Body,
  Card,
  ErrorText,
  Field,
  PrimaryButton,
  Screen,
  Title,
} from '../../src/shared/ui/primitives';

export default function MembersRoute() {
  const router = useRouter();
  const { session, activeFamily } = useSession();
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [devToken, setDevToken] = useState('');
  const canManage = activeFamily?.role === 'OWNER' || activeFamily?.role === 'ADMIN';

  const load = useCallback(async () => {
    if (!session || !activeFamily) return;
    try {
      setMembers(await authApi.listMembers(session.accessToken, activeFamily.id));
      setError('');
    } catch {
      setError('成员列表加载失败');
    }
  }, [activeFamily, session]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function invite() {
    if (!session || !activeFamily || !phoneSchema.safeParse(phone).success || busy) return;
    setBusy(true);
    setError('');
    setDevToken('');
    try {
      const result = await authApi.inviteMember(
        session.accessToken,
        activeFamily.id,
        phone,
        'MEMBER',
      );
      setPhone('');
      setDevToken(result.token ?? '');
    } catch (cause) {
      setError(cause instanceof AuthApiError ? cause.message : '邀请创建失败');
    } finally {
      setBusy(false);
    }
  }

  async function toggleRole(member: MemberSummary) {
    if (!session || !activeFamily) return;
    const next = member.role === 'MEMBER' ? 'ADMIN' : 'MEMBER';
    try {
      await authApi.changeMemberRole(session.accessToken, activeFamily.id, member.id, next);
      await load();
    } catch (cause) {
      setError(cause instanceof AuthApiError ? cause.message : '角色调整失败');
    }
  }

  function confirmRemove(member: MemberSummary) {
    Alert.alert('移除家庭成员', '该成员将无法继续查看和记录此家庭的数据。', [
      { text: '取消', style: 'cancel' },
      { text: '确认移除', style: 'destructive', onPress: () => void remove(member) },
    ]);
  }
  async function remove(member: MemberSummary) {
    if (!session || !activeFamily) return;
    try {
      await authApi.removeMember(session.accessToken, activeFamily.id, member.id);
      await load();
    } catch (cause) {
      setError(cause instanceof AuthApiError ? cause.message : '移除失败');
    }
  }

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
        <Text style={styles.navTitle}>家庭成员</Text>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Title>{activeFamily?.name}</Title>
          <Body>管理员可以邀请、调整角色和移除成员。家庭必须至少保留一名管理员。</Body>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <View>
            {members.map((member) => (
              <View key={member.id} style={styles.member}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(member.user.displayName ?? '家').slice(0, 1)}
                  </Text>
                </View>
                <View style={styles.memberBody}>
                  <Text style={styles.memberName}>
                    {member.user.displayName ??
                      (member.user.id === session?.user.id ? '我' : '家庭成员')}
                  </Text>
                  <Text style={styles.role}>{roleLabel(member.role)}</Text>
                </View>
                {canManage && member.user.id !== session?.user.id ? (
                  <View style={styles.actions}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void toggleRole(member)}
                      style={styles.action}
                    >
                      <Text style={styles.actionText}>
                        {member.role === 'MEMBER' ? '设为管理员' : '设为成员'}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => confirmRemove(member)}
                      style={styles.remove}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </Card>
        {canManage ? (
          <Card>
            <Title>邀请家人</Title>
            <Field
              label="手机号"
              keyboardType="number-pad"
              maxLength={11}
              value={phone}
              placeholder="请输入对方手机号"
              onChangeText={(value) => {
                setPhone(value.replace(/\D/g, ''));
                setError('');
              }}
            />
            <PrimaryButton
              label="生成邀请"
              busy={busy}
              disabled={!phoneSchema.safeParse(phone).success}
              onPress={invite}
            />
            {devToken ? (
              <View style={styles.devInvite}>
                <Text style={styles.devTitle}>开发邀请已创建</Text>
                <Text
                  selectable
                  style={styles.token}
                >{`catdiary:///family-invites/${devToken}`}</Text>
                <Text style={styles.devBody}>
                  正式环境将通过短信或分享链接交付，不会展示 Token。
                </Text>
              </View>
            ) : null}
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function roleLabel(role: string) {
  return role === 'OWNER' ? '家庭创建者' : role === 'ADMIN' ? '管理员' : '成员';
}
const styles = StyleSheet.create({
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  content: { gap: spacing.xxl, paddingBottom: spacing.huge },
  member: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontWeight: '700', color: colors.brand },
  memberBody: { flex: 1 },
  memberName: { ...typography.h3, color: colors.ink },
  role: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  actionText: { fontSize: 12, fontWeight: '600', color: colors.warningDark },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  devInvite: {
    borderRadius: radii.banner,
    backgroundColor: colors.warningSoft,
    padding: spacing.md,
    gap: spacing.xs,
  },
  devTitle: { ...typography.h3, color: colors.warningDark },
  token: { ...typography.caption, color: colors.ink },
  devBody: { ...typography.caption, color: colors.textSecondary },
});
