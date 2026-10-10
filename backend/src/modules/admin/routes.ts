import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../config/db';
import { validate } from '../../middleware/validate';
import { requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { adminCheckinRouter, adminEventsRouter } from '../events/routes';
import { adminMembersRouter } from '../memberships/routes';
import { adminOrdersRouter, adminProductsRouter, adminVariantsRouter } from '../merchandise/routes';
import { adminAnnouncementsRouter } from '../announcements/routes';
import { adminExpensesRouter, adminFinanceRouter } from '../finance/routes';
import { adminFundraisersRouter, adminTasksRouter } from '../fundraisers/routes';
import { overview } from './service';

/**
 * Everything under /api/admin. The guard is on the router itself, so a sub-route can't be added without it and
 * a non-admin gets 403 (anonymous 401) on every path here, including ones that don't exist.
 */
export const adminRouter = Router();
adminRouter.use(requireRole('admin'));
adminRouter.get('/overview', asyncHandler(async (_req, res) => res.json(await overview())));
/** Active accounts, e.g. `?role=admin` for the task assignee picker. */
adminRouter.get('/users', validate({ query: z.object({ role: z.enum(['admin', 'user']).optional() }) }), asyncHandler(async (req, res) => {
  res.json(await getDb()('users').where({ is_active: true }).modify((qb) => { if (req.query.role) qb.where({ role: req.query.role }); }).select('id', 'name', 'email').orderBy('name'));
}));
adminRouter.use('/events', adminEventsRouter);
adminRouter.use('/checkin', adminCheckinRouter);
adminRouter.use('/members', adminMembersRouter);
adminRouter.use('/products', adminProductsRouter);
adminRouter.use('/variants', adminVariantsRouter);
adminRouter.use('/orders', adminOrdersRouter);
adminRouter.use('/announcements', adminAnnouncementsRouter);
adminRouter.use('/finance', adminFinanceRouter);
adminRouter.use('/expenses', adminExpensesRouter);
adminRouter.use('/fundraisers', adminFundraisersRouter);
adminRouter.use('/tasks', adminTasksRouter);
