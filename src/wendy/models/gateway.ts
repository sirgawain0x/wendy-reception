// src/wendy/models/gateway.ts
// ModelGateway — the single interface all agents use to get intelligence.
// No application code should ever call OpenAI/Ollama/etc. directly.

import type { ModelRequest, ModelResponse, ModelHealth } from './request';
import type { RoutingConfig, ModelConfig } from '../config/schema';
import type { TaskType, ModelTier } from '../types';
import { Switchyard } from './switchyard';
import { FallbackHandler } from './fallback';
import { OllamaProvider } from './providers/ollama';
import { OpenAICompatibleProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { GeminiProvider } from './providers/gemini';
import { SwitchyardProvider } from './providers/switchyard';
import { AuditLogger } from '../audit/logger';
import { PrivacyPolicyEngine } from '../privacy/policy';
import { NeMoAnonymizer } from '../privacy/anonymizer';

export class ModelGateway {
  private switchyard: Switchyard;
  private fallback: FallbackHandler;
  private audit: AuditLogger;
  private privacyEngine: PrivacyPolicyEngine;

  constructor(
    models: Record<string, ModelConfig>,
    routing: RoutingConfig,
    audit: AuditLogger,
    privacyEngine?: PrivacyPolicyEngine,
  ) {
    // Create providers from config
    const providers = new Map<string, ModelProvider>();

    for (const [key, cfg] of Object.entries(models)) {
      const provider = this.createProvider(cfg);
      providers.set(key, provider);
    }

    this.switchyard = new Switchyard(routing, providers);
    this.fallback = new FallbackHandler(providers);
    this.audit = audit;

    // Privacy enforcement point. If no engine is supplied, default to one backed
    // by a local-fallback anonymizer so PHI is *always* anonymizable before it
    // can leave private infrastructure for an external provider.
    this.privacyEngine =
      privacyEngine ??
      new PrivacyPolicyEngine(
        new NeMoAnonymizer({ strategy: 'redact', fallback_to_local: true }),
      );
  }

  /**
   * The single entry point for all model interactions.
   * Agents call this with a ModelRequest and get a ModelResponse.
   * They never know which model or provider handled the request.
   */
  async complete(request: ModelRequest): Promise<ModelResponse> {
    const startTime = Date.now();

    // 1. Switchyard decides which model to use
    const decision = this.switchyard.route(request);

    // 2. Get the provider for the selected model
    const provider = this.switchyard.getProvider(decision.provider);

    if (!provider) {
      // Fallback
      const fallbackDecision = this.fallback.getFallback(decision, request);
      const fallbackProvider = this.switchyard.getProvider(fallbackDecision.provider);

      if (!fallbackProvider) {
        return {
          content: '',
          routing: fallbackDecision,
          tokens_in: 0,
          tokens_out: 0,
          latency_ms: Date.now() - startTime,
          error: 'No model provider available',
        };
      }

      // Enforce privacy BEFORE the request leaves for the (possibly external) provider.
      const fallbackEnforcement = await this.enforcePrivacy(request, fallbackDecision);
      if ('error' in fallbackEnforcement) {
        this.audit.log({
          timestamp: new Date().toISOString(),
          tenant_id: request.tenant_id,
          office_id: request.office_id,
          agent_id: request.agent_id,
          conversation_id: request.conversation_id,
          task_type: request.task_type,
          model_route: `${fallbackDecision.tier}:${fallbackDecision.provider}/${fallbackDecision.model}`,
          tool: undefined,
          policy_decision: 'blocked:phi',
          success: false,
          error: fallbackEnforcement.error,
        });
        return {
          content: '',
          routing: fallbackDecision,
          tokens_in: 0,
          tokens_out: 0,
          latency_ms: Date.now() - startTime,
          error: fallbackEnforcement.error,
        };
      }

      const response = await fallbackProvider.complete(
        fallbackEnforcement.request,
        fallbackDecision,
      );
      response.routing.fallback_used = true;

      this.audit.log({
        timestamp: new Date().toISOString(),
        tenant_id: request.tenant_id,
        office_id: request.office_id,
        agent_id: request.agent_id,
        conversation_id: request.conversation_id,
        task_type: request.task_type,
        model_route: `${fallbackDecision.tier}:${fallbackDecision.provider}/${fallbackDecision.model}`,
        tool: undefined,
        policy_decision: fallbackEnforcement.anonymized ? 'fallback:anonymized' : 'fallback',
        success: !response.error,
        error: response.error,
      });

      return response;
    }

    // 3. Enforce privacy BEFORE the request leaves for the (possibly external) provider.
    const enforcement = await this.enforcePrivacy(request, decision);
    if ('error' in enforcement) {
      this.audit.log({
        timestamp: new Date().toISOString(),
        tenant_id: request.tenant_id,
        office_id: request.office_id,
        agent_id: request.agent_id,
        conversation_id: request.conversation_id,
        task_type: request.task_type,
        model_route: `${decision.tier}:${decision.provider}/${decision.model}`,
        tool: undefined,
        policy_decision: 'blocked:phi',
        success: false,
        error: enforcement.error,
      });
      return {
        content: '',
        routing: decision,
        tokens_in: 0,
        tokens_out: 0,
        latency_ms: Date.now() - startTime,
        error: enforcement.error,
      };
    }

    // 4. Provider executes the (privacy-enforced) request
    const response = await provider.complete(enforcement.request, decision);

    // 5. Audit
    this.audit.log({
      timestamp: new Date().toISOString(),
      tenant_id: request.tenant_id,
      office_id: request.office_id,
      agent_id: request.agent_id,
      conversation_id: request.conversation_id,
      task_type: request.task_type,
      model_route: `${decision.tier}:${decision.provider}/${decision.model}`,
      tool: undefined,
      policy_decision: enforcement.anonymized ? 'anonymized' : 'direct',
      success: !response.error,
      error: response.error,
    });

    return response;
  }

  /**
   * Enforce privacy policy before a request is dispatched to a provider.
   *
   * The core security invariant: PHI must never reach an *external* provider
   * in raw form. Whenever the selected route resolves to the external tier and
   * the request carries PHI, the message content is anonymized here (the single
   * choke point every agent goes through). If anonymization is impossible, the
   * request is blocked rather than leaked.
   *
   * Note: the decision is based on the *actual selected tier*, not the
   * `decision.anonymized` flag — some fallback/last-resort paths route to an
   * external provider while leaving that flag `false`.
   */
  private async enforcePrivacy(
    request: ModelRequest,
    decision: RoutingDecision,
  ): Promise<{ request: ModelRequest; anonymized: boolean } | { error: string }> {
    const needsAnonymization =
      request.privacy_level === 'phi' && decision.tier === 'external';

    if (!needsAnonymization) {
      return { request, anonymized: false };
    }

    try {
      const sanitized = await this.privacyEngine.sanitizeForExternal(request);
      return { request: sanitized, anonymized: true };
    } catch (err) {
      // Fail closed: never send raw PHI externally if anonymization failed.
      return {
        error: `PHI could not be anonymized for external routing; request blocked: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
  }

  /**
   * Check health of all configured providers.
   */
  async healthCheck(): Promise<ModelHealth[]> {
    const results: ModelHealth[] = [];
    for (const [key, provider] of this.switchyard.getAllProviders()) {
      const health = await provider.health();
      results.push(health);
    }
    return results;
  }

  private createProvider(config: ModelConfig): ModelProvider {
    switch (config.provider.toLowerCase()) {
      case 'ollama':
        return new OllamaProvider(config);
      case 'switchyard':
        return new SwitchyardProvider(config);
      case 'openai':
      case 'openai-compatible':
        return new OpenAICompatibleProvider(config);
      case 'anthropic':
        return new AnthropicProvider(config);
      case 'gemini':
        return new GeminiProvider(config);
      case 'nvidia':
      case 'nim':
        return new OpenAICompatibleProvider(config); // NIM uses OpenAI-compatible API
      case 'xai':
      case 'grok':
        return new OpenAICompatibleProvider(config); // Grok uses OpenAI-compatible API
      default:
        // Default to OpenAI-compatible for unknown providers
        return new OpenAICompatibleProvider(config);
    }
  }
}

// ─── Provider Interface ──────────────────────────────────────────

export interface ModelProvider {
  complete(request: ModelRequest, decision: RoutingDecision): Promise<ModelResponse>;
  health(): Promise<ModelHealth>;
  isAvailable(): boolean;
}

import type { RoutingDecision } from '../types';