import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('search')
  async search(@Query('q') q: string, @Req() req: any) {
    if (!q || q.trim().length < 2) return [];
    const query = q.trim();
    const isEmail = query.includes('@');

    const users = await this.prisma.user.findMany({
      where: isEmail
        ? { email: query.toLowerCase(), emailVerified: true, id: { not: req.user.id } }
        : {
            username: { contains: query, mode: 'insensitive' },
            emailVerified: true,
            id: { not: req.user.id },
          },
      select: { id: true, username: true, name: true, avatarUrl: true },
      take: 8,
    });
    return users;
  }
}
