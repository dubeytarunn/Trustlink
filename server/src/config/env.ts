import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from root or local dir
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DEMO_MODE: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(true),
  DATABASE_PATH: z.string().default('./data/trustlink.db'),
  KEY_ENCRYPTION_SECRET: z
    .string()
    .length(64, 'KEY_ENCRYPTION_SECRET must be a 64-character hex string (32 bytes)')
    .default('e7b89f2d1a4c3e5b6a7d8c9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f90'),
  JWT_ACCESS_SECRET: z.string().min(16).default('dev_jwt_access_secret_trustlink_academic_verification_platform_2026'),
  JWT_REFRESH_SECRET: z.string().min(16).default('dev_jwt_refresh_secret_trustlink_academic_verification_platform_2026'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
});

export const env = envSchema.parse(process.env);
