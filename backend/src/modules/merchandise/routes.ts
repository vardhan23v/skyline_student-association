import { Router } from 'express';
import { z } from 'zod';
import { hasRole, requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/errorHandler';
import * as svc from './service';

export const productsRouter = Router();
export const variantsRouter = Router();
export const ordersRouter = Router();
const idParam = z.object({ id: z.coerce.number().int().positive() });
const variant = z.object({ size: z.string().min(1).max(20), price: z.coerce.number().min(0), member_price: z.coerce.number().min(0), stock: z.coerce.number().int().min(0) });
const product = z.object({ name: z.string().min(1).max(200), description: z.string().optional(), image_url: z.string().url().optional(), is_active: z.boolean().optional() });

productsRouter.get('/', asyncHandler(async (req, res) => res.json(await svc.listProducts(req.user, hasRole(req.user, 'admin')))));
productsRouter.post('/', requireRole('admin'), validate({ body: product.extend({ variants: z.array(variant).min(1) }) }), asyncHandler(async (req, res) => res.status(201).json({ id: await svc.createProduct(req.body) })));
productsRouter.patch('/:id', requireRole('admin'), validate({ params: idParam, body: product.partial() }), asyncHandler(async (req, res) => { await svc.updateProduct(Number(req.params.id), req.body); res.json({ ok: true }); }));
variantsRouter.patch('/:id', requireRole('admin'), validate({ params: idParam, body: variant.partial() }), asyncHandler(async (req, res) => { await svc.updateVariant(Number(req.params.id), req.body); res.json({ ok: true }); }));

ordersRouter.post('/', requireRole('member'), validate({ body: z.object({ items: z.array(z.object({ variant_id: z.coerce.number().int().positive(), qty: z.coerce.number().int().positive().max(20) })).min(1) }) }), asyncHandler(async (req, res) => res.status(201).json(await svc.placeOrder(req.user!.id, req.body.items))));
ordersRouter.get('/', requireAuth, asyncHandler(async (req, res) => res.json(await svc.listOrders(req.user!))));
ordersRouter.get('/:id', requireAuth, validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await svc.getOrder(Number(req.params.id), req.user!))));
ordersRouter.patch('/:id/fulfil', requireRole('admin'), validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await svc.fulfilOrder(Number(req.params.id)))));
