import { describe, expect, it } from 'vitest';
import { RecordType } from '@prisma/client';
import { parseRecordData } from './record.schemas';

describe('record payload validation', () => {
  it('accepts bounded weight data', () => {
    expect(parseRecordData(RecordType.WEIGHT, { weightKg: 4.25, method: 'SCALE' })).toEqual({
      weightKg: 4.25,
      method: 'SCALE',
    });
  });

  it('rejects impossible values and unknown fields', () => {
    expect(() => parseRecordData(RecordType.WEIGHT, { weightKg: -1 })).toThrow();
    expect(() => parseRecordData(RecordType.WATER, { amountMl: 100, hidden: true })).toThrow();
  });

  it('requires type-specific medication fields', () => {
    expect(() => parseRecordData(RecordType.MEDICATION, { drugName: '药品' })).toThrow();
    expect(
      parseRecordData(RecordType.MEDICATION, { drugName: '药品', dose: '1 片' }),
    ).toMatchObject({ dose: '1 片' });
  });
});
