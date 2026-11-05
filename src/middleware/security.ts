import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { HttpError } from '../utils/errors.ts';

const origins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
export const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin || origins.includes(origin)) callback(null, true);
    else callback(new HttpError(403, 'Origin is not allowed'));
  },
});
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
