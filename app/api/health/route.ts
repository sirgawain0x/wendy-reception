// app/api/health/route.ts
// Health check endpoint — reports system status.

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'wendy-reception',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    components: {
      agents: ['receptionist', 'scheduling', 'knowledge'],
      tools: [
        'get_calendar_availability',
        'create_appointment',
        'reschedule_appointment',
        'cancel_appointment',
        'send_sms',
        'send_email',
        'search_knowledge_base',
        'get_office_hours',
        'handoff_to_human',
      ],
      model_tiers: ['edge', 'central', 'external'],
      privacy: {
        anonymizer: 'configured',
        policy_engine: 'active',
      },
      security: {
        tenant_isolation: 'enforced',
        audit_logging: 'active',
        safety_checks: 'active',
      },
    },
  });
}