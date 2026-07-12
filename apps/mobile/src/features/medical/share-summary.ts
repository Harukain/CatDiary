import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { authApi } from '../auth/auth-api';

export async function shareMedicalSummary(
  accessToken: string,
  familyId: string,
  petId: string,
  petName: string,
) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('当前设备不支持系统分享');
  const bytes = await authApi.downloadMedicalSummary(accessToken, familyId, petId);
  const safeName = petName.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '') || 'cat';
  const file = new File(Paths.cache, `${safeName}-medical-summary.pdf`);
  if (file.exists) file.delete();
  file.create({ intermediates: true });
  file.write(bytes);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    dialogTitle: `${petName}的就医摘要`,
    UTI: 'com.adobe.pdf',
  });
}
