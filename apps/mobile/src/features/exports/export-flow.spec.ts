import { describe, expect, it } from 'vitest';
import {
  canEditDataExportOptions,
  dataExportButtonLabel,
  dataExportPhaseFromStatus,
} from './export-flow';

describe('data export flow rules', () => {
  it('maps server job statuses to user-visible flow phases', () => {
    expect(dataExportPhaseFromStatus('QUEUED')).toBe('queued');
    expect(dataExportPhaseFromStatus('PROCESSING')).toBe('processing');
    expect(dataExportPhaseFromStatus('READY')).toBe('idle');
    expect(dataExportPhaseFromStatus('FAILED')).toBe('idle');
    expect(dataExportPhaseFromStatus('EXPIRED')).toBe('idle');
  });

  it('locks export format and scope while a job is in progress or sharing', () => {
    expect(canEditDataExportOptions('idle')).toBe(true);
    expect(canEditDataExportOptions('queued')).toBe(false);
    expect(canEditDataExportOptions('processing')).toBe(false);
    expect(canEditDataExportOptions('sharing')).toBe(false);
  });

  it('uses explicit button labels for each export phase', () => {
    expect(dataExportButtonLabel('idle')).toBe('生成导出文件');
    expect(dataExportButtonLabel('queued')).toBe('等待生成…');
    expect(dataExportButtonLabel('processing')).toBe('正在整理数据…');
    expect(dataExportButtonLabel('sharing')).toBe('打开系统分享…');
  });
});
