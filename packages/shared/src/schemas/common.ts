import { z } from 'zod';

export const rangeSchema = z
  .enum(['7d', '14d', '30d', '90d'])
  .or(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/)
      .describe('Custom range: YYYY-MM-DD..YYYY-MM-DD'),
  );
export type Range = z.infer<typeof rangeSchema>;

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
export type IsoDate = z.infer<typeof isoDateSchema>;

export const metricNameSchema = z.enum([
  'hrv',
  'rhr',
  'sleep_hours',
  'recovery',
  'strain',
  'steps',
  'readiness',
  'temp_deviation',
  'spo2',
  'vo2max',
]);
export type MetricName = z.infer<typeof metricNameSchema>;
