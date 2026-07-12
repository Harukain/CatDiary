import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { RequestContextMiddleware } from './common/request-context.middleware';
import { FamiliesModule } from './families/families.module';
import { PetsModule } from './pets/pets.module';
import { PlansModule } from './plans/plans.module';
import { TasksModule } from './tasks/tasks.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DevicesModule } from './devices/devices.module';
import { RecordsModule } from './records/records.module';
import { HealthEventsModule } from './health-events/health-events.module';
import { MedicalRecordsModule } from './medical-records/medical-records.module';
import { PhotosModule } from './photos/photos.module';
import { ExportsModule } from './exports/exports.module';
import { validateEnvironment } from './config/environment';
import { MetricsController } from './common/metrics.controller';
import { MetricsService } from './common/metrics.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: Number(process.env.THROTTLE_DEFAULT_LIMIT ?? 120),
      },
    ]),
    PrismaModule,
    AuthModule,
    FamiliesModule,
    PetsModule,
    PlansModule,
    TasksModule,
    NotificationsModule,
    DevicesModule,
    RecordsModule,
    HealthEventsModule,
    MedicalRecordsModule,
    PhotosModule,
    ExportsModule,
  ],
  controllers: [HealthController, MetricsController],
  providers: [MetricsService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('{*splat}');
  }
}
