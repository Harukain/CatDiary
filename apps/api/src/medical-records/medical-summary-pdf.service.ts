import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { MedicalRecordsService } from './medical-records.service';

type Summary = Awaited<ReturnType<MedicalRecordsService['summary']>>;
const fontRegular =
  require.resolve('@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff');
const fontMedium =
  require.resolve('@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-700-normal.woff');

@Injectable()
export class MedicalSummaryPdfService {
  async render(summary: Summary) {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 54, right: 50, bottom: 58, left: 50 },
      bufferPages: true,
      info: {
        Title: `${summary.pet.name}的就医摘要`,
        Author: '猫伴日记',
        Subject: '家庭宠物健康事实摘要',
      },
    });
    doc.registerFont('NotoSC', fontRegular);
    doc.registerFont('NotoSCBold', fontMedium);
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    this.header(doc, summary);
    this.notice(doc, summary.disclaimer);
    this.section(doc, '猫咪资料');
    this.keyValues(doc, [
      ['姓名', summary.pet.name],
      ['品种', summary.pet.breed || '未记录'],
      ['性别', summary.pet.sex || '未记录'],
      ['生日', summary.pet.birthDate ? date(summary.pet.birthDate) : '未记录'],
      [
        '摘要范围',
        summary.period.from || summary.period.to
          ? `${summary.period.from ? date(summary.period.from) : '最早'} 至 ${summary.period.to ? date(summary.period.to) : '现在'}`
          : '全部记录',
      ],
    ]);
    this.section(doc, '医疗档案');
    if (!summary.medicalRecords.length) this.empty(doc);
    else
      summary.medicalRecords.forEach((record) =>
        this.item(
          doc,
          `${date(record.occurredAt)}  ${typeLabel(record.type)}  ${record.title}`,
          [
            record.brand && `品牌：${record.brand}`,
            record.batchNumber && `批次：${record.batchNumber}`,
            record.dose && `剂量：${record.dose}`,
            record.provider && `机构：${record.provider}`,
            record.nextDueAt && `下次日期：${date(record.nextDueAt)}`,
            record.reaction && `反应：${record.reaction}`,
            record.note && `备注：${record.note}`,
          ]
            .filter(Boolean)
            .join('  '),
        ),
      );
    this.section(doc, '健康事件');
    if (!summary.healthEvents.length) this.empty(doc);
    else
      summary.healthEvents.forEach((event) =>
        this.item(
          doc,
          `${date(event.startedAt)}  ${event.title}  [${event.status === 'ACTIVE' ? '观察中' : '已恢复'}]`,
          event.summary || '未填写摘要',
        ),
      );
    this.section(doc, '异常记录');
    if (!summary.abnormalRecords.length) this.empty(doc);
    else
      summary.abnormalRecords.forEach((record) =>
        this.item(
          doc,
          `${date(record.occurredAt)}  ${record.title}`,
          record.note || `类型：${record.type}`,
        ),
      );
    this.addFooters(doc);
    doc.end();
    return done;
  }
  private header(doc: PDFKit.PDFDocument, summary: Summary) {
    doc
      .font('NotoSC')
      .fontSize(9)
      .fillColor('#8A8179')
      .text(
        `猫伴日记  /  生成于 ${new Date(summary.generatedAt).toLocaleString('zh-CN', { hour12: false })}`,
      );
    doc
      .moveDown(1.1)
      .font('NotoSCBold')
      .fontSize(26)
      .fillColor('#292521')
      .text(`${summary.pet.name}的就医摘要`);
    doc
      .moveDown(0.35)
      .font('NotoSC')
      .fontSize(11)
      .fillColor('#756D66')
      .text('家庭照顾记录的事实汇总');
    doc.moveDown(1.2);
    doc.strokeColor('#E0714C').lineWidth(3).moveTo(50, doc.y).lineTo(150, doc.y).stroke();
    doc.moveDown(1.3);
  }
  private notice(doc: PDFKit.PDFDocument, text: string) {
    this.ensure(doc, 75);
    const y = doc.y;
    doc.roundedRect(50, y, 495, 58, 8).fill('#FFF1E8');
    doc
      .font('NotoSCBold')
      .fontSize(10)
      .fillColor('#9D4F34')
      .text('重要说明', 66, y + 10);
    doc
      .font('NotoSC')
      .fontSize(9)
      .fillColor('#5D514A')
      .text(text, 66, y + 28, { width: 463, lineGap: 2 });
    doc.y = y + 70;
  }
  private section(doc: PDFKit.PDFDocument, title: string) {
    this.ensure(doc, 55);
    doc.moveDown(0.7).font('NotoSCBold').fontSize(15).fillColor('#292521').text(title);
    doc.moveDown(0.35);
    doc.strokeColor('#E8E1D9').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.75);
  }
  private keyValues(doc: PDFKit.PDFDocument, rows: Array<[string, string]>) {
    rows.forEach(([label, value]) => {
      this.ensure(doc, 28);
      const y = doc.y;
      doc.font('NotoSC').fontSize(9).fillColor('#8A8179').text(label, 50, y, { width: 90 });
      doc.font('NotoSC').fontSize(10).fillColor('#292521').text(value, 145, y, { width: 400 });
      doc.y = Math.max(doc.y, y + 22);
    });
  }
  private item(doc: PDFKit.PDFDocument, title: string, detail: string) {
    this.ensure(doc, 58);
    const y = doc.y;
    doc.circle(57, y + 6, 3).fill('#E0714C');
    doc.font('NotoSCBold').fontSize(10).fillColor('#292521').text(title, 70, y, { width: 465 });
    doc.moveDown(0.35);
    doc
      .font('NotoSC')
      .fontSize(9)
      .fillColor('#756D66')
      .text(detail || '无补充信息', 70, doc.y, { width: 465, lineGap: 2 });
    doc.moveDown(0.7);
  }
  private empty(doc: PDFKit.PDFDocument) {
    doc.font('NotoSC').fontSize(9).fillColor('#8A8179').text('暂无相关记录');
    doc.moveDown(0.7);
  }
  private ensure(doc: PDFKit.PDFDocument, height: number) {
    if (doc.y + height > doc.page.height - 64) doc.addPage();
  }
  private addFooters(doc: PDFKit.PDFDocument) {
    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .font('NotoSC')
        .fontSize(8)
        .fillColor('#9B938C')
        .text(`猫伴日记 · 第 ${index + 1} / ${range.count} 页`, 50, doc.page.height - 38, {
          width: 495,
          align: 'center',
          lineBreak: false,
        });
      doc.page.margins.bottom = bottom;
    }
  }
}
function date(value: Date | string) {
  return new Date(value).toLocaleDateString('zh-CN');
}
function typeLabel(type: string) {
  return (
    ({ VACCINE: '疫苗', DEWORMING: '驱虫', MEDICATION: '用药' } as Record<string, string>)[type] ??
    type
  );
}
