// src/wendy/runtime/runtime.ts
// Agent runtime — the top-level coordinator that ties everything together.
// This is the main entry point for the Wendy Reception platform.

import { ConfigLoader } from '../config/loader';
import type { WendyConfig, OfficeConfig } from '../config/schema';
import { AuditLogger, ConsoleAuditSink } from '../audit/logger';
import { ModelGateway } from '../models/gateway';
import { AgentRegistry } from '../agents/registry';
import { AgentOrchestrator } from '../agents/orchestrator';
import { ToolRegistry } from '../tools/registry';
import { ReceptionistAgent } from '../agents/receptionist';
import { SchedulingAgent } from '../agents/scheduling';
import { KnowledgeAgent } from '../agents/knowledge';
import { PrivacyPolicyEngine } from '../privacy/policy';
import { RoutingPolicy } from '../policy/routing';
import { SafetyEngine } from '../policy/safety';
import { MetricsCollector } from '../observability/metrics';
import type { AgentContext } from './context';
import type { Message } from '../types';
import type { AgentResponse } from '../agents/base';
import type { CalendarBackend } from '../tools/calendar';
import type { CommunicationBackend } from '../tools/communication';
import type { KnowledgeBackend } from '../tools/knowledge';
import type { HandoffBackend } from '../tools/handoff';
import {
  GetCalendarAvailabilityTool,
  CreateAppointmentTool,
  RescheduleAppointmentTool,
  CancelAppointmentTool,
} from '../tools/calendar';
import { SendSMSTool, SendEmailTool } from '../tools/communication';
import { SearchKnowledgeBaseTool, GetOfficeHoursTool } from '../tools/knowledge';
import { HandoffToHumanTool } from '../tools/handoff';

export interface WendyRuntimeDeps {
  calendarBackend: CalendarBackend;
  communicationBackend: CommunicationBackend;
  knowledgeBackend: KnowledgeBackend;
  handoffBackend: HandoffBackend;
}

export class WendyRuntime {
  private config: WendyConfig;
  private audit: AuditLogger;
  private gateway: ModelGateway;
  private registry: AgentRegistry;
  private orchestrator: AgentOrchestrator;
  private tools: ToolRegistry;
  private privacyEngine: PrivacyPolicyEngine;
  private routingPolicy: RoutingPolicy;
  private safetyEngine: SafetyEngine;
  private metrics: MetricsCollector;

  constructor(config: WendyConfig, deps: WendyRuntimeDeps) {
    this.config = config;
    this.audit = new AuditLogger(new ConsoleAuditSink());

    // Create model gateway
    this.gateway = new ModelGateway(config.models, config.routing, this.audit);

    // Create tool registry
    this.tools = new ToolRegistry();
    this.registerTools(deps);

    // Create agent registry
    this.registry = new AgentRegistry();
    this.registerAgents();

    // Create orchestrator
    this.orchestrator = new AgentOrchestrator(
      this.registry,
      this.gateway,
      this.tools,
      this.audit,
    );

    // Create policy engines
    this.privacyEngine = new PrivacyPolicyEngine();
    this.routingPolicy = new RoutingPolicy(this.privacyEngine, config.routing);
    this.safetyEngine = new SafetyEngine();
    this.metrics = new MetricsCollector();
  }

  /**
   * Process an incoming conversation turn.
   * This is the main entry point for all channels (phone, SMS, web, chat).
   */
  async handle(
    ctx: AgentContext,
    messages: Message[],
  ): Promise<AgentResponse> {
    // Safety check on input
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMessage) {
      const inputCheck = this.safetyEngine.checkInput(lastUserMessage.content);
      if (!inputCheck.safe) {
        this.audit.log({
          timestamp: new Date().toISOString(),
          tenant_id: ctx.tenant.tenant_id,
          office_id: ctx.tenant.office_id,
          agent_id: 'safety',
          conversation_id: ctx.conversationId,
          task_type: 'simple_conversation',
          model_route: 'blocked',
          tool: undefined,
          policy_decision: `blocked:${inputCheck.violations.join(',')}`,
          success: false,
          error: 'Input safety check failed',
        });
        return {
          content: "I want to make sure you get the right information. Let me connect you with someone from the office.",
          confidence: {
            intent_confidence: 1.0,
            tool_confidence: 1.0,
            response_confidence: 1.0,
            policy_decision: 'blocked:safety',
          },
          handoff: {
            conversation_id: ctx.conversationId,
            tenant_id: ctx.tenant.tenant_id,
            office_id: ctx.tenant.office_id,
            reason: 'policy_violation',
            summary: 'Safety check triggered',
            urgency: 'medium',
          },
        };
      }
    }

    // Process through orchestrator
    const response = await this.orchestrator.process(ctx, messages);

    // Safety check on output
    if (response.content) {
      const outputCheck = this.safetyEngine.checkResponse(response.content);
      if (!outputCheck.safe) {
        // Log violation but still return response if it's just a warning
        if (outputCheck.handoff_required && !response.handoff) {
          return {
            ...response,
            content: "I want to make sure you get the right information. Let me connect you with someone from the office.",
            handoff: {
              conversation_id: ctx.conversationId,
              tenant_id: ctx.tenant.tenant_id,
              office_id: ctx.tenant.office_id,
              reason: outputCheck.handoff_reason!,
              summary: 'Safety check on response triggered',
              urgency: 'high',
            },
          };
        }
      }
    }

    return response;
  }

  getMetrics() {
    return this.metrics.getMetrics();
  }

  getAuditLogger() {
    return this.audit;
  }

  // ─── Internal setup ────────────────────────────────────────────

  private registerTools(deps: WendyRuntimeDeps): void {
    this.tools.register(new GetCalendarAvailabilityTool(deps.calendarBackend));
    this.tools.register(new CreateAppointmentTool(deps.calendarBackend));
    this.tools.register(new RescheduleAppointmentTool(deps.calendarBackend));
    this.tools.register(new CancelAppointmentTool(deps.calendarBackend));
    this.tools.register(new SendSMSTool(deps.communicationBackend));
    this.tools.register(new SendEmailTool(deps.communicationBackend));
    this.tools.register(new SearchKnowledgeBaseTool(deps.knowledgeBackend));
    this.tools.register(new GetOfficeHoursTool(deps.knowledgeBackend));
    this.tools.register(new HandoffToHumanTool(deps.handoffBackend));
  }

  private registerAgents(): void {
    const deps = {
      gateway: this.gateway,
      tools: this.tools,
      audit: this.audit,
    };

    this.registry.register(new ReceptionistAgent(deps));
    this.registry.register(new SchedulingAgent(deps));
    this.registry.register(new KnowledgeAgent(deps));
    this.registry.setDefault('receptionist');
  }
}