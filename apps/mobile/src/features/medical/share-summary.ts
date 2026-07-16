import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { authApi } from '../auth/auth-api';

export interface PreparedMedicalSummary {
  uri: string;
  petName: string;
  mimeType: 'application/pdf';
  UTI: 'com.adobe.pdf';
}

export async function prepareMedicalSummary(
  accessToken: string,
  familyId: string,
  petId: string,
  petName: string,
): Promise<PreparedMedicalSummary> {
  const bytes = await authApi.downloadMedicalSummary(accessToken, familyId, petId);
  const safeName = petName.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '') || 'cat';
  const file = new File(Paths.cache, `${safeName}-medical-summary.pdf`);
  if (file.exists) file.delete();
  file.create({ intermediates: true });
  file.write(bytes);
  return { uri: file.uri, petName, mimeType: 'application/pdf', UTI: 'com.adobe.pdf' };
}

export async function sharePreparedMedicalSummary(summary: PreparedMedicalSummary) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('当前设备不支持系统分享');
  await Sharing.shareAsync(summary.uri, {
    mimeType: summary.mimeType,
    dialogTitle: `${summary.petName}的就医摘要`,
    UTI: summary.UTI,
  });
}

export async function shareMedicalSummary(
  accessToken: string,
  familyId: string,
  petId: string,
  petName: string,
) {
  const summary = await prepareMedicalSummary(accessToken, familyId, petId, petName);
  await sharePreparedMedicalSummary(summary);
}
