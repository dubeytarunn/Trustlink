import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { universityRouter } from './routes/university';
import { studentRouter } from './routes/student';
import { verifyRouter } from './routes/verify';
import { employerRouter } from './routes/employer';
import { aadhaarRouter } from './routes/aadhaar';
import { credentialsRouter } from './routes/credentials';
import { credentialRequestsRouter } from './routes/credential-requests';
import { documentsRouter } from './routes/documents';
import { digilockerRouter } from './routes/digilocker';
import { errorHandler } from './middleware/error-handler';

export function createApp() {
  const app = express();

  // Security & standard middleware
  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
    })
  );

  app.use(
    cors({
      origin: [env.CORS_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'],
      credentials: true,
    })
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // API Routes
  app.use('/api', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/university', universityRouter);
  app.use('/api/student', studentRouter);
  app.use('/api/verify', verifyRouter);
  app.use('/api/credentials', credentialsRouter);
  app.use('/api/credential-requests', credentialRequestsRouter);
  app.use('/api/trust-registry', (req, res, next) => {
    req.url = '/trust-registry';
    verifyRouter(req, res, next);
  });
  app.use('/api/employer', employerRouter);
  app.use('/api/kyc/aadhaar', aadhaarRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/digilocker', digilockerRouter);

  // Error handling
  app.use(errorHandler);

  return app;
}
