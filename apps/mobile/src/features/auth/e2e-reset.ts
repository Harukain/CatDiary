import type { RuntimeConfig } from '../../shared/config/runtime-config';

export function isE2eLocalResetEnabled(environment: RuntimeConfig['appEnvironment']) {
  return environment === 'development';
}
