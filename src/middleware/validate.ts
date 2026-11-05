import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

function validate(schema: ZodType, source: 'body' | 'params' | 'query'): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (source === 'body' && req.method === 'PATCH' && req.file && !result.success && result.error.issues.every(issue => issue.message === 'Provide at least one announcement field')) {
      res.locals.body = {}; next(); return;
    }
    if (!result.success) {
      res.status(400).json({ error: 'Validation failed', details: result.error.issues.map(issue => ({ field: [source, ...issue.path].join('.'), message: issue.message })) });
      return;
    }
    // Express 5 query is a getter; keep parsed values in locals instead of assigning it.
    res.locals[source] = result.data;
    next();
  };
}
export const validateBody = (schema: ZodType) => validate(schema, 'body');
export const validateParams = (schema: ZodType) => validate(schema, 'params');
export const validateQuery = (schema: ZodType) => validate(schema, 'query');
