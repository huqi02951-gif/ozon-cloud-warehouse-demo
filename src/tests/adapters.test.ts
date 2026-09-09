import { describe, expect, it } from 'vitest';
import { ozonAdapter } from '../integrations/ozonAdapter';
import { warehouseAdapter } from '../integrations/warehouseAdapter';

describe('mock integration adapters', () => {
  it('returns a renderable PDF whose page content contains the visible demo watermark', async () => {
    const result = await ozonAdapter.getLabel('order-normal');
    const encodedPdf = result.previewUrl.replace('data:application/pdf;base64,', '');
    const pdf = atob(encodedPdf);
    const watermarkHex = pdf.match(/stream\n[\s\S]*?<([0-9A-F]+)> Tj[\s\S]*?endstream/)?.[1];
    const visibleWatermark = watermarkHex
      ?.match(/.{4}/g)
      ?.map((codeUnit) => String.fromCharCode(Number.parseInt(codeUnit, 16)))
      .join('');

    expect(result).toMatchObject({
      orderId: 'order-normal',
      watermark: 'DEMO / 演示数据',
      source: 'mock',
    });
    expect(result.previewUrl.startsWith('data:application/pdf;base64,')).toBe(true);
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(visibleWatermark).toBe('DEMO / 演示数据');
  });

  it('returns the same deterministic label fixture on repeated calls', async () => {
    const first = await ozonAdapter.getLabel('order-normal');
    const second = await ozonAdapter.getLabel('order-normal');

    expect(second).toEqual(first);
  });

  it('returns a readable rejection for the configured warehouse failure', async () => {
    await expect(warehouseAdapter.createOutbound('order-warehouse-error')).rejects.toMatchObject({
      code: 'WAREHOUSE_REJECTED',
      message: '演示云仓拒绝接单，请检查仓库能力后重试',
    });
  });

  it('accepts the configured warehouse success fixture', async () => {
    await expect(warehouseAdapter.createOutbound('order-normal')).resolves.toEqual({
      orderId: 'order-normal',
      outboundId: 'mock-outbound-order-normal',
      status: 'accepted',
      source: 'mock',
    });
  });

  it('rejects unknown order-shaped warehouse ids', async () => {
    await expect(warehouseAdapter.createOutbound('order-not-configured')).rejects.toMatchObject({
      code: 'WAREHOUSE_ORDER_NOT_FOUND',
      message: '未找到对应的演示出库单',
    });
  });

  it('supports ordinary seeded orders while rejecting ids outside the seed', async () => {
    await expect(ozonAdapter.getLabel('order-30')).resolves.toMatchObject({ orderId: 'order-30' });
    await expect(warehouseAdapter.createOutbound('order-30')).resolves.toMatchObject({ orderId: 'order-30' });
    await expect(ozonAdapter.getLabel('order-31')).rejects.toMatchObject({ code: 'OZON_ORDER_NOT_FOUND' });
    await expect(warehouseAdapter.createOutbound('order-31')).rejects.toMatchObject({ code: 'WAREHOUSE_ORDER_NOT_FOUND' });
  });
});
