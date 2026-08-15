// src/wendy/agents/receptionist.ts
// Receptionist Agent — the first production agent.
// Handles greetings, intent detection, FAQs, basic scheduling, and human handoff.

import { BaseAgent, type AgentResponse, type AgentDependencies } from './base';
import type { AgentContext } from '../runtime/context';
import type { Message, TaskType } from '../types';
import type { ModelRequest } from '../models/request';

export class ReceptionistAgent extends BaseAgent {
  name = 'receptionist';
  description = 'Front-desk AI receptionist: greets patients, determines intent, answers basic FAQs, schedules appointments, and escalates to human staff when needed.';
  capabilities = [
    'simple_conversation',
    'faq',
    'appointment_scheduling',
  ];
  allowed_tools = [
    'get_office_hours',
    'search_knowledge_base',
    'get_calendar_availability',
    'create_appointment',
    'reschedule_appointment',
    'cancel_appointment',
    'send_sms',
    'handoff_to_human',
  ];

  protected buildSystemPrompt(ctx: AgentContext): string {
    const officeName = ctx.officeConfig?.name ?? 'our office';
    return `You are Wendy, the AI receptionist for ${officeName}. You are professional, friendly, and helpful.

Your role:
- Greet patients and determine what they need
- Answer questions about office hours, services, insurance, and location
- Help schedule, reschedule, or cancel appointments
- Collect basic patient information when needed
- Escalate to human staff when appropriate

Important rules:
- NEVER diagnose, prescribe, or provide medical/dental advice
- NEVER make up office policies — if you don't know, say so and offer to connect to staff
- For any clinical/medical questions, immediately escalate to human staff
- For billing disputes or frustrated patients, escalate to human staff
- Always be respectful and patient
- Keep responses concise and natural for voice/text conversation
- If you are unsure about anything, escalate to human staff

Office: ${officeName}
Timezone: ${ctx.officeConfig?.timezone ?? 'America/New_York'}`;
  }

  async handle(ctx: AgentContext, messages: Message[]): Promise<AgentResponse> {
    const systemPrompt = this.buildSystemPrompt(ctx);

    // Check for safety boundaries first
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMessage) {
      if (this.isClinicalQuestion(lastUserMessage.content)) {
        return {
          content:
            'I want to make sure you get the right information. Let me connect you with someone from the office.',
          confidence: {
            intent_confidence: 0.95,
            tool_confidence: 1.0,
            response_confidence: 1.0,
            policy_decision: 'handoff:clinical_question',
          },
          handoff: this.createHandoff(ctx, 'clinical_question', lastUserMessage.content, 'high'),
        };
      }

      if (this.isFrustratedPatient(lastUserMessage.content)) {
        return {
          content:
            "I understand your frustration, and I want to make sure this gets resolved properly. Let me connect you with someone from the office who can help.",
          confidence: {
            intent_confidence: 0.85,
            tool_confidence: 1.0,
            response_confidence: 1.0,
            policy_decision: 'handoff:frustrated_patient',
          },
          handoff: this.createHandoff(ctx, 'frustrated_patient', lastUserMessage.content, 'medium'),
        };
      }
    }

    // Build model request
    const request: ModelRequest = {
      tenant_id: ctx.tenant.tenant_id,
      office_id: ctx.tenant.office_id,
      agent_id: this.name,
      conversation_id: ctx.conversationId,
      task_type: 'simple_conversation',
      complexity: 'low',
      privacy_level: 'phi',
      latency_requirement: 'realtime',
      context: systemPrompt,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      tools: this.tools.getDefinitionsForAgent(this.allowed_tools),
      max_tokens: 256,
      temperature: 0.7,
    };

    const response = await this.gateway.complete(request);

    return {
      content: response.content,
      confidence: {
        intent_confidence: 0.8,
        tool_confidence: 0.8,
        response_confidence: response.error ? 0.3 : 0.85,
        policy_decision: response.error ? 'error' : 'processed',
      },
      tool_calls_made: response.tool_calls?.map((tc) => tc.function.name),
    };
  }
}