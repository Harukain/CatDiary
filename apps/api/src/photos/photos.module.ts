import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FamiliesModule } from '../families/families.module';
import { PhotosController, UploadsController } from './photos.controller';
import { PhotosService } from './photos.service';

@Module({
  imports: [AuthModule, FamiliesModule],
  controllers: [UploadsController, PhotosController],
  providers: [PhotosService],
  exports: [PhotosService],
})
export class PhotosModule {}
