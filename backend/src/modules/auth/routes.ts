import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/errorHandler';
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from './schemas';
import * as svc from './service';
import { isTest } from '../../config/env';

export const authRouter = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: isTest ? 10_000 : 30, standardHeaders: true, legacyHeaders: false });
authRouter.use(limiter);

authRouter.post('/register', validate({ body: registerSchema }), asyncHandler(async (req, res) => {
  res.status(201).json(await svc.register(req.body));
}));
authRouter.post('/login', validate({ body: loginSchema }), asyncHandler(async (req, res) => {
  res.json(await svc.login(req.body.email, req.body.password));
}));
// Stricter than the router-wide limit: each request can send an email.
const forgotLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: isTest ? 10_000 : 5, standardHeaders: true, legacyHeaders: false });
authRouter.post('/forgot-password', forgotLimiter, validate({ body: forgotPasswordSchema }), asyncHandler(async (req, res) => {
  res.json(await svc.forgotPassword(req.body.email));
}));
authRouter.post('/reset-password', validate({ body: resetPasswordSchema }), asyncHandler(async (req, res) => {
  res.json(await svc.resetPassword(req.body.token, req.body.password, req.ip));
}));
