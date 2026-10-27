import api from '@/lib/api'
import { getAuthQueryScope } from '@/lib/queryClient'

// ---------------------------------------------------------------------------
// Asistente IA de WhatsApp (Ajustes → Asistente IA). admin edita, manager ve.
// ---------------------------------------------------------------------------

export const aiAgentQueryKeys = {
  config: () => ['aiAgent', getAuthQueryScope(), 'config'] as const,
  appointments: () => ['aiAgent', getAuthQueryScope(), 'appointments'] as const,
  activity: () => ['aiAgent', getAuthQueryScope(), 'activity'] as const,
}

export interface AiAgentConfig {
  enabled: boolean
  /** Activado + información del negocio + clave de OpenAI: responde de verdad. */
  active: boolean
  assistantName: string
  businessInfo: string
  faq: string
  tone: string
  /** Proceso comercial: siguiente paso por etapa, objeciones y trato a clientes. */
  salesProcess: string
  qualification: string
  handoffRules: string
  /** Aviso de autorización de datos personales (Ley 1581) que pide antes de guardar datos. */
  privacyNotice: string
  /** Pedir esa autorización antes de guardar datos, agendar o registrar referidos. */
  consentRequired: boolean
  openaiConfigured: boolean
  model: string
  defaults: { tone: string; sales_process: string; qualification: string; handoff_rules: string; privacy_notice: string }
  /** Responsable de las oportunidades que abre el asistente para leads sin dueño. */
  defaultOwnerId: string | null
  defaultOwnerName: string | null
  /** Chats donde el asistente está en pausa (los atiende un asesor). */
  pausedChats: number
  /** Chats donde un asesor escribió en los últimos 7 días. */
  humanChats: number
  calendar: AiCalendarSettings
  reminders: AiReminderSettings
  /** Hay calendario y cuenta de servicio de Google: el asistente puede agendar. */
  calendarActive: boolean
  googleConfigured: boolean
  /** Correo con el que se comparte el calendario de Google. */
  serviceAccountEmail: string | null
}

export interface AiReminderSettings {
  /** Horas antes de la cita en que se recuerda al cliente (24, 1…). */
  client_offsets: number[]
  whatsapp_template_id: string | null
  no_show_template_id: string | null
  email_enabled: boolean
  /** Minutos antes para el recordatorio al asesor (0 = desactivado). */
  staff_offset_minutes: number
  daily_summary: boolean
  no_show_followup: boolean
}

export interface AiCalendarSettings {
  calendar_id: string
  duration_minutes: number
  /** 0 = domingo … 6 = sábado */
  work_days: number[]
  start_time: string
  end_time: string
  min_notice_hours: number
  max_days_ahead: number
  location: string
}

export function mapConfig(d: Record<string, unknown>): AiAgentConfig {
  return {
    enabled: d.enabled === true,
    active: d.active === true,
    assistantName: String(d.assistant_name ?? ''),
    businessInfo: String(d.business_info ?? ''),
    faq: String(d.faq ?? ''),
    tone: String(d.tone ?? ''),
    salesProcess: String(d.sales_process ?? ''),
    qualification: String(d.qualification ?? ''),
    handoffRules: String(d.handoff_rules ?? ''),
    privacyNotice: String(d.privacy_notice ?? ''),
    consentRequired: d.consent_required !== false,
    openaiConfigured: d.openai_configured === true,
    model: String(d.model ?? ''),
    defaults: (d.defaults ?? { tone: '', sales_process: '', qualification: '', handoff_rules: '', privacy_notice: '' }) as AiAgentConfig['defaults'],
    defaultOwnerId: d.default_owner_id != null ? String(d.default_owner_id) : null,
    defaultOwnerName: d.default_owner_name != null ? String(d.default_owner_name) : null,
    pausedChats: Number(d.paused_chats ?? 0),
    humanChats: Number(d.human_chats ?? 0),
    calendar: d.calendar as AiCalendarSettings,
    reminders: d.reminders as AiReminderSettings,
    calendarActive: d.calendar_active === true,
    googleConfigured: d.google_configured === true,
    serviceAccountEmail: d.service_account_email != null ? String(d.service_account_email) : null,
  }
}

