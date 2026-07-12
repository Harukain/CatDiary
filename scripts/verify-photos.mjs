const base = 'http://127.0.0.1:3000/api/v1';
async function request(path, init = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const payload = response.status === 204 ? null : await response.json();
  return { status: response.status, body: payload?.data ?? payload?.error ?? payload };
}
async function login(phone, label) {
  await request('/auth/sms/send', {
    method: 'POST',
    body: JSON.stringify({ phone, purpose: 'login' }),
  });
  const result = await request('/auth/sms/verify', {
    method: 'POST',
    body: JSON.stringify({
      phone,
      code: '123456',
      device: { deviceId: `${label}-${Date.now()}`, platform: 'IOS', deviceName: label },
    }),
  });
  return result.body;
}

const suffix = String(Date.now()).slice(-8);
const ownerPhone = `135${suffix}`;
const memberPhone = `134${suffix}`;
const owner = await login(ownerPhone, 'Photo owner');
const member = await login(memberPhone, 'Photo member');
const ownerAuth = { Authorization: `Bearer ${owner.accessToken}` };
const memberAuth = { Authorization: `Bearer ${member.accessToken}` };
const family = await request('/families', {
  method: 'POST',
  headers: ownerAuth,
  body: JSON.stringify({ name: '照片验收家庭', timezone: 'Asia/Shanghai' }),
});
const ownerHeaders = { ...ownerAuth, 'X-Family-Id': family.body.id };
const memberHeaders = { ...memberAuth, 'X-Family-Id': family.body.id };
const pet1 = await request('/pets', {
  method: 'POST',
  headers: ownerHeaders,
  body: JSON.stringify({ name: '照片猫一', sex: 'UNKNOWN' }),
});
const pet2 = await request('/pets', {
  method: 'POST',
  headers: ownerHeaders,
  body: JSON.stringify({ name: '照片猫二', sex: 'UNKNOWN' }),
});
const invite = await request(`/families/${family.body.id}/invites`, {
  method: 'POST',
  headers: ownerAuth,
  body: JSON.stringify({ phone: memberPhone, role: 'MEMBER' }),
});
await request(`/family-invites/${invite.body.token}/accept`, {
  method: 'POST',
  headers: memberAuth,
  body: '{}',
});

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const presign = await request('/uploads/presign', {
  method: 'POST',
  headers: ownerHeaders,
  body: JSON.stringify({
    fileName: 'cat.png',
    mimeType: 'image/png',
    byteSize: png.length,
    purpose: 'PHOTO',
  }),
});
const thumbnailPresign = await request('/uploads/presign', {
  method: 'POST',
  headers: ownerHeaders,
  body: JSON.stringify({
    fileName: 'thumb-cat.png',
    mimeType: 'image/png',
    byteSize: png.length,
    purpose: 'PHOTO_THUMBNAIL',
  }),
});
const upload = await fetch(presign.body.uploadUrl, {
  method: 'PUT',
  headers: presign.body.headers,
  body: png,
});
const thumbnailUpload = await fetch(thumbnailPresign.body.uploadUrl, {
  method: 'PUT',
  headers: thumbnailPresign.body.headers,
  body: png,
});
const uploadBody = (await upload.json()).data;
const thumbnailUploadBody = (await thumbnailUpload.json()).data;
const created = await request('/photos', {
  method: 'POST',
  headers: ownerHeaders,
  body: JSON.stringify({
    objectKey: presign.body.objectKey,
    thumbnailObjectKey: thumbnailPresign.body.objectKey,
    petIds: [pet1.body.id, pet2.body.id],
    note: '一起晒太阳',
    checksum: uploadBody.checksum,
    thumbnailChecksum: thumbnailUploadBody.checksum,
    width: 1,
    height: 1,
  }),
});
const byPet1 = await request(`/photos?petId=${pet1.body.id}`, { headers: ownerHeaders });
const byPet2 = await request(`/photos?petId=${pet2.body.id}`, { headers: ownerHeaders });
const content = await fetch(base + created.body.downloadUrl, { headers: ownerHeaders });
const contentBytes = Buffer.from(await content.arrayBuffer());
const thumbnailContent = await fetch(base + created.body.thumbnailUrl, { headers: ownerHeaders });
const thumbnailBytes = Buffer.from(await thumbnailContent.arrayBuffer());
const memberEdit = await request(`/photos/${created.body.id}`, {
  method: 'PATCH',
  headers: memberHeaders,
  body: JSON.stringify({ note: '不应覆盖', version: created.body.version }),
});
const updated = await request(`/photos/${created.body.id}`, {
  method: 'PATCH',
  headers: ownerHeaders,
  body: JSON.stringify({
    note: '只保留第一只猫',
    petIds: [pet1.body.id],
    version: created.body.version,
  }),
});
const avatar = await request(`/photos/${created.body.id}/set-avatar`, {
  method: 'POST',
  headers: ownerHeaders,
  body: JSON.stringify({ petId: pet1.body.id }),
});
const noLongerPet2 = await request(`/photos?petId=${pet2.body.id}`, { headers: ownerHeaders });

