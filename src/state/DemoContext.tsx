import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import React from 'react';
import { demoReducer } from '../domain/reducer';
import { createSeedState } from '../domain/seed';
import type { DemoAction, DemoState } from '../domain/types';
import {
  ozonAdapter as defaultOzonAdapter,
  type DemoLabel,
  type OzonAdapter,
} from '../integrations/ozonAdapter';
import {
  warehouseAdapter as defaultWarehouseAdapter,
  type OutboundResult,
  type WarehouseAdapter,
} from '../integrations/warehouseAdapter';

export const DEMO_STORAGE_KEY = 'ozon-cloud-demo-v1';
/** 自动驾驶会连续产生提示，只保留最近几条，避免堆满屏幕。 */
const MAX_TOASTS = 3;

export type DemoRole = 'admin' | 'operator' | 'warehouse';
export type ToastTone = 'success' | 'error' | 'info';

export interface ToastEvent {
  id: string;
  tone: ToastTone;
  message: string;
}

export interface DemoStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type DemoCommand = DemoAction | { type: 'GET_LABEL'; orderId: string } | { type: 'SYNC_TO_OZON'; orderId: string; fail?: boolean };

export interface CommandResult<T = unknown> {
  ok: boolean;
  message: string;
  data?: T;
  error?: { code: string; message: string };
}

export interface DemoSnapshot {
  state: DemoState;
  role: DemoRole;
  toasts: ToastEvent[];
}

export interface DemoRuntime {
  getSnapshot(): DemoSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch: Dispatch<DemoAction>;
  runCommand(command: DemoCommand): Promise<CommandResult<DemoLabel | OutboundResult>>;
  setRole(role: DemoRole): void;
  dismissToast(id: string): void;
  resetDemo(): Promise<CommandResult>;
}

export interface CreateDemoRuntimeOptions {
  initialRole?: DemoRole;
  initialState?: DemoState;
  storage?: DemoStorage;
  ozon?: OzonAdapter;
  warehouse?: WarehouseAdapter;
}

interface StoredDemo {
  state: DemoState;
  role: DemoRole;
}

function browserStorage(): DemoStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function isDemoState(value: unknown): value is DemoState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<DemoState>;
  return [
    state.stores,
    state.warehouses,
    state.products,
    state.orders,
    state.skuMappings,
    state.inventory,
    state.returns,
    state.tasks,
    state.auditLogs,
  ].every(Array.isArray);
}

function isDemoRole(value: unknown): value is DemoRole {
  return value === 'admin' || value === 'operator' || value === 'warehouse';
}

function readStoredDemo(storage: DemoStorage | undefined): StoredDemo | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<StoredDemo>;
    if (!isDemoState(parsed.state)) return undefined;
    const defaults = createSeedState();
    const storedSettings = parsed.state.settings as Partial<DemoState['settings']> | undefined;
    const inventorySyncMinutes = storedSettings && [5, 15, 30, 60].includes(storedSettings.inventorySyncMinutes ?? 0)
      ? storedSettings.inventorySyncMinutes as DemoState['settings']['inventorySyncMinutes']
      : defaults.settings.inventorySyncMinutes;
    const autoRouteEnabled = typeof storedSettings?.autoRouteEnabled === 'boolean'
      ? storedSettings.autoRouteEnabled
      : defaults.settings.autoRouteEnabled;
    return {
      state: { ...parsed.state, settings: { inventorySyncMinutes, autoRouteEnabled } },
      role: isDemoRole(parsed.role) ? parsed.role : 'admin',
    };
  } catch {
    return undefined;
  }
}

function errorDetails(error: unknown): { code: string; message: string } {
  if (error instanceof Error) {
    const code = 'code' in error && typeof error.code === 'string' ? error.code : 'COMMAND_FAILED';
    return { code, message: error.message };
  }
  return { code: 'COMMAND_FAILED', message: '演示操作失败，请重试' };
}