export async function fetchAiAgentConfig(): Promise<AiAgentConfig> {
  const res = await api.get('/ai_agent')
  return mapConfig(res.data.data ?? {})
}

export type AiAgentInput = {
  enabled: boolean
  default_owner_id: string | null
  assistant_name: string
  business_info: string
  faq: string
  tone: string
  sales_process: string
  qualification: string
  handoff_rules: string
  privacy_notice: string
  consent_required: boolean
}

export async function updateAiAgentConfig(
  body: Partial<AiAgentInput> & { calendar?: AiCalendarSettings; reminders?: AiReminderSettings },
  options: { pauseHumanChats?: boolean } = {},
): Promise<{ config: AiAgentConfig; pausedNow: number }> {
  const res = await api.patch('/ai_agent', { ai_agent: body, pause_human_chats: options.pauseHumanChats })
  return { config: mapConfig(res.data.data ?? {}), pausedNow: Number(res.data.meta?.paused_now ?? 0) }
}

/** Pausar (paused: true) o reanudar el asistente en todos los chats. */
export async function setAllChatsPaused(paused: boolean): Promise<{ config: AiAgentConfig; changed: number }> {
  const res = await api.post('/ai_agent/chats', { paused })
  return { config: mapConfig(res.data.data ?? {}), changed: Number(res.data.meta?.changed ?? 0) }
}

export type ChatTurn = { role: 'user' | 'assistant'; content: string }

export interface AiToolCall {
  name: string
  arguments: Record<string, unknown>
  result: string
  /** No se ejecutó: faltaba la autorización de datos (Ley 1581). */
  blocked?: boolean
}

/** consent: el cliente de prueba ya autorizó sus datos (Ley 1581) en esta conversación. */
export async function testAiAgent(
  messages: ChatTurn[],
  consent = false,
): Promise<{ reply: string; status: string; toolCalls: AiToolCall[] }> {
  const res = await api.post('/ai_agent/test', { messages, consent })
  const d = res.data.data ?? {}
  return { reply: String(d.reply ?? ''), status: String(d.status ?? ''), toolCalls: (d.tool_calls ?? []) as AiToolCall[] }
}

export interface AiAgentRunRow {
  id: string
  status: 'replied' | 'handoff' | 'skipped' | 'error'
  createdAt: string
  contactId: string
  contactName: string | null
  reply: string | null
  toolCalls: AiToolCall[]
  error: string | null
  inputTokens: number
  outputTokens: number
}

/** Métricas del piloto (últimos 30 días): solo lo que hizo el asistente. */
export interface AiAgentMetrics {
  /** Contactos a los que respondió. */
  conversations: number
  /** Oportunidades que calificó, por temperatura actual. */
  leads: { cold: number; warm: number; hot: number }
  demos: number
  demosCompleted: number
  handoffs: number
  referrals: number
  /** Autorizaciones de datos (Ley 1581) que registró. */
  consents: number
  optOuts: number
}

export interface AiAgentActivity {
  runs: AiAgentRunRow[]
  last30: { replies: number; handoffs: number; errors: number; inputTokens: number; outputTokens: number }
  metrics: AiAgentMetrics
}

export async function fetchAiAgentActivity(): Promise<AiAgentActivity> {
  const res = await api.get('/ai_agent/activity')
  const rows = (res.data.data ?? []) as Record<string, unknown>[]
  const m = (res.data.meta?.last_30_days ?? {}) as Record<string, number>
  const k = (res.data.meta?.metrics ?? {}) as Record<string, unknown>
  const leads = (k.leads ?? {}) as Record<string, number>
  return {
    runs: rows.map((r) => ({
      id: String(r.id),
      status: r.status as AiAgentRunRow['status'],
      createdAt: String(r.created_at ?? ''),
      contactId: String(r.contact_id ?? ''),
      contactName: r.contact_name != null ? String(r.contact_name) : null,
      reply: r.reply != null ? String(r.reply) : null,
      toolCalls: (r.tool_calls ?? []) as AiToolCall[],
      error: r.error != null ? String(r.error) : null,
      inputTokens: Number(r.input_tokens ?? 0),
      outputTokens: Number(r.output_tokens ?? 0),
    })),
    last30: {
      replies: Number(m.replies ?? 0),
      handoffs: Number(m.handoffs ?? 0),
      errors: Number(m.errors ?? 0),
      inputTokens: Number(m.input_tokens ?? 0),
      outputTokens: Number(m.output_tokens ?? 0),
    },
    metrics: {
      conversations: Number(k.conversations ?? 0),
      leads: { cold: Number(leads.cold ?? 0), warm: Number(leads.warm ?? 0), hot: Number(leads.hot ?? 0) },
      demos: Number(k.demos ?? 0),
      demosCompleted: Number(k.demos_completed ?? 0),
      handoffs: Number(k.handoffs ?? 0),
      referrals: Number(k.referrals ?? 0),
      consents: Number(k.consents ?? 0),
      optOuts: Number(k.opt_outs ?? 0),
    },
  }
}

