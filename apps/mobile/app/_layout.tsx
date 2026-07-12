import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@cat-diary/design-tokens';
import { SessionProvider } from '../src/features/auth/session-provider';
import * as Notifications from 'expo-notifications';
import { NotificationResponseRouter } from '../src/features/notifications/notification-response-router';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  return (
    <SessionProvider>
      <NotificationResponseRouter />
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.page },
          animation: 'fade',
        }}
      />
    </SessionProvider>
  );
}
