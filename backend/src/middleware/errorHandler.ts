import { ErrorRequestHandler, Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';
import logger from '../utils/logger';

export const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (res.headersSent) {
    return next(err);
  }

  const requestId = req.requestId ?? 'unknown';

  if (err instanceof AppError && err.isOperational) {
    logger.warn('Operational error', {
      code: err.code,
      message: err.message,
      requestId,
    });
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        requestId,
      },
    });
    return;
  }

  // Programmer error or other unexpected error
  logger.error('Internal server error', {
    requestId,
    error: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId,
    },
  });
};
