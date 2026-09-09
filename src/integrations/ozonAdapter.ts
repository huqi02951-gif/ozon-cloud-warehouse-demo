export interface DemoLabel {
  orderId: string;
  previewUrl: string;
  watermark: 'DEMO / 演示数据';
  source: 'mock';
}

export interface OzonAdapter {
  getLabel(orderId: string): Promise<DemoLabel>;
}

export class OzonAdapterError extends Error {
  constructor(
    readonly code: 'OZON_LABEL_FAILED' | 'OZON_ORDER_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'OzonAdapterError';
  }
}

const DELAY_MS = 8;
const LABEL_FAILURES: Record<string, OzonAdapterError> = {
  'order-label-error': new OzonAdapterError(
    'OZON_LABEL_FAILED',
    '演示 Ozon 面单生成失败，请稍后重试',
  ),
};
const KNOWN_ORDERS = new Set([
  'order-normal', 'order-fallback', 'order-unmapped', 'order-return',
  ...Array.from({ length: 26 }, (_, index) => `order-${String(index + 5).padStart(2, '0')}`),
]);
const WATERMARK = 'DEMO / 演示数据';

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, DELAY_MS));
}

function createWatermarkedPdfDataUrl(): string {
  const watermarkHex = [...WATERMARK]
    .map((character) => character.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase())
    .join('');
  const pageContent = `BT\n/F1 24 Tf\n72 720 Td\n<${watermarkHex}> Tj\nET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${pageContent.length} >>\nstream\n${pageContent}\nendstream`,
    '<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [6 0 R] >>',
    '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /DW 1000 >>',
  ];
  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  pdf += offsets.slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return `data:application/pdf;base64,${btoa(pdf)}`;
}

const LABEL_PREVIEW_URL = createWatermarkedPdfDataUrl();

export const ozonAdapter: OzonAdapter = {
  async getLabel(orderId) {
    await delay();

    const failure = LABEL_FAILURES[orderId];
    if (failure) throw failure;
    if (!KNOWN_ORDERS.has(orderId)) {
      throw new OzonAdapterError('OZON_ORDER_NOT_FOUND', '未找到对应的演示 Ozon 订单');
    }

    return {
      orderId,
      previewUrl: LABEL_PREVIEW_URL,
      watermark: WATERMARK,
      source: 'mock',
    };
  },
};
