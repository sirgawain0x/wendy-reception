// src/wendy/models/providers/anthropic.ts
// Anthropic provider — native Claude API support via Switchyard or direct.
// When used directly, calls the Anthropic Messages API.
// When routed through Switchyard, Switchyard handles the protocol translation.

import type { ModelProvider } from '../gateway';
import type { ModelRequest, ModelResponse, ModelHealth } from '../request';
import type { RoutingDecision } from '../../types';
import type { ModelConfig } from '../../config/schema';

export class AnthropicProvider implements ModelProvider {
  private config: ModelConfig;
  private available: boolean = true;

  constructor(config: ModelConfig) {
    this.config = config;
  }

  private getApiKey(): string | undefined {
    if (this.config.api_key_env) {
      return process.env[this.config.api_key_env];
    }
    return process.env.ANTHROPIC_API_KEY || undefined;
  }

  async complete(request: ModelRequest, decision: RoutingDecision): Promise<ModelResponse> {
    const startTime = Date.now();

    try {
      const endpoint = `${this.config.endpoint.replace(/\/$/, '')}/v1/messages`;
      const apiKey = this.getApiKey();

      const body = {
        model: this.config.model,
        messages: request.messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
        system: request.messages.find((m) => m.role === 'system')?.content,
        max_tokens: request.max_tokens ?? this.config.max_tokens ?? 1024,
        temperature: request.temperature ?? this.config.temperature ?? 0.7,
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      };

      if (apiKey) {
        headers['x-api-key'] = apiKey;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        this.available = false;
        return {
          content: '',
          routing: decision,
          tokens_in: 0,
          tokens_out: 0,
          latency_ms: Date.now() - startTime,
          error: `Anthropic HTTP ${response.status}: ${await response.text()}`,
        };
      }

      const data = await response.json();
      const content = data.content?.map((c: { text: string }) => c.text).join('') ?? '';

      return {
        content,
        routing: decision,
        tokens_in: data.usage?.input_tokens ?? 0,
        tokens_out: data.usage?.output_tokens ?? 0,
        latency_ms: Date.now() - startTime,
      };
    } catch (err) {
      this.available = false;
      return {
        content: '',
        routing: decision,
        tokens_in: 0,
        tokens_out: 0,
        latency_ms: Date.now() - startTime,
        error: `Anthropic error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async health(): Promise<ModelHealth> {
    try {
      const apiKey = this.getApiKey();
      // Anthropic doesn't have a /models endpoint, so we do a minimal request
      const endpoint = `${this.config.endpoint.replace(/\/$/, '')}/v1/messages`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      };
      if (apiKey) headers['x-api-key'] = apiKey;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(5000),
      });

      const available = response.ok || response.status === 400; // 400 = bad request but auth works
      this.available = available;
      return {
        provider: 'anthropic',
        model: this.config.model,
        available,
        last_checked: new Date().toISOString(),
        error: available ? undefined : `HTTP ${response.status}`,
      };
    } catch (err) {
      this.available = false;
      return {
        provider: 'anthropic',
        model: this.config.model,
        available: false,
        last_checked: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  isAvailable(): boolean {
    return this.available;
  }
}