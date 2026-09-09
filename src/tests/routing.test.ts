import { describe, expect, it } from 'vitest';
import { createSeedState } from '../domain/seed';
import { ozonAvailable, selectWarehouse } from '../domain/routing';

describe('routing', () => {
  it('falls back to the next eligible warehouse when the preferred warehouse is short', () => {
    const state = createSeedState();
    const order = state.orders.find((item) => item.scenario === 'fallback')!;

    expect(selectWarehouse(order, state).warehouseId).toBe('wh-kazan');
  });

  it('never exposes negative Ozon stock after safety stock', () => {
    const record = createSeedState().inventory[0];

    expect(ozonAvailable({ ...record, available: 2, safetyStock: 3 })).toBe(0);
    expect(ozonAvailable({ ...record, available: 8, safetyStock: 3 })).toBe(5);
  });

  it('keeps a stocked store-preferred warehouse ahead of other candidates', () => {
    const state = createSeedState();
    const order = state.orders.find((item) => item.id === 'order-normal')!;

    expect(selectWarehouse({ ...order, assignedWarehouseId: undefined }, state).warehouseId).toBe('wh-moscow');
  });

  it('requires every item quantity and a mapped SKU before routing', () => {
    const state = createSeedState();
    const normal = state.orders.find((item) => item.id === 'order-normal')!;
    const unmapped = state.orders.find((item) => item.id === 'order-unmapped')!;
    const oversized = { ...normal, items: normal.items.map((item) => ({ ...item, quantity: 10_000 })) };

    expect(selectWarehouse(oversized, state)).toMatchObject({ warehouseId: undefined, reason: 'insufficient-stock' });
    expect(selectWarehouse(unmapped, state)).toMatchObject({ warehouseId: undefined, reason: 'unmapped-sku' });
  });

  it('sums duplicate product lines when checking warehouse stock', () => {
    const state = createSeedState();
    const normal = state.orders.find((item) => item.id === 'order-normal')!;
    const item = normal.items[0];
    const duplicateLines = { ...normal, items: [{ ...item, quantity: 5 }, { ...item, quantity: 5 }] };

    expect(selectWarehouse(duplicateLines, state).warehouseId).not.toBe('wh-moscow');
  });

  it('uses warehouse priority and processing time as deterministic tie breakers', () => {
    const state = createSeedState();
    const order = state.orders.find((item) => item.id === 'order-normal')!;
    const withoutPreference = {
      ...state,
      stores: state.stores.map((store) => store.id === order.storeId ? { ...store, preferredWarehouseId: 'missing' } : store),
      warehouses: state.warehouses.map((warehouse) => ({
        ...warehouse,
        coverageRegions: [...warehouse.coverageRegions, order.recipient.region],
        priority: 1,
        estimatedProcessingHours: warehouse.id === 'wh-kazan' ? 2 : 4,
      })),
    };

    expect(selectWarehouse({ ...order, assignedWarehouseId: undefined }, withoutPreference).warehouseId).toBe('wh-kazan');
  });
});
