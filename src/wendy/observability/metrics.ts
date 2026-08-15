// src/wendy/observability/metrics.ts
// Observability — tracks routing, agent, and model metrics.

import type { AuditEvent } from '../types';

export interface RoutingMetrics {
  total_requests: number;
  edge_requests: number;
  central_requests: number;
  external_requests: number;
  fallback_count: number;
  errors: number;
  avg_latency_ms: number;
  total_tokens_in: number;
  total_tokens_out: number;
  by_task_type: Record<string, number>;
  by_agent: Record<string, number>;
  by_model: Record<string, { requests: number; errors: number; avg_latency_ms: number }>;
}

export class MetricsCollector {
  private events: AuditEvent[] = [];
  private latencies: number[] = [];
  private tokensIn: number = 0;
  private tokensOut: number = 0;

  recordEvent(event: AuditEvent, latencyMs?: number, tokensIn?: number, tokensOut?: number): void {
    this.events.push(event);
    if (latencyMs) this.latencies.push(latencyMs);
    if (tokensIn) this.tokensIn += tokensIn;
    if (tokensOut) this.tokensOut += tokensOut;
  }

  getMetrics(): RoutingMetrics {
    const total = this.events.length;
    const byTaskType: Record<string, number> = {};
    const byAgent: Record<string, number> = {};
    const byModel: Record<string, { requests: number; errors: number; avg_latency_ms: number }> = {};

    let edge = 0, central = 0, external = 0, fallback = 0, errors = 0;

    for (const event of this.events) {
      // Count by task type
      byTaskType[event.task_type] = (byTaskType[event.task_type] || 0) + 1;

      // Count by agent
      byAgent[event.agent_id] = (byAgent[event.agent_id] || 0) + 1;

      // Count by model route
      if (!byModel[event.model_route]) {
        byModel[event.model_route] = { requests: 0, errors: 0, avg_latency_ms: 0 };
      }
      byModel[event.model_route].requests++;
      if (!event.success) {
        byModel[event.model_route].errors++;
        errors++;
      }

      // Count by tier
      if (event.model_route.startsWith('edge')) edge++;
      else if (event.model_route.startsWith('central')) central++;
      else if (event.model_route.startsWith('external')) external++;

      // Count fallbacks
      if (event.policy_decision === 'fallback') fallback++;
    }

    const avgLatency = this.latencies.length > 0
      ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
      : 0;

    return {
      total_requests: total,
      edge_requests: edge,
      central_requests: central,
      external_requests: external,
      fallback_count: fallback,
      errors,
      avg_latency_ms: avgLatency,
      total_tokens_in: this.tokensIn,
      total_tokens_out: this.tokensOut,
      by_task_type: byTaskType,
      by_agent: byAgent,
      by_model: byModel,
    };
  }

  reset(): void {
    this.events = [];
    this.latencies = [];
    this.tokensIn = 0;
    this.tokensOut = 0;
  }
}