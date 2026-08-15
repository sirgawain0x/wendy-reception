// src/wendy/models/providers/openai.ts
// OpenAI-compatible provider — works with OpenAI, Anthropic (via proxy), NVIDIA NIM, etc.

import type { ModelProvider } from '../gateway';
import type { ModelRequest, ModelResponse, ModelHealth } from '../request';
import type { RoutingDecision } from '../../types';
import type { ModelConfig } from '../../config/schema';

export class OpenAICompatibleProvider implements ModelProvider {
  private config: ModelConfig;
  private available: boolean = true;

  constructor(config: ModelConfig) {
    this.config = config;
  }

  private getApiKey(): string | undefined {
    if (this.config.api_key_env) {
      return process.env[this.config.api_key_env];
    }
    // Common env var names
    return (
      process.env.OPENAI_API_KEY ||
      process.env.EXTERNAL_MODEL_API_KEY ||
      process.env.NVIDIA_API_KEY ||
      undefined
    );
  }

  async complete(request: ModelRequest, decision: RoutingDecision): Promise<ModelResponse> {
    const startTime = Date.now();

    try {
      const endpoint = `${this.config.endpoint.replace(/\/$/, '')}/v1/chat/completions`;
      const apiKey = this.getApiKey();

      const body = {
        model: this.config.model,
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: request.temperature ?? this.config.temperature ?? 0.7,
        max_tokens: request.max_tokens ?? this.config.max_tokens ?? 512,
        stream: false,
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
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
          error: `HTTP ${response.status}: ${await response.text()}`,
        };
      }

      const data = await response.json();
      const choice = data.choices?.[0];

      return {
        content: choice?.message?.content ?? '',
        tool_calls: choice?.message?.tool_calls,
        routing: decision,
        tokens_in: data.usage?.prompt_tokens ?? 0,
        tokens_out: data.usage?.completion_tokens ?? 0,
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
        error: `Provider error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async health(): Promise<ModelHealth> {
    try {
      const endpoint = `${this.config.endpoint.replace(/\/$/, '')}/v1/models`;
      const apiKey = this.getApiKey();

      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(endpoint, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      const available = response.ok;
      this.available = available;
      return {
        provider: this.config.provider,
        model: this.config.model,
        available,
        last_checked: new Date().toISOString(),
        error: available ? undefined : `HTTP ${response.status}`,
      };
    } catch (err) {
      this.available = false;
      return {
        provider: this.config.provider,
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