function successMessage(command: DemoCommand): string {
  switch (command.type) {
    case 'RESET':
    case 'RESET_DEMO': return '演示数据已重置';
    case 'GET_LABEL': return '演示面单已生成';
    case 'DISPATCH_ORDER': return '出库任务已提交';
    case 'RETRY_TASK': return '重试成功';
    case 'UPDATE_SETTINGS': return '设置已保存到本机';
    case 'UPDATE_STORE_CONNECTION': return '店铺授权状态已更新';
    case 'SYNC_TO_OZON': return '已回写 Ozon 发货与运单';
    default: return '演示操作已完成';
  }
}

function warehouseForbidden(command: DemoCommand): boolean {
  return ['SET_SAFETY_STOCK', 'SYNC_INVENTORY', 'REPAIR_MAPPING', 'REPAIR_SKU_MAPPING', 'DISPATCH_ORDER'].includes(command.type);
}

function requiresAdmin(command: DemoCommand): boolean {
  return ['UPDATE_SETTINGS', 'UPDATE_STORE_CONNECTION', 'UPDATE_WAREHOUSE_CONFIG', 'RESET', 'RESET_DEMO'].includes(command.type);
}

export function createDemoRuntime(options: CreateDemoRuntimeOptions = {}): DemoRuntime {
  const storage = options.storage ?? browserStorage();
  const persisted = readStoredDemo(storage);
  const ozon = options.ozon ?? defaultOzonAdapter;
  const warehouse = options.warehouse ?? defaultWarehouseAdapter;
  const listeners = new Set<() => void>();
  let toastSequence = 0;
  let mutationQueue: Promise<void> = Promise.resolve();
  let snapshot: DemoSnapshot = {
    state: options.initialState ?? persisted?.state ?? createSeedState(),
    role: options.initialRole ?? persisted?.role ?? 'admin',
    toasts: [],
  };

  const emit = () => listeners.forEach((listener) => listener());
  const persist = () => {
    if (!storage) return;
    try {
      storage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ state: snapshot.state, role: snapshot.role }));
    } catch {
      // Demo operation state remains available in memory when browser storage is unavailable.
    }
  };
  const addToast = (tone: ToastTone, message: string) => {
    toastSequence += 1;
    snapshot = {
      ...snapshot,
      toasts: [...snapshot.toasts, { id: `toast-${toastSequence}`, tone, message }].slice(-MAX_TOASTS),
    };
    emit();
  };
  const commitState = (state: DemoState) => {
    if (state === snapshot.state) return;
    snapshot = { ...snapshot, state };
    persist();
    emit();
  };
  const dispatch = (action: DemoAction) => {
    if ((requiresAdmin(action) && snapshot.role !== 'admin') || (warehouseForbidden(action) && snapshot.role === 'warehouse')) {
      addToast('error', '仅管理员可执行此操作');
      return;
    }
    commitState(demoReducer(snapshot.state, action));
  };

  const commandFailure = <T = never,>(code: string, message: string): CommandResult<T> => {
    addToast('error', message);
    return { ok: false, message, error: { code, message } };
  };

  const commandSuccess = <T = never,>(message: string, data?: T, tone: ToastTone = 'success'): CommandResult<T> => {
    addToast(tone, message);
    return data === undefined ? { ok: true, message } : { ok: true, message, data };
  };

  const runDispatchCommand = async (
    command: Extract<DemoAction, { type: 'DISPATCH_ORDER' }>,
  ): Promise<CommandResult<OutboundResult>> => {
    const currentState = snapshot.state;
    const order = currentState.orders.find((candidate) => candidate.id === command.orderId);
    if (!order) {
      return commandFailure('DISPATCH_ORDER_NOT_FOUND', '未找到对应的演示订单');
    }

    if (!snapshot.state.settings.autoRouteEnabled && command.manualOverride !== true) {
      return commandFailure('AUTO_ROUTE_DISABLED', '自动仓库路由已关闭，请手工选择云仓');
    }

    if (currentState.tasks.some((task) => task.idempotencyKey === `outbound:${command.orderId}`)) {
      return commandSuccess<OutboundResult>('该订单已存在出库任务，无需重复提交', undefined, 'info');
    }

    const candidateState = demoReducer(currentState, command);
    const candidateOrder = candidateState.orders.find((item) => item.id === command.orderId);
    const createdOutbound = candidateState.tasks.some((task) =>
      task.kind === 'outbound'
        && task.orderId === command.orderId
        && !currentState.tasks.some((previousTask) => previousTask.id === task.id),
    );

    if (!createdOutbound) {
      commitState(candidateState);
      if (candidateOrder?.exceptionReason === 'mapping') {
        return commandFailure('DISPATCH_BLOCKED_MAPPING', 'SKU 未映射，无法创建出库任务');
      }
      if (candidateOrder?.exceptionReason === 'stock') {
        return commandFailure('DISPATCH_BLOCKED_STOCK', '可售库存不足，无法创建出库任务');
      }
      return commandFailure('DISPATCH_NOT_ALLOWED', '当前订单状态不允许创建出库任务');
    }

    const label = await ozon.getLabel(command.orderId);
    if (snapshot.role === 'warehouse') return commandFailure('DISPATCH_FORBIDDEN', '仓库人员不能下发订单');
    const data = await warehouse.createOutbound(command.orderId, label);
    commitState(demoReducer(snapshot.state, { ...command, labelReference: label.previewUrl }));
    return commandSuccess('出库任务已提交', data);
  };

  const runRetryCommand = async (
    command: Extract<DemoAction, { type: 'RETRY_TASK' }>,
  ): Promise<CommandResult<DemoLabel | OutboundResult>> => {
    if (snapshot.role === 'warehouse') {
      return commandFailure('RETRY_FORBIDDEN', '仓库人员仅可查看异常任务');
    }
    const task = snapshot.state.tasks.find((candidate) => candidate.id === command.taskId);
    if (!task || task.status !== 'failed' || !task.retryable) {
      return commandFailure('RETRY_NOT_ELIGIBLE', '该任务当前不可重试');
    }
    if (!task.orderId || (task.kind !== 'outbound' && task.kind !== 'label')) {
      return commandFailure('RETRY_UNSUPPORTED', '该任务需要先完成业务修复');
    }

    const data = task.kind === 'outbound'
      ? await warehouse.createOutbound(task.orderId)
      : await ozon.getLabel(task.orderId);
    const candidate = demoReducer(snapshot.state, command);
    const completed = candidate.tasks.find((item) => item.id === task.id);
    if (candidate === snapshot.state || completed?.status !== 'succeeded') {
      return commandFailure('RETRY_NOT_COMPLETED', '重新执行未完成，请检查业务条件');
    }
    commitState(candidate);
    return commandSuccess(successMessage(command), data);
  };

  const executeCommand = async (
    command: DemoCommand,
  ): Promise<CommandResult<DemoLabel | OutboundResult>> => {
    try {
      if ((requiresAdmin(command) && snapshot.role !== 'admin') || (warehouseForbidden(command) && snapshot.role === 'warehouse')) {
        return commandFailure('ADMIN_REQUIRED', '仅管理员可执行此操作');
      }
      if (command.type === 'GET_LABEL') {
        const data = await ozon.getLabel(command.orderId);
        return commandSuccess(successMessage(command), data);
      }
      if (command.type === 'DISPATCH_ORDER') return await runDispatchCommand(command);
      if (command.type === 'SYNC_TO_OZON') {
        const order = snapshot.state.orders.find((item) => item.id === command.orderId);
        if (!order || order.status !== 'pending-ozon-sync') return commandFailure('SYNC_NOT_READY', '订单尚未出库，不能回写 Ozon');
        const trackingNumber = order.packages?.find((item) => item.waybillNo)?.waybillNo;
        const endpoint = order.fulfillmentType === 'rFBS' ? '/v2/fbs/posting/tracking-number/set' : '/v4/posting/fbs/ship';
        const at = new Date().toISOString();
        if (command.fail) {
          commitState(demoReducer(snapshot.state, { type: 'RECORD_OZON_SYNC', orderId: order.id, endpoint, ok: false, at, error: 'POSTING_ALREADY_SHIPPED 或参数校验失败（模拟）' }));
          return commandFailure('OZON_SYNC_FAILED', '回写 Ozon 失败，已进入异常队列');
        }
        commitState(demoReducer(snapshot.state, { type: 'RECORD_OZON_SYNC', orderId: order.id, endpoint, ok: true, trackingNumber, at }));
        return commandSuccess(successMessage(command));
      }
      if (command.type === 'RETRY_TASK') return await runRetryCommand(command);
      if (command.type === 'SET_PRODUCT_PRICES') {
        if (!command.updates.length) return commandFailure('PRICE_TARGET_EMPTY', '没有可调价的商品');
        const valid = command.updates.every((update) => snapshot.state.products.some((product) => product.id === update.productId)
          && Number.isSafeInteger(update.priceRub) && update.priceRub >= 1
          && (update.promotionPriceRub === undefined || (Number.isSafeInteger(update.promotionPriceRub) && update.promotionPriceRub >= 1 && update.promotionPriceRub < update.priceRub)));
        if (!valid) return commandFailure('PRICE_INVALID', '价格须为至少 1 卢布的整数，活动价须低于日常价');
        const candidate = demoReducer(snapshot.state, command);
        if (candidate === snapshot.state) return commandFailure('PRICE_NO_CHANGE', '商品价格没有变化');
        commitState(candidate);
        return commandSuccess(successMessage(command));
      }
      if (command.type === 'SYNC_INVENTORY' && !command.inventoryIds.some((id) => snapshot.state.inventory.some((record) => record.id === id))) {
        return commandFailure('INVENTORY_TARGET_EMPTY', '没有可同步的库存');
      }

      const candidate = demoReducer(snapshot.state, command);
      if (candidate === snapshot.state) return commandFailure('COMMAND_NOT_APPLIED', '操作未生效，请检查当前状态和选择项');
      commitState(candidate);
      if (command.type === 'RESET' || command.type === 'RESET_DEMO') snapshot = { ...snapshot, toasts: [] };
      return commandSuccess(successMessage(command));
    } catch (error) {
      const details = errorDetails(error);
      return commandFailure(details.code, details.message);
    }
  };

  const enqueueMutation = <T,>(operation: () => Promise<T>): Promise<T> => {
    const result = mutationQueue.then(operation);
    mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  };

  const runtime: DemoRuntime = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch,
    runCommand(command) {
      if (command.type === 'GET_LABEL') return executeCommand(command);
      return enqueueMutation(() => executeCommand(command));
    },
    setRole(role) {
      if (role === snapshot.role) return;
      snapshot = { ...snapshot, role };
      persist();
      emit();
    },
    dismissToast(id) {
      const toasts = snapshot.toasts.filter((toast) => toast.id !== id);
      if (toasts.length === snapshot.toasts.length) return;
      snapshot = { ...snapshot, toasts };
      emit();
    },
    resetDemo() {
      return runtime.runCommand({ type: 'RESET_DEMO' });
    },
  };

  return runtime;
}

