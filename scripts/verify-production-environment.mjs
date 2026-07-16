const apiEnvironmentModule = '../apps/api/dist/config/environment.js';
const workerEnvironmentModule = '../apps/worker/dist/environment.js';

async function importBuiltModule(modulePath, exportName) {
  try {
    const mod = await import(modulePath);
    if (typeof mod[exportName] !== 'function')
      throw new Error(`${modulePath} does not export ${exportName}`);
    return mod[exportName];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot load ${modulePath}. Run "pnpm build" before "pnpm test:production-env". ${message}`,
      { cause: error },
    );
  }
}

function expectReject(name, action, pattern) {
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!pattern.test(message))
      throw new Error(`${name} rejected with unexpected message: ${message}`, { cause: error });
    return true;
  }
  throw new Error(`${name} unexpectedly passed`);
}

const validateEnvironment = await importBuiltModule(apiEnvironmentModule, 'validateEnvironment');
const validateWorkerEnvironment = await importBuiltModule(
  workerEnvironmentModule,
  'validateWorkerEnvironment',
);

const apiProductionEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://catdiary:prod-password@postgres.internal:5432/catdiary?schema=public',
  REDIS_URL: 'rediss://redis.internal:6380/0',
  DEV_OTP_CODE: '654321',
  JWT_ACCESS_SECRET: 'production-access-secret-at-least-32-characters',
  JWT_REFRESH_SECRET: 'production-refresh-secret-at-least-32-characters',
  PHONE_LOOKUP_SECRET: 'production-phone-lookup-secret-at-least-32-characters',
  PHONE_ENCRYPTION_SECRET: 'production-phone-encryption-secret-at-least-32-characters',
  CHANNEL_ENCRYPTION_SECRET: 'production-channel-encryption-secret-at-least-32-characters',
  COS_SECRET_ID: 'cos-secret-id',
  COS_SECRET_KEY: 'cos-secret-key',
  COS_BUCKET: 'cat-diary-production-bucket',
  COS_REGION: 'ap-shanghai',
  SMS_APP_ID: 'sms-app-id',
  SMS_SIGN_NAME: '猫伴日记',
  SMS_TEMPLATE_ID: 'sms-template-id',
  SMS_SECRET_ID: 'sms-secret-id',
  SMS_SECRET_KEY: 'sms-secret-key',
  METRICS_TOKEN: 'production-metrics-token-at-least-32-characters',
};

const workerProductionEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: apiProductionEnv.DATABASE_URL,
  REDIS_URL: apiProductionEnv.REDIS_URL,
  CHANNEL_ENCRYPTION_SECRET: apiProductionEnv.CHANNEL_ENCRYPTION_SECRET,
  COS_SECRET_ID: apiProductionEnv.COS_SECRET_ID,
  COS_SECRET_KEY: apiProductionEnv.COS_SECRET_KEY,
  COS_BUCKET: apiProductionEnv.COS_BUCKET,
  COS_REGION: apiProductionEnv.COS_REGION,
  METRICS_TOKEN: apiProductionEnv.METRICS_TOKEN,
};

const checks = {
  apiRejectsFixedDevelopmentOtp: expectReject(
    'API production fixed development OTP',
    () => validateEnvironment({ ...apiProductionEnv, DEV_OTP_CODE: '123456' }),
    /Development OTP/,
  ),
  apiRejectsMissingSmsProvider: expectReject(
    'API production missing SMS provider',
    () => validateEnvironment({ ...apiProductionEnv, SMS_SECRET_KEY: undefined }),
    /SMS_SECRET_KEY/,
  ),
  apiRejectsDevelopmentSecretDefaults: expectReject(
    'API production development secret defaults',
    () =>
      validateEnvironment({
        ...apiProductionEnv,
        JWT_ACCESS_SECRET: 'cat-diary-dev-access-secret-32-chars',
      }),
    /JWT_ACCESS_SECRET/,
  ),
  apiRejectsSwagger: expectReject(
    'API production Swagger',
    () => validateEnvironment({ ...apiProductionEnv, ENABLE_SWAGGER: 'true' }),
    /Swagger/,
  ),
  workerRejectsMissingPrivateObjectStorage: expectReject(
    'Worker production missing private object storage',
    () => validateWorkerEnvironment({ ...workerProductionEnv, COS_BUCKET: undefined }),
    /COS_BUCKET/,
  ),
  workerRejectsDevelopmentMetricsToken: expectReject(
    'Worker production development metrics token',
    () =>
      validateWorkerEnvironment({
        ...workerProductionEnv,
        METRICS_TOKEN: 'cat-diary-dev-metrics-token-at-least-32-characters',
      }),
    /METRICS_TOKEN/,
  ),
  apiAcceptsSecureProductionEnv: validateEnvironment(apiProductionEnv).NODE_ENV === 'production',
  workerAcceptsSecureProductionEnv:
    validateWorkerEnvironment(workerProductionEnv).NODE_ENV === 'production',
};

if (Object.values(checks).some((value) => value !== true))
  throw new Error(`Production environment checks failed: ${JSON.stringify(checks)}`);

console.log(`PRODUCTION_ENV_OK ${JSON.stringify(checks)}`);
