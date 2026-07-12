import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useSession } from '../auth/session-provider';
import { taskTargetFromNotification } from './notification-routing';

export function NotificationResponseRouter() {
  const router = useRouter();
  const { restoring, session, selectFamily } = useSession();
  const handled = useRef(new Set<string>());

  useEffect(() => {
    if (restoring || !session) return;
    const families = new Map(session.families.map((family) => [family.id, family]));
    function handle(response: Notifications.NotificationResponse | null) {
      if (!response || handled.current.has(response.notification.request.identifier)) return;
      const target = taskTargetFromNotification(
        response.notification.request.content.data,
        new Set(families.keys()),
      );
      if (!target) return;
      handled.current.add(response.notification.request.identifier);
      const family = families.get(target.familyId);
      if (!family) return;
      selectFamily(family);
      router.push(target.path);
    }

    void Notifications.getLastNotificationResponseAsync().then(handle);
    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  }, [restoring, router, selectFamily, session]);

  return null;
}
