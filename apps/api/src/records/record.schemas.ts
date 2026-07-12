import { RecordType } from '@prisma/client';
import { z } from 'zod';
import { parseWith } from '../common/zod-parse';

const positiveAmount = z.number().positive().max(100_000);

export const recordDataSchemas = {
  [RecordType.FOOD]: z
    .object({
      foodName: z.string().trim().min(1).max(80),
      amount: positiveAmount,
      unit: z.enum(['g', 'ml', 'portion']),
      appetite: z.enum(['POOR', 'NORMAL', 'GOOD']).optional(),
      finished: z.boolean().optional(),
    })
    .strict(),
  [RecordType.WATER]: z.object({ amountMl: positiveAmount.max(10_000) }).strict(),
  [RecordType.WEIGHT]: z
    .object({
      weightKg: z.number().positive().max(50),
      method: z.enum(['SCALE', 'VET', 'ESTIMATED']).optional(),
    })
    .strict(),
  [RecordType.STOOL]: z
    .object({
      condition: z.enum(['NORMAL', 'SOFT', 'DIARRHEA', 'HARD', 'UNKNOWN']),
      count: z.number().int().min(1).max(30),
      blood: z.boolean().default(false),
    })
    .strict(),
  [RecordType.VOMIT]: z
    .object({
      contentType: z.enum(['FOOD', 'HAIRBALL', 'LIQUID', 'UNKNOWN']),
      count: z.number().int().min(1).max(30),
      blood: z.boolean().default(false),
    })
    .strict(),
  [RecordType.MEDICATION]: z
    .object({
      drugName: z.string().trim().min(1).max(100),
      dose: z.string().trim().min(1).max(60),
      reaction: z.string().trim().max(300).optional(),
    })
    .strict(),
  [RecordType.VACCINE]: z
    .object({
      brand: z.string().trim().max(100).optional(),
      batch: z.string().trim().max(100).optional(),
      dose: z.string().trim().max(60).optional(),
      hospital: z.string().trim().max(120).optional(),
      nextAt: z.string().datetime().optional(),
    })
    .strict(),
  [RecordType.DEWORMING]: z
    .object({
      brand: z.string().trim().max(100).optional(),
      dose: z.string().trim().max(60).optional(),
      hospital: z.string().trim().max(120).optional(),
      nextAt: z.string().datetime().optional(),
    })
    .strict(),
  [RecordType.LITTER]: z
    .object({
      boxId: z.string().trim().max(60).optional(),
      observation: z.string().trim().max(300).optional(),
    })
    .strict(),
  [RecordType.PHOTO]: z.object({ photoIds: z.array(z.string().uuid()).min(1).max(9) }).strict(),
  [RecordType.HEALTH_NOTE]: z.object({ symptom: z.string().trim().min(1).max(200) }).strict(),
} satisfies Record<RecordType, z.ZodType>;

export function parseRecordData(type: RecordType, data: unknown) {
  return parseWith(recordDataSchemas[type] as z.ZodType<unknown>, data);
}
