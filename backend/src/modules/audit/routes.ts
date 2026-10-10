import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth';
import { listAuditLogs } from './service';

export const auditRouter = Router();

auditRouter.get('/', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const result = await listAuditLogs(limit, offset);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
