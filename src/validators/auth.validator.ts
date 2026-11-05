import { z } from 'zod';

export const registerSchema = z.object({
  username: z.string({ error: 'Username is required' }).trim().min(3, 'Username must have at least 3 characters').max(30, 'Username must have at most 30 characters'),
  email: z.email({ error: 'Enter a valid email address' }).transform(value => value.toLowerCase()),
  password: z.string({ error: 'Password is required' }).min(6, 'Password must have at least 6 characters').refine(value => Buffer.byteLength(value, 'utf8') <= 72, {
    message: 'Password must not exceed 72 UTF-8 bytes (bcrypt limit)',
  }),
  name: z.string({ error: 'Name is required' }).trim().min(2, 'Name must have at least 2 characters'),
});

export const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export const refreshSchema = z.object({ refreshToken: z.string().min(1) });
