export class AppError extends Error {
  public readonly statusCode: number;

  public code: string;

  public readonly isOperational: boolean;

  public readonly requestId?: string;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    isOperational = true,
    requestId?: string
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.requestId = requestId;

    // Required for correct instanceof checks when targeting ES5/using transpilers.
    Object.setPrototypeOf(this, new.target.prototype);

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class ValidationError extends AppError {
  public readonly field?: string;

  constructor(message: string, field?: string) {
    super(message, 400, 'VALIDATION_ERROR', true);
    this.field = field;
  }
}

export class AuthError extends AppError {
  constructor(message: string, requestId?: string) {
    super(message, 401, 'AUTH_ERROR', true, requestId);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string, requestId?: string) {
    super(message, 403, 'FORBIDDEN', true, requestId);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, requestId?: string) {
    super(message, 404, 'NOT_FOUND', true, requestId);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string, requestId?: string) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', true, requestId);
  }
}

export class FeedError extends AppError {
  public readonly feedName: string;

  constructor(message: string, feedName: string) {
    super(message, 502, 'FEED_ERROR', true);
    this.feedName = feedName;
  }
}

export class FeedTimeoutError extends FeedError {
  constructor(message: string, feedName: string) {
    super(message, feedName);
    this.code = 'FEED_TIMEOUT';
  }
}

export class FeedRateLimitError extends FeedError {
  constructor(message: string, feedName: string) {
    super(message, feedName);
    this.code = 'FEED_RATE_LIMITED';
  }
}

export class FeedUnavailableError extends FeedError {
  constructor(message: string, feedName: string) {
    super(message, feedName);
    this.code = 'FEED_UNAVAILABLE';
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, requestId?: string) {
    super(message, 503, 'DATABASE_ERROR', true, requestId);
  }
}

export class InternalError extends AppError {
  constructor(message: string, requestId?: string) {
    super(message, 500, 'INTERNAL_ERROR', false, requestId);
  }
}