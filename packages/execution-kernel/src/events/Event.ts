import { generateId } from "../shared/ids";

export interface KernelEvent<T = any> {
  id: string;
  type: string;
  timestamp: number;
  source: string;
  payload: T;
  metadata?: Record<string, any>;
}

export function createKernelEvent<T = any>(
  type: string,
  source: string,
  payload: T,
  metadata?: Record<string, any>
): KernelEvent<T> {
  return {
    id: generateId("event"),
    type,
    timestamp: Date.now(),
    source,
    payload,
    metadata,
  };
}
