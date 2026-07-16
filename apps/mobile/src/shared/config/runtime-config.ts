import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  resolveRuntimeConfigValue,
  type RuntimeConfig,
  type RuntimePlatform,
} from './runtime-config-rules';

export type { RuntimeConfig };
export { resolveRuntimeConfigValue };

export const runtimeConfig = resolveRuntimeConfigValue({
  extra: Constants.expoConfig?.extra ?? {},
  easProjectId: Constants.easConfig?.projectId,
  platformOS: Platform.OS as RuntimePlatform,
});
