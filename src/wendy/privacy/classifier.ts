// src/wendy/privacy/classifier.ts
// PHI/PII classifier — detects sensitive entities in text.
// Uses pattern-based detection as a fast first pass.
// In production, this would also call NeMo Anonymizer for ML-based detection.

export type PHIEntityType =
  | 'patient_name'
  | 'phone_number'
  | 'email'
  | 'address'
  | 'date'
  | 'ssn'
  | 'insurance_id'
  | 'account_number'
  | 'medical_record_number'
  | 'date_of_birth';

export interface PHIDetection {
  entity_type: PHIEntityType;
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export interface PHIClassificationResult {
  contains_phi: boolean;
  entities: PHIDetection[];
  sanitized_text: string;
  anonymization_map: Record<string, string>; // original → placeholder
}

export class PHIClassifier {
  private patterns: Array<{ type: PHIEntityType; regex: RegExp; confidence: number }>;

  constructor() {
    this.patterns = [
      // Phone numbers (various formats)
      { type: 'phone_number', regex: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, confidence: 0.85 },
      // Email addresses
      { type: 'email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, confidence: 0.95 },
      // SSN
      { type: 'ssn', regex: /\b\d{3}-\d{2}-\d{4}\b/g, confidence: 0.95 },
      // Dates (MM/DD/YYYY, YYYY-MM-DD)
      { type: 'date', regex: /\b(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\b/g, confidence: 0.7 },
      // ZIP codes (5 digit)
      { type: 'address', regex: /\b\d{5}(-\d{4})?\b/g, confidence: 0.5 },
      // Insurance/Member ID patterns
      { type: 'insurance_id', regex: /\b[A-Z]{2}\d{6,}\b/g, confidence: 0.6 },
      // Medical record numbers
      { type: 'medical_record_number', regex: /\bMRN[:\s]*\d+\b/gi, confidence: 0.85 },
    ];
  }

  classify(text: string): PHIClassificationResult {
    const entities: PHIDetection[] = [];
    const anonymizationMap: Record<string, string> = {};
    let sanitizedText = text;

    for (const { type, regex, confidence } of this.patterns) {
      let match;
      const pattern = new RegExp(regex.source, regex.flags);
      while ((match = pattern.exec(text)) !== null) {
        const entityText = match[0];
        const start = match.index;
        const end = start + entityText.length;

        // Skip if already covered by a higher-confidence detection
        if (entities.some((e) => e.start <= start && e.end >= end)) continue;

        entities.push({
          entity_type: type,
          text: entityText,
          start,
          end,
          confidence,
        });

        // Create placeholder
        const placeholder = `[${type.toUpperCase()}_${entities.length}]`;
        anonymizationMap[entityText] = placeholder;
      }
    }

    // Apply anonymization to text
    // Sort entities by start position descending so replacements don't shift indices
    const sortedEntities = [...entities].sort((a, b) => b.start - a.start);
    sanitizedText = text;
    for (const entity of sortedEntities) {
      const placeholder = anonymizationMap[entity.text];
      sanitizedText =
        sanitizedText.substring(0, entity.start) +
        placeholder +
        sanitizedText.substring(entity.end);
    }

    return {
      contains_phi: entities.length > 0,
      entities,
      sanitized_text: sanitizedText,
      anonymization_map: anonymizationMap,
    };
  }
}