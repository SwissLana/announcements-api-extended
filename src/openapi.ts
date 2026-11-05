import { extendZodWithOpenApi, OpenApiGeneratorV3, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { registerSchema, loginSchema, refreshSchema } from './validators/auth.validator.ts';
import { announcementSchema, updateAnnouncementSchema, idSchema, querySchema } from './validators/announcements.validator.ts';

extendZodWithOpenApi(z);
export const registry = new OpenAPIRegistry();
registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http', scheme: 'bearer', bearerFormat: 'JWT',
});
const user = registry.register('User', z.object({
  id: z.number().int(), username: z.string(), email: z.email(), name: z.string(),
}));
const tokens = registry.register('Tokens', z.object({ accessToken: z.string(), refreshToken: z.string() }));
const authResponse = registry.register('AuthResponse', tokens.extend({ user }));
const announcement = registry.register('Announcement', announcementSchema.extend({
  imageUrl: z.string().nullable(), id: z.number().int(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), user,
}));
const error = registry.register('Error', z.object({ error: z.string() }));
const validationError = registry.register('ValidationError', z.object({
  error: z.string(), details: z.array(z.object({
    field: z.string(), message: z.string(),
  })),
}));
const json = (schema: z.ZodType) => ({ 'application/json': { schema } });
const response = (description: string, schema: z.ZodType) => ({ description, content: json(schema) });
const badRequest = response('Validation failed', validationError);
const unauthorized = response('Missing, invalid, expired, or revoked token', error);
const notFound = response('Announcement not found', error);
const security = [{ bearerAuth: [] }];

registry.registerPath({ method: 'post', path: '/auth/register', tags: ['Auth'], summary: 'Register and receive tokens',
  request: { body: { required: true, content: json(registerSchema) } },
  responses: { 429: response('Too many requests, please try again later', error), 403: response('Access denied or origin is not allowed', error), 201: response('User registered', authResponse), 400: badRequest, 409: response('Username or email already taken', error) },
});
registry.registerPath({ method: 'post', path: '/auth/login', tags: ['Auth'], summary: 'Log in and replace the refresh token',
  request: { body: { required: true, content: json(loginSchema) } },
  responses: { 429: response('Too many requests, please try again later', error), 403: response('Access denied or origin is not allowed', error), 200: response('Authenticated', authResponse), 400: badRequest, 401: unauthorized },
});
registry.registerPath({ method: 'post', path: '/auth/refresh', tags: ['Auth'], summary: 'Rotate the refresh token',
  request: { body: { required: true, content: json(refreshSchema) } },
  responses: { 429: response('Too many requests, please try again later', error), 403: response('Access denied or origin is not allowed', error), 200: response('New token pair', tokens), 400: badRequest, 401: unauthorized },
});
registry.registerPath({ method: 'post', path: '/auth/logout', tags: ['Auth'], summary: 'Invalidate the current user’s refresh token', security,
  responses: { 429: response('Too many requests, please try again later', error), 403: response('Access denied or origin is not allowed', error), 204: { description: 'Logged out; no response body' }, 401: unauthorized },
});
registry.registerPath({ method: 'get', path: '/auth/me', tags: ['Auth'], summary: 'Get your profile', security,
  responses: { 429: response('Too many requests, please try again later', error), 403: response('Access denied or origin is not allowed', error), 200: response('Profile', user.extend({ createdAt: z.iso.datetime() })), 401: unauthorized },
});
registry.registerPath({ method: 'get', path: '/announcements', tags: ['Announcements'], summary: 'List, search and sort announcements',
  request: { query: querySchema },
  responses: { 403: response('Access denied or origin is not allowed', error), 200: response('Paginated announcements', z.object({ data: z.array(announcement), pagination: z.object({
    total: z.number().int(), page: z.number().int(), totalPages: z.number().int(), perPage: z.literal(10),
  }) })), 400: badRequest },
});
registry.registerPath({ method: 'get', path: '/announcements/{id}', tags: ['Announcements'], summary: 'Get announcement details',
  request: { params: idSchema }, responses: { 403: response('Access denied or origin is not allowed', error), 200: response('Announcement', announcement), 400: badRequest, 404: notFound },
});
registry.registerPath({ method: 'post', path: '/announcements', tags: ['Announcements'], summary: 'Create your announcement', security,
  request: { body: { required: true, content: { ...json(announcementSchema), 'multipart/form-data': { schema: announcementSchema.extend({ image: z.string().openapi({ type: 'string', format: 'binary' }).optional() }) } } } },
  responses: { 413: response('Image exceeds 5 MB', error), 502: response('Image service failed', error), 503: response('Uploads are not configured', error), 403: response('Origin is not allowed', error), 201: response('Created', announcement), 400: badRequest, 401: unauthorized },
});
registry.registerPath({ method: 'patch', path: '/announcements/{id}', tags: ['Announcements'], summary: 'Update your announcement', security,
  request: { params: idSchema, body: { required: true, content: { ...json(updateAnnouncementSchema), 'multipart/form-data': { schema: announcementSchema.partial().extend({ image: z.string().openapi({ type: 'string', format: 'binary' }).optional() }) } } } },
  responses: { 413: response('Image exceeds 5 MB', error), 502: response('Image service failed', error), 503: response('Uploads are not configured', error), 403: response('Access denied or origin is not allowed', error), 200: response('Updated', announcement), 400: badRequest, 401: unauthorized, 404: notFound },
});
registry.registerPath({ method: 'delete', path: '/announcements/{id}', tags: ['Announcements'], summary: 'Delete your announcement', security,
  request: { params: idSchema },
  responses: { 403: response('Access denied or origin is not allowed', error), 204: { description: 'Deleted; no response body' }, 400: badRequest, 401: unauthorized, 404: notFound },
});

export function generateOpenApiDocument() {
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.0', info: { title: 'Announcements API', version: '2.0.0',
      description: 'Access tokens last 15 minutes; refresh tokens last 7 days. Use Authorize with an access token. Logout revokes refresh tokens; issued access tokens expire naturally.' },
    servers: [{ url: '/' }],
  });
}
