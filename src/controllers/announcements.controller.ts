import type { RequestHandler } from 'express';
import logger from '../logger.ts';
import { deleteImage } from '../services/images.ts';
import type { Prisma } from '../../generated/prisma/client.ts';
import prisma from '../../prisma/client.ts';
import { publicUserFields } from './auth.controller.ts';
import { HttpError } from '../utils/errors.ts';

const serialize = <T extends { price: Prisma.Decimal }>(row: T) => ({ ...row, price: Number(row.price) });

const announcementFields = {
  id: true, title: true, description: true, price: true, category: true,
  createdAt: true, updatedAt: true, imageUrl: true, user: { select: publicUserFields },
} as const;

export const listAnnouncements: RequestHandler = async (_req, res) => {
  const { search, sort, page } = res.locals.query;
  const where = search ? { title: { contains: search, mode: 'insensitive' as const } } : {};
  const perPage = 10;
  const direction = sort === 'oldest' ? 'asc' : 'desc';
  const [data, total] = await prisma.$transaction([
    prisma.announcement.findMany({
      where, select: announcementFields,
      orderBy: [{ createdAt: direction }, { id: direction }],
      skip: (page - 1) * perPage, take: perPage,
    }),
    prisma.announcement.count({ where }),
  ], { isolationLevel: 'RepeatableRead' });
  res.json({ data: data.map(serialize), pagination: { total, page, totalPages: Math.ceil(total / perPage), perPage } });
};

export const getAnnouncement: RequestHandler = async (_req, res) => {
  const announcement = await prisma.announcement.findUnique({
    where: { id: res.locals.params.id }, select: announcementFields,
  });
  if (!announcement) throw new HttpError(404, 'Announcement not found');
  res.json(serialize(announcement));
};

export const createAnnouncement: RequestHandler = async (req, res) => {
  const announcement = await prisma.announcement.create({
    data: { ...res.locals.body, userId: req.user.sub }, select: announcementFields,
  }).catch(async error => { await deleteImage(res.locals.body.imageUrl); throw error; });
  logger.info({ announcementId: announcement.id, userId: req.user.sub }, 'Announcement created');
  res.status(201).json(serialize(announcement));
};

async function checkOwnership(id: number, userId: number) {
  const announcement = await prisma.announcement.findUnique({ where: { id } });
  if (!announcement) throw new HttpError(404, 'Announcement not found');
  if (announcement.userId !== userId) throw new HttpError(403, 'Access denied');
  return announcement;
}

export const requireOwnership: RequestHandler = async (req, res, next) => {
  res.locals.announcement = await checkOwnership(res.locals.params.id, req.user.sub);
  next();
};

export const updateAnnouncement: RequestHandler = async (req, res) => {
  const { id } = res.locals.params;
  const previous = res.locals.announcement;
  const announcement = await prisma.announcement.update({
    where: { id, userId: req.user.sub }, data: res.locals.body, select: announcementFields,
  }).catch(async error => { await deleteImage(res.locals.body.imageUrl); throw error; });
  if (res.locals.body.imageUrl) await deleteImage(previous.imageUrl);
  res.json(serialize(announcement));
};

export const deleteAnnouncement: RequestHandler = async (req, res) => {
  const { id } = res.locals.params;
  const previous = await checkOwnership(id, req.user.sub);
  await prisma.announcement.delete({ where: { id, userId: req.user.sub } });
  await deleteImage(previous.imageUrl);
  res.status(204).end();
};
