import React from 'react';
import { StatusTag, type StatusTone } from '../components/StatusTag';
import type { FulfillmentStatus, Order } from '../domain/types';

export const STATUS_LABEL: Record<FulfillmentStatus, string> = {
  pulled: '已拉取', 'pending-validation': '待校验', 'pending-routing': '待分仓',
  'pending-dispatch': '待下发', 'warehouse-accepted': '云仓已接单', picking: '拣货中',
  packed: '已打包', shipped: '已出库', 'pending-ozon-sync': '待同步 Ozon',
  completed: '已完成', cancelled: '已取消', exception: '异常',
};

export const NEXT_STATUS: Partial<Record<FulfillmentStatus, FulfillmentStatus>> = {
  'warehouse-accepted': 'picking', picking: 'packed', packed: 'shipped',
  shipped: 'pending-ozon-sync', 'pending-ozon-sync': 'completed',
};

export function Status({ status }: { status: FulfillmentStatus }) {
  const tone: StatusTone = status === 'completed' ? 'success' : status === 'exception' ? 'danger'
    : status === 'cancelled' ? 'neutral' : ['warehouse-accepted', 'picking', 'packed', 'shipped'].includes(status) ? 'info' : 'warning';
  return <StatusTag tone={tone}>{STATUS_LABEL[status]}</StatusTag>;
}

export function visibleOrders(orders: Order[], storeId: string, warehouseId: string) {
  return orders.filter((order) => (storeId === 'all' || order.storeId === storeId)
    && (warehouseId === 'all' || order.assignedWarehouseId === warehouseId));
}

export const rub = (value: number) => `${new Intl.NumberFormat('zh-CN').format(value)} ₽`;

export function zonedDate(iso: string) {
  const offset = iso.match(/([+-])(\d{2}):(\d{2})$/);
  const zone = offset ? `UTC${offset[1]}${Number(offset[2])}${offset[3] === '00' ? '' : `:${offset[3]}`}` : 'UTC';
  const local = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return local ? `${local[1]}-${local[2]}-${local[3]} ${local[4]}:${local[5]}（${zone}）` : `${iso}（${zone}）`;
}
