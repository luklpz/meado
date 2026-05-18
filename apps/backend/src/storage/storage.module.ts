import { Module } from '@nestjs/common';
import { DriveService } from './drive.service';
import { DriveController } from './drive.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [DriveController],
  providers: [DriveService],
  exports: [DriveService],
})
export class StorageModule {}
