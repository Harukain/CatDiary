import type { ConfigContext, ExpoConfig } from 'expo/config';

type AppEnvironment = 'development' | 'preview' | 'production';

export default ({ config }: ConfigContext): ExpoConfig => {
  const environment = parseEnvironment(process.env.APP_ENV);
  const apiUrl = resolveApiUrl(environment, process.env.EXPO_PUBLIC_API_URL);
  const projectId = resolveProjectId(environment, process.env.EAS_PROJECT_ID);
  const privacyPolicyUrl = resolveLegalUrl(
    environment,
    process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL,
    'EXPO_PUBLIC_PRIVACY_POLICY_URL',
  );
  const termsUrl = resolveLegalUrl(
    environment,
    process.env.EXPO_PUBLIC_TERMS_URL,
    'EXPO_PUBLIC_TERMS_URL',
  );

  return {
    ...config,
    name: config.name ?? '猫伴日记',
    slug: config.slug ?? 'cat-diary',
    scheme: config.scheme ?? 'catdiary',
    ios: {
      ...config.ios,
      bundleIdentifier: 'com.haruka.catdiary',
      config: { ...config.ios?.config, usesNonExemptEncryption: false },
      privacyManifests: {
        NSPrivacyTracking: false,
        NSPrivacyTrackingDomains: [],
        NSPrivacyCollectedDataTypes: [
          collectedData('NSPrivacyCollectedDataTypePhoneNumber'),
          collectedData('NSPrivacyCollectedDataTypeUserID'),
          collectedData('NSPrivacyCollectedDataTypeDeviceID'),
          collectedData('NSPrivacyCollectedDataTypePhotosorVideos'),
          collectedData('NSPrivacyCollectedDataTypeOtherUserContent'),
        ],
        NSPrivacyAccessedAPITypes: [
          accessedApi('NSPrivacyAccessedAPICategoryFileTimestamp', ['0A2A.1', '3B52.1', 'C617.1']),
          accessedApi('NSPrivacyAccessedAPICategoryDiskSpace', ['85F4.1', 'E174.1']),
          accessedApi('NSPrivacyAccessedAPICategorySystemBootTime', ['35F9.1']),
          accessedApi('NSPrivacyAccessedAPICategoryUserDefaults', ['CA92.1']),
        ],
      },
      infoPlist: {
        ...config.ios?.infoPlist,
        NSAppTransportSecurity:
          environment === 'development'
            ? {
                NSAllowsArbitraryLoads: true,
                NSExceptionDomains: {
                  localhost: { NSExceptionAllowsInsecureHTTPLoads: true },
                },
              }
            : { NSAllowsArbitraryLoads: false },
      },
    },
    android: {
      ...config.android,
      package: 'com.haruka.catdiary',
      allowBackup: false,
      blockedPermissions: [
        ...(config.android?.blockedPermissions ?? []),
        'android.permission.RECORD_AUDIO',
        ...(environment === 'development' ? [] : ['android.permission.SYSTEM_ALERT_WINDOW']),
      ],
    },
    plugins: [
      ...(config.plugins ?? []),
      [
        'expo-dev-client',
        {
          launchMode: 'most-recent',
          toolsButton: false,
          showMenuAtLaunch: false,
          android: { toolsButton: false, showMenuAtLaunch: false },
          ios: { toolsButton: false, showMenuAtLaunch: false },
        },
      ],
      [
        'expo-build-properties',
        { android: { usesCleartextTraffic: environment === 'development' } },
      ],
    ],
    extra: {
      ...config.extra,
      appEnvironment: environment,
      ...(apiUrl ? { apiUrl } : {}),
      ...(projectId ? { eas: { projectId } } : {}),
      ...(privacyPolicyUrl ? { privacyPolicyUrl } : {}),
      ...(termsUrl ? { termsUrl } : {}),
    },
    updates: {
      ...config.updates,
      enabled: true,
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
      ...(projectId ? { url: `https://u.expo.dev/${projectId}` } : {}),
    },
  };
};

function collectedData(type: string) {
  return {
    NSPrivacyCollectedDataType: type,
    NSPrivacyCollectedDataTypeLinked: true,
    NSPrivacyCollectedDataTypeTracking: false,
    NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
  };
}

function accessedApi(type: string, reasons: string[]) {
  return { NSPrivacyAccessedAPIType: type, NSPrivacyAccessedAPITypeReasons: reasons };
}

function parseEnvironment(value?: string): AppEnvironment {
  const environment = value ?? 'development';
  if (!['development', 'preview', 'production'].includes(environment))
    throw new Error(`APP_ENV must be development, preview or production; received ${environment}`);
  return environment as AppEnvironment;
}

function resolveApiUrl(environment: AppEnvironment, value?: string) {
  if (!value) {
    if (environment !== 'development')
      throw new Error(`EXPO_PUBLIC_API_URL is required for ${environment} builds`);
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('EXPO_PUBLIC_API_URL must be an absolute URL');
  }
  if (url.username || url.password || url.search || url.hash)
    throw new Error(
      'EXPO_PUBLIC_API_URL must not contain credentials, query parameters or fragments',
    );
  if (!url.pathname.replace(/\/$/, '').endsWith('/api/v1'))
    throw new Error('EXPO_PUBLIC_API_URL must end with /api/v1');
  const localHost = ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname);
  if (environment !== 'development' && (url.protocol !== 'https:' || localHost))
    throw new Error(`${environment} builds require a non-local HTTPS EXPO_PUBLIC_API_URL`);
  return value.replace(/\/$/, '');
}

function resolveProjectId(environment: AppEnvironment, value?: string) {
  if (!value) {
    if (environment !== 'development')
      throw new Error(`EAS_PROJECT_ID is required for ${environment} builds`);
    return undefined;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw new Error('EAS_PROJECT_ID must be a UUID');
  return value;
}

function resolveLegalUrl(environment: AppEnvironment, value: string | undefined, name: string) {
  if (!value) {
    if (environment !== 'development') throw new Error(`${name} is required for ${environment}`);
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
  if (url.username || url.password || url.search || url.hash)
    throw new Error(`${name} must not contain credentials, query parameters or fragments`);
  const localHost = ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname);
  if (environment !== 'development' && (url.protocol !== 'https:' || localHost))
    throw new Error(`${name} must use a non-local HTTPS URL for ${environment}`);
  return value.replace(/\/$/, '');
}
