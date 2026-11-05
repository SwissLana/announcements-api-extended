import { beforeEach, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../app.ts';
import { authLimiter } from '../src/middleware/security.ts';
import prisma from '../prisma/client.ts';
import { config } from '../src/config.ts';

const alice = { username: 'alice', email: 'alice@example.com', password: 'secret123', name: 'Alice' };
const ad = { title: 'Laptop for sale', description: 'A laptop in excellent condition', price: 100, category: 'sale' };
const register = (body = alice) => request(app).post('/auth/register').send(body);
const bearer = (token: string) => `Bearer ${token}`;

beforeEach(async () => {
  authLimiter.resetKey('127.0.0.1');
  authLimiter.resetKey('::ffff:127.0.0.1');
  await prisma.announcement.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});
afterAll(() => prisma.$disconnect());

describe('Authentication', () => {
  it('registers, hashes the password, persists refresh token, and sets correct expiries', async () => {
    const response = await register();
    expect(response.status).toBe(201);
    expect(response.body.user).toEqual({ id: expect.any(Number), username: alice.username, email: alice.email, name: alice.name });
    const stored = await prisma.user.findUniqueOrThrow({ where: { username: alice.username } });
    expect(stored.password).not.toBe(alice.password);
    expect(await bcrypt.compare(alice.password, stored.password)).toBe(true);
    expect(await prisma.refreshToken.count({ where: { token: response.body.refreshToken } })).toBe(1);
    for (const [token, duration] of [[response.body.accessToken, 900], [response.body.refreshToken, 604800]] as const) {
      const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
      expect(payload.exp! - payload.iat!).toBe(duration);
    }
  });
  it('rejects duplicate usernames and emails with the exact 409 message', async () => {
    await register();
    for (const body of [{ ...alice, email: 'other@example.com' }, { ...alice, username: 'other' }]) {
      const response = await register(body);
      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Username or email already taken');
    }
  });
  it.each([
    { username: 'ab' }, { username: 'a'.repeat(31) }, { email: 'invalid' },
    { password: '12345' }, { name: 'a' }, { password: 'é'.repeat(37) },
  ])('rejects invalid registration %j', async patch => {
    const response = await register({ ...alice, ...patch });
    expect(response.status).toBe(400);
    expect(response.body.details).toBeInstanceOf(Array);
  });
  it('returns the same 401 for wrong username and wrong password', async () => {
    await register();
    for (const body of [{ username: 'unknown', password: alice.password }, { username: alice.username, password: 'wrong' }]) {
      const response = await request(app).post('/auth/login').send(body);
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid credentials' });
    }
  });
  it('replaces the old refresh token on login and excludes password', async () => {
    const first = await register();
    const login = await request(app).post('/auth/login').send(alice);
    expect(login.status).toBe(200);
    expect(login.body.user.password).toBeUndefined();
    expect(login.body.refreshToken).not.toBe(first.body.refreshToken);
    expect((await request(app).post('/auth/refresh').send({ refreshToken: first.body.refreshToken })).status).toBe(401);
    expect(await prisma.refreshToken.count()).toBe(1);
  });
  it('rotates immediately and rejects replay; only one concurrent use succeeds', async () => {
    const first = await register();
    const responses = await Promise.all([0, 1].map(() => request(app).post('/auth/refresh').send({ refreshToken: first.body.refreshToken })));
    expect(responses.map(response => response.status).sort()).toEqual([200, 401]);
    const fresh = responses.find(response => response.status === 200)!;
    expect(fresh.body.refreshToken).not.toBe(first.body.refreshToken);
    expect((await request(app).post('/auth/refresh').send({ refreshToken: fresh.body.refreshToken })).status).toBe(200);
  });
  it('rejects tampered, expired, wrong-kind and absent stored refresh tokens', async () => {
    const auth = await register();
    const expired = jwt.sign({ sub: auth.body.user.id, type: 'refresh' }, config.jwtSecret, { expiresIn: -1 });
    for (const token of ['invalid', auth.body.accessToken, expired]) {
      expect((await request(app).post('/auth/refresh').send({ refreshToken: token })).status).toBe(401);
    }
    expect((await request(app).post('/auth/refresh').send({})).status).toBe(400);
    await prisma.refreshToken.deleteMany();
    authLimiter.resetKey('127.0.0.1'); authLimiter.resetKey('::ffff:127.0.0.1');
    expect((await request(app).post('/auth/refresh').send({ refreshToken: auth.body.refreshToken })).status).toBe(401);
  });
  it('protects me and logout; returns profile; logout is idempotent and bodyless', async () => {
    const auth = await register();
    const token = auth.body.accessToken;
    for (const header of ['', 'Bearer invalid', bearer(auth.body.refreshToken), bearer(jwt.sign({ sub: auth.body.user.id, type: 'access' }, config.jwtSecret, { expiresIn: -1 }))]) {
      expect((await request(app).get('/auth/me').set('Authorization', header)).status).toBe(401);
    }
    expect((await request(app).post('/auth/logout')).status).toBe(401);
    const profile = await request(app).get('/auth/me').set('Authorization', bearer(token));
    expect(profile.body).toEqual({ ...auth.body.user, createdAt: expect.any(String) });
    for (let i = 0; i < 2; i++) {
      const response = await request(app).post('/auth/logout').set('Authorization', bearer(token));
      expect(response.status).toBe(204);
      expect(response.text).toBe('');
    }
    authLimiter.resetKey('127.0.0.1'); authLimiter.resetKey('::ffff:127.0.0.1');
    expect((await request(app).post('/auth/refresh').send({ refreshToken: auth.body.refreshToken })).status).toBe(401);
  });
});

describe('Announcements', () => {
  it('creates with token ownership, reads publicly, patches and deletes', async () => {
    const auth = await register();
    const authorization = bearer(auth.body.accessToken);
    const created = await request(app).post('/announcements').set('Authorization', authorization).send({ ...ad, userId: 999 });
    expect(created.status).toBe(201);
    expect(created.body.user).toEqual(auth.body.user);
    expect(created.body.user.password).toBeUndefined();
    const id = created.body.id;
    expect((await request(app).get(`/announcements/${id}`)).body).toEqual(created.body);
    const updated = await request(app).patch(`/announcements/${id}`).set('Authorization', authorization).send({ price: 125 });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe(ad.title);
    expect(updated.body.price).toBe(125);
    expect(new Date(updated.body.updatedAt).getTime()).toBeGreaterThan(new Date(created.body.updatedAt).getTime());
    const deleted = await request(app).delete(`/announcements/${id}`).set('Authorization', authorization);
    expect(deleted.status).toBe(204);
    expect(deleted.text).toBe('');
    expect((await request(app).get(`/announcements/${id}`)).status).toBe(404);
  });
  it('returns 403 for another user and 401 for anonymous writes', async () => {
    const owner = await register();
    const other = await register({ ...alice, username: 'other', email: 'other@example.com' });
    const created = await request(app).post('/announcements').set('Authorization', bearer(owner.body.accessToken)).send(ad);
    for (const method of ['patch', 'delete'] as const) {
      const response = await request(app)[method](`/announcements/${created.body.id}`).set('Authorization', bearer(other.body.accessToken)).send({ price: 5 });
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
      expect((await request(app)[method](`/announcements/${created.body.id}`).send({ price: 5 })).status).toBe(401);
    }
    expect((await request(app).post('/announcements').send(ad)).status).toBe(401);
  });
  it('validates all fields, partial updates, IDs and query parameters', async () => {
    const auth = await register();
    const authorization = bearer(auth.body.accessToken);
    for (const patch of [{ title: 'abcd' }, { title: 'a'.repeat(51) }, { description: 'short' }, { price: 0 }, { price: '100' }, { category: 'unknown' }]) {
      expect((await request(app).post('/announcements').set('Authorization', authorization).send({ ...ad, ...patch })).status).toBe(400);
    }
    const created = await request(app).post('/announcements').set('Authorization', authorization).send(ad);
    for (const body of [{}, { userId: 55 }, { price: null }]) {
      expect((await request(app).patch(`/announcements/${created.body.id}`).set('Authorization', authorization).send(body)).status).toBe(400);
    }
    for (const id of ['0', '-1', 'abc', '1.5', '2147483648']) expect((await request(app).get(`/announcements/${id}`)).status).toBe(400);
    for (const query of ['page=0', 'page=1.5', 'sort=random', 'page=1&page=2']) expect((await request(app).get(`/announcements?${query}`)).status).toBe(400);
    for (const method of ['patch', 'delete'] as const) {
      expect((await request(app)[method]('/announcements/2147483647').set('Authorization', authorization).send({ price: 3 })).status).toBe(404);
    }
  });
  it('paginates, searches case-insensitively and sorts in both directions', async () => {
    const auth = await register();
    await prisma.announcement.createMany({ data: Array.from({ length: 23 }, (_, index) => ({
      ...ad, category: 'sale' as const, userId: auth.body.user.id,
      title: index < 12 ? `LAPTOP number ${index}` : `Bicycle number ${index}`,
      createdAt: new Date(2025, 0, index + 1),
    })) });
    const page = await request(app).get('/announcements?page=2');
    expect(page.body.pagination).toEqual({ total: 23, page: 2, totalPages: 3, perPage: 10 });
    expect(page.body.data).toHaveLength(10);
    expect(page.body.data[0].title).toBe('Bicycle number 12');
    const search = await request(app).get('/announcements?search=laptop&sort=oldest&page=2');
    expect(search.body.pagination.total).toBe(12);
    expect(search.body.data.map((entry: { title: string }) => entry.title)).toEqual(['LAPTOP number 10', 'LAPTOP number 11']);
    expect((await request(app).get('/announcements?search=')).body.pagination.total).toBe(23);
    expect((await request(app).get('/announcements?page=99')).body.data).toEqual([]);
    expect((await request(app).get('/announcements?search=absent')).body.pagination.totalPages).toBe(0);
  });
});

it('serves complete OpenAPI and Swagger; unknown routes and malformed JSON are JSON errors', async () => {
  const document = await request(app).get('/openapi.json');
  expect(document.status).toBe(200);
  expect(Object.values(document.body.paths).reduce((sum: number, methods: any) => sum + Object.keys(methods).length, 0)).toBe(10);
  expect(document.body.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
  expect(document.body.paths['/auth/logout'].post.security).toEqual([{ bearerAuth: [] }]);
  expect(document.body.paths['/announcements'].get.security).toBeUndefined();
  expect((await request(app).get('/api-docs/')).text).toContain('swagger-ui');
  expect((await request(app).get('/missing')).body).toEqual({ error: 'Not found' });
  const malformed = await request(app).post('/auth/register').set('Content-Type', 'application/json').send('{');
  expect(malformed.status).toBe(400);
  expect(malformed.body.error).toBe('Validation failed');
});
