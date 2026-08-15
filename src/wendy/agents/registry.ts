// src/wendy/agents/registry.ts
// Agent registry — maps agent names to agent instances.

import type { Agent } from './base';

export class AgentRegistry {
  private agents = new Map<string, Agent>();
  private defaultAgent: string | null = null;

  register(agent: Agent): void {
    this.agents.set(agent.name, agent);
    if (this.defaultAgent === null) {
      this.defaultAgent = agent.name;
    }
  }

  get(name: string): Agent | undefined {
    return this.agents.get(name);
  }

  getDefault(): Agent | undefined {
    if (this.defaultAgent) {
      return this.agents.get(this.defaultAgent);
    }
    return undefined;
  }

  setDefault(name: string): void {
    if (!this.agents.has(name)) {
      throw new Error(`Agent '${name}' is not registered`);
    }
    this.defaultAgent = name;
  }

  list(): string[] {
    return Array.from(this.agents.keys());
  }

  has(name: string): boolean {
    return this.agents.has(name);
  }
}