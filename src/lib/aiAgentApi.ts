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
  review: () => ['aiAgent', getAuthQueryScope(), 'review'] as const,
  evals: () => ['aiAgent', getAuthQueryScope(), 'evals'] as const,
  evalRun: (id: string) => ['aiAgent', getAuthQueryScope(), 'evals', id] as const,
  evalCases: () => ['aiAgent', getAuthQueryScope(), 'evalCases'] as const,
  weeklyReview: () => ['aiAgent', getAuthQueryScope(), 'weeklyReview'] as const,
  keyRotations: () => ['aiAgent', getAuthQueryScope(), 'keyRotations'] as const,
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
  /** Responsable de seguridad (RFC §16): recibe las alertas de incidentes. */
  securityOwnerId: string | null
  securityOwnerName: string | null
  /** Chats donde el asistente está en pausa (los atiende un asesor). */
  pausedChats: number
  /** Chats donde un asesor escribió en los últimos 7 días. */
  humanChats: number
  calendar: AiCalendarSettings
  reminders: AiReminderSettings
  /** Topes de costo; 0 = sin tope. */
  limits: AiLimits
  /** Respuestas a objeciones (RFC §6); solo las aprobadas por dirección (§18) llegan al asistente. */
  objections: AiObjection[]
  /** Criterios de frío / tibio / caliente (RFC §7) y si comercial los validó. */
  leadCriteria: AiLeadCriteria
  /** Base de conocimiento (RFC §10): responsable y, por apartado, fuente y validación. */
  knowledge: AiKnowledge
  criteriaDefaults: Record<CriteriaLevel, string>
  /** Hay calendario y cuenta de servicio de Google: el asistente puede agendar. */
  calendarActive: boolean
  googleConfigured: boolean
  /** Correo con el que se comparte el calendario de Google. */
  serviceAccountEmail: string | null
}

export type KnowledgeSection = 'business_info' | 'faq' | 'sales_process'

export const KNOWLEDGE_SECTIONS: { key: KnowledgeSection; label: string }[] = [
  { key: 'business_info', label: 'Información del negocio' },
  { key: 'faq', label: 'Preguntas frecuentes' },
  { key: 'sales_process', label: 'Proceso comercial' },
]

export interface AiKnowledgeSection {
  source: string
  validated_at: string | null
  validated_by_name: string | null
  /** Nunca validado o validado hace más de reviewDays. */
  stale: boolean
}

export interface AiKnowledge {
  ownerId: string | null
  ownerName: string | null
  reviewDays: number
  sections: Record<KnowledgeSection, AiKnowledgeSection>
}

export type AiKnowledgeInput = {
  owner_id?: string | null
  review_days?: number
  sections?: Partial<Record<KnowledgeSection, { source: string; validated: boolean; revalidate?: boolean }>>
}

export type CriteriaLevel = 'cold' | 'warm' | 'hot'

export interface AiLeadCriteria {
  cold: string
  warm: string
  hot: string
  validated_at: string | null
  validated_by_name: string | null
}

export interface AiObjection {
  key: string
  /** Lo que dice el cliente («Es caro»). */
  trigger: string
  response: string
  /** Pregunta de reencuadre que hace después (opcional). */
  reframe: string
  /** Qué debe confirmar dirección antes de aprobarla (§18). */
  validation_note: string
  approved_at: string | null
  approved_by_name: string | null
}

/** Lo que se envía al guardar: la aprobación la registra el servidor con quien guarda. */
export type AiObjectionInput = Pick<AiObjection, 'key' | 'trigger' | 'response' | 'reframe' | 'validation_note'> & {
  approved: boolean
}

