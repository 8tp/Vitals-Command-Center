import { useHealthStore } from '../stores/healthStore.js';

export function useDeviceStatus() {
  const ds = useHealthStore((s) => s.deviceStatus);
  return ds;
}
