// app/api/chat/route.ts
// Web chat endpoint — receives chat messages and routes through Wendy.

import { NextRequest, NextResponse } from 'next/server';
import { extractTenantContext, TenantContextError } from '@/src/wendy/tenant/context';
import { ConfigLoader } from '@/src/wendy/config/loader';
import { WendyRuntime, type WendyRuntimeDeps } from '@/src/wendy/runtime/runtime';
import type { AgentContext } from '@/src/wendy/runtime/context';
import type { Message } from '@/src/wendy/types';
import type { CalendarBackend } from '@/src/wendy/tools/calendar';
import type { CommunicationBackend } from '@/src/wendy/tools/communication';
import type { KnowledgeBackend } from '@/src/wendy/tools/knowledge';
import type { HandoffBackend } from '@/src/wendy/tools/handoff';
import type { CalendarSlot, Appointment, KnowledgeDocument, HandoffRequest } from '@/src/wendy/types';

// ─── Mock Backends (Phase 1 — will be replaced with real integrations) ──

class MockCalendarBackend implements CalendarBackend {
  async getAvailability(tenantId: string, officeId: string, date: string): Promise<CalendarSlot[]> {
    // Return mock availability
    const slots: CalendarSlot[] = [];
    for (let hour = 9; hour < 17; hour++) {
      slots.push({
        start_time: `${date}T${hour.toString().padStart(2, '0')}:00:00`,
        end_time: `${date}T${hour.toString().padStart(2, '0')}:30:00`,
        available: hour % 2 === 0,
        provider: 'Dr. Example',
      });
    }
    return slots;
  }

  async createAppointment(
    tenantId: string,
    officeId: string,
    appt: Omit<Appointment, 'id' | 'tenant_id' | 'office_id' | 'status'>,
  ): Promise<Appointment> {
    return {
      ...appt,
      id: `appt_${Date.now()}`,
      tenant_id: tenantId,
      office_id: officeId,
      status: 'scheduled',
    };
  }

  async rescheduleAppointment(
    tenantId: string,
    officeId: string,
    appointmentId: string,
    newStartTime: string,
    newEndTime: string,
  ): Promise<Appointment> {
    return {
      id: appointmentId,
      tenant_id: tenantId,
      office_id: officeId,
      patient_reference: 'patient',
      provider: 'Dr. Example',
      service: 'appointment',
      start_time: newStartTime,
      end_time: newEndTime,
      status: 'scheduled',
    };
  }

  async cancelAppointment(
    tenantId: string,
    officeId: string,
    appointmentId: string,
  ): Promise<Appointment> {
    return {
      id: appointmentId,
      tenant_id: tenantId,
      office_id: officeId,
      patient_reference: 'patient',
      provider: 'Dr. Example',
      service: 'appointment',
      start_time: new Date().toISOString(),
      end_time: new Date().toISOString(),
      status: 'cancelled',
    };
  }

  async getAppointment(
    tenantId: string,
    officeId: string,
    appointmentId: string,
  ): Promise<Appointment | null> {
    return null;
  }
}

class MockCommunicationBackend implements CommunicationBackend {
  async sendSMS(to: string, body: string): Promise<{ success: boolean; messageId?: string }> {
    return { success: true, messageId: `sms_${Date.now()}` };
  }

  async sendEmail(to: string, subject: string, body: string): Promise<{ success: boolean; messageId?: string }> {
    return { success: true, messageId: `email_${Date.now()}` };
  }
}

class MockKnowledgeBackend implements KnowledgeBackend {
  async search(tenantId: string, officeId: string, query: string): Promise<KnowledgeDocument[]> {
    return [
      {
        id: 'kb_1',
        tenant_id: tenantId,
        office_id: officeId,
        title: 'Office Hours',
        content: 'We are open Monday through Friday, 8:00 AM to 5:00 PM. We are closed on weekends and major holidays.',
        category: 'hours',
        tags: ['hours', 'schedule'],
        updated_at: new Date().toISOString(),
      },
    ];
  }
}

class MockHandoffBackend implements HandoffBackend {
  async initiateHandoff(request: HandoffRequest): Promise<{ success: boolean; handoffId: string; message: string }> {
    return {
      success: true,
      handoffId: `handoff_${Date.now()}`,
      message: 'Your request has been escalated to our office staff. Someone will contact you shortly.',
    };
  }
}

// ─── Runtime singleton ───────────────────────────────────────────

let runtime: WendyRuntime | null = null;

async function getRuntime(): Promise<WendyRuntime> {
  if (!runtime) {
    const loader = new ConfigLoader();
    const config = await loader.load();
    const deps: WendyRuntimeDeps = {
      calendarBackend: new MockCalendarBackend(),
      communicationBackend: new MockCommunicationBackend(),
      knowledgeBackend: new MockKnowledgeBackend(),
      handoffBackend: new MockHandoffBackend(),
    };
    runtime = new WendyRuntime(config, deps);
  }
  return runtime;
}

// ─── API Route Handler ───────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // 1. Extract tenant context from headers
    const authReq = extractTenantContext(request.headers);

    // 2. Parse body
    const body = await request.json();
    const { messages, conversation_id, channel } = body as {
      messages: Message[];
      conversation_id: string;
      channel?: string;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'messages array is required' },
        { status: 400 },
      );
    }

    if (!conversation_id) {
      return NextResponse.json(
        { error: 'conversation_id is required' },
        { status: 400 },
      );
    }

    // 3. Get runtime
    const rt = await getRuntime();

    // 4. Build agent context
    const ctx: AgentContext = {
      tenant: authReq.tenant,
      conversationId: conversation_id,
      channel: (channel as any) || 'web',
      officeConfig: null, // Would load from config based on office_id
      metadata: {},
    };

    // 5. Process through Wendy
    const response = await rt.handle(ctx, messages);

    // 6. Return response
    return NextResponse.json({
      content: response.content,
      confidence: response.confidence,
      handoff: response.handoff,
      needs_clarification: response.needs_clarification,
      clarification_question: response.clarification_question,
      tools_used: response.tool_calls_made,
    });
  } catch (err) {
    if (err instanceof TenantContextError) {
      return NextResponse.json(
        { error: err.message },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/chat',
    methods: ['POST'],
    description: 'Send chat messages to Wendy Reception AI',
  });
}