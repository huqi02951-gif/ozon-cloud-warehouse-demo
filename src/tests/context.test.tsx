import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createSeedState } from '../domain/seed';
import type { DemoState } from '../domain/types';
import type { WarehouseAdapter } from '../integrations/warehouseAdapter';
import {
  DemoProvider,
  createDemoRuntime,
  type DemoContextValue,
  type DemoStorage,
  useDemo,
} from '../state/DemoContext';

class MemoryStorage implements DemoStorage {
  readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

function changedState(): DemoState {
  const state = createSeedState();
  return {
    ...state,
    inventory: state.inventory.map((record, index) => index === 0
      ? { ...record, safetyStock: 19 }
      : record),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const acceptedOutbound = {
  orderId: 'order-normal',
  outboundId: 'mock-outbound-order-normal',
  status: 'accepted' as const,
  source: 'mock' as const,
};

describe('demo runtime', () => {
  it('persists reducer-produced state under the approved storage key', async () => {
    const storage = new MemoryStorage();
    const runtime = createDemoRuntime({ storage });
    const inventoryId = runtime.getSnapshot().state.inventory[0].id;

    const result = await runtime.runCommand({
      type: 'SET_SAFETY_STOCK',
      inventoryId,
      safetyStock: 11,
    });

    expect(result.ok).toBe(true);
    expect(runtime.getSnapshot().state.inventory[0].safetyStock).toBe(11);
    expect(JSON.parse(storage.values.get('ozon-cloud-demo-v1')!).state.inventory[0].safetyStock).toBe(11);
    expect(runtime.getSnapshot().toasts.at(-1)).toMatchObject({ tone: 'success' });
  });

  it('hydrates persisted state and resets it through the domain reducer', async () => {
    const storage = new MemoryStorage();
    storage.setItem('ozon-cloud-demo-v1', JSON.stringify({
      state: changedState(),
      role: 'operator',
    }));

    const runtime = createDemoRuntime({ storage });
    expect(runtime.getSnapshot().state.inventory[0].safetyStock).toBe(19);
    expect(runtime.getSnapshot().role).toBe('operator');

    await expect(runtime.runCommand({ type: 'RESET_DEMO' })).resolves.toMatchObject({ ok: false, error: { code: 'ADMIN_REQUIRED' } });
    expect(runtime.getSnapshot().state.inventory[0].safetyStock).toBe(19);
    runtime.setRole('admin');
    await runtime.runCommand({ type: 'RESET_DEMO' });

    expect(runtime.getSnapshot().state.inventory[0].safetyStock).toBe(3);
    expect(runtime.getSnapshot().toasts.at(-1)).toMatchObject({
      tone: 'success',
      message: '演示数据已重置',
    });
  });

  it('keeps reducer state unchanged when an integration command fails', async () => {
    const storage = new MemoryStorage();
    const seed = createSeedState();
    const initialState = {
      ...seed,
      orders: seed.orders.map((order) => order.id === 'order-normal'
        ? { ...order, id: 'order-warehouse-error' }
        : order),
    };
    const runtime = createDemoRuntime({ storage, initialState, ozon: { async getLabel(orderId) { return { orderId, previewUrl: 'data:application/pdf;base64,DEMO', watermark: 'DEMO / 演示数据', source: 'mock' }; } } });
    const before = runtime.getSnapshot().state;

    const result = await runtime.runCommand({
      type: 'DISPATCH_ORDER',
      orderId: 'order-warehouse-error',
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'WAREHOUSE_REJECTED' },
    });
    expect(runtime.getSnapshot().state).toBe(before);
    expect(runtime.getSnapshot().toasts.at(-1)).toMatchObject({ tone: 'error' });
  });

  it('returns a failure and error toast when mapping blocks dispatch', async () => {
    const warehouse: WarehouseAdapter = {
      async createOutbound() {
        throw new Error('blocked dispatch reached adapter');
      },
    };
    const runtime = createDemoRuntime({ warehouse });

    const result = await runtime.runCommand({
      type: 'DISPATCH_ORDER',
      orderId: 'order-unmapped',
    });

    expect(result).toMatchObject({
      ok: false,
      message: 'SKU 未映射，无法创建出库任务',
      error: { code: 'DISPATCH_BLOCKED_MAPPING' },
    });
    expect(runtime.getSnapshot().state.orders.find((order) => order.id === 'order-unmapped')).toMatchObject({
      status: 'exception',
      exceptionReason: 'mapping',
    });
    expect(runtime.getSnapshot().toasts.at(-1)).toMatchObject({
      tone: 'error',
      message: 'SKU 未映射，无法创建出库任务',
    });
  });

  it('returns a failure and error toast when stock blocks dispatch', async () => {
    const seed = createSeedState();
    const initialState = {
      ...seed,
      inventory: seed.inventory.map((record) => ({ ...record, available: record.safetyStock })),
    };
    const runtime = createDemoRuntime({ initialState });

    const result = await runtime.runCommand({ type: 'DISPATCH_ORDER', orderId: 'order-normal' });

    expect(result).toMatchObject({
      ok: false,
      message: '可售库存不足，无法创建出库任务',
      error: { code: 'DISPATCH_BLOCKED_STOCK' },
    });
    expect(runtime.getSnapshot().toasts.at(-1)).toMatchObject({
      tone: 'error',
      message: '可售库存不足，无法创建出库任务',
    });
  });

  it('returns a readable failure for an unknown dispatch order', async () => {
    const runtime = createDemoRuntime();

    const result = await runtime.runCommand({ type: 'DISPATCH_ORDER', orderId: 'order-unknown' });

    expect(result).toMatchObject({
      ok: false,
      message: '未找到对应的演示订单',
      error: { code: 'DISPATCH_ORDER_NOT_FOUND' },
    });
    expect(runtime.getSnapshot().toasts.at(-1)).toMatchObject({
      tone: 'error',
      message: '未找到对应的演示订单',
    });
  });

  it('returns an informational no-op for an already-dispatched order', async () => {
    const warehouse: WarehouseAdapter = {
      async createOutbound() {
        throw new Error('idempotent dispatch reached adapter');
      },
    };
    const runtime = createDemoRuntime({ warehouse });

    const result = await runtime.runCommand({ type: 'DISPATCH_ORDER', orderId: 'order-11' });

    expect(result).toEqual({
      ok: true,
      message: '该订单已存在出库任务，无需重复提交',
    });
    expect(runtime.getSnapshot().toasts.at(-1)).toMatchObject({
      tone: 'info',
      message: '该订单已存在出库任务，无需重复提交',
    });
  });

  it('serializes rapid same-order dispatches into one warehouse call', async () => {
    const outbound = deferred<typeof acceptedOutbound>();
    const createOutbound = vi.fn(() => outbound.promise);
    const runtime = createDemoRuntime({ warehouse: { createOutbound } });

    const first = runtime.runCommand({ type: 'DISPATCH_ORDER', orderId: 'order-normal' });
    const second = runtime.runCommand({ type: 'DISPATCH_ORDER', orderId: 'order-normal' });
    await vi.waitFor(() => expect(createOutbound).toHaveBeenCalledTimes(1));

    expect(createOutbound).toHaveBeenCalledTimes(1);
    outbound.resolve(acceptedOutbound);

    await expect(Promise.all([first, second])).resolves.toEqual([
      { ok: true, message: '出库任务已提交', data: acceptedOutbound },
      { ok: true, message: '该订单已存在出库任务，无需重复提交' },
    ]);
    expect(createOutbound).toHaveBeenCalledTimes(1);
  });

  it('preserves unrelated state updates made while dispatch awaits the warehouse', async () => {
    const outbound = deferred<typeof acceptedOutbound>();
    const runtime = createDemoRuntime({
      warehouse: { createOutbound: () => outbound.promise },
    });
    const inventoryId = runtime.getSnapshot().state.inventory.at(-1)!.id;
    const dispatchResult = runtime.runCommand({ type: 'DISPATCH_ORDER', orderId: 'order-normal' });
    await Promise.resolve();

    runtime.dispatch({ type: 'SET_SAFETY_STOCK', inventoryId, safetyStock: 17 });
    outbound.resolve(acceptedOutbound);
    await dispatchResult;

    expect(runtime.getSnapshot().state.inventory.find((record) => record.id === inventoryId)?.safetyStock).toBe(17);
  });

  it('falls back to in-memory state when the localStorage getter throws', () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: Object.defineProperty({}, 'localStorage', {
        get() {
          throw new DOMException('Storage denied', 'SecurityError');
        },
      }),
    });

    try {
      const runtime = createDemoRuntime();
      expect(runtime.getSnapshot().state.orders).toHaveLength(30);
    } finally {
      if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });

  it('reports rejected and no-op price commands instead of claiming success', async () => {
    const runtime = createDemoRuntime({ storage: undefined });
    const product = runtime.getSnapshot().state.products[0];

    const invalid = await runtime.runCommand({ type: 'SET_PRODUCT_PRICES', updates: [{ productId: product.id, priceRub: 0.49 }] });
    const unchanged = await runtime.runCommand({ type: 'SET_PRODUCT_PRICES', updates: [{ productId: product.id, priceRub: product.priceRub, promotionPriceRub: product.promotionPriceRub }] });
    const emptySync = await runtime.runCommand({ type: 'SYNC_INVENTORY', inventoryIds: [] });

    expect(invalid).toMatchObject({ ok: false, error: { code: 'PRICE_INVALID' } });
    expect(unchanged).toMatchObject({ ok: false, error: { code: 'PRICE_NO_CHANGE' } });
    expect(emptySync).toMatchObject({ ok: false, error: { code: 'INVENTORY_TARGET_EMPTY' } });
  });
});

describe('DemoProvider', () => {
  it('exposes optional initialRole and initialState overrides', () => {
    let value: DemoContextValue | undefined;
    const initialState = changedState();

    function Probe() {
      value = useDemo();
      return null;
    }

    renderToStaticMarkup(
      <DemoProvider initialRole="warehouse" initialState={initialState}>
        <Probe />
      </DemoProvider>,
    );

    expect(value?.role).toBe('warehouse');
    expect(value?.state).toBe(initialState);
  });
});
