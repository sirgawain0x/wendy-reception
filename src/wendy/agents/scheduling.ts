// src/wendy/agents/scheduling.ts
// Scheduling Agent — handles appointment check, book, reschedule, cancel.

import { BaseAgent, type AgentResponse, type AgentDependencies } from './base';
import type { AgentContext } from '../runtime/context';
import type { Message } from '../types';
import type { ModelRequest } from '../models/request';

export class SchedulingAgent extends BaseAgent {
  name = 'scheduling';
  description = 'Appointment scheduling agent: checks calendar availability, books, reschedules, and cancels appointments.';
  capabilities = ['appointment_scheduling'];
  allowed_tools = [
    'get_calendar_availability',
    'create_appointment',
    'reschedule_appointment',
    'cancel_appointment',
    'send_sms',
  ];

  protected buildSystemPrompt(ctx: AgentContext): string {
    const officeName = ctx.officeConfig?.name ?? 'our office';
    const timezone = ctx.officeConfig?.timezone ?? 'America/New_York';
    return `You are Wendy, the scheduling assistant for ${officeName}.

Your role:
- Check calendar availability when patients ask about open slots
- Book new appointments with all required information
- Reschedule existing appointments
- Cancel appointments when requested
- Confirm appointment details with the patient

Important rules:
- Always confirm the patient's name and phone number before booking
- Always confirm the date and time with the patient before finalizing
- If you cannot find availability, suggest the nearest alternative
- Never make up availability — always check the calendar first
- If the calendar tool fails, let the patient know and offer to have staff call back
- Keep responses concise and clear

Office timezone: ${timezone}`;
  }

  async handle(ctx: AgentContext, messages: Message[]): Promise<AgentResponse> {
    const systemPrompt = this.buildSystemPrompt(ctx);

    const request: ModelRequest = {
      tenant_id: ctx.tenant.tenant_id,
      office_id: ctx.tenant.office_id,
      agent_id: this.name,
      conversation_id: ctx.conversationId,
      task_type: 'appointment_scheduling',
      complexity: 'medium',
      privacy_level: 'phi',
      latency_requirement: 'realtime',
      context: systemPrompt,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      tools: this.tools.getDefinitionsForAgent(this.allowed_tools),
      max_tokens: 512,
      temperature: 0.5,
    };

    const response = await this.gateway.complete(request);

    // Check for tool call failures
    const toolCalls = response.tool_calls?.map((tc) => tc.function.name) ?? [];
    const hasError = !!response.error;

    return {
      content: response.content,
      confidence: {
        intent_confidence: 0.85,
        tool_confidence: hasError ? 0.3 : 0.9,
        response_confidence: hasError ? 0.3 : 0.85,
        policy_decision: hasError ? 'error' : 'processed',
      },
      tool_calls_made: toolCalls,
      handoff: hasError
        ? this.createHandoff(
            ctx,
            'tool_unavailable',
            'Scheduling tool failed — patient needs staff assistance',
            'medium',
          )
        : undefined,
    };
  }
}