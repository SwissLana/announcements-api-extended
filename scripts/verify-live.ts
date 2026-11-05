import '../src/config.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import request from 'supertest';
import { v2 as cloudinary } from 'cloudinary';
import app from '../app.ts';
import prisma from '../prisma/client.ts';
import { deleteImage } from '../src/services/images.ts';

// Explicit live check: creates disposable records and real Cloudinary assets.
const suffix = randomUUID().slice(0, 8);
const image = new URL('../tests/fixtures/sample.png', import.meta.url).pathname;
const assets: string[] = [];
let userId: number | undefined;
const publicId = (url: string) => new URL(url).pathname.split('/upload/')[1]!.replace(/^v\d+\//, '').replace(/\.[^.]+$/, '');
async function missing(url: string) {
  try { await cloudinary.api.resource(publicId(url)); return false; }
  catch (error: any) { if (error.error?.http_code === 404 || error.http_code === 404) return true; throw error; }
}
try {
  const auth = await request(app).post('/auth/register').send({ username: `live_${suffix}`, email: `live_${suffix}@example.invalid`, password: randomUUID(), name: 'Live verification' });
  assert.equal(auth.status, 201, 'Registration must succeed');
  userId = auth.body.user.id;
  const accessToken = auth.body.accessToken;
  const created = await request(app).post('/announcements').auth(accessToken, { type: 'bearer' })
    .field({ title: 'Temporary verification listing', description: 'Disposable image upload verification', price: '12.34', category: 'other' })
    .attach('image', image);
  assert.equal(created.status, 201, 'Real image upload must return 201');
  assets.push(created.body.imageUrl);
  assert.equal(created.body.price, 12.34);
  const remote = await cloudinary.api.resource(publicId(created.body.imageUrl));
  assert.equal(remote.width, 16);
  const patched = await request(app).patch(`/announcements/${created.body.id}`).auth(accessToken, { type: 'bearer' })
    .field('price', '25.50').attach('image', image);
  assert.equal(patched.status, 200, 'Image replacement must return 200');
  assets.push(patched.body.imageUrl);
  assert.notEqual(patched.body.imageUrl, created.body.imageUrl);
  assert.equal(patched.body.price, 25.5);
  assert.equal(await missing(created.body.imageUrl), true, 'Replaced image must be deleted remotely');
  const fetched = await request(app).get(`/announcements/${created.body.id}`);
  assert.equal(fetched.body.imageUrl, patched.body.imageUrl);
  const deleted = await request(app).delete(`/announcements/${created.body.id}`).auth(accessToken, { type: 'bearer' });
  assert.equal(deleted.status, 204);
  assert.equal(await missing(patched.body.imageUrl), true, 'Deleted listing image must be deleted remotely');
  assert.deepEqual((await readdir(new URL('../uploads/', import.meta.url))).filter(name => name !== '.gitkeep'), []);
  console.log('PASS: registration, real upload, stored URL, decimal price, replacement, public retrieval, remote deletion, and temporary-file cleanup.');
} catch {
  console.error('Live verification failed. Check the preceding sanitized HTTP status logs; credentials are not printed.');
  process.exitCode = 1;
} finally {
  for (const asset of assets) await deleteImage(asset);
  if (userId) await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
}
