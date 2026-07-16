import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { AccessibilityInfo, findNodeHandle, Pressable, type View } from 'react-native';
import { colors } from '@cat-diary/design-tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '../../src/features/auth/session-provider';
import { QuickAddSheet } from '../../src/features/quick-add/quick-add-sheet';
import { bottomTabBarStyle } from '../../src/shared/ui/bottom-tab-layout';

const icons = {
  index: ['home-outline', 'home'] as const,
  tasks: ['checkbox-outline', 'checkbox'] as const,
  add: ['add', 'add'] as const,
  records: ['time-outline', 'time'] as const,
  me: ['person-outline', 'person'] as const,
};

export default function TabsLayout() {
  const { restoring, session, activeFamily } = useSession();
  const insets = useSafeAreaInsets();
  const [quickAddVisible, setQuickAddVisible] = useState(false);
  const addTabButtonRef = useRef<View>(null);
  const restoreFocusTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const canManage = activeFamily?.role === 'OWNER' || activeFamily?.role === 'ADMIN';

  const openQuickAdd = useCallback(() => {
    if (restoreFocusTimer.current) clearTimeout(restoreFocusTimer.current);
    setQuickAddVisible(true);
  }, []);
  const closeQuickAdd = useCallback((restoreFocus = true) => {
    setQuickAddVisible(false);
    if (!restoreFocus) return;
    if (restoreFocusTimer.current) clearTimeout(restoreFocusTimer.current);
    restoreFocusTimer.current = setTimeout(() => {
      const node = findNodeHandle(addTabButtonRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 320);
  }, []);
  useEffect(
    () => () => {
      if (restoreFocusTimer.current) clearTimeout(restoreFocusTimer.current);
    },
    [],
  );

  if (!restoring && !session) return <Redirect href="/(auth)/login" />;
  return (
    <>
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.navActive,
          tabBarInactiveTintColor: colors.navInactive,
          tabBarStyle: bottomTabBarStyle(insets.bottom),
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
        <Tabs.Screen
          name="add"
          listeners={{
            tabPress: (event) => {
              event.preventDefault();
              openQuickAdd();
            },
          }}
          options={{
            title: '',
            tabBarLabel: '',
            tabBarAccessibilityLabel: '快速新增',
            tabBarButton: ({ href: _href, ...props }) => (
              <Pressable
                {...(props as ComponentProps<typeof Pressable>)}
                ref={addTabButtonRef}
                testID="tab.quick-add.button"
                accessibilityRole="button"
                accessibilityLabel="快速新增"
              />
            ),
          }}
        />
        <Tabs.Screen name="records" options={{ title: '记录' }} />
        <Tabs.Screen name="me" options={{ title: '我的' }} />
      </Tabs>
      <QuickAddSheet visible={quickAddVisible} canManage={canManage} onClose={closeQuickAdd} />
    </>
  );
}
