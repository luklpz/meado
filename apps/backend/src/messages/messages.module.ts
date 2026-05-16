import { Module, forwardRef } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { MessagesGateway } from './messages.gateway';
import { AuthModule } from '../auth/auth.module';
import { DmModule } from '../dm/dm.module';
import { FriendsModule } from '../friends/friends.module';

@Module({
  imports: [AuthModule, DmModule, forwardRef(() => FriendsModule)],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesGateway],
  exports: [MessagesService, MessagesGateway],
})
export class MessagesModule {}
