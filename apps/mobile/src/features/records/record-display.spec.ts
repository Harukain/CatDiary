import { describe, expect, it } from 'vitest';
import type { RecordSummary } from '../auth/auth-api';
import { recordDataRows, recordSummaryText, recordTypeLabel } from './record-display';

function record(overrides: Partial<RecordSummary>): RecordSummary {
  return {
    id: 'record-id',
    clientId: 'client-id',
    petId: 'pet-id',
    authorId: 'user-id',
    type: 'FOOD',
    title: '饮食记录',
    source: 'MANUAL',
    status: 'ACTIVE',
    abnormal: false,
    occurredAt: '2026-07-15T00:00:00.000Z',
    data: {},
    note: null,
    version: 1,
    ...overrides,
  };
}

describe('record display formatting', () => {
  it('formats readonly food records with user-facing labels and units', () => {
    const item = record({
      type: 'FOOD',
      data: { foodName: '主食罐', amount: 85, unit: 'g', appetite: 'GOOD', finished: true },
    });

    expect(recordTypeLabel(item.type)).toBe('饮食');
    expect(recordSummaryText(item)).toBe('主食罐 · 85 g');
    expect(recordDataRows(item)).toEqual([
      { label: '食物', value: '主食罐' },
      { label: '食用量', value: '85 g' },
      { label: '食欲', value: '较好' },
      { label: '是否吃完', value: '是' },
    ]);
  });

  it('formats stool and vomit records with structured option labels', () => {
    expect(
      recordDataRows(record({ type: 'STOOL', data: { count: 2, condition: 'SOFT', blood: true } })),
    ).toEqual([
      { label: '次数', value: '2 次' },
      { label: '排便状态', value: '偏软' },
      { label: '发现血迹', value: '是' },
    ]);

    expect(
      recordSummaryText(record({ type: 'VOMIT', data: { count: 1, contentType: 'HAIRBALL' } })),
    ).toBe('1 次 · 毛球');
  });

  it('formats medical and photo records without raw field keys', () => {
    const vaccine = record({
      type: 'VACCINE',
      data: {
        brand: '妙三多',
        batch: 'B-01',
        dose: '1 针',
        hospital: '安心宠物医院',
        nextAt: '2026-08-15T02:30:00.000Z',
      },
    });
    const photo = record({
      type: 'PHOTO',
      data: { photoIds: ['photo-a', 'photo-b'] },
      photos: [
        { id: 'photo-a', downloadUrl: '/photos/a/content', thumbnailUrl: '/photos/a/thumb' },
      ],
    });

    expect(recordDataRows(vaccine).map((row) => row.label)).toEqual([
      '品牌',
      '批次号',
      '剂量',
      '机构',
      '下次提醒',
    ]);
    expect(recordDataRows(photo)).toEqual([{ label: '照片数量', value: '1 张' }]);
  });
});
