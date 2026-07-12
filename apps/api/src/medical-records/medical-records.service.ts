import { HttpStatus, Injectable } from '@nestjs/common';
import { MedicalRecordType, Prisma } from '@prisma/client';
import { AppException } from '../common/app.exception';
import { PrismaService } from '../prisma/prisma.service';

export interface MedicalRecordInput {
  petId: string;
  type: MedicalRecordType;
  title: string;
  occurredAt: string;
  brand?: string;
  batchNumber?: string;
  dose?: string;
  provider?: string;
  nextDueAt?: string | null;
  reaction?: string;
  note?: string;
}

@Injectable()
export class MedicalRecordsService {
  constructor(private readonly prisma: PrismaService) {}
  list(
    familyId: string,
    filters: { petId?: string; type?: MedicalRecordType; from?: string; to?: string },
  ) {
    return this.prisma.medicalRecord.findMany({
      where: {
        familyId,
        deletedAt: null,
        ...(filters.petId ? { petId: filters.petId } : {}),
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.from || filters.to
          ? {
              occurredAt: {
                ...(filters.from ? { gte: new Date(filters.from) } : {}),
                ...(filters.to ? { lte: new Date(filters.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { occurredAt: 'desc' },
      select: this.selection,
    });
  }
  async get(familyId: string, id: string) {
    const record = await this.prisma.medicalRecord.findFirst({
      where: { id, familyId, deletedAt: null },
      select: this.selection,
    });
    if (!record)
      throw new AppException('MEDICAL_RECORD_NOT_FOUND', '医疗档案不存在', HttpStatus.NOT_FOUND);
    return record;
  }
  async create(familyId: string, userId: string, input: MedicalRecordInput) {
    await this.validate(familyId, input);
    const record = await this.prisma.medicalRecord.create({
      data: this.data(familyId, userId, input),
      select: this.selection,
    });
    await this.audit(familyId, userId, 'medical_record.create', record.id, {
      petId: record.petId,
      type: record.type,
    });
    return record;
  }
  async update(
    familyId: string,
    id: string,
    input: Partial<MedicalRecordInput> & { version: number },
  ) {
    const current = await this.get(familyId, id);
    if (input.petId || input.occurredAt || input.nextDueAt !== undefined)
      await this.validate(familyId, {
        petId: input.petId ?? current.petId,
        occurredAt: input.occurredAt ?? current.occurredAt.toISOString(),
        nextDueAt:
          input.nextDueAt === undefined
            ? (current.nextDueAt?.toISOString() ?? null)
            : input.nextDueAt,
      });
    const result = await this.prisma.medicalRecord.updateMany({
      where: { id, familyId, version: input.version, deletedAt: null },
      data: { ...this.mutable(input), version: { increment: 1 } },
    });
    if (!result.count)
      throw new AppException(
        'VERSION_CONFLICT',
        '医疗档案已被其他管理员修改',
        HttpStatus.CONFLICT,
        undefined,
        { serverVersion: (await this.get(familyId, id)).version },
      );
    return this.get(familyId, id);
  }
  async remove(familyId: string, userId: string, id: string, version: number) {
    const current = await this.get(familyId, id);
    const result = await this.prisma.medicalRecord.updateMany({
      where: { id, familyId, version, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    if (!result.count)
      throw new AppException('VERSION_CONFLICT', '医疗档案已被修改', HttpStatus.CONFLICT);
    await this.audit(familyId, userId, 'medical_record.delete', id, {
      type: current.type,
      petId: current.petId,
    });
  }
  async summary(familyId: string, petId: string, from?: string, to?: string) {
    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, familyId, deletedAt: null },
      select: { id: true, name: true, birthDate: true, breed: true, sex: true },
    });
    if (!pet) throw new AppException('PET_NOT_FOUND', '猫咪档案不存在', HttpStatus.NOT_FOUND);
    const [medicalRecords, abnormalRecords, healthEvents] = await Promise.all([
      this.list(familyId, { petId, from, to }),
      this.prisma.record.findMany({
        where: {
          familyId,
          petId,
          abnormal: true,
          status: 'ACTIVE',
          deletedAt: null,
          ...(from || to
            ? {
                occurredAt: {
                  ...(from ? { gte: new Date(from) } : {}),
                  ...(to ? { lte: new Date(to) } : {}),
                },
              }
            : {}),
        },
        orderBy: { occurredAt: 'desc' },
        select: { id: true, type: true, title: true, occurredAt: true, data: true, note: true },
      }),
      this.prisma.healthEvent.findMany({
        where: {
          familyId,
          petId,
          deletedAt: null,
          ...(from || to
            ? {
                startedAt: {
                  ...(from ? { gte: new Date(from) } : {}),
                  ...(to ? { lte: new Date(to) } : {}),
                },
              }
            : {}),
        },
        orderBy: { startedAt: 'desc' },
        select: {
          id: true,
          title: true,
          status: true,
          startedAt: true,
          recoveredAt: true,
          summary: true,
        },
      }),
    ]);
    return {
      generatedAt: new Date(),
      disclaimer:
        '本摘要仅整理主人记录的事实，不构成诊断、处方或医疗建议。紧急情况请及时联系执业兽医。',
      period: { from: from ?? null, to: to ?? null },
      pet,
      medicalRecords,
      abnormalRecords,
      healthEvents,
    };
  }
  toHtml(summary: Awaited<ReturnType<MedicalRecordsService['summary']>>) {
    const esc = (value: unknown) =>
      String(value ?? '').replace(
        /[&<>"']/g,
        (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
      );
    const rows = summary.medicalRecords
      .map(
        (r) =>
          `<tr><td>${esc(new Date(r.occurredAt).toLocaleDateString('zh-CN'))}</td><td>${esc(typeLabel(r.type))}</td><td>${esc(r.title)}</td><td>${esc(r.brand || r.provider || '—')}</td><td>${esc(r.dose || '—')}</td></tr>`,
      )
      .join('');
    const events = summary.healthEvents
      .map(
        (e) =>
          `<li><strong>${esc(e.title)}</strong>（${esc(e.status === 'ACTIVE' ? '观察中' : '已恢复')}）${e.summary ? `：${esc(e.summary)}` : ''}</li>`,
      )
      .join('');
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(summary.pet.name)}的就医摘要</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#292521;max-width:860px;margin:40px auto;padding:0 28px;line-height:1.6}h1{font-size:30px}h2{margin-top:32px;border-bottom:2px solid #e0714c;padding-bottom:8px}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #e8e1d9;padding:10px 6px}.notice{background:#fff2ea;border-left:4px solid #e0714c;padding:14px 16px}.muted{color:#756d66}</style></head><body><p class="muted">猫伴日记 · 生成于 ${esc(new Date(summary.generatedAt).toLocaleString('zh-CN'))}</p><h1>${esc(summary.pet.name)}的就医摘要</h1><p>品种：${esc(summary.pet.breed || '未记录')}　性别：${esc(summary.pet.sex || '未记录')}</p><div class="notice">${esc(summary.disclaimer)}</div><h2>医疗档案</h2><table><thead><tr><th>日期</th><th>类型</th><th>项目</th><th>品牌/机构</th><th>剂量</th></tr></thead><tbody>${rows || '<tr><td colspan="5">暂无记录</td></tr>'}</tbody></table><h2>健康事件</h2><ul>${events || '<li>暂无记录</li>'}</ul><h2>异常记录</h2><p>共 ${summary.abnormalRecords.length} 条异常记录，请结合原始记录与兽医检查判断。</p></body></html>`;
  }
  private async validate(familyId: string, input: Partial<MedicalRecordInput>) {
    if (
      input.petId &&
      !(await this.prisma.pet.count({ where: { id: input.petId, familyId, deletedAt: null } }))
    )
      throw new AppException('PET_NOT_FOUND', '猫咪档案不存在', HttpStatus.NOT_FOUND);
    if (input.occurredAt && new Date(input.occurredAt).getTime() > Date.now() + 5 * 60_000)
      throw new AppException(
        'FUTURE_OCCURRED_AT',
        '发生时间不能晚于当前时间',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    if (
      input.nextDueAt &&
      input.occurredAt &&
      new Date(input.nextDueAt) <= new Date(input.occurredAt)
    )
      throw new AppException(
        'INVALID_NEXT_DUE_AT',
        '下次日期必须晚于本次发生时间',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
  }
  private data(
    familyId: string,
    userId: string,
    input: MedicalRecordInput,
  ): Prisma.MedicalRecordUncheckedCreateInput {
    return {
      familyId,
      createdById: userId,
      petId: input.petId,
      type: input.type,
      title: input.title.trim(),
      occurredAt: new Date(input.occurredAt),
      ...this.mutable(input),
    };
  }
  private mutable(input: Partial<MedicalRecordInput>) {
    const text = (value?: string) => value?.trim() || null;
    return {
      ...(input.petId ? { petId: input.petId } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.occurredAt ? { occurredAt: new Date(input.occurredAt) } : {}),
      ...(input.brand !== undefined ? { brand: text(input.brand) } : {}),
      ...(input.batchNumber !== undefined ? { batchNumber: text(input.batchNumber) } : {}),
      ...(input.dose !== undefined ? { dose: text(input.dose) } : {}),
      ...(input.provider !== undefined ? { provider: text(input.provider) } : {}),
      ...(input.nextDueAt !== undefined
        ? { nextDueAt: input.nextDueAt ? new Date(input.nextDueAt) : null }
        : {}),
      ...(input.reaction !== undefined ? { reaction: text(input.reaction) } : {}),
      ...(input.note !== undefined ? { note: text(input.note) } : {}),
    };
  }
  private audit(
    familyId: string,
    actorUserId: string,
    action: string,
    resourceId: string,
    beforeSafe: Prisma.InputJsonValue,
  ) {
    return this.prisma.auditLog.create({
      data: {
        familyId,
        actorUserId,
        action,
        resourceType: 'medical_record',
        resourceId,
        beforeSafe,
      },
    });
  }
  private readonly selection = {
    id: true,
    familyId: true,
    petId: true,
    type: true,
    title: true,
    occurredAt: true,
    brand: true,
    batchNumber: true,
    dose: true,
    provider: true,
    nextDueAt: true,
    reaction: true,
    note: true,
    createdById: true,
    version: true,
    createdAt: true,
    updatedAt: true,
    pet: { select: { id: true, name: true } },
    createdBy: { select: { id: true, displayName: true } },
  } satisfies Prisma.MedicalRecordSelect;
}
function typeLabel(type: MedicalRecordType) {
  return ({ VACCINE: '疫苗', DEWORMING: '驱虫', MEDICATION: '用药' } as const)[type];
}
