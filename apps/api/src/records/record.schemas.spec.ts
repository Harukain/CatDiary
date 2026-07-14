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

  it('requires litter records to include a box or observation', () => {
    expect(() => parseRecordData(RecordType.LITTER, {})).toThrow();
    expect(parseRecordData(RecordType.LITTER, { observation: '已清理' })).toEqual({
      observation: '已清理',
    });
  });

  it('requires photo records to contain unique photo ids', () => {
    const photoId = '11111111-1111-4111-8111-111111111111';

    expect(parseRecordData(RecordType.PHOTO, { photoIds: [photoId] })).toEqual({
      photoIds: [photoId],
    });
    expect(() => parseRecordData(RecordType.PHOTO, { photoIds: [photoId, photoId] })).toThrow();
  });
});
