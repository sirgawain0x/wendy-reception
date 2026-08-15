// src/wendy/privacy/policy.ts
// Privacy policy engine — decides what data may be used and where it can go.
// Sits BEFORE Switchyard in the request pipeline.

import type { ModelRequest } from '../models/request';
import type { TaskType, ModelTier, PrivacyLevel } from '../types';
import type { OfficeConfig } from '../config/schema';
import { NeMoAnonymizer } from './anonymizer';

export type PolicyDecision =
  | 'allow'
  | 'deny'
  | 'require_anonymization'
  | 'require_local_only';

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  allowed_tiers: ModelTier[];
  reason: string;
  anonymization_required: boolean;
  sanitized_request?: ModelRequest;
}

export class PrivacyPolicyEngine {
  private anonymizer: NeMoAnonymizer | null = null;

  constructor(anonymizer?: NeMoAnonymizer) {
    if (anonymizer) this.anonymizer = anonymizer;
  }

  /**
   * Evaluate a model request against privacy policy.
   * Determines:
   * - Whether the request is allowed
   * - Which model tiers are permitted
   * - Whether anonymization is required before routing
   */
  async evaluate(
    request: ModelRequest,
    officeConfig: OfficeConfig | null,
  ): Promise<PolicyEvaluationResult> {
    const privacyLevel = request.privacy_level;
    const officePrivacy = officeConfig?.privacy;

    // PHI requests: never allow external routing without anonymization
    if (privacyLevel === 'phi') {
      // Check if external is even enabled
      const externalEnabled = officeConfig?.routing.external_enabled ?? false;

      if (!externalEnabled) {
        return {
          decision: 'require_local_only',
          allowed_tiers: ['edge', 'central'],
          reason: 'External providers disabled for this office; PHI must stay on private infrastructure',
          anonymization_required: false,
        };
      }

      // External enabled — require anonymization before external routing
      return {
        decision: 'require_anonymization',
        allowed_tiers: ['edge', 'central', 'external'],
        reason: 'PHI detected: edge/central allowed directly, external requires anonymization',
        anonymization_required: true,
      };
    }

    // Sanitized requests: can go anywhere
    if (privacyLevel === 'sanitized') {
      return {
        decision: 'allow',
        allowed_tiers: ['edge', 'central', 'external'],
        reason: 'Request already sanitized; all tiers permitted',
        anonymization_required: false,
      };
    }

    // Public requests: can go anywhere
    return {
      decision: 'allow',
      allowed_tiers: ['edge', 'central', 'external'],
      reason: 'No PHI detected; all tiers permitted',
      anonymization_required: false,
    };
  }

  /**
   * Sanitize a request for external routing.
   * Uses NeMo Anonymizer to remove PHI/PII.
   */
  async sanitizeForExternal(request: ModelRequest): Promise<ModelRequest> {
    if (!this.anonymizer) {
      throw new Error('Anonymizer not configured but sanitization requested');
    }

    const sanitizedMessages = [];
    for (const message of request.messages) {
      const result = await this.anonymizer.anonymize(message.content);
      sanitizedMessages.push({
        ...message,
        content: result.anonymized_text,
      });
    }

    return {
      ...request,
      messages: sanitizedMessages,
      privacy_level: 'sanitized' as PrivacyLevel,
    };
  }
}