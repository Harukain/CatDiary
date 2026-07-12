import { apiResourceUrl, type PhotoSummary } from '../auth/auth-api';

export function photoSource(
  photo: Pick<PhotoSummary, 'downloadUrl'>,
  accessToken: string,
  familyId: string,
) {
  const remote =
    photo.downloadUrl.startsWith('http://') || photo.downloadUrl.startsWith('https://');
  return {
    uri: apiResourceUrl(photo.downloadUrl),
    ...(remote
      ? {}
      : { headers: { Authorization: `Bearer ${accessToken}`, 'X-Family-Id': familyId } }),
  };
}

export function photoThumbnailSource(
  photo: Pick<PhotoSummary, 'thumbnailUrl'>,
  accessToken: string,
  familyId: string,
) {
  return photoSource({ downloadUrl: photo.thumbnailUrl }, accessToken, familyId);
}
