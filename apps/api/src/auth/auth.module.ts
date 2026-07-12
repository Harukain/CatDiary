import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { AccessTokenGuard } from './access-token.guard';
import { PhoneSecurityService } from './phone-security.service';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { SmsProviderService } from './sms-provider.service';
import { OtpStoreService } from './otp-store.service';

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, AccountController],
  providers: [
    AuthService,
    AccountService,
    OtpService,
    OtpStoreService,
    SmsProviderService,
    PhoneSecurityService,
    AccessTokenGuard,
  ],
  exports: [AccessTokenGuard, PhoneSecurityService, JwtModule],
})
export class AuthModule {}
