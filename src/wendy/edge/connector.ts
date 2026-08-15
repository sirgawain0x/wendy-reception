// src/wendy/edge/connector.ts
// Central server connector — manages the secure connection to the central inference server.
// Uses Tailscale for private networking. Handles health checks and reconnection.

export interface CentralConnectorConfig {
  endpoint: string; // Central server endpoint (via Tailscale)
  auth_token_env: string; // Environment variable name for auth token
  timeout_ms: number;
  retry_interval_ms: number;
  max_retries: number;
}

export type ConnectionState = 'connected' | 'disconnected' | 'connecting' | 'error';

export interface ConnectionStatus {
  state: ConnectionState;
  endpoint: string;
  last_connected: string | null;
  last_error: string | null;
  latency_ms: number | null;
}

export class CentralConnector {
  private config: CentralConnectorConfig;
  private state: ConnectionState = 'disconnected';
  private lastConnected: string | null = null;
  private lastError: string | null = null;
  private latencyMs: number | null = null;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: CentralConnectorConfig) {
    this.config = config;
  }

  /**
   * Start the connector and begin health checks.
   */
  start(): void {
    if (this.healthCheckInterval) return;

    // Initial check
    this.checkHealth();

    // Periodic health checks
    this.healthCheckInterval = setInterval(
      () => this.checkHealth(),
      this.config.retry_interval_ms,
    );
  }

  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.state = 'disconnected';
  }

  /**
   * Check if the central server is reachable.
   */
  async checkHealth(): Promise<boolean> {
    const startTime = Date.now();
    try {
      this.state = 'connecting';

      const token = process.env[this.config.auth_token_env];
      const response = await fetch(`${this.config.endpoint}/health`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(this.config.timeout_ms),
      });

      if (response.ok) {
        this.state = 'connected';
        this.lastConnected = new Date().toISOString();
        this.lastError = null;
        this.latencyMs = Date.now() - startTime;
        return true;
      } else {
        this.state = 'error';
        this.lastError = `Central server returned ${response.status}`;
        return false;
      }
    } catch (err) {
      this.state = 'disconnected';
      this.lastError = err instanceof Error ? err.message : String(err);
      this.latencyMs = null;
      return false;
    }
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }

  getStatus(): ConnectionStatus {
    return {
      state: this.state,
      endpoint: this.config.endpoint,
      last_connected: this.lastConnected,
      last_error: this.lastError,
      latency_ms: this.latencyMs,
    };
  }
}