export interface AiLimits {
  /** Tokens por conversación en 24 h; al llegar, el chat pasa a un asesor. */
  conversation_tokens: number
  /** Gasto del mes en USD; alerta al 80 % y al 100 % pasa los chats a asesores. */
  monthly_budget_usd: number
  /** Respuestas por número por minuto (0 = sin límite); al pasarlo es un incidente (RFC §16). */
  per_minute: number
  /** Mensajes por minuto en todo el CRM desde los que se avisa de un pico (0 = no avisar). */
  spike_per_minute: number
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
  /** «¿Qué te pareció?» tras una cita marcada como realizada (RFC §5). */
  post_demo_followup: boolean
  post_demo_template_id: string | null
  /** Horas después de terminar la cita. */
  post_demo_hours: number
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
    securityOwnerId: d.security_owner_id != null ? String(d.security_owner_id) : null,
    securityOwnerName: d.security_owner_name != null ? String(d.security_owner_name) : null,
    pausedChats: Number(d.paused_chats ?? 0),
    humanChats: Number(d.human_chats ?? 0),
    calendar: d.calendar as AiCalendarSettings,
    reminders: d.reminders as AiReminderSettings,
    limits: {
      conversation_tokens: Number((d.limits as Record<string, unknown> | undefined)?.conversation_tokens ?? 60000),
      monthly_budget_usd: Number((d.limits as Record<string, unknown> | undefined)?.monthly_budget_usd ?? 20),
      per_minute: Number((d.limits as Record<string, unknown> | undefined)?.per_minute ?? 5),
      spike_per_minute: Number((d.limits as Record<string, unknown> | undefined)?.spike_per_minute ?? 30),
    },
    objections: Array.isArray(d.objections)
      ? (d.objections as Record<string, unknown>[]).map((o) => ({
          key: String(o.key ?? ''),
          trigger: String(o.trigger ?? ''),
          response: String(o.response ?? ''),
          reframe: String(o.reframe ?? ''),
          validation_note: String(o.validation_note ?? ''),
          approved_at: o.approved_at ? String(o.approved_at) : null,
          approved_by_name: o.approved_by_name ? String(o.approved_by_name) : null,
        }))
      : [],
    leadCriteria: (() => {
      const c = (d.lead_criteria ?? {}) as Record<string, unknown>
      return {
        cold: String(c.cold ?? ''),
        warm: String(c.warm ?? ''),
        hot: String(c.hot ?? ''),
        validated_at: c.validated_at ? String(c.validated_at) : null,
        validated_by_name: c.validated_by_name ? String(c.validated_by_name) : null,
      }
    })(),
    knowledge: (() => {
      const k = (d.knowledge ?? {}) as Record<string, unknown>
      const sections = (k.sections ?? {}) as Record<string, Record<string, unknown>>
      const section = (key: KnowledgeSection): AiKnowledgeSection => {
        const e = sections[key] ?? {}
        return {
          source: String(e.source ?? ''),
          validated_at: e.validated_at ? String(e.validated_at) : null,
          validated_by_name: e.validated_by_name ? String(e.validated_by_name) : null,
          stale: e.stale !== false,
        }
      }
      return {
        ownerId: k.owner_id != null ? String(k.owner_id) : null,
        ownerName: k.owner_name != null ? String(k.owner_name) : null,
        reviewDays: Number(k.review_days ?? 90),
        sections: { business_info: section('business_info'), faq: section('faq'), sales_process: section('sales_process') },
      }
    })(),
    criteriaDefaults: (d.criteria_defaults ?? { cold: '', warm: '', hot: '' }) as Record<CriteriaLevel, string>,
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
  security_owner_id: string | null
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
  body: Partial<AiAgentInput> & {
    calendar?: AiCalendarSettings
    reminders?: AiReminderSettings
    objections?: AiObjectionInput[]
    lead_criteria?: Record<CriteriaLevel, string> & { validated: boolean }
    knowledge?: AiKnowledgeInput
  },
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
  /** Calificaciones de los asesores (RFC §17). */
  ratings: Record<AiRunRating, number>
  /** Pendientes en la cola de revisión semanal. */
  reviewPending: number
  /** Seguridad (RFC §16): intentos de manipulación y mensajes con datos sensibles ocultos. */
  injectionAttempts: number
  sensitiveMasked: number
  /** Errores por categoría (RFC §17): esta ventana y la anterior (reincidencia). */
  errorsByCategory: Record<string, { current: number; previous: number }>
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
      ratings: {
        correct: Number((k.ratings as Record<string, unknown> | undefined)?.correct ?? 0),
        partial: Number((k.ratings as Record<string, unknown> | undefined)?.partial ?? 0),
        incorrect: Number((k.ratings as Record<string, unknown> | undefined)?.incorrect ?? 0),
      },
      reviewPending: Number(k.review_pending ?? 0),
      injectionAttempts: Number(k.injection_attempts ?? 0),
      errorsByCategory: Object.fromEntries(
        Object.entries((k.errors_by_category ?? {}) as Record<string, Record<string, unknown>>).map(([cat, v]) => [
          cat,
          { current: Number(v?.current ?? 0), previous: Number(v?.previous ?? 0) },
        ]),
      ),
      sensitiveMasked: Number(k.sensitive_masked ?? 0),
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
  frase_no_aprobada: 'Frase no aprobada',
  tope_conversacion: 'Tope de la conversación',
  tope_mensual: 'Tope de costo del mes',
}

