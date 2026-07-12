import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sms } from 'tencentcloud-sdk-nodejs-sms';

@Injectable()
export class SmsProviderService {
  private readonly client: InstanceType<typeof sms.v20210111.Client> | null;

  constructor(private readonly config: ConfigService) {
    this.client =
      config.get('NODE_ENV') === 'production'
        ? new sms.v20210111.Client({
            credential: {
              secretId: config.getOrThrow<string>('SMS_SECRET_ID'),
              secretKey: config.getOrThrow<string>('SMS_SECRET_KEY'),
            },
            region: config.get('SMS_REGION', 'ap-guangzhou'),
            profile: {
              signMethod: 'TC3-HMAC-SHA256',
              httpProfile: { reqMethod: 'POST', reqTimeout: 10 },
            },
          })
        : null;
  }

  async sendCode(phone: string, code: string, ttlMinutes: number) {
    if (!this.client) return { providerMessageId: null };
    const response = await this.client.SendSms({
      PhoneNumberSet: [`+86${phone}`],
      SmsSdkAppId: this.config.getOrThrow<string>('SMS_APP_ID'),
      SignName: this.config.getOrThrow<string>('SMS_SIGN_NAME'),
      TemplateId: this.config.getOrThrow<string>('SMS_TEMPLATE_ID'),
      TemplateParamSet: [code, String(ttlMinutes)],
    });
    const status = response.SendStatusSet?.[0];
    if (status?.Code !== 'Ok') {
      console.error(
        JSON.stringify({
          level: 'error',
          service: 'cat-diary-api',
          event: 'sms-provider-rejected',
          providerCode: status?.Code ?? 'EMPTY_RESPONSE',
          requestId: response.RequestId,
        }),
      );
      throw new Error('SMS_PROVIDER_REJECTED');
    }
    return { providerMessageId: status.SerialNo ?? response.RequestId ?? null };
  }
}
