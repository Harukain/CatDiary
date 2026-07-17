import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { useSession } from '../../src/features/auth/session-provider';
import {
  Body,
  Card,
  PrimaryButton,
  Screen,
  TextButton,
  Title,
} from '../../src/shared/ui/primitives';
import { bottomTabScrollPadding } from '../../src/shared/ui/bottom-tab-layout';

export default function MeTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, activeFamily, selectFamily, signOut } = useSession();
  function confirmSignOut() {
    Alert.alert(
      '退出登录？',
      '退出后会清除本机缓存、待同步操作和待上传照片。请先确认重要内容已经同步。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '退出并清除本机数据',
          style: 'destructive',
          onPress: () => void signOut().then(() => router.replace('/(auth)/login')),
        },
      ],
    );
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
          <View style={styles.familyList}>
            {session?.families.map((family) => (
              <Pressable
                key={family.id}
                accessibilityRole="button"
                accessibilityState={{ selected: activeFamily?.id === family.id }}
                onPress={() => selectFamily(family)}
                style={[styles.family, activeFamily?.id === family.id && styles.familyActive]}
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
                  <Text style={[styles.role, activeFamily?.id === family.id && styles.roleActive]}>
                    {roleLabel(family.role)}
                  </Text>
                </View>
                {activeFamily?.id === family.id ? (
                  <Ionicons name="checkmark-circle" size={20} color={colors.surface} />
                ) : null}
              </Pressable>
            ))}
          </View>
        </Card>
        <Card>
          <SettingsRow
            testID="me.pets.button"
            title="猫咪档案"
            body="查看、添加和编辑猫咪"
            onPress={() => router.push('/pets')}
          />
          <SettingsRow
            testID="me.legal.button"
            title="协议与隐私"
            body="查看用户协议、隐私政策和数据说明"
            onPress={() => router.push('/settings/legal')}
          />
          <SettingsRow
            testID="me.export.button"
            title="数据导出"
            body="导出 JSON 或 CSV 文件"
            onPress={() => router.push('/settings/export')}
          />
          <SettingsRow
            testID="me.photos.button"
            title="猫咪相册"
            body="照片、备注与多猫归档"
            onPress={() => router.push('/photos')}
          />
          <SettingsRow
            testID="me.family-members.button"
            title="家庭成员"
            body="查看成员、角色和邀请"
            onPress={() => router.push('/family/members')}
          />
          <SettingsRow
            testID="me.notifications.button"
            title="通知偏好"
            body="照顾提醒、手机推送和飞书通知"
            onPress={() => router.push('/settings/notifications')}
          />
          <SettingsRow
            testID="me.notification-logs.button"
            title="提醒发送记录"
            body="查看提醒状态与失败原因"
            onPress={() => router.push('/notification-logs')}
          />
          <SettingsRow
            testID="me.account.button"
            title="账号与注销"
            body="查看账号状态或申请注销"
            onPress={() => router.push('/settings/account')}
          />
        </Card>
        <Card>
          <Title>设备通知</Title>
          <Body>系统通知权限、当前设备登记和个人偏好已统一放到通知偏好页处理。</Body>
          <PrimaryButton
            label="去通知偏好"
            onPress={() => router.push('/settings/notifications')}
          />
        </Card>
        <TextButton testID="me.sign-out.button" label="退出登录" onPress={() => confirmSignOut()} />
      </ScrollView>
    </Screen>
  );
}

function SettingsRow({
  title,
  body,
  testID,
  onPress,
}: {
  title: string;
  body: string;
  testID: string;
  onPress(): void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${title}，${body}`}
      onPress={onPress}
      style={({ pressed }) => [styles.settingsRow, pressed && styles.pressed]}
    >
      <View style={styles.settingsRowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowBody}>{body}</Text>
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
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
