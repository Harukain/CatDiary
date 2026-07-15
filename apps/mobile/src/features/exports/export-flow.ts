export type ExportJobStatus = 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED' | 'EXPIRED';

export type DataExportPhase = 'idle' | 'queued' | 'processing' | 'sharing';

export function dataExportPhaseFromStatus(status: ExportJobStatus): DataExportPhase {
  if (status === 'QUEUED') return 'queued';
  if (status === 'PROCESSING') return 'processing';
  return 'idle';
}

export function dataExportButtonLabel(phase: DataExportPhase) {
  if (phase === 'queued') return '等待生成…';
  if (phase === 'processing') return '正在整理数据…';
  if (phase === 'sharing') return '打开系统分享…';
  return '生成并分享导出文件';
}

export function canEditDataExportOptions(phase: DataExportPhase) {
  return phase === 'idle';
}
