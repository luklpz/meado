import {
  Injectable, ConflictException, UnauthorizedException, BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';

export interface PublicUser {
  id: string;
  username: string;
  role: string;
}

const secret = () => process.env.JWT_SECRET ?? 'dev-secret';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const [byUsername, byEmail] = await Promise.all([
      this.prisma.user.findUnique({ where: { username: dto.username } }),
      this.prisma.user.findUnique({ where: { email: dto.email } }),
    ]);
    if (byUsername) throw new ConflictException('Username already taken');
    if (byEmail) throw new ConflictException('Email already registered');

    const count = await this.prisma.user.count();
    const role = count === 0 ? 'SUPERADMIN' : 'USER';
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: { username: dto.username, email: dto.email, passwordHash, role: role as any },
      select: { id: true, username: true, email: true },
    });

    const verifyToken = jwt.sign(
      { sub: user.id, email: user.email, type: 'verify' },
      secret(),
      { expiresIn: '24h' },
    );

    try {
      await this.emailService.sendVerificationEmail(user.email, user.username, verifyToken);
    } catch {
      // Roll back user creation if the email couldn't be delivered
      await this.prisma.user.delete({ where: { id: user.id } });
      throw new BadRequestException('Could not send verification email — check the address and try again');
    }

    return { message: 'Account created. Check your email to verify your account.' };
  }

  async login(dto: LoginDto): Promise<{ token: string; user: PublicUser }> {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (!user.emailVerified) {
      throw new UnauthorizedException('Please verify your email before logging in');
    }

    return this.buildResult({ id: user.id, username: user.username, role: user.role as string });
  }

  async verifyEmail(token: string): Promise<void> {
    let payload: any;
    try {
      payload = jwt.verify(token, secret());
    } catch {
      throw new BadRequestException('Invalid or expired verification link');
    }

    if (payload.type !== 'verify') {
      throw new BadRequestException('Invalid token type');
    }

    await this.prisma.user.update({
      where: { id: payload.sub },
      data: { emailVerified: true },
    });
  }

  getMe(user: PublicUser): PublicUser & { socketToken: string } {
    const socketToken = jwt.sign(
      { sub: user.id, username: user.username, role: user.role },
      secret(),
      { expiresIn: '1h' },
    );
    return { ...user, socketToken };
  }

  private buildResult(user: PublicUser): { token: string; user: PublicUser } {
    const token = jwt.sign(
      { sub: user.id, username: user.username, role: user.role },
      secret(),
      { expiresIn: '7d' },
    );
    return { token, user };
  }
}
