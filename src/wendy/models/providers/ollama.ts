// src/wendy/models/providers/ollama.ts
// Ollama provider — local model inference on Jetson or dev machine.

import type { ModelProvider } from '../gateway';
import type { ModelRequest, ModelResponse, ModelHealth } from '../request';
import type { RoutingDecision } from '../../types';
import type { ModelConfig } from '../../config/schema';

export class OllamaProvider implements ModelProvider {
  private config: ModelConfig;
  private available: boolean = true;

  constructor(config: ModelConfig) {
    this.config = config;
  }

  async complete(request: ModelRequest, decision: RoutingDecision): Promise<ModelResponse> {
    const startTime = Date.now();

    try {
      const endpoint = `${this.config.endpoint.replace(/\/$/, '')}/api/chat`;

      const body = {
        model: this.config.model,
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        stream: false,
        options: {
          temperature: request.temperature ?? this.config.temperature ?? 0.7,
          num_predict: request.max_tokens ?? this.config.max_tokens ?? 512,
        },
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
          error: `Ollama HTTP ${response.status}: ${await response.text()}`,
        };
      }

      const data = await response.json();

      return {
        content: data.message?.content ?? '',
        routing: decision,
        tokens_in: data.prompt_eval_count ?? 0,
        tokens_out: data.eval_count ?? 0,
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
        error: `Ollama error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async health(): Promise<ModelHealth> {
    try {
      const endpoint = `${this.config.endpoint.replace(/\/$/, '')}/api/tags`;
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(5000),
      });
      const available = response.ok;
      this.available = available;
      return {
        provider: 'ollama',
        model: this.config.model,
        available,
        last_checked: new Date().toISOString(),
        error: available ? undefined : `HTTP ${response.status}`,
      };
    } catch (err) {
      this.available = false;
      return {
        provider: 'ollama',
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