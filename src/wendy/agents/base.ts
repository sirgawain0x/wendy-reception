// src/wendy/agents/base.ts
// Agent interface — the common contract for all Wendy agents.

import type {
  TenantContext,
  Message,
  ConfidenceScores,
  HandoffRequest,
} from '../types';
import type { ModelGateway } from '../models/gateway';
import type { ToolRegistry } from '../tools/registry';
import type { AuditLogger } from '../audit/logger';
import type { AgentContext } from '../runtime/context';

export interface AgentResponse {
  content: string;
  confidence: ConfidenceScores;
  handoff?: HandoffRequest;
  tool_calls_made?: string[];
  needs_clarification?: boolean;
  clarification_question?: string;
}

export interface Agent {
  /** Unique agent name */
  name: string;

  /** Human-readable description */
  description: string;

  /** Capabilities this agent provides */
  capabilities: string[];

  /** Tools this agent is allowed to use */
  allowed_tools: string[];

  /**
   * Handle a conversation turn.
   * The agent receives context, uses tools as needed, and returns a response.
   */
  handle(ctx: AgentContext, messages: Message[]): Promise<AgentResponse>;
}

// ─── Base Agent ──────────────────────────────────────────────────

export abstract class BaseAgent implements Agent {
  abstract name: string;
  abstract description: string;
  abstract capabilities: string[];
  abstract allowed_tools: string[];

  protected gateway: ModelGateway;
  protected tools: ToolRegistry;
  protected audit: AuditLogger;

  constructor(deps: AgentDependencies) {
    this.gateway = deps.gateway;
    this.tools = deps.tools;
    this.audit = deps.audit;
  }

  abstract handle(ctx: AgentContext, messages: Message[]): Promise<AgentResponse>;

  /**
   * Check if the intent is a clinical/medical question that requires handoff.
   */
  protected isClinicalQuestion(text: string): boolean {
    const clinicalPatterns = [
      /pain/i, /hurt/i, /bleeding/i, /swelling/i, /infec/i, /sick/i,
      /fever/i, /dizzy/i, /numb/i, /emergency/i, /urgent/i,
      /what should i (do|take)/i, /diagnos/i, /prescri/i, /treat/i,
      /medicine/i, /medication/i, /dosage/i, /side effect/i,
      /allerg/i, /reaction/i, /symptom/i, /condition/i,
    ];
    return clinicalPatterns.some((p) => p.test(text));
  }

  /**
   * Check if the patient seems frustrated/angry.
   */
  protected isFrustratedPatient(text: string): boolean {
    const frustrationPatterns = [
      /ridiculous/i, /unacceptable/i, /terrible/i, /awful/i, /worst/i,
      /angry/i, /frustrated/i, /fed up/i, /done with/i, /cancel everything/i,
      /sue/i, /complain/i, /manager/i, /supervisor/i, /!{3,}/i,
    ];
    return frustrationPatterns.some((p) => p.test(text));
  }

  /**
   * Create a human handoff request.
   */
  protected createHandoff(
    ctx: AgentContext,
    reason: HandoffRequest['reason'],
    summary: string,
    urgency: HandoffRequest['urgency'] = 'medium',
  ): HandoffRequest {
    return {
      conversation_id: ctx.conversationId,
      tenant_id: ctx.tenant.tenant_id,
      office_id: ctx.tenant.office_id,
      reason,
      summary,
      urgency,
    };
  }

  /**
   * Build a system prompt for the agent.
   */
  protected abstract buildSystemPrompt(ctx: AgentContext): string;
}

// ─── Dependencies ────────────────────────────────────────────────

export interface AgentDependencies {
  gateway: ModelGateway;
  tools: ToolRegistry;
  audit: AuditLogger;
}