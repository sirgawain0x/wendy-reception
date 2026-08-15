// src/wendy/tools/communication.ts
// Communication tools — send SMS, send email.

import { BaseTool } from './base';
import type { ToolCallParams } from './base';

// ─── Communication Backend Interface ─────────────────────────────

export interface CommunicationBackend {
  sendSMS(to: string, body: string, tenantId: string, officeId: string): Promise<{ success: boolean; messageId?: string; error?: string }>;
  sendEmail(to: string, subject: string, body: string, tenantId: string, officeId: string): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

// ─── Send SMS ────────────────────────────────────────────────────

export class SendSMSTool extends BaseTool {
  name = 'send_sms';
  description = 'Send an SMS message to a patient or contact.';
  parameters = {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient phone number (E.164 format)' },
      body: { type: 'string', description: 'Message body' },
    },
    required: ['to', 'body'],
  };

  constructor(private backend: CommunicationBackend) {
    super();
  }

  protected async run(params: ToolCallParams) {
    return this.backend.sendSMS(
      params.arguments.to as string,
      params.arguments.body as string,
      params.tenant_id,
      params.office_id,
    );
  }
}

// ─── Send Email ──────────────────────────────────────────────────

export class SendEmailTool extends BaseTool {
  name = 'send_email';
  description = 'Send an email to a patient or contact.';
  parameters = {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient email address' },
      subject: { type: 'string', description: 'Email subject' },
      body: { type: 'string', description: 'Email body' },
    },
    required: ['to', 'subject', 'body'],
  };

  constructor(private backend: CommunicationBackend) {
    super();
  }

  protected async run(params: ToolCallParams) {
    return this.backend.sendEmail(
      params.arguments.to as string,
      params.arguments.subject as string,
      params.arguments.body as string,
      params.tenant_id,
      params.office_id,
    );
  }
}