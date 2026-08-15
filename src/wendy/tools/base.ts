// src/wendy/tools/base.ts
// Tool interface — the common contract for all Wendy tools.
// Tools enforce authorization, input validation, tenant isolation, and audit logging.

import type { TenantContext, ToolResult } from '../types';

export interface ToolCallParams {
  tenant_id: string;
  office_id: string;
  conversation_id: string;
  arguments: Record<string, unknown>;
}

export interface Tool {
  /** Unique tool name */
  name: string;

  /** Human-readable description (sent to model) */
  description: string;

  /** JSON Schema for parameters (sent to model) */
  parameters: Record<string, unknown>;

  /**
   * Execute the tool with validated, tenant-scoped parameters.
   * Must never access data outside the provided tenant context.
   */
  execute(params: ToolCallParams): Promise<ToolResult>;
}

// ─── Base Tool ───────────────────────────────────────────────────

export abstract class BaseTool implements Tool {
  abstract name: string;
  abstract description: string;
  abstract parameters: Record<string, unknown>;

  async execute(params: ToolCallParams): Promise<ToolResult> {
    try {
      // Validate required parameters
      this.validateParams(params.arguments);

      // Execute the tool's actual logic
      const result = await this.run(params);

      return {
        tool_call_id: '', // set by caller
        result,
        success: true,
      };
    } catch (err) {
      return {
        tool_call_id: '',
        result: null,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Subclasses implement this */
  protected abstract run(params: ToolCallParams): Promise<unknown>;

  /**
   * Validate that all required parameters are present.
   */
  protected validateParams(args: Record<string, unknown>): void {
    const required = (this.parameters.required as string[]) || [];
    for (const key of required) {
      if (!(key in args)) {
        throw new Error(`Missing required parameter: ${key}`);
      }
    }
  }

  /**
   * Assert tenant isolation — never allow cross-tenant access.
   */
  protected assertTenantScope(params: ToolCallParams, resourceTenantId: string): void {
    if (params.tenant_id !== resourceTenantId) {
      throw new Error(
        `Tenant isolation violation: request tenant ${params.tenant_id} cannot access resource belonging to tenant ${resourceTenantId}`,
      );
    }
  }
}