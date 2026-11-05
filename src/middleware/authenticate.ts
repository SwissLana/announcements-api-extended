import type { RequestHandler } from 'express';
import { verifyToken } from '../utils/tokens.ts';

export const authenticate: RequestHandler = (req, res, next) => {
  const match = req.headers.authorization?.match(/^Bearer ([^\s]+)$/i);
  try {
    if (!match) throw new Error('Missing bearer token');
    req.user = { sub: verifyToken(match[1], 'access') };
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
};
