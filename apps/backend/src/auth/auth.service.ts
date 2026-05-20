import {
  Injectable, ConflictException, UnauthorizedException, BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const disposableDomains: string[] = require('disposable-email-domains');
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CloudinaryService } from '../storage/cloudinary.service';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';

const DISPOSABLE_DOMAINS = new Set(disposableDomains);

export interface PublicUser {
  id: string;
  username: string;
  name?: string | null;
  role: string;
  avatarUrl?: string | null;
}

const USERNAME_RE = /^[a-zA-Z0-9]+$/;

function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET env var is not set');
  return s;
}

const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function normalizeEmail(email: string): string {
  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1) return email.toLowerCase();
  const local = email.slice(0, atIndex).toLowerCase().replace(/\./g, '');
  const domain = email.slice(atIndex + 1).toLowerCase();
  return `${local}@${domain}`;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string }> {
    if (!dto.username || !dto.email || !dto.password) {
      throw new BadRequestException('Se requiere nombre de usuario, email y contraseña');
    }
    if (!USERNAME_RE.test(dto.username)) {
      throw new BadRequestException('El nombre de usuario solo puede contener letras y números');
    }
    if (dto.username.length < 3 || dto.username.length > 20) {
      throw new BadRequestException('El nombre de usuario debe tener entre 3 y 20 caracteres');
    }
    if (!dto.password || dto.password.length < 8) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres');
    }

    const emailDomain = dto.email.slice(dto.email.lastIndexOf('@') + 1).toLowerCase();
    if (DISPOSABLE_DOMAINS.has(emailDomain)) {
      throw new BadRequestException('No se permiten direcciones de email temporales o desechables');
    }

    const normalizedEmail = normalizeEmail(dto.email);

    const [byUsername, byEmail] = await Promise.all([
      this.prisma.user.findUnique({ where: { username: dto.username } }),
      this.prisma.user.findUnique({ where: { email: normalizedEmail } }),
    ]);
    if (byUsername) throw new ConflictException('El nombre de usuario ya está en uso');
    if (byEmail) throw new ConflictException('El email ya está registrado');

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
      jwtSecret(),
      { expiresIn: '24h' },
    );

    try {
      await this.emailService.sendVerificationEmail(user.email, user.username, verifyToken);
    } catch {
      await this.prisma.user.delete({ where: { id: user.id } });
      throw new BadRequestException('No se pudo enviar el email de verificación. Comprueba la dirección e inténtalo de nuevo');
    }

    return { message: 'Account created. Check your email to verify your account.' };
  }

  async login(dto: LoginDto): Promise<{ token: string; user: PublicUser }> {
    if (!dto.email || !dto.password) throw new UnauthorizedException('Credenciales incorrectas');
    const normalizedEmail = normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) throw new UnauthorizedException('Credenciales incorrectas');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciales incorrectas');

    if (!user.emailVerified) {
      throw new UnauthorizedException('Verifica tu email antes de iniciar sesión');
    }

    return this.buildResult({
      id: user.id, username: user.username, name: user.name, role: user.role as string, avatarUrl: user.avatarUrl,
    });
  }

  async verifyEmail(token: string): Promise<void> {
    let payload: any;
    try {
      payload = jwt.verify(token, jwtSecret());
    } catch {
      throw new BadRequestException('El enlace de verificación no es válido o ha expirado');
    }

    if (payload.type !== 'verify') {
      throw new BadRequestException('Tipo de token no válido');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true } });
    if (!user) throw new BadRequestException('El enlace de verificación no es válido o ha expirado');
    await this.prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const normalizedEmail = normalizeEmail(email);
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user || !user.emailVerified) {
      return { message: 'If that email exists, a reset link has been sent.' };
    }

    const resetToken = jwt.sign(
      { sub: user.id, type: 'reset' },
      jwtSecret(),
      { expiresIn: '1h' },
    );

    try {
      await this.emailService.sendPasswordResetEmail(user.email, user.username, resetToken);
    } catch {
      throw new BadRequestException('No se pudo enviar el email de recuperación. Inténtalo más tarde');
    }

    return { message: 'If that email exists, a reset link has been sent.' };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    let payload: any;
    try {
      payload = jwt.verify(token, jwtSecret());
    } catch {
      throw new BadRequestException('El enlace de recuperación no es válido o ha expirado');
    }

    if (payload.type !== 'reset') throw new BadRequestException('Tipo de token no válido');
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true } });
    if (!user) throw new BadRequestException('El enlace de recuperación no es válido o ha expirado');
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    return { message: 'Password updated successfully' };
  }

  async updateAvatar(userId: string, file: Express.Multer.File): Promise<{ avatarUrl: string }> {
    if (!ALLOWED_AVATAR_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Tipo de archivo no permitido. Usa JPEG, PNG, GIF o WebP.');
    }

    const avatarUrl = await this.cloudinaryService.uploadBuffer(
      file.buffer,
      'meado/avatars',
      `avatar-${userId}`,
    );

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
      jwtSecret(),
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
      jwtSecret(),
      { expiresIn: '7d' },
    );
    return { token, user };
  }
}
