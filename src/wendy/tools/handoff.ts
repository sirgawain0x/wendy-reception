// src/wendy/tools/handoff.ts
// Human handoff tool — connects patient to human staff.

import { BaseTool } from './base';
import type { ToolCallParams } from './base';
import type { HandoffRequest, HandoffReason } from '../types';

// ─── Handoff Backend Interface ───────────────────────────────────

export interface HandoffBackend {
  initiateHandoff(request: HandoffRequest): Promise<{ success: boolean; handoffId: string; message: string }>;
}

// ─── Handoff to Human ────────────────────────────────────────────

export class HandoffToHumanTool extends BaseTool {
  name = 'handoff_to_human';
  description = 'Escalate the conversation to human office staff. Use when the request involves clinical questions, emergencies, billing disputes, or situations requiring human judgment.';
  parameters = {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'Reason for handoff',
        enum: [
          'clinical_question',
          'emergency',
          'frustrated_patient',
          'billing_dispute',
          'uncertain_identity',
          'ambiguous_request',
          'model_uncertainty',
          'policy_violation',
          'repeated_failure',
          'tool_unavailable',
          'sensitive_request',
        ],
      },
      summary: { type: 'string', description: 'Summary of the conversation so far' },
      urgency: {
        type: 'string',
        description: 'Urgency level',
        enum: ['low', 'medium', 'high', 'emergency'],
      },
    },
    required: ['reason', 'summary'],
  };

  constructor(private backend: HandoffBackend) {
    super();
  }

  protected async run(params: ToolCallParams) {
    const request: HandoffRequest = {
      conversation_id: params.conversation_id,
      tenant_id: params.tenant_id,
      office_id: params.office_id,
      reason: params.arguments.reason as HandoffReason,
      summary: params.arguments.summary as string,
      urgency: (params.arguments.urgency as HandoffRequest['urgency']) || 'medium',
    };

    return this.backend.initiateHandoff(request);
  }
}