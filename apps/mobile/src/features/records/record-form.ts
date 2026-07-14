import type { ManualRecordType, RecordSummary } from '../auth/auth-api';

export const recordTypes: Array<{ value: ManualRecordType; label: string }> = [
  { value: 'FOOD', label: '饮食' },
  { value: 'WATER', label: '饮水' },
  { value: 'WEIGHT', label: '体重' },
  { value: 'STOOL', label: '排便' },
  { value: 'VOMIT', label: '呕吐' },
  { value: 'MEDICATION', label: '用药' },
  { value: 'LITTER', label: '铲屎' },
];
export const stoolOptions = [
  { value: 'NORMAL', label: '正常' },
  { value: 'SOFT', label: '偏软' },
  { value: 'DIARRHEA', label: '腹泻' },
  { value: 'HARD', label: '偏硬' },
  { value: 'UNKNOWN', label: '不确定' },
] as const;
export const vomitOptions = [
  { value: 'FOOD', label: '食物' },
  { value: 'HAIRBALL', label: '毛球' },
  { value: 'LIQUID', label: '液体' },
  { value: 'UNKNOWN', label: '不确定' },
] as const;

export interface RecordFormValue {
  first: string;
  second: string;
  blood: boolean;
}
type PetOption = { id: string; name: string };

export function fieldConfig(type: ManualRecordType) {
  switch (type) {
    case 'FOOD':
      return {
        firstLabel: '食物名称',
        firstPlaceholder: '例如：主食罐',
        secondLabel: '食用量（克）',
        secondPlaceholder: '例如：85',
        secondNumeric: true,
      };
    case 'WATER':
      return {
        firstLabel: '饮水量（毫升）',
        firstPlaceholder: '例如：120',
        secondLabel: '',
        secondPlaceholder: '',
        firstNumeric: true,
      };
    case 'WEIGHT':
      return {
        firstLabel: '体重（kg）',
        firstPlaceholder: '例如：4.25',
        secondLabel: '',
        secondPlaceholder: '',
        firstNumeric: true,
      };
    case 'STOOL':
      return {
        firstLabel: '次数',
        firstPlaceholder: '例如：1',
        secondLabel: '排便状态',
        secondPlaceholder: '',
        firstNumeric: true,
      };
    case 'VOMIT':
      return {
        firstLabel: '次数',
        firstPlaceholder: '例如：1',
        secondLabel: '呕吐物内容',
        secondPlaceholder: '',
        firstNumeric: true,
      };
    case 'MEDICATION':
      return {
        firstLabel: '药品名称',
        firstPlaceholder: '例如：益生菌',
        secondLabel: '剂量',
        secondPlaceholder: '例如：1 袋',
      };
    default:
      return {
        firstLabel: '猫砂盆',
        firstPlaceholder: '例如：客厅猫砂盆',
        secondLabel: '观察',
        secondPlaceholder: '例如：已清理，一切正常',
      };
  }
}
function positive(value: string, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label}必须大于 0`);
  return number;
}
function count(value: string) {
  const number = positive(value, '次数');
  if (!Number.isInteger(number) || number > 30) throw new Error('次数必须是 1 到 30 的整数');
  return number;
}
export function buildRecordData(
  type: ManualRecordType,
  value: RecordFormValue,
): Record<string, unknown> {
  const first = value.first.trim();
  const second = value.second.trim();
  switch (type) {
    case 'FOOD':
      if (!first) throw new Error('请填写食物名称');
      return { foodName: first, amount: positive(second, '食用量'), unit: 'g' };
    case 'WATER':
      return { amountMl: positive(first, '饮水量') };
    case 'WEIGHT':
      return { weightKg: positive(first, '体重'), method: 'SCALE' };
    case 'STOOL':
      return { count: count(first), condition: second || 'UNKNOWN', blood: value.blood };
    case 'VOMIT':
      return { count: count(first), contentType: second || 'UNKNOWN', blood: value.blood };
    case 'MEDICATION':
      if (!first) throw new Error('请填写药品名称');
      if (!second) throw new Error('请填写剂量');
      return { drugName: first, dose: second };
    default:
      if (!first && !second) throw new Error('请填写猫砂盆或观察内容');
      return { boxId: first || undefined, observation: second || undefined };
  }
}
export function initialRecordForm(record: RecordSummary): RecordFormValue {
  const data = record.data;
  switch (record.type) {
    case 'FOOD':
      return {
        first: String(data.foodName ?? ''),
        second: String(data.amount ?? ''),
        blood: false,
      };
    case 'WATER':
      return { first: String(data.amountMl ?? ''), second: '', blood: false };
    case 'WEIGHT':
      return { first: String(data.weightKg ?? ''), second: '', blood: false };
    case 'STOOL':
      return {
        first: String(data.count ?? ''),
        second: String(data.condition ?? 'UNKNOWN'),
        blood: Boolean(data.blood),
      };
    case 'VOMIT':
      return {
        first: String(data.count ?? ''),
        second: String(data.contentType ?? 'UNKNOWN'),
        blood: Boolean(data.blood),
      };
    case 'MEDICATION':
      return { first: String(data.drugName ?? ''), second: String(data.dose ?? ''), blood: false };
    case 'LITTER':
      return {
        first: String(data.boxId ?? ''),
        second: String(data.observation ?? ''),
        blood: false,
      };
    default:
      return { first: '', second: '', blood: false };
  }
}
export function recordTitle(type: ManualRecordType, first: string) {
  return `${recordTypes.find((item) => item.value === type)?.label ?? '日常'}记录${type === 'MEDICATION' || type === 'FOOD' ? ` · ${first.trim()}` : ''}`;
}
export function recordRequiresPet(type: ManualRecordType) {
  return type !== 'LITTER';
}
export function isRecordDraftReady(
  type: ManualRecordType,
  value: RecordFormValue,
  petId: string | null,
) {
  if (recordRequiresPet(type) && !petId) return false;
  const first = value.first.trim();
  const second = value.second.trim();
  if (type === 'FOOD' || type === 'MEDICATION') return Boolean(first && second);
  if (type === 'LITTER') return Boolean(first || second);
  return Boolean(first);
}
export function recordOwnerLabel(record: Pick<RecordSummary, 'pet' | 'type'>) {
  if (record.pet?.name) return record.pet.name;
  return record.type === 'LITTER' ? '公共猫砂盆' : '家庭';
}
export function resolveInitialRecordPetId(
  pets: Array<Pick<PetOption, 'id'>>,
  requestedPetId?: string | null,
) {
  if (requestedPetId && pets.some((pet) => pet.id === requestedPetId)) return requestedPetId;
  return pets[0]?.id ?? null;
}
export function recordDraftOwnerLabel(
  type: ManualRecordType,
  pets: PetOption[],
  petId: string | null,
) {
  if (type === 'LITTER' && !petId) return '公共猫砂盆';
  return pets.find((pet) => pet.id === petId)?.name ?? '未选择猫咪';
}
export function datePart(value: Date | string = new Date()) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function timePart(value: Date | string = new Date()) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
export function parseOccurredAt(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期请按 YYYY-MM-DD 填写');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('时间请按 HH:mm 填写');
  const calendarCheck = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(calendarCheck.getTime()) || calendarCheck.toISOString().slice(0, 10) !== date)
    throw new Error('请输入有效发生日期');
  const occurredAt = new Date(`${date}T${time}:00+08:00`);
  if (occurredAt.getTime() > Date.now() + 5 * 60_000) throw new Error('发生时间不能晚于当前时间');
  return occurredAt.toISOString();
}
