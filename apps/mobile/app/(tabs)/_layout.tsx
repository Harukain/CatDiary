import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { colors, radii } from '@cat-diary/design-tokens';
import { useSession } from '../../src/features/auth/session-provider';

const icons = {
  index: ['home-outline', 'home'] as const,
  tasks: ['checkbox-outline', 'checkbox'] as const,
  add: ['add', 'add'] as const,
  records: ['time-outline', 'time'] as const,
  me: ['person-outline', 'person'] as const,
};

export default function TabsLayout() {
  const { restoring, session } = useSession();
  if (!restoring && !session) return <Redirect href="/(auth)/login" />;
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#F5B79B',
        tabBarInactiveTintColor: colors.navInactive,
        tabBarStyle: {
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 12,
          height: 68,
          borderRadius: radii.navigation,
          borderTopWidth: 0,
          backgroundColor: colors.ink,
          paddingTop: 8,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600' },
        tabBarIcon: ({ color, focused, size }) => {
          const pair = icons[route.name as keyof typeof icons] ?? icons.index;
          const isAdd = route.name === 'add';
          return (
            <Ionicons
              name={pair[focused ? 1 : 0]}
              color={isAdd ? colors.surface : color}
              size={isAdd ? 28 : Math.min(size, 22)}
              style={
                isAdd
                  ? {
                      width: 46,
                      height: 46,
                      borderRadius: 23,
                      textAlign: 'center',
                      lineHeight: 46,
                      backgroundColor: colors.brand,
                      marginTop: -18,
                    }
                  : undefined
              }
            />
          );
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: '首页' }} />
      <Tabs.Screen name="tasks" options={{ title: '任务' }} />
      <Tabs.Screen name="add" options={{ title: '＋' }} />
      <Tabs.Screen name="records" options={{ title: '记录' }} />
      <Tabs.Screen name="me" options={{ title: '我的' }} />
    </Tabs>
  );
}
