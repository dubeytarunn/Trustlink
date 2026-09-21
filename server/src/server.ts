import { createApp } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { getDatabase } from './db/connection';

async function bootstrap() {
  // Initialize and run SQLite migrations
  const db = getDatabase();
  logger.info('Database connection established and migrations applied.');

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 TrustLink Server listening on http://localhost:${env.PORT}`);
    logger.info(`Environment: ${env.NODE_ENV} | Demo Mode: ${env.DEMO_MODE}`);
  });

  const shutdown = () => {
    logger.info('Gracefully shutting down TrustLink Server...');
    server.close(() => {
      db.close();
      logger.info('Database closed. Process exiting.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start TrustLink server');
  process.exit(1);
});
