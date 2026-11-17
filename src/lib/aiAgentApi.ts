import api from '@/lib/api'
import { getAuthQueryScope } from '@/lib/queryClient'

// ---------------------------------------------------------------------------
// Asistente IA de WhatsApp (Ajustes → Asistente IA). admin edita, manager ve.
// ---------------------------------------------------------------------------

export const aiAgentQueryKeys = {
  config: () => ['aiAgent', getAuthQueryScope(), 'config'] as const,
  appointments: () => ['aiAgent', getAuthQueryScope(), 'appointments'] as const,
  activity: () => ['aiAgent', getAuthQueryScope(), 'activity'] as const,
  versions: () => ['aiAgent', getAuthQueryScope(), 'versions'] as const,
  version: (id: string) => ['aiAgent', getAuthQueryScope(), 'versions', id] as const,
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
  /** Piloto: si hay números (E.164), solo les responde a ellos; vacío = a todos. */
  pilotNumbers: string[]
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
  /** Topes de costo; 0 = sin tope. */
  limits: AiLimits
  /** Hay calendario y cuenta de servicio de Google: el asistente puede agendar. */
  calendarActive: boolean
  googleConfigured: boolean
  /** Correo con el que se comparte el calendario de Google. */
  serviceAccountEmail: string | null
}

export interface AiLimits {
  /** Tokens por conversación en 24 h; al llegar, el chat pasa a un asesor. */
  conversation_tokens: number
  /** Gasto del mes en USD; alerta al 80 % y al 100 % pasa los chats a asesores. */
  monthly_budget_usd: number
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
    pilotNumbers: Array.isArray(d.pilot_numbers) ? d.pilot_numbers.map(String) : [],
    openaiConfigured: d.openai_configured === true,
    model: String(d.model ?? ''),
    defaults: (d.defaults ?? { tone: '', sales_process: '', qualification: '', handoff_rules: '', privacy_notice: '' }) as AiAgentConfig['defaults'],
    defaultOwnerId: d.default_owner_id != null ? String(d.default_owner_id) : null,
    defaultOwnerName: d.default_owner_name != null ? String(d.default_owner_name) : null,
    pausedChats: Number(d.paused_chats ?? 0),
    humanChats: Number(d.human_chats ?? 0),
    calendar: d.calendar as AiCalendarSettings,
    reminders: d.reminders as AiReminderSettings,
    limits: {
      conversation_tokens: Number((d.limits as Record<string, unknown> | undefined)?.conversation_tokens ?? 60000),
      monthly_budget_usd: Number((d.limits as Record<string, unknown> | undefined)?.monthly_budget_usd ?? 20),
    },
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
  pilot_numbers: string[]
  limits: AiLimits
}

/** changeReason: motivo del cambio de instrucciones; queda en el historial de versiones. */
export async function updateAiAgentConfig(
  body: Partial<AiAgentInput> & { calendar?: AiCalendarSettings; reminders?: AiReminderSettings },
  options: { pauseHumanChats?: boolean; changeReason?: string } = {},
): Promise<{ config: AiAgentConfig; pausedNow: number }> {
  const res = await api.patch('/ai_agent', {
    ai_agent: body,
    pause_human_chats: options.pauseHumanChats,
    change_reason: options.changeReason?.trim() || undefined,
  })
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
  /** Número de la versión de las instrucciones con que respondió. */
  configVersion: number | null
  /** Desde que llegó el mensaje del cliente hasta que salió la respuesta (ms). */
  latencyMs: number | null
  /** Tiempo esperando a OpenAI (ms). */
  modelMs: number | null
  /** Por qué pasó a un asesor (HANDOFF_TYPE_LABELS). */
  handoffType: string | null
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
  /** Pasos a asesor por tipo (RFC §9). */
  handoffsByType: Record<string, number>
  /** Tiempo de respuesta: mediana y percentil 90 (ms); meta del RFC: menos de 10 s. */
  responseTime: { medianMs: number | null; p90Ms: number | null; samples: number }
}

export interface AiAgentActivity {
  runs: AiAgentRunRow[]
  last30: { replies: number; handoffs: number; errors: number; inputTokens: number; outputTokens: number }
  metrics: AiAgentMetrics
  /** Gasto estimado del mes calendario frente al tope. */
  budget: { monthUsd: number; monthlyBudgetUsd: number; percent: number | null }
}

export async function fetchAiAgentActivity(): Promise<AiAgentActivity> {
  const res = await api.get('/ai_agent/activity')
  return mapActivity(res.data ?? {})
}

