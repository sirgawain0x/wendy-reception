// src/wendy/audit/logger.ts
// Audit event system — logs significant agent actions.
// Logs are treated as sensitive data. Raw PHI is not logged unnecessarily.

import type { AuditEvent } from '../types';

export class AuditLogger {
  private events: AuditEvent[] = [];
  private maxBufferSize = 10000;
  private sink: AuditSink | null = null;

  constructor(sink?: AuditSink) {
    if (sink) this.sink = sink;
  }

  log(event: AuditEvent): void {
    // Buffer in memory
    this.events.push(event);

    // Trim buffer
    if (this.events.length > this.maxBufferSize) {
      this.events = this.events.slice(-this.maxBufferSize);
    }

    // Send to external sink if configured
    if (this.sink) {
      this.sink.write(event).catch((err) => {
        console.error('[audit] Failed to write to sink:', err);
      });
    }
  }

  getEvents(filter?: Partial<AuditEvent>): AuditEvent[] {
    if (!filter) return [...this.events];
    return this.events.filter((e) =>
      Object.entries(filter).every(([key, value]) => e[key as keyof AuditEvent] === value),
    );
  }

  getEventsForTenant(tenantId: string, officeId?: string): AuditEvent[] {
    return this.events.filter(
      (e) => e.tenant_id === tenantId && (!officeId || e.office_id === officeId),
    );
  }

  clear(): void {
    this.events = [];
  }

  setSink(sink: AuditSink): void {
    this.sink = sink;
  }
}

// ─── Audit Sink Interface ────────────────────────────────────────

export interface AuditSink {
  write(event: AuditEvent): Promise<void>;
}

// ─── Console Sink (development) ──────────────────────────────────

export class ConsoleAuditSink implements AuditSink {
  async write(event: AuditEvent): Promise<void> {
    console.log('[audit]', JSON.stringify(event));
  }
}

// ─── File Sink ───────────────────────────────────────────────────

export class FileAuditSink implements AuditSink {
  constructor(private filePath: string) {}

  async write(event: AuditEvent): Promise<void> {
    const { appendFile } = require('fs/promises');
    const line = JSON.stringify(event) + '\n';
    await appendFile(this.filePath, line);
  }
}