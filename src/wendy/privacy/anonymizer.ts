// src/wendy/privacy/anonymizer.ts
// NeMo Anonymizer integration — detects and redacts/anonymizes PHI/PII.
// Reference: https://github.com/NVIDIA-NeMo/Anonymizer
//
// In production, this calls the NeMo Anonymizer service.
// In development/offline mode, it falls back to the pattern-based PHIClassifier.

import type { PHIClassificationResult, PHIEntityType } from './classifier';
import { PHIClassifier } from './classifier';

export type AnonymizationStrategy = 'redact' | 'hash' | 'substitute' | 'annotate';

export interface AnonymizerConfig {
  endpoint?: string; // NeMo Anonymizer service URL
  strategy: AnonymizationStrategy;
  fallback_to_local: boolean; // Use local classifier if service unavailable
  custom_entities?: Array<{ name: string; patterns: string[] }>;
}

export interface AnonymizationResult {
  original_text: string;
  anonymized_text: string;
  entities_detected: number;
  strategy_used: AnonymizationStrategy;
  service_used: 'nemo' | 'local';
  anonymization_map: Record<string, string>; // original → anonymized
  reconstruction_map: Record<string, string>; // anonymized → original (for response restoration)
}

export class NeMoAnonymizer {
  private config: AnonymizerConfig;
  private localClassifier: PHIClassifier;

  constructor(config: AnonymizerConfig) {
    this.config = config;
    this.localClassifier = new PHIClassifier();
  }

  /**
   * Anonymize text by detecting and replacing PHI/PII entities.
   * Uses NeMo Anonymizer service if available, falls back to local classifier.
   */
  async anonymize(text: string): Promise<AnonymizationResult> {
    // Try NeMo Anonymizer service first
    if (this.config.endpoint) {
      try {
        return await this.callNeMoService(text);
      } catch (err) {
        if (!this.config.fallback_to_local) {
          throw new Error(
            `NeMo Anonymizer service unavailable: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        // Fall through to local classifier
      }
    }

    // Local fallback
    return this.localAnonymize(text);
  }

  /**
   * Restore original PHI in a response (for reconstruction after external model call).
   * Only used when the response from an external model contains anonymized placeholders
   * that need to be restored for internal use within the trusted zone.
   */
  reconstruct(text: string, reconstructionMap: Record<string, string>): string {
    let result = text;
    for (const [anonymized, original] of Object.entries(reconstructionMap)) {
      // Escape regex special chars in the anonymized text
      const escaped = anonymized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'g'), original);
    }
    return result;
  }

  // ─── Internal ──────────────────────────────────────────────────

  private async callNeMoService(text: string): Promise<AnonymizationResult> {
    const response = await fetch(`${this.config.endpoint}/anonymize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        strategy: this.config.strategy,
        custom_entities: this.config.custom_entities,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`NeMo Anonymizer HTTP ${response.status}`);
    }

    const data = await response.json();

    const reconstructionMap: Record<string, string> = {};
    const anonymizationMap: Record<string, string> = {};

    // Build maps from service response
    if (data.entities) {
      for (const entity of data.entities) {
        anonymizationMap[entity.original] = entity.replacement;
        reconstructionMap[entity.replacement] = entity.original;
      }
    }

    return {
      original_text: text,
      anonymized_text: data.anonymized_text ?? text,
      entities_detected: data.entities?.length ?? 0,
      strategy_used: this.config.strategy,
      service_used: 'nemo',
      anonymization_map: anonymizationMap,
      reconstruction_map: reconstructionMap,
    };
  }

  private localAnonymize(text: string): Promise<AnonymizationResult> {
    const classification: PHIClassificationResult = this.localClassifier.classify(text);

    const reconstructionMap: Record<string, string> = {};
    for (const [original, placeholder] of Object.entries(classification.anonymization_map)) {
      reconstructionMap[placeholder] = original;
    }

    let anonymizedText = classification.sanitized_text;

    // Apply strategy
    switch (this.config.strategy) {
      case 'redact':
        // Replace placeholders with [REDACTED]
        for (const placeholder of Object.values(classification.anonymization_map)) {
          anonymizedText = anonymizedText.replace(placeholder, '[REDACTED]');
        }
        break;
      case 'hash':
        // Replace with deterministic hash
        for (const [original, placeholder] of Object.entries(classification.anonymization_map)) {
          const hash = this.deterministicHash(original);
          anonymizedText = anonymizedText.replace(placeholder, `[HASH:${hash}]`);
          reconstructionMap[`[HASH:${hash}]`] = original;
        }
        break;
      case 'annotate':
        // Keep placeholder format (already done by classifier)
        break;
      case 'substitute':
        // For production, substitution should be done by NeMo, not LLM
        // Local fallback uses annotation format
        break;
    }

    return Promise.resolve({
      original_text: text,
      anonymized_text: anonymizedText,
      entities_detected: classification.entities.length,
      strategy_used: this.config.strategy,
      service_used: 'local',
      anonymization_map: classification.anonymization_map,
      reconstruction_map: reconstructionMap,
    });
  }

  private deterministicHash(text: string): string {
    // Simple deterministic hash (not cryptographic — for anonymization only)
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }
}