import type { RequestHandler } from 'express';
import bcrypt from 'bcrypt';
import logger from '../logger.ts';
import prisma from '../../prisma/client.ts';
import { createTokens, verifyToken } from '../utils/tokens.ts';
import { HttpError } from '../utils/errors.ts';

export const publicUserFields = { id: true, username: true, email: true, name: true } as const;

export const register: RequestHandler = async (_req, res) => {
  const { username, email, password, name } = res.locals.body;
  const existingUser = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } });
  if (existingUser) throw new HttpError(409, 'Username or email already taken');
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = await prisma.$transaction(async transaction => {
      const user = await transaction.user.create({
        data: { username, email, password: passwordHash, name }, select: publicUserFields,
      });
      const tokens = createTokens(user.id);
      await transaction.refreshToken.create({ data: { token: tokens.refreshToken, userId: user.id } });
      return { user, ...tokens };
    });
    logger.info({ userId: result.user.id }, 'User registered');
    res.status(201).json(result);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      throw new HttpError(409, 'Username or email already taken');
    }
    throw error;
  }
};

export const login: RequestHandler = async (_req, res) => {
  const { username, password } = res.locals.body;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || Buffer.byteLength(password, 'utf8') > 72 || !(await bcrypt.compare(password, user.password))) {
    throw new HttpError(401, 'Invalid credentials');
  }
  const tokens = createTokens(user.id);
  await prisma.refreshToken.upsert({
    where: { userId: user.id },
    create: { userId: user.id, token: tokens.refreshToken },
    update: { token: tokens.refreshToken },
  });
  logger.info({ userId: user.id }, 'User logged in');
  res.json({ user: { id: user.id, username: user.username, email: user.email, name: user.name }, ...tokens });
};

export const refresh: RequestHandler = async (_req, res) => {
  const { refreshToken } = res.locals.body;
  let userId: number;
  try { userId = verifyToken(refreshToken, 'refresh'); }
  catch { throw new HttpError(401, 'Invalid refresh token'); }
  const tokens = createTokens(userId);
  await prisma.$transaction(async transaction => {
    // Deleting by the old value atomically lets only one concurrent refresh succeed.
    const deleted = await transaction.refreshToken.deleteMany({ where: { token: refreshToken, userId } });
    if (deleted.count !== 1) throw new HttpError(401, 'Invalid refresh token');
    await transaction.refreshToken.create({ data: { userId, token: tokens.refreshToken } });
  });
  res.json(tokens);
};

export const logout: RequestHandler = async (req, res) => {
  await prisma.refreshToken.deleteMany({ where: { userId: req.user.sub } });
  res.status(204).end();
};

export const me: RequestHandler = async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub }, select: { ...publicUserFields, createdAt: true },
  });
  if (!user) throw new HttpError(401, 'Unauthorized');
  res.json(user);
};
