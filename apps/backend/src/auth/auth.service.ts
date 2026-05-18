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
  name?: string | null;
  role: string;
  avatarUrl?: string | null;
}

const USERNAME_RE = /^[a-zA-Z0-9]+$/;

const secret = () => process.env.JWT_SECRET ?? 'dev-secret';

const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function normalizeEmail(email: string): string {
  const [local, domain] = email.toLowerCase().split('@');
  return `${local}@${domain}`;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string }> {
    if (!dto.username || !dto.email || !dto.password) {
      throw new BadRequestException('Username, email and password are required');
    }
    if (!USERNAME_RE.test(dto.username)) {
      throw new BadRequestException('Username must contain only letters and numbers');
    }
    if (dto.username.length < 3 || dto.username.length > 32) {
      throw new BadRequestException('Username must be 3–32 characters');
    }
    if (!dto.password || dto.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const normalizedEmail = normalizeEmail(dto.email);

    const [byUsername, byEmail] = await Promise.all([
      this.prisma.user.findUnique({ where: { username: dto.username } }),
      this.prisma.user.findUnique({ where: { email: normalizedEmail } }),
    ]);
    if (byUsername) throw new ConflictException('Username already taken');
    if (byEmail) throw new ConflictException('Email already registered');

    const count = await this.prisma.user.count();
    const role = count === 0 ? 'SUPERADMIN' : 'USER';
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        name: dto.name?.trim() || null,
        email: normalizedEmail,
        passwordHash,
        role: role as any,
      },
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
      await this.prisma.user.delete({ where: { id: user.id } });
      throw new BadRequestException('Could not send verification email — check the address and try again');
    }

    return { message: 'Account created. Check your email to verify your account.' };
  }

  async login(dto: LoginDto): Promise<{ token: string; user: PublicUser }> {
    if (!dto.email || !dto.password) throw new UnauthorizedException('Invalid credentials');
    const normalizedEmail = normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (!user.emailVerified) {
      throw new UnauthorizedException('Please verify your email before logging in');
    }

    return this.buildResult({
      id: user.id, username: user.username, name: user.name, role: user.role as string, avatarUrl: user.avatarUrl,
    });
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

  async forgotPassword(email: string): Promise<{ message: string }> {
    const normalizedEmail = normalizeEmail(email);
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user || !user.emailVerified) {
      return { message: 'If that email exists, a reset link has been sent.' };
    }

    const resetToken = jwt.sign(
      { sub: user.id, type: 'reset' },
      secret(),
      { expiresIn: '1h' },
    );

    try {
      await this.emailService.sendPasswordResetEmail(user.email, user.username, resetToken);
    } catch {
      throw new BadRequestException('Could not send reset email — try again later');
    }

    return { message: 'If that email exists, a reset link has been sent.' };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    let payload: any;
    try {
      payload = jwt.verify(token, secret());
    } catch {
      throw new BadRequestException('Invalid or expired reset link');
    }

    if (payload.type !== 'reset') throw new BadRequestException('Invalid token type');
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({ where: { id: payload.sub }, data: { passwordHash } });

    return { message: 'Password updated successfully' };
  }

  async updateAvatar(userId: string, file: Express.Multer.File): Promise<{ avatarUrl: string }> {
    if (!ALLOWED_AVATAR_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Tipo de archivo no permitido. Usa JPEG, PNG, GIF o WebP.');
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new BadRequestException('Almacenamiento no configurado.');
    }

    const ext = file.mimetype.split('/')[1];
    const path = `${userId}/avatar.${ext}`;

    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/avatars/${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': file.mimetype,
        'x-upsert': 'true',
      },
      body: file.buffer as any,
    });

    if (!uploadRes.ok) {
      throw new BadRequestException('Error al subir la imagen. Inténtalo de nuevo.');
    }

    const avatarUrl = `${supabaseUrl}/storage/v1/object/public/avatars/${path}`;

    await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl } });

    return { avatarUrl };
  }

  async getMe(user: PublicUser): Promise<PublicUser & { socketToken: string }> {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { avatarUrl: true, name: true },
    });

    const socketToken = jwt.sign(
      { type: 'socket', id: user.id, username: user.username, role: user.role, avatarUrl: dbUser?.avatarUrl ?? null },
      secret(),
      { expiresIn: '1h' },
    );

    return { ...user, name: dbUser?.name, avatarUrl: dbUser?.avatarUrl, socketToken };
  }

  async updateProfile(userId: string, dto: { name?: string }): Promise<{ name: string | null }> {
    const name = dto.name?.trim() || null;
    await this.prisma.user.update({ where: { id: userId }, data: { name } });
    return { name };
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
