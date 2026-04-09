import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodSchema } from 'zod';
import { ValidationError } from '../errors';
import { fireAudit } from '../services/auditService';

export function validate<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (result.success) {
      req.body = result.data;
      next();
    } else {
      const { error } = result;
      const firstError = error.errors[0];

      if (firstError) {
        const field = firstError.path.join('.');
        // Log field name + value TYPE — never the actual value.
        const rawBody = req.body as Record<string, unknown>;
        const topKey  = firstError.path[0];
        const valueType = topKey !== undefined ? typeof rawBody[topKey as string] : 'unknown';

        fireAudit({
          userId:    req.user?.id,
          action:    'validation_failed',
          resource:  req.path,
          details:   { field, errorCode: firstError.code, valueType },
          ipAddress: req.ip ?? 'unknown',
          userAgent: (req.headers['user-agent'] ?? '').slice(0, 200),
          requestId: req.requestId ?? 'unknown',
          outcome:   'failure',
        });

        throw new ValidationError(firstError.message, field);
      } else {
        throw new ValidationError('Validation failed with no specific error');
      }
    }
  };
}
