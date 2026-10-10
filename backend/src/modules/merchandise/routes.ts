import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/errorHandler';
import * as svc from './service';
import { emitOrder, orderBus } from './events';

export const productsRouter = Router();
export const ordersRouter = Router();
/** Mounted under /api/admin (the admin router enforces requireRole('admin')). */
export const adminProductsRouter = Router();
export const adminVariantsRouter = Router();
export const adminOrdersRouter = Router();
const idParam = z.object({ id: z.coerce.number().int().positive() });
const variant = z.object({ size: z.string().min(1).max(20), price: z.coerce.number().min(0).max(1e9), member_price: z.coerce.number().min(0).max(1e9), stock: z.coerce.number().int().min(0).max(1_000_000) });
const product = z.object({ name: z.string().min(1).max(200), description: z.string().max(5000).optional(), image_url: z.string().max(500).refine((u) => /^(https:\/\/|\/(?!\/))/.test(u), 'https:// URL or site path').optional(), is_active: z.boolean().optional() });
const orderBody = z.object({ items: z.array(z.object({ variant_id: z.coerce.number().int().positive(), qty: z.coerce.number().int().positive().max(20) })).min(1).max(50) });

productsRouter.get('/', asyncHandler(async (req, res) => res.json(await svc.listProducts(req.user))));

ordersRouter.post('/', requireAuth, validate({ body: orderBody }), asyncHandler(async (req, res) => res.status(201).json(await svc.placeOrder(req.user!.id, req.body.items))));
ordersRouter.get('/mine', requireAuth, asyncHandler(async (req, res) => res.json(await svc.myOrders(req.user!.id))));
ordersRouter.get('/:id', requireAuth, validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await svc.getOrder(Number(req.params.id), req.user!))));

adminProductsRouter.get('/', asyncHandler(async (req, res) => res.json(await svc.listProducts(req.user, true))));
adminProductsRouter.post('/', validate({ body: product.extend({ variants: z.array(variant).min(1).max(50) }) }), asyncHandler(async (req, res) => res.status(201).json({ id: await svc.createProduct(req.body) })));
adminProductsRouter.patch('/:id', validate({ params: idParam, body: product.partial() }), asyncHandler(async (req, res) => { await svc.updateProduct(Number(req.params.id), req.body); res.json({ ok: true }); }));
adminVariantsRouter.patch('/:id', validate({ params: idParam, body: variant.partial() }), asyncHandler(async (req, res) => { await svc.updateVariant(Number(req.params.id), req.body); res.json({ ok: true }); }));

const listQuery = z.object({
  status: z.enum(['pending', 'paid', 'fulfilled', 'cancelled']).optional(),
  q: z.string().trim().max(190).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  page_size: z.coerce.number().int().min(1).max(100).optional(),
});
adminOrdersRouter.get('/', validate({ query: listQuery }), asyncHandler(async (req, res) => res.json(await svc.adminOrders(req.query as svc.AdminOrdersQuery))));

/**
 * GET /admin/orders/stream — Server-Sent Events. One `order` event (the admin row) whenever an order is created or
 * changes status; a comment line every 25 s keeps proxies from closing the idle connection.
 */
export const HEARTBEAT_MS = 25_000;
adminOrdersRouter.get('/stream', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 5000\n: connected\n\n');
  const send = (row: unknown) => res.write(`event: order\ndata: ${JSON.stringify(row)}\n\n`);
  const beat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  orderBus.on('order', send);
  req.on('close', () => { clearInterval(beat); orderBus.off('order', send); });
});

adminOrdersRouter.patch('/:id', validate({ params: idParam, body: z.object({ status: z.enum(['paid', 'fulfilled', 'cancelled']) }) }), asyncHandler(async (req, res) => {
  const row = await svc.setOrderStatus(req.user!.id, Number(req.params.id), req.body.status);
  emitOrder(Number(req.params.id));
  res.json(row);
}));
