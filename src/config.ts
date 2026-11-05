import 'dotenv/config';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || Buffer.byteLength(jwtSecret) < 32) {
  throw new Error('JWT_SECRET must contain at least 32 bytes. See .env.example.');
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');

export const config = { jwtSecret, port: Number(process.env.PORT ?? 3000) };
