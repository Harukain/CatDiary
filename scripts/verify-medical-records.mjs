const base = 'http://127.0.0.1:3000/api/v1';
async function request(path, init = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }
  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    body: typeof payload === 'object' ? (payload.data ?? payload.error) : payload,
  };
}
const phone = `137${String(Date.now()).slice(-8)}`;
await request('/auth/sms/send', {
  method: 'POST',
  body: JSON.stringify({ phone, purpose: 'login' }),
});
const login = await request('/auth/sms/verify', {
  method: 'POST',
  body: JSON.stringify({
    phone,
    code: '123456',
    device: {
      deviceId: `medical-${Date.now()}`,
      platform: 'IOS',
      deviceName: 'Medical verification',
    },
  }),
});
const auth = { Authorization: `Bearer ${login.body.accessToken}` };
const family = await request('/families', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ name: '医疗档案验证家庭', timezone: 'Asia/Shanghai' }),
});
const headers = { ...auth, 'X-Family-Id': family.body.id };
const pet = await request('/pets', {
  method: 'POST',
  headers,
  body: JSON.stringify({ name: '医疗猫', sex: 'FEMALE', breed: '中华田园猫' }),
});
const occurredAt = new Date(Date.now() - 86_400_000).toISOString();
const created = await request('/medical-records', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    petId: pet.body.id,
    type: 'VACCINE',
    title: '猫三联加强针',
    occurredAt,
    brand: '验证品牌',
    batchNumber: 'BATCH-001',
    dose: '0.5 ml',
    provider: '验证动物医院',
    nextDueAt: new Date(Date.now() + 365 * 86_400_000).toISOString(),
    reaction: '轻微嗜睡',
  }),
});
const invalid = await request('/medical-records', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    petId: pet.body.id,
    type: 'DEWORMING',
    title: '错误日期',
    occurredAt,
    nextDueAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  }),
});
const updated = await request(`/medical-records/${created.body.id}`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({ note: '留观后正常', version: created.body.version }),
});
const conflict = await request(`/medical-records/${created.body.id}`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({ note: '旧版本覆盖', version: created.body.version }),
});
const json = await request(`/medical-summary?petId=${pet.body.id}&format=json`, { headers });
const html = await request(`/medical-summary?petId=${pet.body.id}&format=html`, { headers });
const pdfResponse = await fetch(`${base}/medical-summary?petId=${pet.body.id}&format=pdf`, {
  headers,
});
const pdf = Buffer.from(await pdfResponse.arrayBuffer());
await mkdir('output/pdf', { recursive: true });
await writeFile('output/pdf/medical-summary-sample.pdf', pdf);
if (
  created.status !== 201 ||
  invalid.status !== 422 ||
  updated.body.note !== '留观后正常' ||
  conflict.status !== 409 ||
  json.body.medicalRecords.length !== 1 ||
  !html.contentType?.includes('text/html') ||
  !html.body.startsWith('<!doctype html>') ||
  !html.body.includes('不构成诊断') ||
  pdfResponse.status !== 200 ||
  !pdfResponse.headers.get('content-type')?.includes('application/pdf') ||
  pdf.subarray(0, 4).toString() !== '%PDF'
)
  throw new Error(
    JSON.stringify(
      {
        created,
        invalid,
        updated,
        conflict,
        json,
        html: { ...html, body: String(html.body).slice(0, 200) },
        pdfStatus: pdfResponse.status,
        pdfSize: pdf.length,
      },
      null,
      2,
    ),
  );
console.log(
  'MEDICAL_RECORDS_API_INTEGRATION_OK',
  JSON.stringify({
    invalidDateRejected: invalid.status,
    conflict: conflict.status,
    summaryFormats: ['json', 'html', 'pdf'],
    pdfBytes: pdf.length,
  }),
);
import { mkdir, writeFile } from 'node:fs/promises';
