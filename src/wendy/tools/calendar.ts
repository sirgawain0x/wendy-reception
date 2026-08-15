// src/wendy/tools/calendar.ts
// Calendar tools — appointment availability, booking, rescheduling, cancellation.

import { BaseTool } from './base';
import type { ToolCallParams } from './base';
import type { CalendarSlot, Appointment } from '../types';

// ─── Calendar Backend Interface ──────────────────────────────────

export interface CalendarBackend {
  getAvailability(
    tenantId: string,
    officeId: string,
    date: string,
    provider?: string,
  ): Promise<CalendarSlot[]>;

  createAppointment(
    tenantId: string,
    officeId: string,
    appt: Omit<Appointment, 'id' | 'tenant_id' | 'office_id' | 'status'>,
  ): Promise<Appointment>;

  rescheduleAppointment(
    tenantId: string,
    officeId: string,
    appointmentId: string,
    newStartTime: string,
    newEndTime: string,
  ): Promise<Appointment>;

  cancelAppointment(
    tenantId: string,
    officeId: string,
    appointmentId: string,
    reason?: string,
  ): Promise<Appointment>;

  getAppointment(
    tenantId: string,
    officeId: string,
    appointmentId: string,
  ): Promise<Appointment | null>;
}

// ─── Get Calendar Availability ───────────────────────────────────

export class GetCalendarAvailabilityTool extends BaseTool {
  name = 'get_calendar_availability';
  description = 'Check available appointment slots for a given date.';
  parameters = {
    type: 'object',
    properties: {
      date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
      provider: { type: 'string', description: 'Specific provider name (optional)' },
    },
    required: ['date'],
  };

  constructor(private backend: CalendarBackend) {
    super();
  }

  protected async run(params: ToolCallParams): Promise<CalendarSlot[]> {
    const date = params.arguments.date as string;
    const provider = params.arguments.provider as string | undefined;
    return this.backend.getAvailability(params.tenant_id, params.office_id, date, provider);
  }
}

// ─── Create Appointment ──────────────────────────────────────────

export class CreateAppointmentTool extends BaseTool {
  name = 'create_appointment';
  description = 'Book a new appointment for a patient.';
  parameters = {
    type: 'object',
    properties: {
      patient_name: { type: 'string', description: 'Patient name' },
      patient_phone: { type: 'string', description: 'Patient phone number' },
      provider: { type: 'string', description: 'Provider name' },
      service: { type: 'string', description: 'Service type (e.g. cleaning, consultation)' },
      start_time: { type: 'string', description: 'Start time ISO 8601' },
      end_time: { type: 'string', description: 'End time ISO 8601' },
      notes: { type: 'string', description: 'Optional notes' },
    },
    required: ['patient_name', 'patient_phone', 'start_time', 'end_time'],
  };

  constructor(private backend: CalendarBackend) {
    super();
  }

  protected async run(params: ToolCallParams): Promise<Appointment> {
    return this.backend.createAppointment(params.tenant_id, params.office_id, {
      patient_reference: params.arguments.patient_name as string,
      provider: (params.arguments.provider as string) || 'any',
      service: (params.arguments.service as string) || 'appointment',
      start_time: params.arguments.start_time as string,
      end_time: params.arguments.end_time as string,
      notes: params.arguments.notes as string | undefined,
    });
  }
}

// ─── Reschedule Appointment ──────────────────────────────────────

export class RescheduleAppointmentTool extends BaseTool {
  name = 'reschedule_appointment';
  description = 'Reschedule an existing appointment to a new time.';
  parameters = {
    type: 'object',
    properties: {
      appointment_id: { type: 'string', description: 'The appointment ID to reschedule' },
      new_start_time: { type: 'string', description: 'New start time ISO 8601' },
      new_end_time: { type: 'string', description: 'New end time ISO 8601' },
    },
    required: ['appointment_id', 'new_start_time', 'new_end_time'],
  };

  constructor(private backend: CalendarBackend) {
    super();
  }

  protected async run(params: ToolCallParams): Promise<Appointment> {
    return this.backend.rescheduleAppointment(
      params.tenant_id,
      params.office_id,
      params.arguments.appointment_id as string,
      params.arguments.new_start_time as string,
      params.arguments.new_end_time as string,
    );
  }
}

// ─── Cancel Appointment ──────────────────────────────────────────

export class CancelAppointmentTool extends BaseTool {
  name = 'cancel_appointment';
  description = 'Cancel an existing appointment.';
  parameters = {
    type: 'object',
    properties: {
      appointment_id: { type: 'string', description: 'The appointment ID to cancel' },
      reason: { type: 'string', description: 'Reason for cancellation' },
    },
    required: ['appointment_id'],
  };

  constructor(private backend: CalendarBackend) {
    super();
  }

  protected async run(params: ToolCallParams): Promise<Appointment> {
    return this.backend.cancelAppointment(
      params.tenant_id,
      params.office_id,
      params.arguments.appointment_id as string,
      params.arguments.reason as string | undefined,
    );
  }
}