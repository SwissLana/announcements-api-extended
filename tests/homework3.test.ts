import { beforeEach, afterAll, it, expect, vi } from 'vitest';
import request from 'supertest';
import { readdir } from 'node:fs/promises';
vi.mock('../src/services/images.ts', () => ({ uploadImage: vi.fn(), deleteImage: vi.fn() }));
import { uploadImage } from '../src/services/images.ts';
import app from '../app.ts';
import prisma from '../prisma/client.ts';
import { authLimiter } from '../src/middleware/security.ts';
const mockUpload = vi.mocked(uploadImage);
const user = { username: 'imageuser', email: 'image@example.com', password: 'secret123', name: 'Image User' };
const fields = { title: 'Bicycle photo', description: 'A bicycle in good condition', price: '12.34', category: 'sale' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE1cAAAAASUVORK5CYII=', 'base64');
async function token() { return (await request(app).post('/auth/register').send(user)).body.accessToken; }
async function files() { return (await readdir(new URL('../uploads/', import.meta.url))).filter(name => name !== '.gitkeep'); }
beforeEach(async () => {
  authLimiter.resetKey('127.0.0.1'); authLimiter.resetKey('::ffff:127.0.0.1');
  mockUpload.mockReset(); mockUpload.mockResolvedValue('https://res.cloudinary.com/demo/image/upload/example.png');
  await prisma.announcement.deleteMany(); await prisma.refreshToken.deleteMany(); await prisma.user.deleteMany();
});
afterAll(() => prisma.$disconnect());
it('sets security headers and enforces the origin allowlist', async () => {
  const allowed = await request(app).get('/announcements').set('Origin', 'http://localhost:5173');
  expect(allowed.status).toBe(200);
  expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  expect(allowed.headers['x-content-type-options']).toBe('nosniff');
  expect((await request(app).get('/announcements').set('Origin', 'https://untrusted.example')).status).toBe(403);
  expect((await request(app).options('/announcements').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST')).status).toBe(204);
});
it('limits all auth routes after ten requests without limiting announcements', async () => {
  for (let i = 0; i < 10; i++) expect((await request(app).get('/auth/me')).status).toBe(401);
  const blocked = await request(app).post('/auth/login').send({ username: 'nobody', password: 'wrong' });
  expect(blocked.status).toBe(429); expect(blocked.body.error).toBe('Too many requests, please try again later');
  expect(blocked.headers['retry-after']).toBeDefined();
  expect((await request(app).get('/announcements')).status).toBe(200);
});
it('uploads multipart images, stores the URL and decimal price, and deletes temporary files', async () => {
  const access = await token();
  const created = await request(app).post('/announcements').auth(access, { type: 'bearer' }).field(fields).attach('image', png, 'photo.png');
  expect(created.status).toBe(201); expect(created.body.imageUrl).toContain('https://res.cloudinary.com/');
  expect(created.body.price).toBe(12.34);
  expect((await prisma.announcement.findUniqueOrThrow({ where: { id: created.body.id } })).price.toString()).toBe('12.34');
  expect(await files()).toEqual([]);
  const patched = await request(app).patch(`/announcements/${created.body.id}`).auth(access, { type: 'bearer' }).attach('image', png, 'new.png');
  expect(patched.status).toBe(200); expect(mockUpload).toHaveBeenCalledTimes(2); expect(await files()).toEqual([]);
});
it('accepts multipart without images and rejects extra decimal places', async () => {
  const access = await token();
  expect((await request(app).post('/announcements').auth(access, { type: 'bearer' }).field(fields)).status).toBe(201);
  expect((await request(app).post('/announcements').auth(access, { type: 'bearer' }).field({ ...fields, price: '12.345' })).status).toBe(400);
});
it('rejects spoofed and oversized images without calling Cloudinary', async () => {
  const access = await token();
  expect((await request(app).post('/announcements').auth(access, { type: 'bearer' }).field(fields).attach('image', Buffer.from('not a photo'), 'fake.png')).status).toBe(400);
  expect((await request(app).post('/announcements').auth(access, { type: 'bearer' }).field(fields).attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), 'large.png')).status).toBe(413);
  expect(mockUpload).not.toHaveBeenCalled(); expect(await files()).toEqual([]);
});
it('removes temporary files when Cloudinary fails and does not create a record', async () => {
  const access = await token(); mockUpload.mockRejectedValue(new Error('Remote failure'));
  expect((await request(app).post('/announcements').auth(access, { type: 'bearer' }).field(fields).attach('image', png, 'photo.png')).status).toBe(500);
  expect(await prisma.announcement.count()).toBe(0); expect(await files()).toEqual([]);
});
it('uses the same validation detail shape for malformed JSON and invalid IDs', async () => {
  for (const response of [await request(app).post('/auth/register').set('Content-Type', 'application/json').send('{'), await request(app).get('/announcements/abc')]) {
    expect(response.status).toBe(400);
    expect(response.body.details[0]).toEqual({ field: expect.any(String), message: expect.any(String) });
  }
});

it('preserves safe upload-service HTTP errors in API responses', async () => {
  const { HttpError } = await import('../src/utils/errors.ts');
  const access = await token();
  for (const status of [502, 503]) {
    mockUpload.mockRejectedValue(new HttpError(status, 'Image service unavailable'));
    const response = await request(app).post('/announcements').auth(access, { type: 'bearer' }).field(fields).attach('image', png, 'photo.png');
    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error: 'Image service unavailable' });
    expect(await files()).toEqual([]);
  }
});
