import type { ErrorRequestHandler } from 'express';
import logger from '../logger.ts';
import multer from 'multer';
import { HttpError } from '../utils/errors.ts';

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5 MB or smaller' : 'Invalid upload: send one image in the image field' });
  } else if (error.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Validation failed', details: [{ field: 'body', message: 'Send a valid JSON object' }] });
  } else if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
  } else if (error.status >= 400 && error.status < 500) {
    res.status(error.status).json({ error: error.message });
  } else if (error.code === 'P2025') {
    res.status(404).json({ error: 'Resource not found' });
  } else if (error.code === 'P2002') {
    res.status(409).json({ error: 'Unique constraint violation' });
  } else if (error.code === 'P2003') {
    res.status(400).json({ error: 'Foreign key constraint failed' });
  } else {
    logger.error({ name: error.name, code: error.code }, 'Unexpected request error');
    res.status(500).json({ error: 'Internal server error' });
  }
};
