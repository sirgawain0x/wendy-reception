// src/wendy/models/request.ts
// ModelRequest / ModelResponse types — the single contract between agents and models.

import type {
  TenantContext,
  TaskType,
  PrivacyLevel,
  Message,
  ToolCall,
  ToolResult,
  RoutingDecision,
  ConfidenceScores,
} from '../types';

export interface ModelRequest {
  // Identity
  tenant_id: string;
  office_id: string;
  agent_id: string;
  conversation_id: string;

  // Routing signals
  task_type: TaskType;
  complexity: 'low' | 'medium' | 'high';
  privacy_level: PrivacyLevel;
  latency_requirement: 'realtime' | 'normal' | 'batch';
  max_cost?: number;

  // Content
  context?: string;
  messages: Message[];
  tools?: ToolDefinition[];
  tool_results?: ToolResult[];

  // Options
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

export interface ModelResponse {
  content: string;
  tool_calls?: ToolCall[];
  routing: RoutingDecision;
  confidence?: ConfidenceScores;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  error?: string;
}

export interface ModelHealth {
  provider: string;
  model: string;
  available: boolean;
  latency_ms?: number;
  error?: string;
  last_checked: string;
}