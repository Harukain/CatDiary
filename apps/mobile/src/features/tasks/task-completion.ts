import type { CompleteTaskInput, TaskSummary } from '../auth/auth-api';

export interface TaskCompletionDraft {
  actualAtLocal: string;
  resultText: string;
  note: string;
}

export interface TaskCompletionValidation {
  input?: CompleteTaskInput;
  error?: string;
}

const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/;
const maxResultLength = 160;
const maxNoteLength = 500;

export function isMedicalTask(task: Pick<TaskSummary, 'type'>) {
  return task.type === 'VACCINE' || task.type === 'DEWORMING' || task.type === 'MEDICATION';
}

export function canQuickUndoTaskCompletion(task: Pick<TaskSummary, 'type'>) {
  return !isMedicalTask(task);
}

export function initialTaskCompletionDraft(
  task: Pick<TaskSummary, 'type'>,
  now = new Date(),
): TaskCompletionDraft {
  return {
    actualAtLocal: formatLocalTaskDateTime(now),
    resultText: defaultResultText(task),
    note: '',
  };
}

export function isTaskCompletionDraftDirty(
  current: TaskCompletionDraft,
  baseline: TaskCompletionDraft,
) {
  return (
    current.actualAtLocal !== baseline.actualAtLocal ||
    current.resultText !== baseline.resultText ||
    current.note !== baseline.note
  );
}

export function buildTaskCompletionInput(
  task: Pick<TaskSummary, 'type'>,
  draft: TaskCompletionDraft,
  now = new Date(),
): TaskCompletionValidation {
  const actualAt = parseLocalTaskDateTime(draft.actualAtLocal);
  if (!actualAt) return { error: '请按 YYYY-MM-DD HH:mm 填写实际完成时间' };
  if (actualAt.getTime() > now.getTime() + 60 * 1000) return { error: '实际完成时间不能晚于现在' };

  const resultText = draft.resultText.trim();
  if (!resultText) return { error: '请填写本次执行结果' };
  if (resultText.length > maxResultLength)
    return { error: `执行结果不能超过 ${maxResultLength} 个字` };

  const note = draft.note.trim();
  if (note.length > maxNoteLength) return { error: `备注不能超过 ${maxNoteLength} 个字` };

  return {
    input: {
      actualAt: actualAt.toISOString(),
      result: { summary: resultText },
      ...(note ? { note } : {}),
      medicalConfirmed: isMedicalTask(task),
    },
  };
}

export function formatTaskCompletionResult(result?: Record<string, unknown> | null) {
  if (!result || !Object.keys(result).length) return '';
  const summary = result.summary;
  if (typeof summary === 'string') return summary;
  return JSON.stringify(result);
}

export function formatLocalTaskDateTime(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function parseLocalTaskDateTime(value: string) {
  const match = localDateTimePattern.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() !== Number(month) - 1 ||
    parsed.getDate() !== Number(day) ||
    parsed.getHours() !== Number(hour) ||
    parsed.getMinutes() !== Number(minute)
  )
    return null;
  return parsed;
}

function defaultResultText(task: Pick<TaskSummary, 'type'>) {
  if (task.type === 'LITTER') return '已清理猫砂盆';
  if (task.type === 'VACCINE') return '已按计划完成疫苗接种';
  if (task.type === 'DEWORMING') return '已按计划完成驱虫';
  if (task.type === 'MEDICATION') return '已按计划完成用药';
  return '已完成';
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}