/** Costo aproximado en USD con precios de referencia de la línea «mini» (USD por millón de tokens). */
export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (inputTokens * 0.4 + outputTokens * 1.6) / 1_000_000
}

export const TOOL_LABELS: Record<string, string> = {
  calificar_lead: 'Calificó el lead',
  guardar_datos_contacto: 'Guardó datos del contacto',
  pasar_a_asesor: 'Pasó a un asesor',
  no_contactar: 'Registró la baja',
  registrar_referido: 'Registró un referido',
  registrar_autorizacion_datos: 'Registró la autorización de datos',
  consultar_disponibilidad: 'Consultó la agenda',
  agendar_cita: 'Agendó una cita',
  reprogramar_cita: 'Reprogramó la cita',
  cancelar_cita: 'Canceló la cita',
}

/** Etiqueta de una acción del asistente; las bloqueadas no se muestran como hechas. */
export function toolCallLabel(tool: AiToolCall): string {
  const label = TOOL_LABELS[tool.name] ?? tool.name
  return tool.blocked ? `No ejecutado: ${label.charAt(0).toLowerCase()}${label.slice(1)} (falta autorización)` : label
}

export async function testCalendar(): Promise<{ label: string; startsAt: string }[]> {
  const res = await api.post('/ai_agent/calendar_test')
  return ((res.data.data?.slots ?? []) as { label: string; starts_at: string }[]).map((s) => ({
    label: s.label,
    startsAt: s.starts_at,
  }))
}

export interface AppointmentRow {
  id: string
  label: string
  startsAt: string
  contactId: string
  contactName: string | null
  ownerName: string | null
  notes: string | null
  confirmedAt: string | null
  /** Recordatorios enviados al cliente (horas antes). */
  remindersSent: number[]
}

function mapAppointment(a: Record<string, unknown>): AppointmentRow {
  return {
    id: String(a.id),
    label: String(a.label ?? ''),
    startsAt: String(a.starts_at ?? ''),
    contactId: String(a.contact_id ?? ''),
    contactName: a.contact_name != null ? String(a.contact_name) : null,
    ownerName: a.owner_name != null ? String(a.owner_name) : null,
    notes: a.notes != null ? String(a.notes) : null,
    confirmedAt: a.confirmed_at != null ? String(a.confirmed_at) : null,
    remindersSent: Array.isArray(a.reminders_sent) ? (a.reminders_sent as number[]) : [],
  }
}

/** Próximas citas y las que ya pasaron sin marcar si el cliente asistió. */
export async function fetchAppointments(): Promise<{ upcoming: AppointmentRow[]; awaitingOutcome: AppointmentRow[] }> {
  const res = await api.get('/ai_agent/appointments')
  return {
    upcoming: ((res.data.data ?? []) as Record<string, unknown>[]).map(mapAppointment),
    awaitingOutcome: ((res.data.meta?.awaiting_outcome ?? []) as Record<string, unknown>[]).map(mapAppointment),
  }
}

export async function setAppointmentOutcome(id: string, outcome: 'attended' | 'no_show'): Promise<void> {
  await api.post(`/ai_agent/appointments/${id}/outcome`, { outcome })
}

export async function cancelAppointment(id: string): Promise<void> {
  await api.post(`/ai_agent/appointments/${id}/cancel`)
}
