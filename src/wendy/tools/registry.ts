// src/wendy/tools/registry.ts
// Tool registry — maps tool names to tool instances.
// Only registered tools can be called by agents.

import type { Tool } from './base';

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get tool definitions for the model (OpenAI function calling format).
   */
  getDefinitions(toolNames: string[]): Array<{
    type: 'function';
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }> {
    const defs: Array<{
      type: 'function';
      function: { name: string; description: string; parameters: Record<string, unknown> };
    }> = [];

    for (const name of toolNames) {
      const tool = this.tools.get(name);
      if (tool) {
        defs.push({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        });
      }
    }

    return defs;
  }

  /**
   * Get only the tools an agent is allowed to use.
   */
  getDefinitionsForAgent(
    allowedTools: string[],
    enabledTools?: string[],
  ): Array<{
    type: 'function';
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }> {
    // If enabledTools is provided, intersect with allowedTools
    const toolsToUse = enabledTools
      ? allowedTools.filter((t) => enabledTools.includes(t))
      : allowedTools;

    return this.getDefinitions(toolsToUse);
  }
}