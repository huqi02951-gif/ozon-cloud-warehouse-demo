import type { DemoRole } from '../state/DemoContext';

export interface PageProps {
  storeId: string;
  warehouseId: string;
  role: DemoRole;
}
