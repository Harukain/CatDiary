import { spawnSync } from 'node:child_process';

const projectId = '123e4567-e89b-42d3-a456-426614174000';
const legalUrls = {
  EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://www.example.com/privacy',
  EXPO_PUBLIC_TERMS_URL: 'https://www.example.com/terms',
};

function expoConfig(overrides, type = 'public') {
  const result = spawnSync(
    'pnpm',
    ['--filter', '@cat-diary/mobile', 'exec', 'expo', 'config', '--type', type, '--json'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        ...(['preview', 'production'].includes(overrides.APP_ENV) ? legalUrls : {}),
        ...overrides,
      },
    },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    config: result.status === 0 ? JSON.parse(result.stdout) : null,
  };
}

function expectFailure(overrides, pattern) {
  const result = expoConfig(overrides);
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status === 0 || !pattern.test(output))
    throw new Error(
      `Expected config failure ${pattern}, received status=${result.status}: ${output}`,
    );
}

const development = expoConfig({
  APP_ENV: 'development',
  EXPO_PUBLIC_API_URL: '',
  EAS_PROJECT_ID: '',
});
if (development.status !== 0 || development.config.extra.apiUrl !== undefined)
  throw new Error(`Development config is invalid: ${development.stderr}`);
const developmentIntrospection = expoConfig(
  { APP_ENV: 'development', EXPO_PUBLIC_API_URL: '', EAS_PROJECT_ID: '' },
  'introspect',
);
if (developmentIntrospection.status !== 0) throw new Error(developmentIntrospection.stderr);
const developmentAndroidApplication =
  developmentIntrospection.config._internal.modResults.android.manifest.manifest.application?.[0]
    ?.$ ?? {};
if (developmentAndroidApplication['android:usesCleartextTraffic'] !== 'true')
  throw new Error(
    'Development Android builds must allow a LAN HTTP API for physical-device testing',
  );

expectFailure(
  { APP_ENV: 'preview', EXPO_PUBLIC_API_URL: '', EAS_PROJECT_ID: projectId },
  /EXPO_PUBLIC_API_URL is required/,
);
expectFailure(
  {
    APP_ENV: 'production',
    EXPO_PUBLIC_API_URL: 'https://api.example.com/api/v1',
    EAS_PROJECT_ID: projectId,
    EXPO_PUBLIC_PRIVACY_POLICY_URL: '',
  },
  /EXPO_PUBLIC_PRIVACY_POLICY_URL is required/,
);
expectFailure(
  {
    APP_ENV: 'production',
    EXPO_PUBLIC_API_URL: 'https://api.example.com/api/v1',
    EAS_PROJECT_ID: projectId,
    EXPO_PUBLIC_TERMS_URL: 'http://localhost/terms',
  },
  /EXPO_PUBLIC_TERMS_URL must use a non-local HTTPS URL/,
);
expectFailure(
  {
    APP_ENV: 'production',
    EXPO_PUBLIC_API_URL: 'http://api.example.com/api/v1',
    EAS_PROJECT_ID: projectId,
  },
  /non-local HTTPS/,
);
expectFailure(
  {
    APP_ENV: 'production',
    EXPO_PUBLIC_API_URL: 'https://api.example.com/api/v1',
    EAS_PROJECT_ID: '',
  },
  /EAS_PROJECT_ID is required/,
);

const production = expoConfig({
  APP_ENV: 'production',
  EXPO_PUBLIC_API_URL: 'https://api.example.com/api/v1',
  EAS_PROJECT_ID: projectId,
});
if (production.status !== 0) throw new Error(production.stderr);
const config = production.config;
const productionPrebuild = expoConfig(
  {
    APP_ENV: 'production',
    EXPO_PUBLIC_API_URL: 'https://api.example.com/api/v1',
    EAS_PROJECT_ID: projectId,
  },
  'prebuild',
);
if (productionPrebuild.status !== 0) throw new Error(productionPrebuild.stderr);
const productionIntrospection = expoConfig(
  {
    APP_ENV: 'production',
    EXPO_PUBLIC_API_URL: 'https://api.example.com/api/v1',
    EAS_PROJECT_ID: projectId,
  },
  'introspect',
);
if (productionIntrospection.status !== 0) throw new Error(productionIntrospection.stderr);
const nativeResults = productionIntrospection.config._internal.modResults;
const infoPlist = nativeResults.ios.infoPlist;
const manifest = nativeResults.android.manifest.manifest;
const androidApplication = manifest.application?.[0]?.$ ?? {};
const privacyManifest = config.ios.privacyManifests;
const privacyApiReasons = new Map(
  (privacyManifest?.NSPrivacyAccessedAPITypes ?? []).map((entry) => [
    entry.NSPrivacyAccessedAPIType,
    [...entry.NSPrivacyAccessedAPITypeReasons].sort(),
  ]),
);
const privacyDataTypes = new Set(
  (privacyManifest?.NSPrivacyCollectedDataTypes ?? []).map(
    (entry) => entry.NSPrivacyCollectedDataType,
  ),
);
const activeAndroidPermissions = (manifest['uses-permission'] ?? [])
  .filter((entry) => entry.$?.['tools:node'] !== 'remove')
  .map((entry) => entry.$?.['android:name'])
  .filter(Boolean);
