// src/wendy/tools/knowledge.ts
// Knowledge base tool — retrieve office-specific information.

import { BaseTool } from './base';
import type { ToolCallParams } from './base';
import type { KnowledgeDocument } from '../types';

// ─── Knowledge Backend Interface ─────────────────────────────────

export interface KnowledgeBackend {
  search(
    tenantId: string,
    officeId: string,
    query: string,
    category?: string,
  ): Promise<KnowledgeDocument[]>;
}

// ─── Search Knowledge Base ───────────────────────────────────────

export class SearchKnowledgeBaseTool extends BaseTool {
  name = 'search_knowledge_base';
  description = 'Search the office knowledge base for information like hours, services, insurance, location, policies, and pricing.';
  parameters = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The question or search query' },
      category: {
        type: 'string',
        description: 'Category filter (e.g. hours, services, insurance, location, policies)',
      },
    },
    required: ['query'],
  };

  constructor(private backend: KnowledgeBackend) {
    super();
  }

  protected async run(params: ToolCallParams): Promise<KnowledgeDocument[]> {
    return this.backend.search(
      params.tenant_id,
      params.office_id,
      params.arguments.query as string,
      params.arguments.category as string | undefined,
    );
  }
}

// ─── Get Office Hours ────────────────────────────────────────────

export class GetOfficeHoursTool extends BaseTool {
  name = 'get_office_hours';
  description = 'Get the current office hours including today\'s schedule.';
  parameters = {
    type: 'object',
    properties: {},
    required: [],
  };

  constructor(private backend: KnowledgeBackend) {
    super();
  }

  protected async run(params: ToolCallParams): Promise<KnowledgeDocument[]> {
    return this.backend.search(
      params.tenant_id,
      params.office_id,
      'office hours schedule',
      'hours',
    );
  }
}