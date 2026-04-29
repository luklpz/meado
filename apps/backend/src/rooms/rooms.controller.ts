import { Controller, Get, Param, Query, BadRequestException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@Controller('rooms')
export class RoomsController {
  @Get(':roomId/livekit-token')
  getLiveKitToken(@Param('roomId') roomId: string, @Query('username') username: string) {
    if (!username) throw new BadRequestException('username required');

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!apiKey || !apiSecret) throw new BadRequestException('LiveKit not configured');

    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      {
        iss: apiKey,
        sub: username,
        name: username,
        nbf: now,
        exp: now + 3600,
        jti: Math.random().toString(36).slice(2),
        video: { room: roomId, roomJoin: true, canPublish: true, canSubscribe: true },
      },
      apiSecret,
      { algorithm: 'HS256' },
    );

    return { token };
  }
}
