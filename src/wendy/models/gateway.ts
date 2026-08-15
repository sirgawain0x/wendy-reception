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

export class ModelGateway {
  private switchyard: Switchyard;
  private fallback: FallbackHandler;
  private audit: AuditLogger;

  constructor(
    models: Record<string, ModelConfig>,
    routing: RoutingConfig,
    audit: AuditLogger,
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

      const response = await fallbackProvider.complete(request, fallbackDecision);
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
        policy_decision: 'fallback',
        success: !response.error,
        error: response.error,
      });

      return response;
    }

    // 3. Provider executes the request
    const response = await provider.complete(request, decision);

    // 4. Audit
    this.audit.log({
      timestamp: new Date().toISOString(),
      tenant_id: request.tenant_id,
      office_id: request.office_id,
      agent_id: request.agent_id,
      conversation_id: request.conversation_id,
      task_type: request.task_type,
      model_route: `${decision.tier}:${decision.provider}/${decision.model}`,
      tool: undefined,
      policy_decision: decision.anonymized ? 'anonymized' : 'direct',
      success: !response.error,
      error: response.error,
    });

    return response;
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