import { describe, expect, it } from 'vitest';
import { createSeedState } from '../domain/seed';

describe('createSeedState', () => {
  it('creates the approved deterministic demo dataset', () => {
    const state = createSeedState();

    expect(state.stores).toHaveLength(3);
    expect(state.warehouses).toHaveLength(3);
    expect(state.products).toHaveLength(50);
    expect(state.orders).toHaveLength(30);
    expect(state.orders.map((order) => order.scenario)).toEqual(
      expect.arrayContaining(['normal', 'fallback', 'unmapped', 'return']),
    );
  });

  it('keeps stable scenario fixtures and their required demo setup', () => {
    const state = createSeedState();
    const byId = new Map(state.orders.map((order) => [order.id, order]));

    expect(byId.get('order-normal')?.scenario).toBe('normal');
    expect(byId.get('order-fallback')?.scenario).toBe('fallback');
    expect(byId.get('order-unmapped')?.scenario).toBe('unmapped');
    expect(byId.get('order-return')?.scenario).toBe('return');
    expect(state.inventory.find((record) => record.productId === 'product-02' && record.warehouseId === 'wh-moscow')?.available).toBe(1);
    expect(state.inventory.find((record) => record.productId === 'product-02' && record.warehouseId === 'wh-kazan')?.available).toBeGreaterThanOrEqual(3);
    expect(state.skuMappings.find((mapping) => mapping.storeId === 'store-taiga' && mapping.ozonSku === 'OZ-DEMO-0049')?.status).toBe('unmapped');
    expect(state.orders.every((order) => order.labelWatermark === 'DEMO / 演示数据')).toBe(true);
  });

  it('creates fresh state with return records consistent with their orders', () => {
    const first = createSeedState();
    const second = createSeedState();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.returns).toHaveLength(6);
    for (const returnCase of first.returns) {
      const order = first.orders.find((candidate) => candidate.id === returnCase.orderId);
      expect(order).toBeDefined();
      expect(returnCase.storeId).toBe(order?.storeId);
      expect(returnCase.productId).toBe(order?.items[0].productId);
    }
  });

  it('seeds every representative integration failure with typed remediation metadata', () => {
    const tasks = createSeedState().tasks.filter(task => task.status === 'failed');
    expect(tasks.map(task => task.failureCode)).toEqual(expect.arrayContaining([
      'warehouse-timeout', 'rate-limit', 'warehouse-refused', 'stock', 'mapping', 'label-failed', 'ozon-sync-gap',
    ]));
    expect(tasks.every(task => task.errorReason && task.recommendation && task.requestSummary && typeof task.retryable === 'boolean')).toBe(true);
  });
});
