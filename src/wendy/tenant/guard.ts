// src/wendy/tenant/guard.ts
// Tenant access guard — enforces isolation at the data layer.
// Every database query must pass through this guard.

import type { TenantContext } from '../types';

export class TenantGuard {
  /**
   * Assert that a resource belongs to the requesting tenant.
   * Throws if there's a mismatch.
   */
  static assertAccess(tenant: TenantContext, resourceTenantId: string, resourceOfficeId: string): void {
    if (tenant.tenant_id !== resourceTenantId) {
      throw new Error(
        `Tenant isolation violation: tenant ${tenant.tenant_id} cannot access resource belonging to tenant ${resourceTenantId}`,
      );
    }
    if (tenant.office_id !== resourceOfficeId) {
      throw new Error(
        `Office isolation violation: office ${tenant.office_id} cannot access resource belonging to office ${resourceOfficeId}`,
      );
    }
  }

  /**
   * Create a tenant-scoped query filter.
   * All database queries MUST include this filter.
   */
  static scopedFilter(tenant: TenantContext): { tenant_id: string; office_id: string } {
    return {
      tenant_id: tenant.tenant_id,
      office_id: tenant.office_id,
    };
  }

  /**
   * Validate that a list of resources all belong to the requesting tenant.
   */
  static validateBatch(tenant: TenantContext, resources: Array<{ tenant_id: string; office_id: string }>): boolean {
    return resources.every(
      (r) => r.tenant_id === tenant.tenant_id && r.office_id === tenant.office_id,
    );
  }
}