const fake = Buffer.from('this is not a png');
const fakePresign = await request('/uploads/presign', {
  method: 'POST',
  headers: ownerHeaders,
  body: JSON.stringify({
    fileName: 'fake.png',
    mimeType: 'image/png',
    byteSize: fake.length,
    purpose: 'PHOTO',
  }),
});
const fakeUpload = await fetch(fakePresign.body.uploadUrl, {
  method: 'PUT',
  headers: fakePresign.body.headers,
  body: fake,
});
const oversized = await request('/uploads/presign', {
  method: 'POST',
  headers: ownerHeaders,
  body: JSON.stringify({
    fileName: 'large.jpg',
    mimeType: 'image/jpeg',
    byteSize: 10 * 1024 * 1024 + 1,
    purpose: 'PHOTO',
  }),
});
const wrongMime = await request('/uploads/presign', {
  method: 'POST',
  headers: ownerHeaders,
  body: JSON.stringify({
    fileName: 'cat.gif',
    mimeType: 'image/gif',
    byteSize: 128,
    purpose: 'PHOTO',
  }),
});
const removed = await fetch(`${base}/photos/${created.body.id}`, {
  method: 'DELETE',
  headers: { ...ownerHeaders, 'If-Match': String(updated.body.version) },
});
const petAfterDelete = await request(`/pets/${pet1.body.id}`, { headers: ownerHeaders });

const checks = {
  presignedAndUploaded:
    presign.status === 201 &&
    thumbnailPresign.status === 201 &&
    upload.status === 200 &&
    thumbnailUpload.status === 200,
  registeredWithMultiplePets:
    created.status === 201 && created.body.pets.length === 2 && !!created.body.thumbnailUrl,
  filtersByEitherPet:
    byPet1.body.items[0]?.id === created.body.id && byPet2.body.items[0]?.id === created.body.id,
  protectedContentMatches: content.status === 200 && contentBytes.equals(png),
  thumbnailContentMatches: thumbnailContent.status === 200 && thumbnailBytes.equals(png),
  memberCannotEditOthers:
    memberEdit.status === 403 && memberEdit.body.code === 'PHOTO_EDIT_FORBIDDEN',
  ownerCanEditBindings:
    updated.status === 200 &&
    updated.body.pets.length === 1 &&
    noLongerPet2.body.items.length === 0,
  avatarSet: avatar.status === 201 && avatar.body.petId === pet1.body.id,
  signatureRejected: fakeUpload.status === 415,
  sizeRejected: oversized.status === 400,
  mimeRejected: wrongMime.status === 415,
  softDeleteClearsAvatar:
    removed.status === 204 &&
    petAfterDelete.body.avatarUrl === null &&
    petAfterDelete.body.avatarKey === null,
};
if (Object.values(checks).some((value) => !value))
  throw new Error(
    JSON.stringify(
      {
        checks,
        presign,
        created,
        byPet1,
        byPet2,
        memberEdit,
        updated,
        avatar,
        noLongerPet2,
        fakeUpload: { status: fakeUpload.status, body: await fakeUpload.text() },
        oversized,
        wrongMime,
      },
      null,
      2,
    ),
  );
console.log('PHOTOS_API_INTEGRATION_OK', JSON.stringify(checks));
