// src/wendy/models/switchyard.ts
// Switchyard — the model routing layer.
// Uses routing config + request signals to select the appropriate model.

import type { ModelRequest, ModelResponse, ModelHealth } from './request';
import type { RoutingConfig, ModelConfig } from '../config/schema';
import type { RoutingDecision, ModelTier, TaskType } from '../types';
import type { ModelProvider } from './gateway';

export class Switchyard {
  private routing: RoutingConfig;
  private providers: Map<string, ModelProvider>;
  private healthCache: Map<string, { available: boolean; timestamp: number }> = new Map();
  private healthCacheTTL = 5000; // 5 seconds

  constructor(routing: RoutingConfig, providers: Map<string, ModelProvider>) {
    this.routing = routing;
    this.providers = providers;
  }

  /**
   * Route a request to the appropriate model.
   * Uses routing config + health checks + request signals.
   */
  route(request: ModelRequest): RoutingDecision {
    const taskType = request.task_type;
    const rule = this.routing[taskType] || this.routing['simple_conversation'];

    // Determine preferred model
    const preferredKey = rule.preferred;
    const isPreferredAvailable = this.checkAvailability(preferredKey);

    if (isPreferredAvailable) {
      return this.buildDecision(preferredKey, request, false);
    }

    // Try fallback
    if (rule.fallback) {
      const isFallbackAvailable = this.checkAvailability(rule.fallback);
      if (isFallbackAvailable) {
        return this.buildDecision(rule.fallback, request, true);
      }
    }

    // Last resort: try any available provider
    for (const [key] of Array.from(this.providers)) {
      if (this.checkAvailability(key)) {
        return this.buildDecision(key, request, true);
      }
    }

    // Nothing available — return preferred anyway (will fail gracefully)
    return this.buildDecision(preferredKey, request, true);
  }

  getProvider(key: string): ModelProvider | undefined {
    return this.providers.get(key);
  }

  getAllProviders(): Map<string, ModelProvider> {
    return this.providers;
  }

  // ─── Internal ──────────────────────────────────────────────────

  private buildDecision(
    modelKey: string,
    request: ModelRequest,
    fallbackUsed: boolean,
  ): RoutingDecision {
    const tier = this.inferTier(modelKey);
    const provider = this.providers.get(modelKey);

    return {
      tier,
      provider: modelKey,
      model: provider ? this.getModelName(provider) : modelKey,
      endpoint: this.getEndpoint(modelKey),
      anonymized: request.privacy_level === 'phi' && tier === 'external',
      fallback_used: fallbackUsed,
      reason: fallbackUsed ? 'preferred unavailable, using fallback' : 'preferred model available',
    };
  }

  private inferTier(modelKey: string): ModelTier {
    if (modelKey.startsWith('edge')) return 'edge';
    if (modelKey.startsWith('central')) return 'central';
    if (modelKey.startsWith('external')) return 'external';
    return 'edge'; // safe default
  }

  private getModelName(provider: ModelProvider): string {
    // This is a simplification — in practice we'd store the model name
    return 'configured';
  }

  private getEndpoint(modelKey: string): string {
    // Derived from config — would need model config access
    return `configured:${modelKey}`;
  }

  private checkAvailability(modelKey: string): boolean {
    // Check cache first
    const cached = this.healthCache.get(modelKey);
    if (cached && Date.now() - cached.timestamp < this.healthCacheTTL) {
      return cached.available;
    }

    // Synchronous availability check (provider.isAvailable is sync)
    const provider = this.providers.get(modelKey);
    if (!provider) {
      this.healthCache.set(modelKey, { available: false, timestamp: Date.now() });
      return false;
    }

    const available = provider.isAvailable();
    this.healthCache.set(modelKey, { available, timestamp: Date.now() });
    return available;
  }

  /**
   * Force a health refresh (called by health monitor).
   */
  async refreshHealth(): Promise<void> {
    for (const [key, provider] of Array.from(this.providers)) {
      const health = await provider.health();
      this.healthCache.set(key, {
        available: health.available,
        timestamp: Date.now(),
      });
    }
  }
}