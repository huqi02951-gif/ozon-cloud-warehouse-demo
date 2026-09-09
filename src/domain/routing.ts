import type { DemoState, InventoryRecord, Order, RouteDecision, Warehouse } from './types';

export function ozonAvailable(record: InventoryRecord): number {
  return Math.max(0, record.available - record.safetyStock);
}

function hasMappings(order: Order, state: DemoState): boolean {
  return order.items.every((item) => state.skuMappings.some((mapping) =>
    mapping.storeId === order.storeId
      && mapping.ozonSku === item.ozonSku
      && mapping.status === 'mapped'
      && Boolean(mapping.warehouseSku),
  ));
}

export function warehouseCanFulfill(order: Order, warehouse: Warehouse, state: DemoState): boolean {
  if (!warehouse.connected || !warehouse.capabilities.includes('fbs')) return false;

  const quantities = new Map<string, number>();
  for (const item of order.items) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }

  return [...quantities].every(([productId, quantity]) => {
    const record = state.inventory.find((candidate) =>
      candidate.productId === productId
        && candidate.warehouseId === warehouse.id
        && candidate.condition === 'sellable',
    );
    return record !== undefined && ozonAvailable(record) >= quantity;
  });
}

export function selectWarehouse(order: Order, state: DemoState): RouteDecision {
  if (!hasMappings(order, state)) {
    return { warehouseId: undefined, reason: 'unmapped-sku', consideredWarehouseIds: [] };
  }

  const capable = state.warehouses.filter((warehouse) => warehouse.connected && warehouse.capabilities.includes('fbs'));
  const eligible = capable.filter((warehouse) => warehouseCanFulfill(order, warehouse, state));

  if (eligible.length === 0) {
    return {
      warehouseId: undefined,
      reason: capable.length > 0 ? 'insufficient-stock' : 'no-eligible-warehouse',
      consideredWarehouseIds: capable.map((warehouse) => warehouse.id),
    };
  }

  const store = state.stores.find((candidate) => candidate.id === order.storeId);
  const preferredWarehouseId = store?.preferredWarehouseId;
  const ordered = [...eligible].sort((left, right) => {
    const preferredDifference = Number(right.id === preferredWarehouseId) - Number(left.id === preferredWarehouseId);
    if (preferredDifference !== 0) return preferredDifference;

    const coverageDifference = Number(right.coverageRegions.includes(order.recipient.region))
      - Number(left.coverageRegions.includes(order.recipient.region));
    if (coverageDifference !== 0) return coverageDifference;

    return left.priority - right.priority
      || left.estimatedProcessingHours - right.estimatedProcessingHours
      || left.id.localeCompare(right.id);
  });
  const selected = ordered[0];
  const reason = selected.id === preferredWarehouseId
    ? 'preferred-warehouse'
    : selected.coverageRegions.includes(order.recipient.region)
      ? 'region-coverage'
      : 'warehouse-priority';

  return {
    warehouseId: selected.id,
    reason,
    consideredWarehouseIds: ordered.map((warehouse) => warehouse.id),
  };
}
