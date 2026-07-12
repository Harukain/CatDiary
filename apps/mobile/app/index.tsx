import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { colors } from '@cat-diary/design-tokens';
import { useSession } from '../src/features/auth/session-provider';

export default function EntryRoute() {
  const { restoring, session } = useSession();
  if (restoring)
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!session.families.length) return <Redirect href="/onboarding/family" />;
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.page,
  },
});
