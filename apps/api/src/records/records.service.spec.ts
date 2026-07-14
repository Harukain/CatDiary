import { FamilyRole, RecordSource, RecordStatus, RecordType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { RecordsService } from './records.service';

function record(
  overrides: Partial<{
    authorId: string;
    source: RecordSource;
    type: RecordType;
  }> = {},
) {
  return {
    id: 'record-id',
    clientId: 'client-id',
    familyId: 'family-id',
    petId: 'pet-id',
    taskId: null,
    authorId: 'member-a',
    type: RecordType.FOOD,
    title: '早餐',
    source: RecordSource.MANUAL,
    status: RecordStatus.ACTIVE,
    abnormal: false,
    occurredAt: new Date('2026-07-14T00:00:00.000Z'),
    data: { foodName: '主食罐', amount: 80, unit: 'g' },
    note: null,
    version: 1,
    createdAt: new Date('2026-07-14T00:00:00.000Z'),
    updatedAt: new Date('2026-07-14T00:00:00.000Z'),
    deletedAt: null,
    pet: { id: 'pet-id', name: '福宝' },
    author: { id: 'member-a', displayName: '成员 A' },
    ...overrides,
  };
}

function fixture(current = record()) {
  const prisma = {
    record: {
      findFirst: vi.fn().mockResolvedValue(current),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    pet: { count: vi.fn().mockResolvedValue(1) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-id' }) },
  };
  return { service: new RecordsService(prisma as never), prisma };
}

const updateInput = { version: 1, title: '更新后的记录' };

describe('RecordsService mutation permissions', () => {
  it('rejects direct edits of task-generated records even for an owner', async () => {
    const { service, prisma } = fixture(record({ source: RecordSource.TASK }));

    await expect(
      service.update('family-id', 'owner-id', FamilyRole.OWNER, 'record-id', updateInput),
    ).rejects.toMatchObject({ code: 'TASK_RECORD_IMMUTABLE', status: 422 });
    expect(prisma.record.updateMany).not.toHaveBeenCalled();
  });

  it('rejects direct deletion of task-generated records even for an admin', async () => {
    const { service, prisma } = fixture(record({ source: RecordSource.TASK }));

    await expect(
      service.remove('family-id', 'admin-id', FamilyRole.ADMIN, 'record-id', 1),
    ).rejects.toMatchObject({ code: 'TASK_RECORD_IMMUTABLE', status: 422 });
    expect(prisma.record.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([RecordType.MEDICATION, RecordType.VACCINE, RecordType.DEWORMING])(
    'rejects a member edit of their own %s record',
    async (type) => {
      const { service, prisma } = fixture(record({ type }));

      await expect(
        service.update('family-id', 'member-a', FamilyRole.MEMBER, 'record-id', updateInput),
      ).rejects.toMatchObject({ code: 'MEDICAL_RECORD_EDIT_FORBIDDEN', status: 403 });
      expect(prisma.record.updateMany).not.toHaveBeenCalled();
    },
  );

  it.each([RecordType.MEDICATION, RecordType.VACCINE, RecordType.DEWORMING])(
    'rejects a member deletion of their own %s record',
    async (type) => {
      const { service, prisma } = fixture(record({ type }));

      await expect(
        service.remove('family-id', 'member-a', FamilyRole.MEMBER, 'record-id', 1),
      ).rejects.toMatchObject({ code: 'MEDICAL_RECORD_DELETE_FORBIDDEN', status: 403 });
      expect(prisma.record.updateMany).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    },
  );

  it('rejects a member edit of another member ordinary record', async () => {
    const { service, prisma } = fixture();

    await expect(
      service.update('family-id', 'member-b', FamilyRole.MEMBER, 'record-id', updateInput),
    ).rejects.toMatchObject({ code: 'RECORD_EDIT_FORBIDDEN', status: 403 });
    expect(prisma.record.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a member deletion of another member ordinary record', async () => {
    const { service, prisma } = fixture();

    await expect(
      service.remove('family-id', 'member-b', FamilyRole.MEMBER, 'record-id', 1),
    ).rejects.toMatchObject({ code: 'RECORD_DELETE_FORBIDDEN', status: 403 });
    expect(prisma.record.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('lets a member edit and delete their own ordinary manual record', async () => {
    const edit = fixture();
    await edit.service.update('family-id', 'member-a', FamilyRole.MEMBER, 'record-id', updateInput);
    expect(edit.prisma.record.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'record-id', familyId: 'family-id', version: 1 }),
      }),
    );

    const deletion = fixture();
    await deletion.service.remove('family-id', 'member-a', FamilyRole.MEMBER, 'record-id', 1);
    expect(deletion.prisma.record.updateMany).toHaveBeenCalledOnce();
    expect(deletion.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ familyId: 'family-id', actorUserId: 'member-a' }),
    });
  });

  it.each([FamilyRole.OWNER, FamilyRole.ADMIN])(
    'lets %s edit and delete another member medical manual record',
    async (role) => {
      const edit = fixture(record({ type: RecordType.MEDICATION }));
      await edit.service.update('family-id', 'manager-id', role, 'record-id', updateInput);
      expect(edit.prisma.record.updateMany).toHaveBeenCalledOnce();

      const deletion = fixture(record({ type: RecordType.MEDICATION }));
      await deletion.service.remove('family-id', 'manager-id', role, 'record-id', 1);
      expect(deletion.prisma.record.updateMany).toHaveBeenCalledOnce();
      expect(deletion.prisma.auditLog.create).toHaveBeenCalledOnce();
    },
  );

  it('keeps record lookup and update constrained to the active family', async () => {
    const { service, prisma } = fixture();

    await service.update('active-family', 'member-a', FamilyRole.MEMBER, 'record-id', updateInput);

    expect(prisma.record.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'record-id', familyId: 'active-family' }),
      }),
    );
    expect(prisma.record.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'record-id', familyId: 'active-family' }),
      }),
    );
  });
});
