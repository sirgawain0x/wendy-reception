// src/wendy/types/index.ts
// Shared types for the Wendy Reception platform.

// ─── Tenant & Identity ───────────────────────────────────────────

export interface TenantContext {
  tenant_id: string;
  office_id: string;
  device_id?: string;
}

// ─── Messages ────────────────────────────────────────────────────

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  tool_call_id: string;
  result: unknown;
  success: boolean;
  error?: string;
}

// ─── Capabilities ────────────────────────────────────────────────

export type TaskType =
  | 'simple_conversation'
  | 'appointment_scheduling'
  | 'faq'
  | 'patient_intake'
  | 'complex_reasoning'
  | 'document_analysis'
  | 'marketing'
  | 'administrative';

export type PrivacyLevel = 'phi' | 'sanitized' | 'public';

export type ModelTier = 'edge' | 'central' | 'external';

// ─── Conversation ────────────────────────────────────────────────

export interface Conversation {
  id: string;
  tenant_id: string;
  office_id: string;
  channel: Channel;
  messages: Message[];
  metadata: ConversationMetadata;
  created_at: string;
  updated_at: string;
}

export type Channel = 'phone' | 'sms' | 'web' | 'chat';

export interface ConversationMetadata {
  patient_name?: string;
  patient_phone?: string;
  patient_email?: string;
  appointment_id?: string;
  intent?: string;
  intent_confidence?: number;
  escalated_to_human?: boolean;
}

// ─── Appointments ────────────────────────────────────────────────

export interface Appointment {
  id: string;
  tenant_id: string;
  office_id: string;
  patient_reference: string;
  provider: string;
  service: string;
  start_time: string;
  end_time: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  notes?: string;
}

export interface CalendarSlot {
  start_time: string;
  end_time: string;
  available: boolean;
  provider: string;
}

// ─── Knowledge ───────────────────────────────────────────────────

export interface KnowledgeDocument {
  id: string;
  tenant_id: string;
  office_id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  updated_at: string;
}

// ─── Audit ───────────────────────────────────────────────────────

export interface AuditEvent {
  timestamp: string;
  tenant_id: string;
  office_id: string;
  agent_id: string;
  conversation_id: string;
  task_type: string;
  model_route: string;
  tool?: string;
  policy_decision: string;
  success: boolean;
  error?: string;
}

// ─── Confidence ──────────────────────────────────────────────────

export interface ConfidenceScores {
  intent_confidence: number;
  tool_confidence: number;
  response_confidence: number;
  policy_decision: string;
}

// ─── Human Handoff ───────────────────────────────────────────────

export interface HandoffRequest {
  conversation_id: string;
  tenant_id: string;
  office_id: string;
  reason: HandoffReason;
  summary: string;
  urgency: 'low' | 'medium' | 'high' | 'emergency';
}

export type HandoffReason =
  | 'clinical_question'
  | 'emergency'
  | 'frustrated_patient'
  | 'billing_dispute'
  | 'uncertain_identity'
  | 'ambiguous_request'
  | 'model_uncertainty'
  | 'policy_violation'
  | 'repeated_failure'
  | 'tool_unavailable'
  | 'sensitive_request';

// ─── Device ──────────────────────────────────────────────────────

export interface Device {
  id: string;
  tenant_id: string;
  office_id: string;
  name: string;
  model: string;
  software_version: string;
  agent_version: string;
  model_version: string;
  config_version: string;
  status: 'registered' | 'active' | 'suspended' | 'revoked';
  last_heartbeat: string;
  registered_at: string;
}

// ─── Routing ─────────────────────────────────────────────────────

export interface RoutingDecision {
  tier: ModelTier;
  provider: string;
  model: string;
  endpoint: string;
  anonymized: boolean;
  fallback_used: boolean;
  reason: string;
}