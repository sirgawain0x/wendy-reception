// src/wendy/edge/health.ts
// Health monitor — tracks edge device health and reports to central server.

import type { Device } from '../types';
import type { CentralConnector } from './connector';

export interface EdgeHealth {
  device_id: string;
  timestamp: string;
  status: 'healthy' | 'degraded' | 'critical';
  checks: HealthCheck[];
  uptime_seconds: number;
  cpu_percent: number;
  memory_percent: number;
  gpu_percent?: number;
  gpu_memory_percent?: number;
  model_loaded: boolean;
  central_connected: boolean;
}

interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  latency_ms?: number;
}

export class HealthMonitor {
  private deviceId: string;
  private connector: CentralConnector;
  private startTime: Date;
  private modelLoaded: boolean = false;

  constructor(deviceId: string, connector: CentralConnector) {
    this.deviceId = deviceId;
    this.connector = connector;
    this.startTime = new Date();
  }

  setModelLoaded(loaded: boolean): void {
    this.modelLoaded = loaded;
  }

  async check(): Promise<EdgeHealth> {
    const checks: HealthCheck[] = [];

    // Check local model
    checks.push({
      name: 'local_model',
      status: this.modelLoaded ? 'pass' : 'fail',
      message: this.modelLoaded ? 'Model loaded' : 'No model loaded',
    });

    // Check central connection
    const centralConnected = this.connector.isConnected();
    checks.push({
      name: 'central_connection',
      status: centralConnected ? 'pass' : 'warn',
      message: centralConnected ? 'Connected' : 'Disconnected — operating in offline mode',
    });

    // Check system resources (would use actual system APIs on Jetson)
    const cpuPercent = await this.getCPUUsage();
    const memoryPercent = await this.getMemoryUsage();

    checks.push({
      name: 'cpu',
      status: cpuPercent < 90 ? 'pass' : 'warn',
      message: `CPU: ${cpuPercent.toFixed(1)}%`,
    });

    checks.push({
      name: 'memory',
      status: memoryPercent < 90 ? 'pass' : 'warn',
      message: `Memory: ${memoryPercent.toFixed(1)}%`,
    });

    // Determine overall status
    const hasFail = checks.some((c) => c.status === 'fail');
    const hasWarn = checks.some((c) => c.status === 'warn');
    const status = hasFail ? 'critical' : hasWarn ? 'degraded' : 'healthy';

    return {
      device_id: this.deviceId,
      timestamp: new Date().toISOString(),
      status,
      checks,
      uptime_seconds: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
      cpu_percent: cpuPercent,
      memory_percent: memoryPercent,
      model_loaded: this.modelLoaded,
      central_connected: centralConnected,
    };
  }

  private async getCPUUsage(): Promise<number> {
    // On Jetson, this would read /proc/stat or use tegrastats
    // For now, return a mock value
    return 25.0;
  }

  private async getMemoryUsage(): Promise<number> {
    // On Jetson, this would read /proc/meminfo or use tegrastats
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const { stdout } = await execAsync("cat /proc/meminfo | head -4");
      const lines = stdout.split('\n');
      const total = parseInt(lines[0]?.split(/\s+/)[1] || '0');
      const available = parseInt(lines[2]?.split(/\s+/)[1] || '0');
      if (total > 0) {
        return ((total - available) / total) * 100;
      }
    } catch {}
    return 40.0; // Fallback
  }
}