/** Frase que el filtro de precios no dejó enviar, si la hubo. */
export function blockedPriceSentence(calls: AiToolCall[]): string | null {
  const call = calls.find((c) => c.name === 'filtro_precios')
  return call && typeof call.arguments.frase === 'string' ? call.arguments.frase : null
}

/** Frase absoluta no aprobada («garantizado», «ilimitado»…) que el filtro no dejó enviar. */
export function blockedClaimSentence(calls: AiToolCall[]): string | null {
  const call = calls.find((c) => c.name === 'filtro_frases')
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

// ---- Mejora continua (RFC-001 v2 §17) ---------------------------------------

export type AiRunRating = 'correct' | 'partial' | 'incorrect'

export const RATING_LABELS: Record<AiRunRating, string> = {
  correct: 'Correcta',
  partial: 'Parcial',
  incorrect: 'Incorrecta',
}

/** Respuesta del asistente en un mensaje de la bandeja (atributo `ai_run`). */
// Categorías y severidad de los errores (RFC §17), con la severidad sugerida.
export const ERROR_CATEGORIES: { key: string; label: string; severity: ErrorSeverity }[] = [
  { key: 'respuesta_incorrecta', label: 'Respuesta incorrecta', severity: 'critica' },
  { key: 'precio_fuera_de_base', label: 'Precio o condición no aprobada', severity: 'critica' },
  { key: 'transferencia_fallida', label: 'No pasó a un asesor cuando debía', severity: 'alta' },
  { key: 'cita_fallida', label: 'Cita duplicada o no creada', severity: 'alta' },
  { key: 'referido_duplicado', label: 'Referido duplicado', severity: 'alta' },
  { key: 'objecion_sin_respuesta', label: 'Objeción sin respuesta', severity: 'media' },
  { key: 'tono_inadecuado', label: 'Tono inadecuado', severity: 'baja' },
]

export type ErrorSeverity = 'critica' | 'alta' | 'media' | 'baja'

export const SEVERITY_LABELS: Record<ErrorSeverity, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
}

export const ERROR_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  ERROR_CATEGORIES.map((c) => [c.key, c.label]),
)

export interface MessageAiRun {
  id: string
  rating: AiRunRating | null
  ratingNote: string | null
  errorCategory: string | null
  errorSeverity: ErrorSeverity | null
}

export function mapMessageAiRun(raw: unknown): MessageAiRun | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const rating = typeof r.rating === 'string' && r.rating in RATING_LABELS ? (r.rating as AiRunRating) : null
  return {
    id: String(r.id ?? ''),
    rating,
    ratingNote: typeof r.rating_note === 'string' && r.rating_note ? r.rating_note : null,
    errorCategory: typeof r.error_category === 'string' && r.error_category ? r.error_category : null,
    errorSeverity:
      typeof r.error_severity === 'string' && r.error_severity in SEVERITY_LABELS
        ? (r.error_severity as ErrorSeverity)
        : null,
  }
}

/** rating null = quitar la calificación. category/severity solo con parcial o incorrecta. */
export async function rateAiAgentRun(
  id: string,
  rating: AiRunRating | null,
  note?: string,
  error?: { category?: string; severity?: ErrorSeverity },
): Promise<void> {
  await api.post(`/ai_agent/runs/${id}/rating`, {
    rating: rating ?? '',
    note: note ?? '',
    category: error?.category ?? '',
    severity: error?.severity ?? '',
  })
}

export type ReviewReason = 'sin_informacion' | 'partial' | 'incorrect'

export const REVIEW_REASON_LABELS: Record<ReviewReason, string> = {
  sin_informacion: 'No supo responder',
  partial: 'Calificada parcial',
  incorrect: 'Calificada incorrecta',
}

export interface ReviewItem {
  id: string
  createdAt: string
  reason: ReviewReason | null
  contactId: string
  contactName: string | null
  question: string | null
  reply: string | null
  ratingNote: string | null
  ratedByName: string | null
  handoffReason: string | null
  errorCategory: string | null
  errorSeverity: ErrorSeverity | null
}

export function mapReviewItem(r: Record<string, unknown>): ReviewItem {
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
  const reason = str(r.reason)
  return {
    id: String(r.id ?? ''),
    createdAt: String(r.created_at ?? ''),
    reason: reason && reason in REVIEW_REASON_LABELS ? (reason as ReviewReason) : null,
    contactId: String(r.contact_id ?? ''),
    contactName: str(r.contact_name),
    question: str(r.question),
    reply: str(r.reply),
    ratingNote: str(r.rating_note),
    ratedByName: str(r.rated_by_name),
    handoffReason: str(r.handoff_reason),
    errorCategory: str(r.error_category),
    errorSeverity: (str(r.error_severity) as ErrorSeverity | null) ?? null,
  }
}

