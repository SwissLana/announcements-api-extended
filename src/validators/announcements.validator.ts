import { z } from 'zod';

export const announcementSchema = z.object({
  title: z.string({ error: 'Title is required' }).trim().min(5, 'Title must have at least 5 characters').max(50, 'Title must have at most 50 characters'),
  description: z.string({ error: 'Description is required' }).trim().min(10, 'Description must have at least 10 characters'),
  price: z.number({ error: 'Price must be a number' }).positive('Price must be greater than zero').max(9999999999.99, 'Price is too large').refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.0001, 'Price must have at most two decimal places'),
  category: z.enum(['sale', 'service', 'job', 'other'], { error: 'Choose sale, service, job or other' }),
});
export const updateAnnouncementSchema = announcementSchema.partial().refine(
  value => Object.keys(value).length > 0,
  { message: 'Provide at least one announcement field' },
);
export const idSchema = z.object({
  id: z.string().regex(/^[1-9]\d*$/, 'Enter a positive whole number').transform(Number).pipe(z.number().int().max(2147483647)),
});
export const querySchema = z.object({
  search: z.string().trim().optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
  page: z.string().regex(/^[1-9]\d*$/, 'Enter a positive whole number').default('1').transform(Number)
    .pipe(z.number().int().max(214748364)),
});
