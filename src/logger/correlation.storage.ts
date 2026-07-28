// src/logger/correlation.storage.ts
// AsyncLocalStorage wrapper for per-request correlation IDs

import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
  correlationId: string;
  userId?: string;
  userRole?: string;
  ipAddress?: string;
  actionReason?: string;
}

export const correlationStorage = new AsyncLocalStorage<RequestContext>();

export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore()?.correlationId;
}
