// src/wendy/runtime/context.ts
// AgentContext — passed to every agent invocation.

import type { TenantContext, Channel } from '../types';
import type { OfficeConfig } from '../config/schema';

export interface AgentContext {
  tenant: TenantContext;
  conversationId: string;
  channel: Channel;
  officeConfig: OfficeConfig | null;
  metadata: Record<string, unknown>;
}