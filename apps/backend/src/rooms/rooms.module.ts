import { Module } from '@nestjs/common';
import { RoomsGateway } from './rooms.gateway';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';

@Module({
  controllers: [RoomsController],
  providers: [RoomsGateway, RoomsService],
})
export class RoomsModule {}
