import { it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('cloudinary', () => ({ v2: { config: vi.fn(), uploader: { upload: vi.fn(), destroy: vi.fn() } } }));
import { v2 as cloudinary } from 'cloudinary';
import { uploadImage, deleteImage } from '../src/services/images.ts';
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'test-cloud'); vi.stubEnv('CLOUDINARY_API_SECRET', 'test-secret'); vi.stubEnv('CLOUDINARY_API_KEY', 'test-key'); });
afterEach(() => vi.unstubAllEnvs());
it('returns a helpful error when image credentials are missing', async () => {
  vi.stubEnv('CLOUDINARY_API_SECRET', '');
  await expect(uploadImage('/tmp/test.png')).rejects.toMatchObject({ status: 503 });
  expect(cloudinary.uploader.upload).not.toHaveBeenCalled();
});
it('maps external upload failures to a safe 502 response', async () => {
  vi.mocked(cloudinary.uploader.upload).mockRejectedValue(new Error('secret provider details'));
  await expect(uploadImage('/tmp/test.png')).rejects.toMatchObject({ status: 502, message: 'Image service is unavailable. Please try again later' });
});
it('only removes images from the configured cloud and announcements folder', async () => {
  await deleteImage('https://res.cloudinary.com/another-cloud/image/upload/v1/announcements/photo.png');
  expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
  await deleteImage('https://res.cloudinary.com/test-cloud/image/upload/v1/announcements/photo.png');
  expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('announcements/photo', { resource_type: 'image', invalidate: true });
});
