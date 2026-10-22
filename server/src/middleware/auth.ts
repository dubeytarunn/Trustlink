import { Request, Response, NextFunction } from 'express';
import { AuthService, TokenPayload } from '../services/auth-service';
import { AppError } from './error-handler';

// Extend Express Request type to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

const authService = new AuthService();

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.trustlink_access_token) {
    token = req.cookies.trustlink_access_token;
  }

  if (!token) {
    return next(new AppError('UNAUTHORIZED', 'Authentication token required', 401));
  }

  try {
    const payload = authService.verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err) {
    next(err);
  }
}

export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction) {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.trustlink_access_token) {
    token = req.cookies.trustlink_access_token;
  }

  if (token) {
    try {
      const payload = authService.verifyAccessToken(token);
      req.user = payload;
    } catch {
      // Ignored for optional authentication
    }
  }
  next();
}

export function requireRole(...allowedRoles: Array<'admin' | 'university' | 'student' | 'employer'>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('UNAUTHORIZED', 'Authentication required', 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          'FORBIDDEN',
          `Access forbidden: requires one of [${allowedRoles.join(', ')}], but current role is ${req.user.role}`,
          403
        )
      );
    }

    next();
  };
}
