// src/wendy/agents/knowledge.ts
// Knowledge Agent — retrieves office-specific information from the knowledge base.

import { BaseAgent, type AgentResponse, type AgentDependencies } from './base';
import type { AgentContext } from '../runtime/context';
import type { Message } from '../types';
import type { ModelRequest } from '../models/request';

export class KnowledgeAgent extends BaseAgent {
  name = 'knowledge';
  description = 'Knowledge/FAQ agent: answers questions about office hours, services, insurance, location, policies, and pricing using the office knowledge base.';
  capabilities = ['faq'];
  allowed_tools = [
    'search_knowledge_base',
    'get_office_hours',
  ];

  protected buildSystemPrompt(ctx: AgentContext): string {
    const officeName = ctx.officeConfig?.name ?? 'our office';
    return `You are Wendy, the information assistant for ${officeName}.

Your role:
- Answer questions about office hours, location, and contact info
- Explain services offered
- Provide insurance and payment policy information
- Share office policies (cancellation, late arrival, etc.)
- Give preparation instructions if they are in the knowledge base

Important rules:
- ONLY answer based on information from the knowledge base tools
- NEVER make up information — if it's not in the knowledge base, say you're not sure and offer to connect to staff
- NEVER provide medical/dental advice or clinical information
- Keep answers concise and directly address the question
- If the question is about something not in the knowledge base, escalate to human staff

You must ground every answer in retrieved knowledge base content.`;
  }

  async handle(ctx: AgentContext, messages: Message[]): Promise<AgentResponse> {
    const systemPrompt = this.buildSystemPrompt(ctx);

    const request: ModelRequest = {
      tenant_id: ctx.tenant.tenant_id,
      office_id: ctx.tenant.office_id,
      agent_id: this.name,
      conversation_id: ctx.conversationId,
      task_type: 'faq',
      complexity: 'low',
      privacy_level: 'public',
      latency_requirement: 'realtime',
      context: systemPrompt,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      tools: this.tools.getDefinitionsForAgent(this.allowed_tools),
      max_tokens: 256,
      temperature: 0.3, // Lower temperature for factual answers
    };

    const response = await this.gateway.complete(request);

    return {
      content: response.content,
      confidence: {
        intent_confidence: 0.8,
        tool_confidence: 0.85,
        response_confidence: response.error ? 0.3 : 0.9,
        policy_decision: response.error ? 'error' : 'processed',
      },
      tool_calls_made: response.tool_calls?.map((tc) => tc.function.name),
      handoff: response.error
        ? this.createHandoff(
            ctx,
            'tool_unavailable',
            'Knowledge base unavailable — patient needs staff assistance',
            'low',
          )
        : undefined,
    };
  }
}