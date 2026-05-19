import { Module, forwardRef } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { StorageModule } from '../storage/storage.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [EmailModule, forwardRef(() => StorageModule)],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  controllers: [AuthController],
  exports: [JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
