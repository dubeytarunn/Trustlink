import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { env } from '../config/env';
import { getDatabase } from '../db/connection';
import { hashPassword, verifyPassword } from '../crypto/password';
import { AppError } from '../middleware/error-handler';

export interface TokenPayload {
  userId: number;
  email: string;
  role: 'admin' | 'university' | 'student' | 'employer';
  universityId?: number | null;
}

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  role: 'admin' | 'university' | 'student' | 'employer';
  university_id: number | null;
  status: string;
  totp_secret: string | null;
  failed_logins: number;
  locked_until: string | null;
  created_at: string;
}

export class AuthService {
  private db = getDatabase();

  generateAccessToken(payload: TokenPayload): string {
    return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
  }

  generateRefreshToken(payload: TokenPayload): string {
    return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  }

  verifyAccessToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload;
    } catch {
      throw new AppError('INVALID_TOKEN', 'Access token is invalid or expired', 401);
    }
  }

  verifyRefreshToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
    } catch {
      throw new AppError('INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired', 401);
    }
  }

  async login(email: string, passwordPlain: string, totpCode?: string) {
    const user = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim()) as UserRow | undefined;

    if (!user) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    // Check account lockout
    if (user.locked_until) {
      const lockExpiry = new Date(user.locked_until).getTime();
      if (Date.now() < lockExpiry) {
        const remainingMinutes = Math.ceil((lockExpiry - Date.now()) / 60000);
        throw new AppError('ACCOUNT_LOCKED', `Account is temporarily locked due to failed attempts. Try again in ${remainingMinutes} minutes.`, 403);
      } else {
        // Unlock after expiry
        this.db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').run(user.id);
      }
    }

    if (user.status !== 'active') {
      throw new AppError('ACCOUNT_INACTIVE', 'Your account has been deactivated or suspended', 403);
    }

    const isValidPassword = await verifyPassword(passwordPlain, user.password_hash);
    if (!isValidPassword) {
      const failedCount = user.failed_logins + 1;
      if (failedCount >= 5) {
        const lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        this.db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?').run(failedCount, lockUntil, user.id);
        throw new AppError('ACCOUNT_LOCKED', 'Too many failed login attempts. Account locked for 15 minutes.', 403);
      } else {
        this.db.prepare('UPDATE users SET failed_logins = ? WHERE id = ?').run(failedCount, user.id);
      }
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    // Check TOTP 2FA if enabled
    if (user.totp_secret) {
      if (!totpCode) {
        return {
          requires2FA: true,
          userId: user.id,
          message: 'Two-factor authentication code required',
        };
      }
      const isTotpValid = authenticator.verify({ token: totpCode, secret: user.totp_secret });
      if (!isTotpValid) {
        throw new AppError('INVALID_2FA', 'Invalid two-factor authentication code', 401);
      }
    }

    // Reset failed logins on successful authentication
    this.db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').run(user.id);

    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      universityId: user.university_id,
    };

    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    return {
      requires2FA: false,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        universityId: user.university_id,
      },
      accessToken,
      refreshToken,
    };
  }

  async setup2FA(userId: number) {
    const user = this.db.prepare('SELECT id, email, totp_secret FROM users WHERE id = ?').get(userId) as UserRow | undefined;
    if (!user) throw new AppError('USER_NOT_FOUND', 'User not found', 404);

    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(user.email, 'TrustLink', secret);

    return { secret, otpauth };
  }

  async verifyAndEnable2FA(userId: number, secret: string, token: string) {
    const isValid = authenticator.verify({ token, secret });
    if (!isValid) {
      throw new AppError('INVALID_2FA_TOKEN', 'Verification code invalid', 400);
    }

    this.db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret, userId);
    return { success: true, message: 'Two-factor authentication enabled successfully' };
  }

  async changePassword(userId: number, currentPlain: string, newPlain: string) {
    const user = this.db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(userId) as UserRow | undefined;
    if (!user) throw new AppError('USER_NOT_FOUND', 'User not found', 404);

    const isValid = await verifyPassword(currentPlain, user.password_hash);
    if (!isValid) throw new AppError('INVALID_PASSWORD', 'Current password is incorrect', 400);

    if (newPlain.length < 8) {
      throw new AppError('WEAK_PASSWORD', 'New password must be at least 8 characters long', 400);
    }

    const newHash = await hashPassword(newPlain);
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, userId);
    return { success: true, message: 'Password updated successfully' };
  }
}
