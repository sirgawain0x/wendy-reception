// src/wendy/agents/orchestrator.ts
// Agent orchestrator — determines which agent should handle a request.
// Flow: incoming → intent classification → agent selection → tool selection → model routing → response

import type { Agent, AgentResponse } from './base';
import type { AgentRegistry } from './registry';
import type { AgentContext } from '../runtime/context';
import type { Message, TaskType, HandoffReason } from '../types';
import type { ModelGateway } from '../models/gateway';
import type { AuditLogger } from '../audit/logger';
import type { ToolRegistry } from '../tools/registry';

interface IntentResult {
  task_type: TaskType;
  agent_name: string;
  confidence: number;
  is_handoff: boolean;
  handoff_reason?: HandoffReason;
}

export class AgentOrchestrator {
  private registry: AgentRegistry;
  private gateway: ModelGateway;
  private audit: AuditLogger;
  private tools: ToolRegistry;

  constructor(
    registry: AgentRegistry,
    gateway: ModelGateway,
    tools: ToolRegistry,
    audit: AuditLogger,
  ) {
    this.registry = registry;
    this.gateway = gateway;
    this.audit = audit;
    this.tools = tools;
  }

  /**
   * Process an incoming message:
   * 1. Classify intent
   * 2. Select agent
   * 3. Agent handles the conversation
   * 4. Return response
   */
  async process(ctx: AgentContext, messages: Message[]): Promise<AgentResponse> {
    // 1. Classify intent
    const intent = await this.classifyIntent(ctx, messages);

    // 2. Check for safety handoff
    if (intent.is_handoff) {
      const agent = this.registry.getDefault()!;
      return {
        content:
          'I want to make sure you get the right information. Let me connect you with someone from the office.',
        confidence: {
          intent_confidence: intent.confidence,
          tool_confidence: 1.0,
          response_confidence: 1.0,
          policy_decision: 'handoff',
        },
        handoff: {
          conversation_id: ctx.conversationId,
          tenant_id: ctx.tenant.tenant_id,
          office_id: ctx.tenant.office_id,
          reason: intent.handoff_reason!,
          summary: messages[messages.length - 1]?.content ?? '',
          urgency: intent.handoff_reason === 'emergency' ? 'emergency' : 'medium',
        },
      };
    }

    // 3. Select agent
    const agent = this.registry.get(intent.agent_name) ?? this.registry.getDefault();

    if (!agent) {
      throw new Error('No agent available to handle request');
    }

    // 4. Agent handles the conversation
    const response = await agent.handle(ctx, messages);

    // 5. Audit
    this.audit.log({
      timestamp: new Date().toISOString(),
      tenant_id: ctx.tenant.tenant_id,
      office_id: ctx.tenant.office_id,
      agent_id: agent.name,
      conversation_id: ctx.conversationId,
      task_type: intent.task_type,
      model_route: response.handoff ? 'handoff' : 'agent',
      tool: response.tool_calls_made?.join(','),
      policy_decision: response.handoff ? 'handoff' : 'processed',
      success: true,
    });

    return response;
  }

  /**
   * Classify the intent of the latest message.
   * Uses the model gateway for classification.
   */
  private async classifyIntent(ctx: AgentContext, messages: Message[]): Promise<IntentResult> {
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage || lastMessage.role !== 'user') {
      return {
        task_type: 'simple_conversation',
        agent_name: 'receptionist',
        confidence: 0.5,
        is_handoff: false,
      };
    }

    const text = lastMessage.content;

    // Rule-based safety checks first (fast, deterministic)

    // Clinical/medical question → handoff
    if (this.isClinicalQuestion(text)) {
      return {
        task_type: 'simple_conversation',
        agent_name: 'receptionist',
        confidence: 0.95,
        is_handoff: true,
        handoff_reason: 'clinical_question',
      };
    }

    // Frustrated patient → handoff
    if (this.isFrustrated(text)) {
      return {
        task_type: 'simple_conversation',
        agent_name: 'receptionist',
        confidence: 0.8,
        is_handoff: true,
        handoff_reason: 'frustrated_patient',
      };
    }

    // Billing disputes → handoff
    if (/billing|charge|charged|refund|overcharged|invoice/i.test(text)) {
      return {
        task_type: 'simple_conversation',
        agent_name: 'receptionist',
        confidence: 0.7,
        is_handoff: true,
        handoff_reason: 'billing_dispute',
      };
    }

    // Rule-based intent classification (fast path)

    // Scheduling intents
    if (this.isSchedulingIntent(text)) {
      return {
        task_type: 'appointment_scheduling',
        agent_name: 'scheduling',
        confidence: 0.85,
        is_handoff: false,
      };
    }

    // FAQ/knowledge intents
    if (this.isFAQIntent(text)) {
      return {
        task_type: 'faq',
        agent_name: 'knowledge',
        confidence: 0.8,
        is_handoff: false,
      };
    }

    // Default: receptionist handles general conversation
    return {
      task_type: 'simple_conversation',
      agent_name: 'receptionist',
      confidence: 0.7,
      is_handoff: false,
    };
  }

  // ─── Intent detection helpers ──────────────────────────────────

  private isClinicalQuestion(text: string): boolean {
    const patterns = [
      /pain/i, /hurt/i, /bleeding/i, /swelling/i, /infec/i, /sick/i,
      /fever/i, /dizzy/i, /numb/i, /emergency/i, /urgent/i,
      /what should i (do|take)/i, /diagnos/i, /prescri/i, /treat/i,
      /medicine/i, /medication/i, /dosage/i, /side effect/i,
      /allerg/i, /reaction/i, /symptom/i, /condition/i,
      /how (long|much).* (recover|heal|wait)/i,
    ];
    return patterns.some((p) => p.test(text));
  }

  private isFrustrated(text: string): boolean {
    const patterns = [
      /ridiculous/i, /unacceptable/i, /terrible/i, /awful/i, /worst/i,
      /angry/i, /frustrated/i, /fed up/i, /done with/i, /cancel everything/i,
      /sue/i, /complain/i, /manager/i, /supervisor/i, /!{3,}/i,
    ];
    return patterns.some((p) => p.test(text));
  }

  private isSchedulingIntent(text: string): boolean {
    const patterns = [
      /appoint/i, /schedul/i, /book/i, /reschedul/i, /cancel/i,
      /move.*appoint/i, /change.*appoint/i, /availab/i, /open slot/i,
      /next available/i, /earliest/i, /slot/i, /when can/i,
    ];
    return patterns.some((p) => p.test(text));
  }

  private isFAQIntent(text: string): boolean {
    const patterns = [
      /hours/i, /open/i, /close/i, /location/i, /address/i, /where/i,
      /phone number/i, /insurance/i, /accept/i, /cover/i,
      /service/i, /offer/i, /do you/i, /cost/i, /price/i, /fee/i,
      /parking/i, /directions/i, /policy/i, /new patient/i,
    ];
    return patterns.some((p) => p.test(text));
  }
}