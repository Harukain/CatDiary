import type { RecordSummary } from '../auth/auth-api';

export interface RecordActionPermission {
  allowed: boolean;
  reason?: string;
}

export interface RecordActionPermissions {
  edit: RecordActionPermission;
  delete: RecordActionPermission;
}

type PermissionRecord = Pick<RecordSummary, 'authorId' | 'source' | 'type'>;

const medicalRecordTypes = new Set<RecordSummary['type']>(['VACCINE', 'DEWORMING', 'MEDICATION']);

const allowed: RecordActionPermission = { allowed: true };

export function getRecordActionPermissions(
  record: PermissionRecord,
  userId: string | undefined,
  role: string | undefined,
): RecordActionPermissions {
  if (record.source === 'TASK') {
    return denyBoth(
      '这条记录由任务完成后自动生成，不能直接编辑或删除。如需修正，请撤销对应任务后重新完成。',
    );
  }

  if (role === 'OWNER' || role === 'ADMIN') {
    return { edit: allowed, delete: allowed };
  }

  if (role !== 'MEMBER' || !userId) {
    return denyBoth('暂时无法确认你在当前家庭的权限，本记录现以只读方式展示。');
  }

  if (medicalRecordTypes.has(record.type)) {
    return {
      edit: {
        allowed: false,
        reason: '用药、疫苗和驱虫属于医疗类记录，普通成员可以查看，但需要家庭管理员修改。',
      },
      delete: {
        allowed: false,
        reason: '医疗类记录仅家庭管理员可以删除，以便保留完整的健康历史。',
      },
    };
  }

  if (record.authorId !== userId) {
    return denyBoth('这条记录由其他家庭成员创建。普通成员只能编辑或删除自己创建的普通记录。');
  }

  return { edit: allowed, delete: allowed };
}

function denyBoth(reason: string): RecordActionPermissions {
  return {
    edit: { allowed: false, reason },
    delete: { allowed: false, reason },
  };
}
