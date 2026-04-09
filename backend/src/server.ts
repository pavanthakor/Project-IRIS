process.on('uncaughtException', (error: Error) => {
  const message = error.stack ?? error.message;
  process.stderr.write(`[uncaughtException] ${message}\n`);
});

process.on('unhandledRejection', (reason: unknown) => {
  const message =
    reason instanceof Error
      ? reason.stack ?? reason.message
      : JSON.stringify(reason);
  process.stderr.write(`[unhandledRejection] ${message}\n`);
});

import type { Server } from 'node:http';
import app from './app';
import config from './config';
import { closeConnections } from './config/database';
import { runStartupDiagnostics } from './services/startupDiagnostics';
import { startFeedAutoRecovery } from './services/feedAutoRecovery';
import logger from './utils/logger';

const server: Server = app.listen(config.port, () => {
  logger.info('Backend server started', {
    port:    config.port,
    nodeEnv: config.nodeEnv,
  });
  void runStartupDiagnostics();
  startFeedAutoRecovery();
});

const gracefulShutdown = async (signal: NodeJS.Signals): Promise<void> => {
  logger.info('Graceful shutdown initiated', { signal });

  server.close((serverCloseError?: Error) => {
    if (serverCloseError) {
      logger.error('Error while closing HTTP server', {
        error: serverCloseError.message
      });
      process.exitCode = 1;
    }

    void closeConnections()
      .then(() => {
        logger.info('Database and Redis connections closed');
        process.exit();
      })
      .catch((error: unknown) => {
        logger.error('Error while closing infrastructure connections', {
          error: error instanceof Error ? error.message : 'unknown'
        });
        process.exit(1);
      });
  });

  setTimeout(() => {
    logger.warn('Forced shutdown timeout reached');
    void closeConnections().finally(() => {
      process.exit(1);
    });
  }, 10_000).unref();
};

process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});