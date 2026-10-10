import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../config/db';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/errorHandler';
import { ask, confirmProposal } from './service';

export const aiRouter = Router();
aiRouter.post('/ask', requireAuth, validate({ body: z.object({ prompt: z.string().min(1).max(4000) }) }), asyncHandler(async (req, res) => {
  res.json(await ask(getDb(), req.user!, req.body.prompt));
}));
aiRouter.post('/confirm/:proposalId', requireAuth, validate({ params: z.object({ proposalId: z.string().min(8) }) }), asyncHandler(async (req, res) => {
  res.json(await confirmProposal(getDb(), req.user!, req.params.proposalId));
}));
