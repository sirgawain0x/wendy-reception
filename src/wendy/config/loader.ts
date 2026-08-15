// src/wendy/config/loader.ts
// Configuration loader — reads YAML config files + environment variables.

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { WendyConfig, ModelConfig } from './schema';
import { validateConfig } from './schema';

// ─── Environment variable expansion ──────────────────────────────

function expandEnvVars(text: string): string {
  return text.replace(/\$\{(\w+)\}/g, (_, varName) => process.env[varName] ?? '');
}

// ─── YAML parser (minimal — avoids extra deps for simple configs) ─

// We use a lightweight YAML parser. For complex configs, js-yaml can be added.
// For now, configs are simple enough to parse with this minimal parser.

function parseYAML(text: string): unknown {
  // Expand env vars first
  text = expandEnvVars(text);
  // Use dynamic import of js-yaml if available, otherwise fall back
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const yaml = require('js-yaml');
    return yaml.load(text);
  } catch {
    // js-yaml not installed — minimal inline parser for flat configs
    return minimalYamlParse(text);
  }
}

function minimalYamlParse(text: string): unknown {
  // Very basic YAML parsing for simple key: value structures
  // This is a fallback — production should use js-yaml
  const result: Record<string, unknown> = {};
  const lines = text.split('\n');
  const stack: { indent: number; obj: Record<string, unknown> }[] = [
    { indent: 0, obj: result },
  ];

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    while (stack.length > 1 && indent < stack[stack.length - 1].indent) {
      stack.pop();
    }

    const current = stack[stack.length - 1].obj;
    const colonIdx = trimmed.indexOf(':');

    if (colonIdx === -1) continue;

    const key = trimmed.substring(0, colonIdx).trim();
    const value = trimmed.substring(colonIdx + 1).trim();

    if (value === '') {
      // Nested object
      const newObj: Record<string, unknown> = {};
      current[key] = newObj;
      stack.push({ indent: indent + 2, obj: newObj });
    } else {
      // Parse value
      let parsed: unknown = value;
      if (value === 'true') parsed = true;
      else if (value === 'false') parsed = false;
      else if (value === 'null' || value === '~') parsed = null;
      else if (!isNaN(Number(value))) parsed = Number(value);
      // Remove quotes
      if (typeof parsed === 'string' && parsed.startsWith('"') && parsed.endsWith('"')) {
        parsed = parsed.slice(1, -1);
      }
      current[key] = parsed;
    }
  }

  return result;
}

// ─── Config Loader ───────────────────────────────────────────────

export class ConfigLoader {
  private config: WendyConfig | null = null;
  private configDir: string;

  constructor(configDir?: string) {
    this.configDir = configDir ?? path.join(process.cwd(), 'config');
  }

  async load(): Promise<WendyConfig> {
    if (this.config) return this.config;

    // Load main config files
    const routingPath = path.join(this.configDir, 'routing.yaml');
    const agentsPath = path.join(this.configDir, 'agents.yaml');
    const officesDir = path.join(this.configDir, 'offices');

    const config: Partial<WendyConfig> = {
      models: {},
      routing: {},
      offices: {},
      defaults: {
        confidence_threshold: 0.7,
        max_retries: 3,
        timeout_ms: 30000,
      },
    };

    // Load routing config
    if (existsSync(routingPath)) {
      const routingText = await readFile(routingPath, 'utf-8');
      const parsed = parseYAML(routingText) as Record<string, unknown>;
      if (parsed.models) config.models = parsed.models as typeof config.models;
      if (parsed.routing) config.routing = parsed.routing as typeof config.routing;
      if (parsed.defaults) config.defaults = { ...config.defaults, ...parsed.defaults };
    }

    // Load agent config
    if (existsSync(agentsPath)) {
      const agentsText = await readFile(agentsPath, 'utf-8');
      const parsed = parseYAML(agentsText) as Record<string, unknown>;
      // Will be merged into office configs
      (config as Record<string, unknown>)._defaultAgents = parsed;
    }

    // Load office configs
    if (existsSync(officesDir)) {
      const { readdir } = require('fs/promises');
      const files = await readdir(officesDir);
      for (const file of files) {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          const officeText = await readFile(path.join(officesDir, file), 'utf-8');
          const office = parseYAML(officeText) as Record<string, unknown>;
          if (office.id) {
            config.offices![office.id as string] = office as any;
          }
        }
      }
    }

    // Override with environment variables
    config.models = this.applyEnvOverrides(config.models || {});

    // Validate
    const errors = validateConfig(config as WendyConfig);
    if (errors.length > 0) {
      throw new Error(`Configuration errors:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
    }

    this.config = config as WendyConfig;
    return this.config;
  }

  private applyEnvOverrides(models: Record<string, ModelConfig>): Record<string, ModelConfig> {
    // Environment variables take precedence
    const env = process.env;

    if (env.EDGE_MODEL_ENDPOINT && env.EDGE_FAST_MODEL) {
      models.edge_fast = {
        provider: env.EDGE_MODEL_PROVIDER || 'ollama',
        endpoint: env.EDGE_MODEL_ENDPOINT,
        model: env.EDGE_FAST_MODEL,
        api_key_env: env.EDGE_MODEL_API_KEY_ENV,
        ...models.edge_fast,
      };
    }

    if (env.CENTRAL_MODEL_ENDPOINT && env.CENTRAL_REASONING_MODEL) {
      models.central_reasoning = {
        provider: env.CENTRAL_MODEL_PROVIDER || 'ollama',
        endpoint: env.CENTRAL_MODEL_ENDPOINT,
        model: env.CENTRAL_REASONING_MODEL,
        api_key_env: env.CENTRAL_MODEL_API_KEY_ENV,
        ...models.central_reasoning,
      };
    }

    if (env.EXTERNAL_MODEL_ENDPOINT && env.EXTERNAL_MODEL) {
      models.external_reasoning = {
        provider: env.EXTERNAL_MODEL_PROVIDER || 'openai',
        endpoint: env.EXTERNAL_MODEL_ENDPOINT,
        model: env.EXTERNAL_MODEL,
        api_key_env: 'EXTERNAL_MODEL_API_KEY',
        ...models.external_reasoning,
      };
    }

    return models;
  }

  getOfficeConfig(officeId: string): OfficeConfig | null {
    if (!this.config) return null;
    return this.config.offices[officeId] ?? null;
  }

  getModelConfig(modelKey: string): ModelConfig | null {
    if (!this.config) return null;
    return (this.config.models as Record<string, ModelConfig>)[modelKey] ?? null;
  }

  getRoutingRule(taskType: string): RoutingRule | null {
    if (!this.config) return null;
    return this.config.routing[taskType] ?? null;
  }
}

// Re-export types
export type { WendyConfig, ModelConfig, RoutingRule } from './schema';
import type { OfficeConfig, RoutingRule } from './schema';