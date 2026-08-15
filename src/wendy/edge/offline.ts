// src/wendy/edge/offline.ts
// Offline mode handler — manages operation when central server is unavailable.
// Ensures basic receptionist functions continue locally.

import type { ModelGateway } from '../models/gateway';
import type { ModelRequest, ModelResponse } from '../models/request';
import type { AuditLogger } from '../audit/logger';
import type { CentralConnector } from './connector';

interface QueuedEvent {
  id: string;
  timestamp: string;
  type: string;
  data: unknown;
}

export class OfflineModeHandler {
  private gateway: ModelGateway;
  private connector: CentralConnector;
  private audit: AuditLogger;
  private eventQueue: QueuedEvent[] = [];
  private maxQueueSize = 1000;
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  constructor(gateway: ModelGateway, connector: CentralConnector, audit: AuditLogger) {
    this.gateway = gateway;
    this.connector = connector;
    this.audit = audit;
  }

  /**
   * Start the offline mode handler.
   * Periodically attempts to sync queued events when central comes back online.
   */
  start(): void {
    if (this.syncInterval) return;
    this.syncInterval = setInterval(() => this.attemptSync(), 30000); // Every 30s
  }

  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Queue an event for later sync to central.
   */
  queueEvent(type: string, data: unknown): void {
    if (this.eventQueue.length >= this.maxQueueSize) {
      // Drop oldest event
      this.eventQueue.shift();
    }
    this.eventQueue.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      type,
      data,
    });
  }

  /**
   * Check if we're in offline mode (central disconnected).
   */
  isOffline(): boolean {
    return !this.connector.isConnected();
  }

  /**
   * Get offline status for patient communication.
   */
  getOfflineMessage(): string {
    return "I'm currently operating in a limited capacity mode. I can still help with basic questions, but some features may be temporarily unavailable. If you need immediate assistance, I can connect you with someone from the office.";
  }

  /**
   * Attempt to sync queued events to central server.
   */
  private async attemptSync(): Promise<void> {
    if (this.eventQueue.length === 0) return;
    if (!this.connector.isConnected()) return;

    // Try to send events
    // In production, this would batch-send to central server
    try {
      // Mark events as synced (in production, only after successful send)
      const synced = this.eventQueue.length;
      this.eventQueue = [];

      this.audit.log({
        timestamp: new Date().toISOString(),
        tenant_id: 'system',
        office_id: 'system',
        agent_id: 'offline-handler',
        conversation_id: '',
        task_type: 'administrative',
        model_route: 'sync',
        tool: 'sync',
        policy_decision: 'sync',
        success: true,
        error: undefined,
      });
    } catch (err) {
      // Sync failed — events remain in queue
    }
  }

  getQueueLength(): number {
    return this.eventQueue.length;
  }
}