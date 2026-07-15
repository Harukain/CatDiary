import { z } from 'zod';

const optionalSecret = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);
const booleanFlag = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true');
const redisUrl = z
  .string()
  .url()
  .refine((value) => /^rediss?:\/\//.test(value), {
    message: 'must use redis:// or rediss://',
  });
const developmentSecrets = {
  JWT_ACCESS_SECRET: 'cat-diary-dev-access-secret-32-chars',
  JWT_REFRESH_SECRET: 'cat-diary-dev-refresh-secret-32-chars',
  PHONE_LOOKUP_SECRET: 'cat-diary-dev-phone-lookup-secret-32-chars',
  PHONE_ENCRYPTION_SECRET: 'cat-diary-dev-phone-encryption-secret-32-chars',
  CHANNEL_ENCRYPTION_SECRET: 'cat-diary-dev-channel-encryption-secret-32-chars',
} as const;
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.string().url(),
    REDIS_URL: redisUrl,
    JWT_ACCESS_SECRET: z.string().min(32).default(developmentSecrets.JWT_ACCESS_SECRET),
    JWT_REFRESH_SECRET: z.string().min(32).default(developmentSecrets.JWT_REFRESH_SECRET),
    PHONE_LOOKUP_SECRET: z.string().min(32).default(developmentSecrets.PHONE_LOOKUP_SECRET),
    PHONE_ENCRYPTION_SECRET: z.string().min(32).default(developmentSecrets.PHONE_ENCRYPTION_SECRET),
    CHANNEL_ENCRYPTION_SECRET: z
      .string()
      .min(32)
      .default(developmentSecrets.CHANNEL_ENCRYPTION_SECRET),
    DEV_OTP_CODE: z
      .string()
      .regex(/^\d{6}$/)
      .default('123456'),
    DEFAULT_TIMEZONE: z.string().default('Asia/Shanghai'),
    PUBLIC_API_URL: z.string().url().optional(),
    UPLOAD_LOCAL_DIR: z.string().optional(),
    EXPORT_LOCAL_DIR: z.string().optional(),
    COS_SECRET_ID: optionalSecret,
    COS_SECRET_KEY: optionalSecret,
    COS_BUCKET: optionalSecret,
    COS_REGION: optionalSecret,
    SMS_APP_ID: optionalSecret,
    SMS_SIGN_NAME: optionalSecret,
    SMS_TEMPLATE_ID: optionalSecret,
    SMS_SECRET_ID: optionalSecret,
    SMS_SECRET_KEY: optionalSecret,
    SMS_REGION: z.string().default('ap-guangzhou'),
    SMS_CODE_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
    CORS_ALLOWED_ORIGINS: z.string().default(''),
    TRUST_PROXY: z.enum(['true', 'false']).default('false'),
    ENABLE_SWAGGER: z.enum(['true', 'false']).optional(),
    FEATURE_NOTIFICATIONS_ENABLED: booleanFlag,
    FEATURE_EXPORTS_ENABLED: booleanFlag,
    METRICS_TOKEN: z.string().min(32).optional(),
    THROTTLE_DEFAULT_LIMIT: z.coerce.number().int().positive().default(120),
    THROTTLE_SMS_SEND_LIMIT: z.coerce.number().int().positive().default(5),
    THROTTLE_SMS_VERIFY_LIMIT: z.coerce.number().int().positive().default(10),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV !== 'production') return;
    for (const key of [
      'COS_SECRET_ID',
      'COS_SECRET_KEY',
      'COS_BUCKET',
      'COS_REGION',
      'SMS_APP_ID',
      'SMS_SIGN_NAME',
      'SMS_TEMPLATE_ID',
      'SMS_SECRET_ID',
      'SMS_SECRET_KEY',
    ] as const)
      if (!value[key])
        context.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required in production`,
        });
    if (value.DEV_OTP_CODE === '123456')
      context.addIssue({
        code: 'custom',
        path: ['DEV_OTP_CODE'],
        message: 'Development OTP must not be enabled in production',
      });
    for (const [key, developmentValue] of Object.entries(developmentSecrets))
      if (value[key as keyof typeof developmentSecrets] === developmentValue)
        context.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} must not use the development default in production`,
        });
    if (!value.METRICS_TOKEN)
      context.addIssue({
        code: 'custom',
        path: ['METRICS_TOKEN'],
        message: 'METRICS_TOKEN is required in production',
      });
  });

export function validateEnvironment(value: Record<string, unknown>) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new Error(
      `Invalid environment configuration: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
    );
  return result.data;
}
