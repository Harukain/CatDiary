import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { authApi } from '../auth/auth-api';

export async function shareDataExport(
  accessToken: string,
  familyId: string,
  exportId: string,
  familyName: string,
  format: 'JSON' | 'CSV',
) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('当前设备不支持系统分享');
  const bytes = await authApi.downloadExport(accessToken, familyId, exportId);
  const extension = format.toLowerCase();
  const safeName = familyName.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '') || 'family';
  const file = new File(Paths.cache, `${safeName}-cat-diary-export.${extension}`);
  if (file.exists) file.delete();
  file.create({ intermediates: true });
  file.write(bytes);
  await Sharing.shareAsync(file.uri, {
    mimeType: format === 'JSON' ? 'application/json' : 'text/csv',
    dialogTitle: `${familyName}的数据导出`,
    UTI: format === 'JSON' ? 'public.json' : 'public.comma-separated-values-text',
  });
}
