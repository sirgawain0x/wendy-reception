// src/wendy/config/schema.ts
// Configuration schema + validation for Wendy.

import type { TaskType, ModelTier } from '../types';

export interface ModelConfig {
  provider: string;
  endpoint: string;
  model: string;
  api_key_env?: string;
  max_tokens?: number;
  temperature?: number;
}

export interface RoutingRule {
  preferred: string;
  fallback?: string;
  privacy_required?: 'anonymized' | 'none';
  provider?: string;
}

export interface RoutingConfig {
  [task_type: string]: RoutingRule;
}

export interface AgentConfig {
  enabled: boolean;
  model_preference?: string;
  tools?: string[];
  custom_prompt?: string;
}

export interface AgentsConfig {
  [agent_name: string]: AgentConfig;
}

export interface PrivacyConfig {
  external_phi: 'deny' | 'anonymized';
  anonymization: 'required' | 'optional';
  anonymizer_endpoint?: string;
}

export interface NetworkConfig {
  central_endpoint?: string;
  tailscale_enabled?: boolean;
  offline_mode?: boolean;
}

export interface OfficeConfig {
  id: string;
  name: string;
  timezone: string;
  agents: AgentsConfig;
  routing: {
    edge_enabled: boolean;
    central_enabled: boolean;
    external_enabled: boolean;
  };
  privacy: PrivacyConfig;
  network: NetworkConfig;
  knowledge_base?: string;
}

export interface WendyConfig {
  models: {
    edge_fast?: ModelConfig;
    central_reasoning?: ModelConfig;
    external_reasoning?: ModelConfig;
  };
  routing: RoutingConfig;
  offices: Record<string, OfficeConfig>;
  defaults: {
    confidence_threshold: number;
    max_retries: number;
    timeout_ms: number;
  };
}

// ─── Validation ──────────────────────────────────────────────────

export function validateConfig(config: WendyConfig): string[] {
  const errors: string[] = [];

  if (!config.models) {
    errors.push('models section is required');
  } else {
    if (!config.models.edge_fast) {
      errors.push('models.edge_fast is required for edge operation');
    }
    if (!config.models.edge_fast?.endpoint) {
      errors.push('models.edge_fast.endpoint is required');
    }
    if (!config.models.edge_fast?.model) {
      errors.push('models.edge_fast.model is required');
    }
  }

  if (!config.routing) {
    errors.push('routing section is required');
  }

  if (!config.offices || Object.keys(config.offices).length === 0) {
    errors.push('at least one office must be configured');
  }

  for (const [id, office] of Object.entries(config.offices || {})) {
    if (!office.id) errors.push(`office ${id}: id is required`);
    if (!office.timezone) errors.push(`office ${id}: timezone is required`);
    if (!office.privacy) errors.push(`office ${id}: privacy config is required`);
  }

  if (config.defaults?.confidence_threshold !== undefined) {
    if (config.defaults.confidence_threshold < 0 || config.defaults.confidence_threshold > 1) {
      errors.push('defaults.confidence_threshold must be between 0 and 1');
    }
  }

  return errors;
}