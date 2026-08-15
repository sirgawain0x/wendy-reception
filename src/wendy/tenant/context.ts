// src/wendy/tenant/context.ts
// Tenant context — extracted from every incoming request.
// Every request MUST have tenant_id and office_id.

import type { TenantContext } from '../types';

export interface AuthenticatedRequest {
  tenant: TenantContext;
  token: string;
  deviceId?: string;
}

export class TenantContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantContextError';
  }
}

/**
 * Extract tenant context from request headers.
 * Expected headers:
 *   X-Tenant-ID: the tenant identifier
 *   X-Office-ID: the office identifier
 *   X-Device-ID: the device identifier (for edge appliances)
 *   Authorization: Bearer <token>
 */
export function extractTenantContext(headers: Headers): AuthenticatedRequest {
  const tenantId = headers.get('x-tenant-id');
  const officeId = headers.get('x-office-id');
  const deviceId = headers.get('x-device-id');
  const authHeader = headers.get('authorization');

  if (!tenantId) {
    throw new TenantContextError('Missing X-Tenant-ID header');
  }
  if (!officeId) {
    throw new TenantContextError('Missing X-Office-ID header');
  }
  if (!authHeader?.startsWith('Bearer ')) {
    throw new TenantContextError('Missing or invalid Authorization header');
  }

  return {
    tenant: {
      tenant_id: tenantId,
      office_id: officeId,
      device_id: deviceId ?? undefined,
    },
    token: authHeader.substring(7),
    deviceId: deviceId ?? undefined,
  };
}