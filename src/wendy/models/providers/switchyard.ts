// src/wendy/models/providers/switchyard.ts
// Switchyard provider — talks to the NVIDIA NeMo Switchyard Rust proxy server.
// Switchyard handles protocol translation between OpenAI Chat, Anthropic Messages,
// and OpenAI Responses formats. It routes requests across providers based on
// configured routing algorithms (llm_classifier, stage_router, random, etc.).
//
// When using Switchyard, Wendy's ModelGateway sends OpenAI Chat format to Switchyard,
// and Switchyard decides the actual backend (Ollama, OpenAI, Anthropic, Gemini, etc.).
//
// Reference: https://github.com/NVIDIA-NeMo/Switchyard

import type { ModelProvider } from '../gateway';
import type { ModelRequest, ModelResponse, ModelHealth } from '../request';
import type { RoutingDecision } from '../../types';
import type { ModelConfig } from '../../config/schema';

export class SwitchyardProvider implements ModelProvider {
  private config: ModelConfig;
  private available: boolean = true;

  constructor(config: ModelConfig) {
    this.config = config;
  }

  private getApiKey(): string | undefined {
    if (this.config.api_key_env) {
      return process.env[this.config.api_key_env];
    }
    return undefined; // Switchyard may not need an API key if it handles upstream auth
  }

  async complete(request: ModelRequest, decision: RoutingDecision): Promise<ModelResponse> {
    const startTime = Date.now();

    try {
      // Switchyard accepts OpenAI Chat Completions format
      // The "model" field is the route ID configured in Switchyard's TOML
      const endpoint = `${this.config.endpoint.replace(/\/$/, '')}/v1/chat/completions`;
      const apiKey = this.getApiKey();

      const body = {
        // Use the configured model name (which is the Switchyard route ID)
        model: this.config.model,
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: request.temperature ?? this.config.temperature ?? 0.7,
        max_tokens: request.max_tokens ?? this.config.max_tokens ?? 1024,
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
          error: `Switchyard HTTP ${response.status}: ${await response.text()}`,
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
        error: `Switchyard error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async health(): Promise<ModelHealth> {
    try {
      // Switchyard exposes a /health endpoint
      const endpoint = `${this.config.endpoint.replace(/\/$/, '')}/health`;
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(5000),
      });
      const available = response.ok;
      this.available = available;
      return {
        provider: 'switchyard',
        model: this.config.model,
        available,
        last_checked: new Date().toISOString(),
        error: available ? undefined : `HTTP ${response.status}`,
      };
    } catch (err) {
      this.available = false;
      return {
        provider: 'switchyard',
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