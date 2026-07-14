import type { RecordSummary } from '../auth/auth-api';

type DisplayRecord = Pick<RecordSummary, 'type' | 'data' | 'photos'>;

export interface RecordDataRow {
  label: string;
  value: string;
}

const typeLabels: Record<string, string> = {
  FOOD: '饮食',
  WATER: '饮水',
  WEIGHT: '体重',
  STOOL: '排便',
  VOMIT: '呕吐',
  MEDICATION: '用药',
  VACCINE: '疫苗',
  DEWORMING: '驱虫',
  LITTER: '铲屎',
  PHOTO: '照片',
  HEALTH_NOTE: '健康观察',
};

const stoolLabels: Record<string, string> = {
  NORMAL: '正常',
  SOFT: '偏软',
  DIARRHEA: '腹泻',
  HARD: '偏硬',
  UNKNOWN: '不确定',
};

const vomitLabels: Record<string, string> = {
  FOOD: '食物',
  HAIRBALL: '毛球',
  LIQUID: '液体',
  UNKNOWN: '不确定',
};

const appetiteLabels: Record<string, string> = {
  POOR: '较差',
  NORMAL: '正常',
  GOOD: '较好',
};

const weightMethodLabels: Record<string, string> = {
  SCALE: '体重秤',
  VET: '医院',
  ESTIMATED: '估算',
};

const fallbackLabels: Record<string, string> = {
  foodName: '食物',
  amount: '数量',
  unit: '单位',
  amountMl: '饮水量',
  weightKg: '体重',
  method: '测量方式',
  condition: '状态',
  contentType: '内容',
  count: '次数',
  blood: '发现血迹',
  drugName: '药品',
  dose: '剂量',
  reaction: '反应',
  brand: '品牌/药品',
  batch: '批次号',
  hospital: '机构',
  nextAt: '下次提醒',
  boxId: '猫砂盆',
  observation: '观察',
  symptom: '症状',
};

export function recordTypeLabel(type: string) {
  return typeLabels[type] ?? type;
}

export function recordSummaryText(record: DisplayRecord) {
  const data = record.data;
  switch (record.type) {
    case 'FOOD':
      return compact([text(data.foodName), formatAmount(data.amount, data.unit)]).join(' · ');
    case 'WATER':
      return `${numberText(data.amountMl)} ml`;
    case 'WEIGHT':
      return `${numberText(data.weightKg)} kg`;
    case 'STOOL':
      return compact([`${numberText(data.count)} 次`, labelOf(stoolLabels, data.condition)]).join(
        ' · ',
      );
    case 'VOMIT':
      return compact([`${numberText(data.count)} 次`, labelOf(vomitLabels, data.contentType)]).join(
        ' · ',
      );
    case 'MEDICATION':
      return compact([text(data.drugName), text(data.dose)]).join(' · ');
    case 'VACCINE':
      return compact([text(data.brand), text(data.dose), nextText(data.nextAt)]).join(' · ');
    case 'DEWORMING':
      return compact([text(data.brand), text(data.dose), nextText(data.nextAt)]).join(' · ');
    case 'LITTER':
      return text(data.observation) || text(data.boxId) || '已记录';
    case 'PHOTO': {
      const count = photoCount(record);
      return count ? `${count} 张照片` : '照片记录';
    }
    case 'HEALTH_NOTE':
      return text(data.symptom) || '健康观察';
    default:
      return text(data.observation) || '已记录';
  }
}

export function recordDataRows(record: DisplayRecord): RecordDataRow[] {
  const data = record.data;
  switch (record.type) {
    case 'FOOD':
      return cleanRows([
        row('食物', data.foodName),
        row('食用量', formatAmount(data.amount, data.unit)),
        row('食欲', labelOf(appetiteLabels, data.appetite)),
        row('是否吃完', optionalBooleanText(data.finished)),
      ]);
    case 'WATER':
      return cleanRows([row('饮水量', `${numberText(data.amountMl)} ml`)]);
    case 'WEIGHT':
      return cleanRows([
        row('体重', `${numberText(data.weightKg)} kg`),
        row('测量方式', labelOf(weightMethodLabels, data.method)),
      ]);
    case 'STOOL':
      return cleanRows([
        row('次数', `${numberText(data.count)} 次`),
        row('排便状态', labelOf(stoolLabels, data.condition)),
        row('发现血迹', booleanText(data.blood)),
      ]);
    case 'VOMIT':
      return cleanRows([
        row('次数', `${numberText(data.count)} 次`),
        row('呕吐物内容', labelOf(vomitLabels, data.contentType)),
        row('发现血迹', booleanText(data.blood)),
      ]);
    case 'MEDICATION':
      return cleanRows([
        row('药品名称', data.drugName),
        row('剂量', data.dose),
        row('反应', data.reaction),
      ]);
    case 'VACCINE':
      return cleanRows([
        row('品牌', data.brand),
        row('批次号', data.batch),
        row('剂量', data.dose),
        row('机构', data.hospital),
        row('下次提醒', dateTimeText(data.nextAt)),
      ]);
    case 'DEWORMING':
      return cleanRows([
        row('品牌/药品', data.brand),
        row('剂量', data.dose),
        row('机构', data.hospital),
        row('下次提醒', dateTimeText(data.nextAt)),
      ]);
    case 'LITTER':
      return cleanRows([row('猫砂盆', data.boxId), row('观察', data.observation)]);
    case 'PHOTO': {
      const count = photoCount(record);
      return [{ label: '照片数量', value: count ? `${count} 张` : '照片记录' }];
    }
    case 'HEALTH_NOTE':
      return cleanRows([row('症状', data.symptom)]);
    default:
      return Object.entries(data).map(([key, value]) => ({
        label: fallbackLabels[key] ?? key,
        value: formatUnknownValue(value),
      }));
  }
}

function row(label: string, value: unknown): RecordDataRow {
  return { label, value: formatUnknownValue(value) };
}

function cleanRows(rows: RecordDataRow[]) {
  return rows.filter((item) => item.value.length > 0);
}

function compact(values: Array<string | undefined>) {
  return values.filter((value): value is string => Boolean(value));
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function numberText(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return '—';
}

function formatAmount(amount: unknown, unit: unknown) {
  const amountText = numberText(amount);
  const unitText = text(unit) || 'g';
  return amountText === '—' ? '' : `${amountText} ${unitText}`;
}

function labelOf(labels: Record<string, string>, value: unknown) {
  const key = text(value);
  return key ? (labels[key] ?? key) : '';
}

function optionalBooleanText(value: unknown) {
  return typeof value === 'boolean' ? booleanText(value) : '';
}

function booleanText(value: unknown) {
  return value === true ? '是' : '否';
}

function dateTimeText(value: unknown) {
  const raw = text(value);
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function nextText(value: unknown) {
  const formatted = dateTimeText(value);
  return formatted ? `下次 ${formatted}` : '';
}

function photoCount(record: DisplayRecord) {
  if (record.photos?.length) return record.photos.length;
  return Array.isArray(record.data.photoIds) ? record.data.photoIds.length : 0;
}

function formatUnknownValue(value: unknown) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return booleanText(value);
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return JSON.stringify(value);
}
