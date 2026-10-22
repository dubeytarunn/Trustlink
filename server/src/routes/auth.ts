import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth-service';
import { authenticate } from '../middleware/auth';
import { env } from '../config/env';

export const authRouter = Router();
const authService = new AuthService();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpCode: z.string().optional(),
});

authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, totpCode } = loginSchema.parse(req.body);
    const result = await authService.login(email, password, totpCode);

    if (result.requires2FA) {
      res.json({
        requires2FA: true,
        userId: result.userId,
        message: result.message,
      });
      return;
    }

    // Set secure httpOnly cookies
    const isProd = env.NODE_ENV === 'production';
    res.cookie('trustlink_access_token', result.accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 min
    });

    res.cookie('trustlink_refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      user: result.user,
      accessToken: result.accessToken,
    });
    return;
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('trustlink_access_token');
  res.clearCookie('trustlink_refresh_token');
  res.json({ message: 'Logged out successfully' });
});

authRouter.post('/refresh', (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies?.trustlink_refresh_token || req.body?.refreshToken;
    if (!refreshToken) {
      res.status(401).json({ error: { code: 'MISSING_REFRESH_TOKEN', message: 'No refresh token provided' } });
      return;
    }

    const payload = authService.verifyRefreshToken(refreshToken);
    const newAccessToken = authService.generateAccessToken({
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      universityId: payload.universityId,
    });

    res.cookie('trustlink_access_token', newAccessToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });

    res.json({ accessToken: newAccessToken });
    return;
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', authenticate, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
});

authRouter.post('/change-password', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const result = await authService.changePassword(req.user!.userId, currentPassword, newPassword);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/2fa/setup', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.setup2FA(req.user!.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const verify2FASchema = z.object({
  secret: z.string(),
  token: z.string().length(6),
});

authRouter.post('/2fa/verify', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { secret, token } = verify2FASchema.parse(req.body);
    const result = await authService.verifyAndEnable2FA(req.user!.userId, secret, token);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
