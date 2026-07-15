import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { phoneSchema } from '@cat-diary/validation';
import { authApi, AuthApiError, type MemberSummary } from '../../src/features/auth/auth-api';
import {
  canOperateFamilyMember,
  familyMemberDisplayName,
  familyMemberRoleChangeCopy,
  memberOperationKey,
  normalizeInvitePhone,
} from '../../src/features/family/member-actions';
import { useSession } from '../../src/features/auth/session-provider';
import {
  Body,
  Card,
  ErrorText,
  Field,
  PrimaryButton,
  Screen,
  SuccessText,
  Title,
} from '../../src/shared/ui/primitives';

type MembersOperation = '' | 'invite' | `role:${string}` | `remove:${string}`;

export default function MembersRoute() {
  const router = useRouter();
  const { session, activeFamily } = useSession();
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [phone, setPhone] = useState('');
  const [operation, setOperation] = useState<MembersOperation>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [devToken, setDevToken] = useState('');
  const canManage = activeFamily?.role === 'OWNER' || activeFamily?.role === 'ADMIN';
  const phoneValid = phoneSchema.safeParse(phone).success;
  const busy = operation !== '';

  const load = useCallback(async () => {
    if (!session || !activeFamily) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setMembers(await authApi.listMembers(session.accessToken, activeFamily.id));
      setError('');
    } catch {
      setError('成员列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [activeFamily, session]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function invite() {
    if (!session || !activeFamily || !phoneValid || busy) return;
    setOperation('invite');
    setError('');
    setSuccess('');
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
      setSuccess('邀请已生成。');
    } catch (cause) {
      setError(cause instanceof AuthApiError ? cause.message : '邀请创建失败');
    } finally {
      setOperation('');
    }
  }

  function confirmToggleRole(member: MemberSummary) {
    if (
      busy ||
      !canOperateFamilyMember({
        currentRole: activeFamily?.role,
        currentUserId: session?.user.id,
        member,
      })
    )
      return;
    const name = familyMemberDisplayName(member, session?.user.id);
    const copy = familyMemberRoleChangeCopy(name, member.role);
    if (!copy) return;
    Alert.alert(copy.title, copy.message, [
      { text: '取消', style: 'cancel' },
      {
        text: copy.confirmLabel,
        onPress: () => void toggleRole(member, copy.nextRole, copy.success),
      },
    ]);
  }

  async function toggleRole(
    member: MemberSummary,
    next: 'ADMIN' | 'MEMBER',
    successMessage: string,
  ) {
    if (!session || !activeFamily || busy) return;
    setOperation(memberOperationKey('role', member.id));
    setError('');
    setSuccess('');
    try {
      await authApi.changeMemberRole(session.accessToken, activeFamily.id, member.id, next);
      await load();
      setSuccess(successMessage);
    } catch (cause) {
      setError(cause instanceof AuthApiError ? cause.message : '角色调整失败');
    } finally {
      setOperation('');
    }
  }

  function confirmRemove(member: MemberSummary) {
    if (
      busy ||
      !canOperateFamilyMember({
        currentRole: activeFamily?.role,
        currentUserId: session?.user.id,
        member,
      })
    )
      return;
    const name = familyMemberDisplayName(member, session?.user.id);
    Alert.alert('移除家庭成员？', `${name} 将无法继续查看和记录此家庭的数据。`, [
      { text: '取消', style: 'cancel' },
      { text: '确认移除', style: 'destructive', onPress: () => void remove(member) },
    ]);
  }
  async function remove(member: MemberSummary) {
    if (!session || !activeFamily || busy) return;
    const name = familyMemberDisplayName(member, session.user.id);
    setOperation(memberOperationKey('remove', member.id));
    setError('');
    setSuccess('');
    try {
      await authApi.removeMember(session.accessToken, activeFamily.id, member.id);
      await load();
      setSuccess(`${name} 已从家庭移除。`);
    } catch (cause) {
      setError(cause instanceof AuthApiError ? cause.message : '移除失败');
    } finally {
      setOperation('');
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
          <Body>
            {canManage
              ? '管理员可以邀请、调整角色和移除成员。家庭必须至少保留一名管理员。'
              : '你可以查看家庭成员。邀请、角色调整和移除需要家庭管理员操作。'}
          </Body>
          {error ? <ErrorText>{error}</ErrorText> : null}
          {success ? <SuccessText>{success}</SuccessText> : null}
          <View>
            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.brand} />
                <Text style={styles.loadingText}>正在加载成员…</Text>
              </View>
            ) : members.length === 0 ? (
              <Text style={styles.emptyText}>暂无成员，请稍后重试。</Text>
            ) : (
              members.map((member) => {
                const memberName = familyMemberDisplayName(member, session?.user.id);
                const canOperate = canOperateFamilyMember({
                  currentRole: activeFamily?.role,
                  currentUserId: session?.user.id,
                  member,
                });
                const roleBusy = operation === memberOperationKey('role', member.id);
                const removeBusy = operation === memberOperationKey('remove', member.id);
                const disabled = busy || loading;
                return (
                  <View key={member.id} style={styles.member}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{memberName.slice(0, 1)}</Text>
                    </View>
                    <View style={styles.memberBody}>
                      <Text style={styles.memberName}>{memberName}</Text>
                      <Text style={styles.role}>{roleLabel(member.role)}</Text>
                    </View>
                    {canOperate ? (
                      <View style={styles.actions}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={
                            member.role === 'MEMBER'
                              ? `将 ${memberName} 设为管理员`
                              : `将 ${memberName} 设为普通成员`
                          }
                          accessibilityState={{ disabled }}
                          disabled={disabled}
                          onPress={() => confirmToggleRole(member)}
                          style={({ pressed }) => [
                            styles.action,
                            disabled && styles.actionDisabled,
                            pressed && styles.pressed,
                          ]}
                        >
                          {roleBusy ? <ActivityIndicator color={colors.warningDark} /> : null}
                          <Text style={styles.actionText}>
                            {member.role === 'MEMBER' ? '设为管理员' : '设为成员'}
                          </Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`移除 ${memberName}`}
                          accessibilityState={{ disabled }}
                          disabled={disabled}
                          onPress={() => confirmRemove(member)}
                          style={({ pressed }) => [
                            styles.remove,
                            disabled && styles.actionDisabled,
                            pressed && styles.pressed,
                          ]}
                        >
                          {removeBusy ? (
                            <ActivityIndicator color={colors.dangerDark} />
                          ) : (
                            <Ionicons
                              name="trash-outline"
                              size={18}
                              color={disabled ? colors.textTertiary : colors.danger}
                            />
                          )}
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
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
                setPhone(normalizeInvitePhone(value));
                setError('');
                setSuccess('');
              }}
            />
            <PrimaryButton
              label="生成邀请"
              busy={operation === 'invite'}
              disabled={!phoneValid || busy || loading}
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
  loading: { minHeight: 80, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadingText: { ...typography.caption, color: colors.textSecondary },
  emptyText: { ...typography.secondary, color: colors.textSecondary, paddingVertical: spacing.lg },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  action: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  actionDisabled: { opacity: 0.5 },
  actionText: { fontSize: 12, fontWeight: '600', color: colors.warningDark },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
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