export async function fetchAiAgentReview(): Promise<ReviewItem[]> {
  const res = await api.get('/ai_agent/review')
  return ((res.data.data ?? []) as Record<string, unknown>[]).map(mapReviewItem)
}

export async function markAiAgentRunReviewed(id: string, note?: string): Promise<void> {
  await api.post(`/ai_agent/runs/${id}/review`, { note: note ?? '' })
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
  objections: 'Objeciones aprobadas',
  lead_criteria: 'Criterios de calificación',
  knowledge: 'Responsable y fuentes',
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
  filtro_frases: 'Bloqueó una frase no aprobada',
  datos_sensibles: 'Ocultó datos sensibles al modelo',
  intento_manipulacion: 'Intento de manipulación (registrado)',
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

// ---- Pruebas con el modelo real y casos de regresión (RFC §13, §14 y §17) ----

export type EvalRunStatus = 'queued' | 'running' | 'done' | 'error'

export interface EvalCaseResult {
  name: string
  category: string
  passed: boolean
  attempts: number
  passedAttempts: number
  failures: string[]
  reply: string
  tools: string[]
}

export interface EvalRun {
  id: string
  status: EvalRunStatus
  repeat: number
  total: number
  passed: number
  failed: number
  model: string | null
  configVersion: number | null
  error: string | null
  userName: string | null
  createdAt: string
  finishedAt: string | null
  results: EvalCaseResult[]
}

export function mapEvalRun(d: Record<string, unknown>): EvalRun {
  return {
    id: String(d.id),
    status: (d.status as EvalRunStatus) ?? 'queued',
    repeat: Number(d.repeat ?? 1),
    total: Number(d.total ?? 0),
    passed: Number(d.passed ?? 0),
    failed: Number(d.failed ?? 0),
    model: d.model != null ? String(d.model) : null,
    configVersion: d.config_version != null ? Number(d.config_version) : null,
    error: d.error != null ? String(d.error) : null,
    userName: d.user_name != null ? String(d.user_name) : null,
    createdAt: String(d.created_at ?? ''),
    finishedAt: d.finished_at != null ? String(d.finished_at) : null,
    results: ((d.results ?? []) as Record<string, unknown>[]).map((r) => ({
      name: String(r.name ?? ''),
      category: String(r.category ?? ''),
      passed: r.passed === true,
      attempts: Number(r.attempts ?? 1),
      passedAttempts: Number(r.passed_attempts ?? (r.passed === true ? 1 : 0)),
      failures: Array.isArray(r.failures) ? r.failures.map(String) : [],
      reply: String(r.reply ?? ''),
      tools: Array.isArray(r.tools) ? r.tools.map(String) : [],
    })),
  }
}

export async function fetchEvalRuns(): Promise<{ runs: EvalRun[]; cases: number; regressionCases: number }> {
  const res = await api.get('/ai_agent/evals')
  return {
    runs: ((res.data.data ?? []) as Record<string, unknown>[]).map(mapEvalRun),
    cases: Number(res.data.meta?.cases ?? 0),
    regressionCases: Number(res.data.meta?.regression_cases ?? 0),
  }
}

export async function fetchEvalRun(id: string): Promise<EvalRun> {
  const res = await api.get(`/ai_agent/evals/${id}`)
  return mapEvalRun(res.data.data ?? {})
}

export async function startEvalRun(repeat: number): Promise<EvalRun> {
  const res = await api.post('/ai_agent/evals', { repeat })
  return mapEvalRun(res.data.data ?? {})
}

export interface EvalExpect {
  status?: 'replied' | 'handoff'
  includes_any?: string[]
  excludes?: string[]
  tools?: string[]
  no_tools?: string[]
}

export interface EvalCase {
  id: string
  name: string
  notes: string | null
  consent: boolean
  messages: ChatTurn[]
  expect: EvalExpect
  createdAt: string
  createdByName: string | null
}

export async function fetchEvalCases(): Promise<EvalCase[]> {
  const res = await api.get('/ai_agent/eval_cases')
  return ((res.data.data ?? []) as Record<string, unknown>[]).map((d) => ({
    id: String(d.id),
    name: String(d.name ?? ''),
    notes: d.notes != null ? String(d.notes) : null,
    consent: d.consent !== false,
    messages: (d.messages ?? []) as ChatTurn[],
    expect: (d.expect ?? {}) as EvalExpect,
    createdAt: String(d.created_at ?? ''),
    createdByName: d.created_by_name != null ? String(d.created_by_name) : null,
  }))
}

export interface EvalCaseDraft {
  name: string
  consent: boolean
  messages: ChatTurn[]
  reply: string | null
}

/** Conversación de esa respuesta hasta la pregunta del cliente, anonimizada por el servidor. */
export async function fetchEvalCaseDraft(runId: string): Promise<EvalCaseDraft> {
  const res = await api.get('/ai_agent/eval_cases/draft', { params: { run_id: runId } })
  const d = res.data.data ?? {}
  return {
    name: String(d.name ?? ''),
    consent: d.consent !== false,
    messages: (d.messages ?? []) as ChatTurn[],
    reply: d.reply != null ? String(d.reply) : null,
  }
}

export async function createEvalCase(body: {
  name: string
  notes?: string
  consent: boolean
  messages: ChatTurn[]
  expect: EvalExpect
  run_id?: string
}): Promise<void> {
  await api.post('/ai_agent/eval_cases', { eval_case: body })
}

export async function deleteEvalCase(id: string): Promise<void> {
  await api.delete(`/ai_agent/eval_cases/${id}`)
}

// ---- Revisión semanal (RFC §17) ----------------------------------------------

export interface WeeklyReview {
  since: string
  conversations: number
  /** Porcentajes (null sin conversaciones). */
  handoffRate: number | null
  optOutRate: number | null
  errorRate: number | null
  stages: { stage: string; count: number; won: number }[]
  objections: { key: string; trigger: string; conversations: number }[]
  sample: {
    contactId: string
    contactName: string | null
    replies: number
    handoff: boolean
    lastAt: string | null
    ratings: Record<string, number>
  }[]
}

export function mapWeeklyReview(d: Record<string, unknown>): WeeklyReview {
  const pct = (v: unknown) => (v == null ? null : Number(v))
  return {
    since: String(d.since ?? ''),
    conversations: Number(d.conversations ?? 0),
    handoffRate: pct(d.handoff_rate),
    optOutRate: pct(d.opt_out_rate),
    errorRate: pct(d.error_rate),
    stages: ((d.stages ?? []) as Record<string, unknown>[]).map((s) => ({
      stage: String(s.stage ?? ''),
      count: Number(s.count ?? 0),
      won: Number(s.won ?? 0),
    })),
    objections: ((d.objections ?? []) as Record<string, unknown>[]).map((o) => ({
      key: String(o.key ?? ''),
      trigger: String(o.trigger ?? ''),
      conversations: Number(o.conversations ?? 0),
    })),
    sample: ((d.sample ?? []) as Record<string, unknown>[]).map((c) => ({
      contactId: String(c.contact_id ?? ''),
      contactName: c.contact_name != null ? String(c.contact_name) : null,
      replies: Number(c.replies ?? 0),
      handoff: c.handoff === true,
      lastAt: c.last_at != null ? String(c.last_at) : null,
      ratings: (c.ratings ?? {}) as Record<string, number>,
    })),
  }
}

export async function fetchWeeklyReview(): Promise<WeeklyReview> {
  const res = await api.get('/ai_agent/weekly_review')
  return mapWeeklyReview(res.data.data ?? {})
}

// ---- Rotación de claves (RFC §16) ----------------------------------------------

export type KeyRotationStatus = 'ok' | 'due_soon' | 'overdue' | 'unknown'

export interface KeyRotation {
  key: string
  label: string
  configured: boolean
  rotatedOn: string | null
  rotatedByName: string | null
  dueOn: string | null
  status: KeyRotationStatus
}

export function mapKeyRotation(r: Record<string, unknown>): KeyRotation {
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
  const status = str(r.status)
  return {
    key: String(r.key ?? ''),
    label: String(r.label ?? r.key ?? ''),
    configured: r.configured === true,
    rotatedOn: str(r.rotated_on),
    rotatedByName: str(r.rotated_by_name),
    dueOn: str(r.due_on),
    status: status === 'ok' || status === 'due_soon' || status === 'overdue' ? status : 'unknown',
  }
}

export async function fetchKeyRotations(): Promise<KeyRotation[]> {
  const res = await api.get('/ai_agent/key_rotations')
  return ((res.data.data ?? []) as Record<string, unknown>[]).map(mapKeyRotation)
}

export async function recordKeyRotation(key: string, rotatedOn: string): Promise<KeyRotation[]> {
  const res = await api.post('/ai_agent/key_rotations', { key, rotated_on: rotatedOn })
  return ((res.data.data ?? []) as Record<string, unknown>[]).map(mapKeyRotation)
}
