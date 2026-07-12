import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { colors } from '@cat-diary/design-tokens';
import { authApi } from '../auth/auth-api';

export async function registerForPushNotifications(accessToken: string) {
  if (!Device.isDevice) throw new Error('推送通知需要在真机 Development Build 中测试');
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('cat-care', {
      name: '照顾提醒',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: colors.brand,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const permission =
    current.status === 'granted' ? current : await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('未获得通知权限，可稍后在系统设置中开启');
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) throw new Error('当前 Development Build 尚未配置 EAS projectId');
  const result = await Notifications.getExpoPushTokenAsync({ projectId });
  await authApi.registerPushToken(
    accessToken,
    result.data,
    Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
  );
  return result.data;
}
