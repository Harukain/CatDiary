import { z } from 'zod';

const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;
const optionalSecret = z.preprocess(blankToUndefined, z.string().min(1).optional());
const optionalPath = z.preprocess(blankToUndefined, z.string().min(1).optional());
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
const developmentChannelSecret = 'cat-diary-dev-channel-encryption-secret-32-chars';
const developmentMetricsToken = 'cat-diary-dev-metrics-token-at-least-32-characters';
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().url(),
    REDIS_URL: redisUrl,
    WORKER_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    WORKER_HOST: z.string().min(1).default('0.0.0.0'),
    METRICS_TOKEN: z.string().min(32).default(developmentMetricsToken),
    CHANNEL_ENCRYPTION_SECRET: z.string().min(32).default(developmentChannelSecret),
    COS_SECRET_ID: optionalSecret,
    COS_SECRET_KEY: optionalSecret,
    COS_BUCKET: optionalSecret,
    COS_REGION: optionalSecret,
    EXPORT_LOCAL_DIR: optionalPath,
    UPLOAD_LOCAL_DIR: optionalPath,
    FEATURE_NOTIFICATIONS_ENABLED: booleanFlag,
    FEATURE_EXPORTS_ENABLED: booleanFlag,
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV !== 'production') return;
    for (const key of ['COS_SECRET_ID', 'COS_SECRET_KEY', 'COS_BUCKET', 'COS_REGION'] as const)
      if (!value[key])
        context.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required in production`,
        });
    if (value.CHANNEL_ENCRYPTION_SECRET === developmentChannelSecret)
      context.addIssue({
        code: 'custom',
        path: ['CHANNEL_ENCRYPTION_SECRET'],
        message: 'CHANNEL_ENCRYPTION_SECRET must not use the development default in production',
      });
    if (value.METRICS_TOKEN === developmentMetricsToken)
      context.addIssue({
        code: 'custom',
        path: ['METRICS_TOKEN'],
        message: 'METRICS_TOKEN must not use the development default in production',
      });
  });

export function validateWorkerEnvironment(value: Record<string, unknown>) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new Error(
      `Invalid worker environment configuration: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
    );
  return result.data;
}
