import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { useSession } from '../../src/features/auth/session-provider';
import {
  Body,
  Card,
  ErrorText,
  PrimaryButton,
  Screen,
  TextButton,
  Title,
} from '../../src/shared/ui/primitives';
import { bottomTabScrollPadding } from '../../src/shared/ui/bottom-tab-layout';

export default function MeTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { restoring, session, activeFamily, selectFamily, signOut } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const contextUnavailable = !restoring && (!session || !activeFamily);
  const sessionScopedLocked = restoring || signingOut || !session;
  const familyScopedLocked = restoring || signingOut || !session || !activeFamily;
  const familySwitchLocked = restoring || signingOut || !session;

  function confirmSignOut() {
    if (restoring || signingOut || !session) return;
    Alert.alert(
      '退出登录？',
      '退出后会清除本机缓存、待同步操作和待上传照片。请先确认重要内容已经同步。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '退出并清除本机数据',
          style: 'destructive',
          onPress: () => void performSignOut(),
        },
      ],
    );
  }

  async function performSignOut() {
    if (restoring || signingOut || !session) return;
    setSigningOut(true);
    setSignOutError('');
    try {
      await signOut();
      router.replace('/(auth)/login');
    } catch {
      setSignOutError('退出失败，请稍后重试。');
      setSigningOut(false);
    }
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomTabScrollPadding(insets.bottom) },
        ]}
      >
        <View>
          <Text testID="me.title" style={styles.title}>
            我的
          </Text>
          <Text style={styles.subtitle}>家庭、成员与账号设置</Text>
        </View>
        <Card>
          <Title>当前家庭</Title>
          {restoring ? (
            <View testID="me.restoring.card" style={styles.inlineState}>
              <ActivityIndicator color={colors.brand} />
              <Body>正在恢复账号与家庭信息…</Body>
            </View>
          ) : !session ? (
            <View testID="me.context-empty.card" style={styles.inlineState}>
              <Title>需要重新登录</Title>
              <Body>登录后才能查看家庭、猫咪档案和通知设置。</Body>
              <PrimaryButton label="去登录" onPress={() => router.replace('/(auth)/login')} />
            </View>
          ) : session.families.length ? (
            <>
              {!activeFamily ? (
                <Body testID="me.family-select.hint">请选择一个家庭后再管理猫咪和通知。</Body>
              ) : null}
              <View style={styles.familyList}>
                {session.families.map((family) => (
                  <Pressable
                    key={family.id}
                    accessibilityRole="button"
                    accessibilityState={{
                      disabled: familySwitchLocked,
                      selected: activeFamily?.id === family.id,
                    }}
                    disabled={familySwitchLocked}
                    onPress={() => selectFamily(family)}
                    style={({ pressed }) => [
                      styles.family,
                      activeFamily?.id === family.id && styles.familyActive,
                      familySwitchLocked && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View>
                      <Text
                        style={[
                          styles.familyName,
                          activeFamily?.id === family.id && styles.familyNameActive,
                        ]}
                      >
                        {family.name}
                      </Text>
                      <Text
                        style={[styles.role, activeFamily?.id === family.id && styles.roleActive]}
                      >
                        {roleLabel(family.role)}
                      </Text>
                    </View>
                    {activeFamily?.id === family.id ? (
                      <Ionicons name="checkmark-circle" size={20} color={colors.surface} />
                    ) : null}
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <View testID="me.context-empty.card" style={styles.inlineState}>
              <Title>还没有家庭</Title>
              <Body>先创建家庭，才能归档猫咪、邀请成员和配置照顾提醒。</Body>
              <PrimaryButton label="创建家庭" onPress={() => router.push('/onboarding/family')} />
            </View>
          )}
        </Card>
        <Card>
          {contextUnavailable ? (
            <View testID="me.settings-lock-note" style={styles.lockNote}>
              <Text style={styles.lockNoteText}>家庭相关入口需要先选择或创建家庭。</Text>
            </View>
          ) : null}
          <SettingsRow
            testID="me.pets.button"
            title="猫咪档案"
            body="查看、添加和编辑猫咪"
            disabled={familyScopedLocked}
            onPress={() => router.push('/pets')}
          />
          <SettingsRow
            testID="me.legal.button"
            title="协议与隐私"
            body="查看用户协议、隐私政策和数据说明"
            disabled={sessionScopedLocked}
            onPress={() => router.push('/settings/legal')}
          />
          <SettingsRow
            testID="me.export.button"
            title="数据导出"
            body="导出 JSON 或 CSV 文件"
            disabled={familyScopedLocked}
            onPress={() => router.push('/settings/export')}
          />
          <SettingsRow
            testID="me.photos.button"
            title="猫咪相册"
            body="照片、备注与多猫归档"
            disabled={familyScopedLocked}
            onPress={() => router.push('/photos')}
          />
          <SettingsRow
            testID="me.family-members.button"
            title="家庭成员"
            body="查看成员、角色和邀请"
            disabled={familyScopedLocked}
            onPress={() => router.push('/family/members')}
          />
          <SettingsRow
            testID="me.notifications.button"
            title="通知偏好"
            body="照顾提醒、手机推送和飞书通知"
            disabled={familyScopedLocked}
            onPress={() => router.push('/settings/notifications')}
          />
          <SettingsRow
            testID="me.notification-logs.button"
            title="提醒发送记录"
            body="查看提醒状态与失败原因"
            disabled={familyScopedLocked}
            onPress={() => router.push('/notification-logs')}
          />
          <SettingsRow
            testID="me.account.button"
            title="账号与注销"
            body="查看账号状态或申请注销"
            disabled={sessionScopedLocked}
            onPress={() => router.push('/settings/account')}
          />
        </Card>
        <Card>
          <Title>设备通知</Title>
          <Body>
            {activeFamily
              ? '系统通知权限、当前设备登记和个人偏好已统一放到通知偏好页处理。'
              : '选择或创建家庭后，才能配置系统通知、当前设备登记和飞书通知。'}
          </Body>
          <PrimaryButton
            label="去通知偏好"
            disabled={familyScopedLocked}
            onPress={() => router.push('/settings/notifications')}
          />
        </Card>
        {signOutError ? <ErrorText testID="me.sign-out.error">{signOutError}</ErrorText> : null}
        <TextButton
          testID="me.sign-out.button"
          label={signingOut ? '正在退出…' : '退出登录'}
          disabled={sessionScopedLocked}
          onPress={() => confirmSignOut()}
        />
      </ScrollView>
    </Screen>
  );
}

function SettingsRow({
  title,
  body,
  testID,
  disabled,
  onPress,
}: {
  title: string;
  body: string;
  testID: string;
  disabled?: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${title}，${body}`}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.settingsRow,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.settingsRowCopy}>
        <Text style={[styles.rowTitle, disabled && styles.rowMuted]}>{title}</Text>
        <Text style={[styles.rowBody, disabled && styles.rowMuted]}>{body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

function roleLabel(role: string) {
  return role === 'OWNER' ? '家庭创建者' : role === 'ADMIN' ? '管理员' : '成员';
}

const styles = StyleSheet.create({
  content: { gap: spacing.xxl },
  title: { ...typography.h1, color: colors.ink },
  subtitle: { ...typography.secondary, color: colors.textSecondary, marginTop: spacing.xs },
  inlineState: { gap: spacing.md, alignItems: 'flex-start' },
  lockNote: {
    borderRadius: radii.banner,
    backgroundColor: colors.warningSoft,
    padding: spacing.md,
  },
  lockNoteText: { ...typography.caption, color: colors.warningDark },
  familyList: { gap: spacing.sm },
  family: {
    minHeight: 60,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  familyActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  familyName: { ...typography.h3, color: colors.ink },
  familyNameActive: { color: colors.surface },
  role: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  roleActive: { color: colors.navInactive },
  settingsRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  settingsRowCopy: { flex: 1, gap: spacing.xs },
  rowTitle: { ...typography.h3, color: colors.ink },
  rowBody: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  rowMuted: { color: colors.textTertiary },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
