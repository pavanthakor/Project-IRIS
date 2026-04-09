import { Router, Request, Response } from 'express';
import { dbQuery } from '../config/database';
import { ValidationError } from '../errors';
import { PaginatedHistory, UserPayload } from '../types';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const user = req.user as UserPayload;
  const page = parseInt(req.query.page as string, 10) || 1;
  const pageSize = parseInt(req.query.pageSize as string, 10) || 10;

  if (page < 1 || pageSize < 1 || pageSize > 100) {
    throw new ValidationError('Invalid pagination parameters');
  }

  const offset = (page - 1) * pageSize;

  const [historyResult, totalResult] = await Promise.all([
    dbQuery(
      `SELECT id, ioc_value, ioc_type, risk_score, queried_at
       FROM ioc_queries
       WHERE user_id = $1
       ORDER BY queried_at DESC
       LIMIT $2 OFFSET $3`,
      [user.id, pageSize, offset]
    ),
    dbQuery('SELECT COUNT(*) FROM ioc_queries WHERE user_id = $1', [user.id]),
  ]);

  const totalRow = totalResult.rows[0] as { count?: unknown } | undefined;
  const total = totalRow?.count ? parseInt(String(totalRow.count), 10) : 0;

  const response: PaginatedHistory = {
    items: historyResult.rows.map(row => ({
      id: row.id,
      iocValue: row.ioc_value,
      iocType: row.ioc_type,
      riskScore: row.risk_score,
      queriedAt: new Date(row.queried_at).toISOString(),
    })),
    total,
    page,
    pageSize,
  };

  res.json(response);
});

export default router;