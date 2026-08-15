// tests/routing.test.ts
// Tests for model routing, fallback, and privacy policy.

import { describe, it, expect } from 'vitest';
import { Switchyard } from '../src/wendy/models/switchyard';
import { FallbackHandler } from '../src/wendy/models/fallback';
import { PrivacyPolicyEngine } from '../src/wendy/privacy/policy';
import { PHIClassifier } from '../src/wendy/privacy/classifier';
import type { ModelRequest } from '../src/wendy/models/request';
import type { RoutingConfig } from '../src/wendy/config/schema';

// Mock provider for testing
class MockProvider {
  constructor(private available: boolean) {}
  isAvailable() { return this.available; }
  async complete() { return { content: 'mock', routing: {} as any, tokens_in: 0, tokens_out: 0, latency_ms: 0 }; }
  async health() { return { provider: 'mock', model: 'mock', available: this.available, last_checked: '' }; }
}

describe('Switchyard Routing', () => {
  const routingConfig: RoutingConfig = {
    simple_conversation: { preferred: 'edge_fast', fallback: 'central_reasoning' },
    complex_reasoning: { preferred: 'central_reasoning', fallback: 'edge_fast' },
  };

  it('routes simple conversation to edge model', () => {
    const providers = new Map();
    providers.set('edge_fast', new MockProvider(true) as any);
    providers.set('central_reasoning', new MockProvider(true) as any);

    const switchyard = new Switchyard(routingConfig, providers);
    const request: ModelRequest = {
      tenant_id: 't1', office_id: 'o1', agent_id: 'test', conversation_id: 'c1',
      task_type: 'simple_conversation', complexity: 'low', privacy_level: 'public',
      latency_requirement: 'realtime', messages: [],
    };

    const decision = switchyard.route(request);
    expect(decision.tier).toBe('edge');
    expect(decision.provider).toBe('edge_fast');
    expect(decision.fallback_used).toBe(false);
  });

  it('routes complex reasoning to central model', () => {
    const providers = new Map();
    providers.set('edge_fast', new MockProvider(true) as any);
    providers.set('central_reasoning', new MockProvider(true) as any);

    const switchyard = new Switchyard(routingConfig, providers);
    const request: ModelRequest = {
      tenant_id: 't1', office_id: 'o1', agent_id: 'test', conversation_id: 'c1',
      task_type: 'complex_reasoning', complexity: 'high', privacy_level: 'public',
      latency_requirement: 'normal', messages: [],
    };

    const decision = switchyard.route(request);
    expect(decision.tier).toBe('central');
    expect(decision.provider).toBe('central_reasoning');
  });

  it('falls back to edge when central is unavailable', () => {
    const providers = new Map();
    providers.set('edge_fast', new MockProvider(true) as any);
    providers.set('central_reasoning', new MockProvider(false) as any);

    const switchyard = new Switchyard(routingConfig, providers);
    const request: ModelRequest = {
      tenant_id: 't1', office_id: 'o1', agent_id: 'test', conversation_id: 'c1',
      task_type: 'complex_reasoning', complexity: 'high', privacy_level: 'public',
      latency_requirement: 'normal', messages: [],
    };

    const decision = switchyard.route(request);
    expect(decision.tier).toBe('edge');
    expect(decision.fallback_used).toBe(true);
  });

  it('falls back to central when edge is unavailable', () => {
    const providers = new Map();
    providers.set('edge_fast', new MockProvider(false) as any);
    providers.set('central_reasoning', new MockProvider(true) as any);

    const switchyard = new Switchyard(routingConfig, providers);
    const request: ModelRequest = {
      tenant_id: 't1', office_id: 'o1', agent_id: 'test', conversation_id: 'c1',
      task_type: 'simple_conversation', complexity: 'low', privacy_level: 'public',
      latency_requirement: 'realtime', messages: [],
    };

    const decision = switchyard.route(request);
    expect(decision.tier).toBe('central');
    expect(decision.fallback_used).toBe(true);
  });
});

describe('Privacy Policy', () => {
  const engine = new PrivacyPolicyEngine();

  it('blocks external routing for PHI when external disabled', async () => {
    const request: ModelRequest = {
      tenant_id: 't1', office_id: 'o1', agent_id: 'test', conversation_id: 'c1',
      task_type: 'simple_conversation', complexity: 'low', privacy_level: 'phi',
      latency_requirement: 'realtime', messages: [],
    };

    const result = await engine.evaluate(request, {
      id: 'o1', name: 'Test', timezone: 'America/New_York',
      agents: {}, routing: { edge_enabled: true, central_enabled: true, external_enabled: false },
      privacy: { external_phi: 'deny', anonymization: 'required' },
      network: {},
    });

    expect(result.decision).toBe('require_local_only');
    expect(result.allowed_tiers).not.toContain('external');
  });

  it('requires anonymization for PHI when external enabled', async () => {
    const request: ModelRequest = {
      tenant_id: 't1', office_id: 'o1', agent_id: 'test', conversation_id: 'c1',
      task_type: 'simple_conversation', complexity: 'low', privacy_level: 'phi',
      latency_requirement: 'realtime', messages: [],
    };

    const result = await engine.evaluate(request, {
      id: 'o1', name: 'Test', timezone: 'America/New_York',
      agents: {}, routing: { edge_enabled: true, central_enabled: true, external_enabled: true },
      privacy: { external_phi: 'anonymized', anonymization: 'required' },
      network: {},
    });

    expect(result.decision).toBe('require_anonymization');
    expect(result.anonymization_required).toBe(true);
  });

  it('allows public data to go anywhere', async () => {
    const request: ModelRequest = {
      tenant_id: 't1', office_id: 'o1', agent_id: 'test', conversation_id: 'c1',
      task_type: 'faq', complexity: 'low', privacy_level: 'public',
      latency_requirement: 'realtime', messages: [],
    };

    const result = await engine.evaluate(request, null);
    expect(result.decision).toBe('allow');
    expect(result.allowed_tiers).toContain('external');
  });
});