const forbiddenAndroidPermissions = [
  'android.permission.RECORD_AUDIO',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.READ_CONTACTS',
  'android.permission.WRITE_CONTACTS',
];
const checks = {
  environment: config.extra.appEnvironment === 'production',
  apiUrl: config.extra.apiUrl === 'https://api.example.com/api/v1',
  projectId: config.extra.eas.projectId === projectId,
  updatesUrl: config.updates.url === `https://u.expo.dev/${projectId}`,
  privacyPolicyUrl: config.extra.privacyPolicyUrl === legalUrls.EXPO_PUBLIC_PRIVACY_POLICY_URL,
  termsUrl: config.extra.termsUrl === legalUrls.EXPO_PUBLIC_TERMS_URL,
  runtimeVersion: config.runtimeVersion?.policy === 'appVersion',
  deepLinkScheme: config.scheme === 'catdiary',
  iosBundle: config.ios.bundleIdentifier === 'com.haruka.catdiary',
  androidPackage: config.android.package === 'com.haruka.catdiary',
  encryptionDeclaration: productionPrebuild.config.ios.config.usesNonExemptEncryption === false,
  microphoneDisabled: JSON.stringify(config.plugins).includes('"microphonePermission":false'),
  iosHttpsOnly:
    infoPlist.NSAppTransportSecurity?.NSAllowsArbitraryLoads === false &&
    !infoPlist.NSAppTransportSecurity?.NSExceptionDomains,
  iosCameraPurpose: infoPlist.NSCameraUsageDescription === '允许猫伴日记拍摄猫咪照片',
  iosPhotosPurpose:
    infoPlist.NSPhotoLibraryUsageDescription === '允许猫伴日记选择猫咪照片并保存到家庭相册',
  noUnusedIosSensitivePurpose:
    !('NSFaceIDUsageDescription' in infoPlist) &&
    !('NSMicrophoneUsageDescription' in infoPlist) &&
    !('NSLocationWhenInUseUsageDescription' in infoPlist) &&
    !('NSContactsUsageDescription' in infoPlist),
  androidPermissionMinimum: forbiddenAndroidPermissions.every(
    (permission) => !activeAndroidPermissions.includes(permission),
  ),
  androidBackupDisabled: androidApplication['android:allowBackup'] === 'false',
  androidProductionCleartextDisabled: androidApplication['android:usesCleartextTraffic'] !== 'true',
  privacyTrackingDisabled:
    privacyManifest?.NSPrivacyTracking === false &&
    privacyManifest.NSPrivacyTrackingDomains?.length === 0,
  privacyRequiredReasonApis:
    JSON.stringify(privacyApiReasons.get('NSPrivacyAccessedAPICategoryFileTimestamp')) ===
      JSON.stringify(['0A2A.1', '3B52.1', 'C617.1']) &&
    JSON.stringify(privacyApiReasons.get('NSPrivacyAccessedAPICategoryDiskSpace')) ===
      JSON.stringify(['85F4.1', 'E174.1']) &&
    JSON.stringify(privacyApiReasons.get('NSPrivacyAccessedAPICategorySystemBootTime')) ===
      JSON.stringify(['35F9.1']) &&
    JSON.stringify(privacyApiReasons.get('NSPrivacyAccessedAPICategoryUserDefaults')) ===
      JSON.stringify(['CA92.1']),
  privacyCollectedData:
    [
      'NSPrivacyCollectedDataTypePhoneNumber',
      'NSPrivacyCollectedDataTypeUserID',
      'NSPrivacyCollectedDataTypeDeviceID',
      'NSPrivacyCollectedDataTypePhotosorVideos',
      'NSPrivacyCollectedDataTypeOtherUserContent',
    ].every((type) => privacyDataTypes.has(type)) &&
    (privacyManifest?.NSPrivacyCollectedDataTypes ?? []).every(
      (entry) =>
        entry.NSPrivacyCollectedDataTypeLinked === true &&
        entry.NSPrivacyCollectedDataTypeTracking === false &&
        entry.NSPrivacyCollectedDataTypePurposes?.length === 1 &&
        entry.NSPrivacyCollectedDataTypePurposes[0] ===
          'NSPrivacyCollectedDataTypePurposeAppFunctionality',
    ),
};
if (Object.values(checks).some((value) => !value))
  throw new Error(`Mobile production config checks failed: ${JSON.stringify(checks)}`);

console.log(`MOBILE_CONFIG_OK ${JSON.stringify(checks)}`);
