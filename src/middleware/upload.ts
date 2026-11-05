import multer from 'multer';
import { mkdir, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileTypeFromFile } from 'file-type';
import type { RequestHandler } from 'express';
import { uploadImage } from '../services/images.ts';
import { HttpError } from '../utils/errors.ts';
import logger from '../logger.ts';

const directory = new URL('../../uploads/', import.meta.url);
const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
const receive = multer({
  storage: multer.diskStorage({
    destination(_req, _file, done) { mkdir(directory, { recursive: true }).then(() => done(null, directory.pathname), error => done(error, '')); },
    filename(_req, _file, done) { done(null, randomUUID()); },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5, parts: 6, fieldSize: 100 * 1024 },
  fileFilter(_req, file, done) {
    if (!allowed.has(file.mimetype)) done(new HttpError(400, 'Use a JPEG, PNG or WebP image'));
    else done(null, true);
  },
}).single('image');

export const receiveImage: RequestHandler = (req, res, next) => {
  receive(req, res, error => {
    if (req.file) {
      const path = req.file.path;
      // Covers validation, ownership and downstream failures as well as success.
      res.once('close', () => { unlink(path).catch(error => { if (error.code !== 'ENOENT') logger.error({ code: error.code }, 'Temporary image cleanup failed'); }); });
    }
    if (error) return next(error);
    if (req.is('multipart/form-data') && typeof req.body?.price === 'string' && req.body.price.trim() !== '') {
      req.body.price = Number(req.body.price);
    }
    next();
  });
};
export const saveImage: RequestHandler = async (req, res, next) => {
  if (req.file) {
    try {
      const type = await fileTypeFromFile(req.file.path);
      if (!type || !allowed.has(type.mime)) throw new HttpError(400, 'The file is not a valid JPEG, PNG or WebP image');
      res.locals.body.imageUrl = await uploadImage(req.file.path);
    } finally {
      await unlink(req.file.path).catch(error => { if (error.code !== 'ENOENT') logger.error({ code: error.code }, 'Temporary image cleanup failed'); });
    }
  }
  next();
};