export interface DemoContextValue extends DemoSnapshot {
  dispatch: Dispatch<DemoAction>;
  runCommand: DemoRuntime['runCommand'];
  setRole: DemoRuntime['setRole'];
  dismissToast: DemoRuntime['dismissToast'];
  resetDemo: DemoRuntime['resetDemo'];
}

export interface DemoProviderProps {
  children: ReactNode;
  initialRole?: DemoRole;
  initialState?: DemoState;
}

const DemoContext = createContext<DemoContextValue | undefined>(undefined);

export function DemoProvider({ children, initialRole, initialState }: DemoProviderProps) {
  const runtimeRef = useRef<DemoRuntime | null>(null);
  if (!runtimeRef.current) {
    runtimeRef.current = createDemoRuntime({ initialRole, initialState });
  }
  const runtime = runtimeRef.current;
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  const value = useMemo<DemoContextValue>(() => ({
    ...snapshot,
    dispatch: runtime.dispatch,
    runCommand: runtime.runCommand,
    setRole: runtime.setRole,
    dismissToast: runtime.dismissToast,
    resetDemo: runtime.resetDemo,
  }), [runtime, snapshot]);

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const value = useContext(DemoContext);
  if (!value) throw new Error('useDemo 必须在 DemoProvider 内使用');
  return value;
}
