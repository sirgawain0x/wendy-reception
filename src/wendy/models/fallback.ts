// src/wendy/models/fallback.ts
// Fallback handler — determines fallback model when preferred is unavailable.

import type { ModelProvider } from './gateway';
import type { ModelRequest } from './request';
import type { RoutingDecision, ModelTier } from '../types';

export class FallbackHandler {
  private providers: Map<string, ModelProvider>;

  constructor(providers: Map<string, ModelProvider>) {
    this.providers = providers;
  }

  /**
   * Given a failed routing decision, determine the best fallback.
   * Strategy:
   *   1. If central failed → try edge (degrade to local)
   *   2. If edge failed → try central (escalate)
   *   3. If external failed → try central → edge
   *   4. If all failed → return edge (will produce error response)
   */
  getFallback(failed: RoutingDecision, request: ModelRequest): RoutingDecision {
    const tier = failed.tier;

    let fallbackTier: ModelTier;
    switch (tier) {
      case 'central':
        fallbackTier = 'edge'; // Degrade to local
        break;
      case 'edge':
        fallbackTier = 'central'; // Escalate to central
        break;
      case 'external':
        fallbackTier = 'central'; // Fall back to central
        break;
      default:
        fallbackTier = 'edge';
    }

    // Find a provider for the fallback tier
    for (const [key, provider] of Array.from(this.providers)) {
      if (key.startsWith(fallbackTier) && provider.isAvailable()) {
        const isExternal = fallbackTier === 'external' as ModelTier;
        return {
          tier: fallbackTier,
          provider: key,
          model: 'fallback',
          endpoint: `fallback:${key}`,
          anonymized: request.privacy_level === 'phi' && isExternal,
          fallback_used: true,
          reason: `${tier} unavailable, falling back to ${fallbackTier}`,
        };
      }
    }

    // Absolute last resort: any available provider
    for (const [key, provider] of Array.from(this.providers)) {
      if (provider.isAvailable()) {
        return {
          tier: key.startsWith('edge') ? 'edge' : key.startsWith('central') ? 'central' : 'external',
          provider: key,
          model: 'last-resort',
          endpoint: `last-resort:${key}`,
          anonymized: false,
          fallback_used: true,
          reason: 'last resort — only available provider',
        };
      }
    }

    // Nothing is available
    return {
      tier: 'edge',
      provider: failed.provider,
      model: 'unavailable',
      endpoint: 'unavailable',
      anonymized: false,
      fallback_used: true,
      reason: 'all providers unavailable',
    };
  }
}