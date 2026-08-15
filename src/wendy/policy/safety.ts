// src/wendy/policy/safety.ts
// Safety boundaries — enforced on every agent response.

import type { Message, HandoffReason } from '../types';

export interface SafetyCheckResult {
  safe: boolean;
  handoff_required: boolean;
  handoff_reason?: HandoffReason;
  violations: string[];
  sanitized_content?: string;
}

export class SafetyEngine {
  // Patterns that indicate clinical/medical advice being given
  private clinicalAdvicePatterns = [
    /you should (take|use|try|avoid)/i,
    /I (recommend|suggest|advise|prescribe)/i,
    /take (medication|medicine|ibuprofen|aspirin|antibiotic)/i,
    /this (is|could be|sounds like) (a|an|.*condition)/i,
    /diagnos/i,
    /you (may|might) have/i,
    /treat.*with/i,
    /side effect/i,
  ];

  // Patterns that indicate prompt injection attempts
  private injectionPatterns = [
    /ignore (all |previous |the )?instructions/i,
    /disregard (your |the )?(system )?prompt/i,
    /you are now (a |an )?[A-Z]/i,
    /pretend (you are|to be)/i,
    /override (safety|policy|restrictions)/i,
    /reveal (your |the )?(system )?prompt/i,
    /<\/system>/i,
    /\[SYSTEM\]/i,
  ];

  // Patterns that indicate office policy being fabricated
  private fabricationPatterns = [
    /our policy (is|states|requires)/i,
    /we (always|never|require|charge)/i,
  ];

  /**
   * Check an agent's response for safety violations.
   */
  checkResponse(content: string, context?: { knowledgeBaseUsed?: boolean }): SafetyCheckResult {
    const violations: string[] = [];

    // Check for clinical advice
    if (this.clinicalAdvicePatterns.some((p) => p.test(content))) {
      violations.push('potential_clinical_advice');
    }

    // Check for prompt injection in the response (echoing injection)
    if (this.injectionPatterns.some((p) => p.test(content))) {
      violations.push('prompt_injection_detected');
    }

    // Check for fabricated office policies (when not grounded in knowledge base)
    if (!context?.knowledgeBaseUsed && this.fabricationPatterns.some((p) => p.test(content))) {
      violations.push('potential_fabricated_policy');
    }

    // Determine if handoff is required
    const handoffRequired = violations.includes('potential_clinical_advice');

    return {
      safe: violations.length === 0,
      handoff_required: handoffRequired,
      handoff_reason: handoffRequired ? 'clinical_question' : undefined,
      violations,
    };
  }

  /**
   * Check incoming user message for prompt injection.
   */
  checkInput(message: string): SafetyCheckResult {
    const violations: string[] = [];

    if (this.injectionPatterns.some((p) => p.test(message))) {
      violations.push('prompt_injection_detected');
    }

    return {
      safe: violations.length === 0,
      handoff_required: false,
      violations,
    };
  }
}