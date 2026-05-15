import {
  Controller, Post, Get, Body, Res, Req, Query,
  HttpCode, UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

const COOKIE = 'token';

function cookieOpts(prod: boolean) {
  return {
    httpOnly: true,
    secure: prod,
    sameSite: (prod ? 'none' : 'lax') as 'none' | 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

@Controller('auth')
export class AuthController {
  private readonly prod = process.env.NODE_ENV === 'production';
  private readonly frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';

  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Get('verify-email')
  async verifyEmail(@Query('token') token: string, @Res() res: Response) {
    try {
      await this.authService.verifyEmail(token);
      res.redirect(`${this.frontendUrl}/login?verified=1`);
    } catch {
      res.redirect(`${this.frontendUrl}/login?error=invalid-token`);
    }
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);
    res.cookie(COOKIE, result.token, cookieOpts(this.prod));
    return result.user;
  }

  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() body: { email: string }) {
    return this.authService.forgotPassword(body.email);
  }

  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() body: { token: string; password: string }) {
    return this.authService.resetPassword(body.token, body.password);
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request) {
    return this.authService.getMe((req as any).user);
  }
}
