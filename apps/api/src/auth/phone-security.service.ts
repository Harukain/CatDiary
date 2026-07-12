import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

@Injectable()
export class PhoneSecurityService {
  constructor(private readonly config: ConfigService) {}

  hash(phone: string) {
    return createHmac('sha256', this.config.getOrThrow<string>('PHONE_LOOKUP_SECRET'))
      .update(phone)
      .digest('hex');
  }

  encrypt(phone: string) {
    const key = createHash('sha256')
      .update(this.config.getOrThrow<string>('PHONE_ENCRYPTION_SECRET'))
      .digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(phone, 'utf8'), cipher.final()]);
    return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  decrypt(value: string) {
    const [ivValue, tagValue, encryptedValue] = value.split('.');
    if (!ivValue || !tagValue || !encryptedValue) throw new Error('Invalid encrypted phone');
    const key = createHash('sha256')
      .update(this.config.getOrThrow<string>('PHONE_ENCRYPTION_SECRET'))
      .digest();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
