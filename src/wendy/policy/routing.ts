// src/wendy/policy/routing.ts
// Routing policy — sits before Switchyard to enforce data routing decisions.
// Combines privacy policy + routing config + availability signals.

import type { ModelRequest } from '../models/request';
import type { RoutingDecision, ModelTier, TaskType } from '../types';
import type { OfficeConfig, RoutingConfig } from '../config/schema';
import { PrivacyPolicyEngine } from '../privacy/policy';
import type { PolicyEvaluationResult } from '../privacy/policy';

export class RoutingPolicy {
  private privacyEngine: PrivacyPolicyEngine;
  private routingConfig: RoutingConfig;

  constructor(privacyEngine: PrivacyPolicyEngine, routingConfig: RoutingConfig) {
    this.privacyEngine = privacyEngine;
    this.routingConfig = routingConfig;
  }

  /**
   * Decide routing for a request.
   * Returns the routing decision + policy evaluation.
   */
  async decide(
    request: ModelRequest,
    officeConfig: OfficeConfig | null,
  ): Promise<{
    policy: PolicyEvaluationResult;
    routing: RoutingDecision | null;
  }> {
    // 1. Privacy policy evaluation
    const policy = await this.privacyEngine.evaluate(request, officeConfig);

    if (policy.decision === 'deny') {
      return { policy, routing: null };
    }

    // 2. Get routing rule for task type
    const taskType = request.task_type;
    const rule = this.routingConfig[taskType] || this.routingConfig['simple_conversation'];

    if (!rule) {
      return {
        policy,
        routing: {
          tier: 'edge',
          provider: 'edge_fast',
          model: 'default',
          endpoint: 'default',
          anonymized: policy.anonymization_required,
          fallback_used: false,
          reason: 'no routing rule found, defaulting to edge',
        },
      };
    }

    // 3. Determine tier from preferred model key
    const preferredTier = this.inferTier(rule.preferred);
    const fallbackTier = rule.fallback ? this.inferTier(rule.fallback) : null;

    // 4. Check if preferred tier is allowed by policy
    let selectedTier = preferredTier;
    let selectedModel = rule.preferred;
    let fallbackUsed = false;

    if (!policy.allowed_tiers.includes(preferredTier)) {
      // Preferred tier not allowed — try fallback
      if (fallbackTier && policy.allowed_tiers.includes(fallbackTier)) {
        selectedTier = fallbackTier;
        selectedModel = rule.fallback!;
        fallbackUsed = true;
      } else {
        // Find any allowed tier
        for (const tier of policy.allowed_tiers) {
          const matchingModel = Object.keys(this.routingConfig).find((key) => {
            const r = this.routingConfig[key];
            return this.inferTier(r.preferred) === tier;
          });
          if (matchingModel) {
            selectedTier = tier;
            selectedModel = this.routingConfig[matchingModel].preferred;
            fallbackUsed = true;
            break;
          }
        }
      }
    }

    // 5. Check office routing config
    if (officeConfig) {
      if (selectedTier === 'edge' && !officeConfig.routing.edge_enabled) {
        if (officeConfig.routing.central_enabled) {
          selectedTier = 'central';
          fallbackUsed = true;
        }
      }
      if (selectedTier === 'central' && !officeConfig.routing.central_enabled) {
        if (officeConfig.routing.edge_enabled) {
          selectedTier = 'edge';
          fallbackUsed = true;
        }
      }
      if (selectedTier === 'external' && !officeConfig.routing.external_enabled) {
        // External not enabled — fall back to central or edge
        selectedTier = officeConfig.routing.central_enabled ? 'central' : 'edge';
        fallbackUsed = true;
      }
    }

    // 6. Determine if anonymization is needed for this route
    const needsAnonymization =
      policy.anonymization_required && selectedTier === 'external';

    return {
      policy,
      routing: {
        tier: selectedTier,
        provider: selectedModel,
        model: selectedModel,
        endpoint: `configured:${selectedModel}`,
        anonymized: needsAnonymization,
        fallback_used: fallbackUsed,
        reason: fallbackUsed
          ? `preferred tier not allowed, using ${selectedTier}`
          : `routed to ${selectedTier} per policy`,
      },
    };
  }

  private inferTier(modelKey: string): ModelTier {
    if (modelKey.startsWith('edge')) return 'edge';
    if (modelKey.startsWith('central')) return 'central';
    if (modelKey.startsWith('external')) return 'external';
    return 'edge';
  }
}