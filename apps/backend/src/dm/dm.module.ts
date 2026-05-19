import { Module, forwardRef } from '@nestjs/common';
import { DmService } from './dm.service';
import { DmController } from './dm.controller';
import { AuthModule } from '../auth/auth.module';
import { MessagesModule } from '../messages/messages.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [AuthModule, StorageModule, forwardRef(() => MessagesModule)],
  controllers: [DmController],
  providers: [DmService],
  exports: [DmService],
})
export class DmModule {}
