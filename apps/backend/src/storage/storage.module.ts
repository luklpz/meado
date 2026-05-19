import { Module, forwardRef } from '@nestjs/common';
import { DriveService } from './drive.service';
import { DriveController } from './drive.controller';
import { CloudinaryService } from './cloudinary.service';
import { UploadController } from './upload.controller';
import { StorageService } from './storage.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [DriveController, UploadController],
  providers: [DriveService, CloudinaryService, StorageService],
  exports: [DriveService, CloudinaryService, StorageService],
})
export class StorageModule {}
