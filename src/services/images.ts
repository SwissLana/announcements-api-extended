import { v2 as cloudinary } from 'cloudinary';
import { HttpError } from '../utils/errors.ts';
import logger from '../logger.ts';
cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
export async function uploadImage(path: string) {
  if (![process.env.CLOUDINARY_CLOUD_NAME, process.env.CLOUDINARY_API_KEY, process.env.CLOUDINARY_API_SECRET].every(value => value?.trim())) throw new HttpError(503, 'Image uploads are not configured');
  try {
    const result = await cloudinary.uploader.upload(path, { folder: 'announcements', resource_type: 'image', timeout: 30000 });
    logger.info({ publicId: result.public_id }, 'Announcement photo uploaded');
    return result.secure_url;
  } catch {
    throw new HttpError(502, 'Image service is unavailable. Please try again later');
  }
}

export async function deleteImage(imageUrl: string | null | undefined) {
  if (!imageUrl) return;
  const url = new URL(imageUrl);
  const prefix = `/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/`;
  if (url.hostname !== 'res.cloudinary.com' || !url.pathname.startsWith(prefix)) return;
  const publicId = url.pathname.slice(prefix.length).replace(/^v\d+\//, '').replace(/\.[^.]+$/, '');
  if (!publicId.startsWith('announcements/')) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
  } catch {
    logger.error({ publicId }, 'Remote image cleanup failed; retry from Cloudinary dashboard');
  }
}
