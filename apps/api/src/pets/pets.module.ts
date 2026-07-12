import { Module } from '@nestjs/common';
import { FamiliesModule } from '../families/families.module';
import { PetsController } from './pets.controller';
import { PetsService } from './pets.service';
import { AuthModule } from '../auth/auth.module';
import { PhotosModule } from '../photos/photos.module';

@Module({
  imports: [AuthModule, FamiliesModule, PhotosModule],
  controllers: [PetsController],
  providers: [PetsService],
})
export class PetsModule {}
