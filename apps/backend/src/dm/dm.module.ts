import { Module, forwardRef } from '@nestjs/common';
import { DmService } from './dm.service';
import { DmController } from './dm.controller';
import { AuthModule } from '../auth/auth.module';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [AuthModule, forwardRef(() => MessagesModule)],
  controllers: [DmController],
  providers: [DmService],
  exports: [DmService],
})
export class DmModule {}
