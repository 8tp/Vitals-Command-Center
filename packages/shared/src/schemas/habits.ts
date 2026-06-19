import { z } from 'zod';
import { isoDateSchema } from './common.js';

export const habitTypeSchema = z.enum(['boolean', 'scale_1_5', 'number', 'time', 'text']);
export const habitCategorySchema = z.enum([
  'morning_checkin',
  'evening_checkin',
  'auto_tracked',
  'custom',
]);

export const createHabitSchema = z.object({
  name: z.string().min(1).max(80),
  category: habitCategorySchema,
  type: habitTypeSchema,
  unit: z.string().max(16).nullable().optional(),
  targetValue: z.number().nullable().optional(),
  sortOrder: z.number().int().default(0),
});
export type CreateHabitInput = z.infer<typeof createHabitSchema>;

export const updateHabitSchema = createHabitSchema.partial().extend({
  active: z.boolean().optional(),
});

export const logHabitSchema = z.object({
  habitId: z.string(),
  date: isoDateSchema.optional(), // defaults to today
  value: z.string(),
});
export type LogHabitInput = z.infer<typeof logHabitSchema>;