const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v))

export function mapActivity(body: { data?: unknown; meta?: Record<string, unknown> }): AiAgentActivity {
  const rows = (body.data ?? []) as Record<string, unknown>[]
  const m = (body.meta?.last_30_days ?? {}) as Record<string, number>
  const k = (body.meta?.metrics ?? {}) as Record<string, unknown>
  const leads = (k.leads ?? {}) as Record<string, number>
  const rt = (k.response_time ?? {}) as Record<string, unknown>
  const b = (body.meta?.budget ?? {}) as Record<string, unknown>
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
      configVersion: numOrNull(r.config_version),
      latencyMs: numOrNull(r.latency_ms),
      modelMs: numOrNull(r.model_ms),
      handoffType: r.handoff_type != null ? String(r.handoff_type) : null,
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
      handoffsByType: (k.handoffs_by_type ?? {}) as Record<string, number>,
      responseTime: {
        medianMs: numOrNull(rt.median_ms),
        p90Ms: numOrNull(rt.p90_ms),
        samples: Number(rt.samples ?? 0),
      },
    },
    budget: {
      monthUsd: Number(b.month_usd ?? 0),
      monthlyBudgetUsd: Number(b.monthly_budget_usd ?? 0),
      percent: numOrNull(b.percent),
    },
  }
}

/** Por qué pasó a un asesor; los tres últimos los decide el sistema. */
export const HANDOFF_TYPE_LABELS: Record<string, string> = {
  pidio_asesor: 'Pidió una persona',
  compra_o_cotizacion: 'Compra o cotización',
  molesto: 'Cliente molesto',
  sin_informacion: 'Sin información',
  agenda: 'Agendar',
  datos_personales: 'Datos personales',
  otro: 'Otro',
  promesa: 'Prometió un asesor',
  multimedia: 'Audio o archivo',
  falla_ia: 'Falla del asistente',
  precio_no_aprobado: 'Precio no aprobado',
  tope_conversacion: 'Tope de la conversación',
  tope_mensual: 'Tope de costo del mes',
}

/** Frase que el filtro de precios no dejó enviar, si la hubo. */
export function blockedPriceSentence(calls: AiToolCall[]): string | null {
  const call = calls.find((c) => c.name === 'filtro_precios')
  return call && typeof call.arguments.frase === 'string' ? call.arguments.frase : null
}

/** 9500 → «9,5 s». */
export function formatSeconds(ms: number | null): string {
  if (ms == null) return '—'
  return `${(ms / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} s`
}

// ---- Historial de versiones de las instrucciones (RFC §13 y §17) ----------

export interface AiAgentConfigVersion {
  id: string
  number: number
  createdAt: string
  userName: string | null
  reason: string | null
  changedFields: string[]
  /** Solo en el detalle: los textos de esa versión. */
  content?: Record<string, string | boolean>
}

function mapVersion(v: Record<string, unknown>): AiAgentConfigVersion {
  return {
    id: String(v.id),
    number: Number(v.number ?? 0),
    createdAt: String(v.created_at ?? ''),
    userName: v.user_name != null ? String(v.user_name) : null,
    reason: v.reason != null ? String(v.reason) : null,
    changedFields: Array.isArray(v.changed_fields) ? v.changed_fields.map(String) : [],
    content: v.content != null ? (v.content as Record<string, string | boolean>) : undefined,
  }
}

export async function fetchAiAgentVersions(): Promise<AiAgentConfigVersion[]> {
  const res = await api.get('/ai_agent/versions')
  return ((res.data.data ?? []) as Record<string, unknown>[]).map(mapVersion)
}

export async function fetchAiAgentVersion(id: string): Promise<AiAgentConfigVersion> {
  const res = await api.get(`/ai_agent/versions/${id}`)
  return mapVersion(res.data.data ?? {})
}

/** Nombre en pantalla de cada campo versionado. */
export const VERSION_FIELD_LABELS: Record<string, string> = {
  assistant_name: 'Nombre del asistente',
  business_info: 'Información del negocio',
  faq: 'Preguntas frecuentes',
  tone: 'Tono',
  sales_process: 'Proceso comercial',
  qualification: 'Calificación',
  handoff_rules: 'Paso a asesor',
  privacy_notice: 'Aviso de autorización',
  consent_required: 'Pedir autorización',
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
  filtro_precios: 'Bloqueó un precio no aprobado',
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
