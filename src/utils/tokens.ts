import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { config } from '../config.ts';

export function createTokens(userId: number) {
  // A unique ID ensures rotation works even within the same second.
  return {
    accessToken: jwt.sign({ sub: userId, type: 'access' }, config.jwtSecret, {
      algorithm: 'HS256', expiresIn: '15m', jwtid: randomUUID(),
    }),
    refreshToken: jwt.sign({ sub: userId, type: 'refresh' }, config.jwtSecret, {
      algorithm: 'HS256', expiresIn: '7d', jwtid: randomUUID(),
    }),
  };
}

export function verifyToken(token: string, expectedType: 'access' | 'refresh'): number {
  const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  if (typeof payload === 'string' || payload.type !== expectedType ||
      !Number.isSafeInteger(payload.sub) || Number(payload.sub) <= 0) {
    throw new Error('Invalid token payload');
  }
  return Number(payload.sub);
}
