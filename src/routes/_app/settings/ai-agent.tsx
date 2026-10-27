import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, Bot, BotOff, RotateCcw, Send, Sparkles } from 'lucide-react'
import { requireSettingsRole } from '@/lib/authGuards'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fetchUsersList } from '@/lib/userApi'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Spinner } from '@/components/ui/spinner'
import { formatRailsError } from '@/lib/api'
import { cn, formatRelativeTime } from '@/lib/utils'
import { useUserRole } from '@/stores/auth'
import { AgendaSettings, RemindersSettings, UpcomingAppointments } from '@/components/ai-agent/AgendaSettings'
import {
  aiAgentQueryKeys,
  estimateCostUsd,
  fetchAiAgentActivity,
  fetchAiAgentConfig,
  setAllChatsPaused,
  testAiAgent,
  toolCallLabel,
  updateAiAgentConfig,
  type AiAgentConfig,
  type AiAgentInput,
  type AiAgentMetrics,
  type AiToolCall,
  type ChatTurn,
} from '@/lib/aiAgentApi'

// Mismo alcance que AiAgentPolicy: admin edita; manager consulta.
export const Route = createFileRoute('/_app/settings/ai-agent')({
  beforeLoad: () => requireSettingsRole('admin', 'manager'),
  component: AiAgentSettingsPage,
})

const NO_OWNER = '__auto__'

const BUSINESS_PLACEHOLDER = `Ej:
Qué vendemos: software para gestionar sistemas ISO 9001, ISO 14001, ISO 45001 y SG-SST.
Proceso: demo sin costo → propuesta → implementación → acompañamiento.
Precios: desde $X según el plan (el asesor confirma la cotización).
Horario: lunes a viernes, 8:00 a. m. a 6:00 p. m.
Web: https://iswo.com.co`

const FAQ_PLACEHOLDER = `Ej:
¿La demo tiene costo? No, es personalizada y sin costo.
¿Cuánto dura la implementación? Depende de los módulos; el asesor te confirma el plazo.`

function AiAgentSettingsPage() {
  const canEdit = useUserRole() === 'admin'
  const { data: config, isLoading } = useQuery({ queryKey: aiAgentQueryKeys.config(), queryFn: fetchAiAgentConfig })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Bot className="size-5" />
          Asistente IA de WhatsApp
        </h2>
        <p className="text-sm text-muted-foreground">
          Responde por WhatsApp con la información de tu negocio, califica a cada lead y le pasa la conversación a un
          asesor cuando hace falta.
        </p>
      </div>

      {isLoading || !config ? (
        <Skeleton className="h-96 w-full rounded-lg" />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0 space-y-6">
            <ConfigForm config={config} canEdit={canEdit} />
            <AgendaSettings config={config} canEdit={canEdit} />
            <RemindersSettings config={config} canEdit={canEdit} />
          </div>
          <div className="space-y-6">
            <UpcomingAppointments canCancel />
            <PausedChatsCard config={config} canEdit={canEdit} />
            {canEdit && <TestChat disabled={!config.openaiConfigured} />}
            <ActivityCard />
          </div>
        </div>
      )}
    </div>
  )
}

function ConfigForm({ config, canEdit }: { config: AiAgentConfig; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const toForm = (c: AiAgentConfig): AiAgentInput => ({
    enabled: c.enabled,
    default_owner_id: c.defaultOwnerId,
    assistant_name: c.assistantName,
    business_info: c.businessInfo,
    faq: c.faq,
    tone: c.tone,
    sales_process: c.salesProcess,
    qualification: c.qualification,
    handoff_rules: c.handoffRules,
    privacy_notice: c.privacyNotice,
    consent_required: c.consentRequired,
  })
  const [form, setForm] = useState<AiAgentInput>(() => toForm(config))
  const { data: users = [] } = useQuery({
    queryKey: ['users', 'for-ai-agent-owner'],
    queryFn: () => fetchUsersList({ items: 200 }),
    enabled: canEdit,
  })
  const staff = users.filter((u) => ['admin', 'manager', 'consultant'].includes(String(u.role)))
  useEffect(() => {
    setForm(toForm(config))
  }, [config])

  const set = <K extends keyof AiAgentInput>(key: K, value: AiAgentInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  const [confirmOn, setConfirmOn] = useState(false)
  const [pauseHumanChats, setPauseHumanChats] = useState(true)

  const saveMutation = useMutation({
    mutationFn: ({ body, pauseHuman }: { body: Partial<AiAgentInput>; pauseHuman?: boolean }) =>
      updateAiAgentConfig(body, { pauseHumanChats: pauseHuman }),
    onSuccess: ({ config: next, pausedNow }, { body }) => {
      queryClient.setQueryData(aiAgentQueryKeys.config(), next)
      if (body.enabled !== undefined && Object.keys(body).length === 1) {
        toast.success(
          next.enabled
            ? `Asistente encendido${pausedNow > 0 ? `: no responderá en ${pausedNow} chat(s) que ya atiende un asesor` : ''}`
            : 'Asistente apagado',
        )
      } else {
        toast.success('Configuración guardada')
      }
      setConfirmOn(false)
    },
    onError: (err) => toast.error(formatRailsError(err, 'No se pudo guardar')),
  })

  const dirty = JSON.stringify(toForm(config)) !== JSON.stringify(form)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              Estado
              {config.active ? (
                <Badge className="border-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Respondiendo</Badge>
              ) : config.enabled ? (
                <Badge className="border-0 bg-amber-500/15 text-amber-700 dark:text-amber-300">Activado sin clave</Badge>
              ) : (
                <Badge variant="outline">Apagado</Badge>
              )}
            </CardTitle>
            <CardDescription>Modelo: {config.model} (OpenAI)</CardDescription>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <Switch
              checked={config.enabled}
              disabled={!canEdit || saveMutation.isPending || (!config.enabled && dirty)}
              onCheckedChange={(v) => {
                if (v) {
                  setPauseHumanChats(true)
                  setConfirmOn(true)
                } else {
                  saveMutation.mutate({ body: { enabled: false } })
                }
              }}
              aria-label="Activar asistente"
            />
            {config.enabled ? 'Activado' : 'Apagado'}
          </label>
        </div>
        {!config.openaiConfigured && (
          <p className="mt-2 flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Falta la clave de OpenAI en el servidor. Puedes dejar todo configurado; el asistente empieza a responder
            cuando se agregue.
          </p>
        )}
        {!config.enabled && dirty && canEdit && (
          <p className="mt-2 text-xs text-muted-foreground">Guarda los cambios antes de activarlo.</p>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        <Field label="Nombre del asistente" hint="Cómo se presenta en el chat.">
          <Input
            value={form.assistant_name}
            onChange={(e) => set('assistant_name', e.target.value)}
            placeholder="Ej: Sofía, asistente de ISWO"
            disabled={!canEdit}
          />
        </Field>
        <Field
          label="Asesor por defecto"
          hint={`Cuando el asistente califica o agenda a un contacto nuevo sin dueño, le abre una oportunidad a nombre de esta persona.${
            !form.default_owner_id && config.defaultOwnerName ? ` Sin elegir: ${config.defaultOwnerName} (primer administrador).` : ''
          }`}
        >
          <Select
            value={form.default_owner_id ?? NO_OWNER}
            onValueChange={(v) => set('default_owner_id', v === NO_OWNER ? null : v)}
            disabled={!canEdit}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_OWNER}>Primer administrador (automático)</SelectItem>
              {staff.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          label="Información del negocio"
          hint="Todo lo que el asistente puede contar: servicios, precios o rangos, proceso, horarios, ubicación, enlaces. No inventa nada que no esté aquí."
        >
          <Textarea
            value={form.business_info}
            onChange={(e) => set('business_info', e.target.value)}
            placeholder={BUSINESS_PLACEHOLDER}
            rows={10}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Preguntas frecuentes (opcional)">
          <Textarea
            value={form.faq}
            onChange={(e) => set('faq', e.target.value)}
            placeholder={FAQ_PLACEHOLDER}
            rows={5}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Tono de las respuestas">
          <Textarea value={form.tone} onChange={(e) => set('tone', e.target.value)} rows={2} disabled={!canEdit} />
        </Field>
        <Field
          label="Proceso comercial"
          hint="Cómo lleva al cliente hasta comprar y recomendar: el siguiente paso que propone en cada etapa, cómo responde objeciones y cómo atiende a quien ya es cliente."
        >
          <Textarea
            value={form.sales_process}
            onChange={(e) => set('sales_process', e.target.value)}
            rows={9}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Qué debe averiguar para calificar al lead">
          <Textarea
            value={form.qualification}
            onChange={(e) => set('qualification', e.target.value)}
            rows={2}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Cuándo pasar la conversación a un asesor">
          <Textarea
            value={form.handoff_rules}
            onChange={(e) => set('handoff_rules', e.target.value)}
            rows={3}
            disabled={!canEdit}
          />
        </Field>
        <div className="space-y-2 rounded-md border p-3">
          <label className="flex items-start gap-2 text-sm font-medium">
            <Checkbox
              checked={form.consent_required}
              onCheckedChange={(v) => set('consent_required', v === true)}
              disabled={!canEdit}
              className="mt-0.5"
            />
            <span>
              Pedir autorización de datos personales (Ley 1581) antes de guardar datos, agendar o registrar referidos
            </span>
          </label>
          {form.consent_required && (
            <Field
              label="Aviso de autorización"
              hint="El asistente lo envía una vez, antes de pedir datos. Incluye el enlace a tu política de tratamiento de datos. La fecha y el texto aceptado quedan en el contacto y en Auditoría."
            >
              <Textarea
                value={form.privacy_notice}
                onChange={(e) => set('privacy_notice', e.target.value)}
                rows={3}
                disabled={!canEdit}
              />
            </Field>
          )}
        </div>

        {canEdit ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setForm(toForm(config))} disabled={!dirty || saveMutation.isPending}>
              Descartar cambios
            </Button>
            <Button
              onClick={() => {
                const { enabled: _enabled, ...rest } = form
                saveMutation.mutate({ body: rest })
              }}
              disabled={!dirty || saveMutation.isPending}
            >
              {saveMutation.isPending && <Spinner className="mr-2" />}
              Guardar
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Solo un administrador puede cambiar el asistente.</p>
        )}
      </CardContent>

      <AlertDialog open={confirmOn} onOpenChange={(open) => { if (!saveMutation.isPending) setConfirmOn(open) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Encender el asistente?</AlertDialogTitle>
            <AlertDialogDescription>
              Desde ahora responderá automáticamente los mensajes de WhatsApp de todos los chats, salvo los que estén en
              pausa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={pauseHumanChats}
              onCheckedChange={(v) => setPauseHumanChats(v === true)}
              className="mt-0.5"
            />
            <span>
              No responder en los chats donde un asesor ya está conversando (escribió en los últimos 7 días)
              {config.humanChats > 0 ? ` — ${config.humanChats} chat(s)` : ''}. <b>Recomendado.</b>
            </span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saveMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={saveMutation.isPending}
              onClick={(e) => {
                e.preventDefault()
                saveMutation.mutate({ body: { enabled: true }, pauseHuman: pauseHumanChats })
              }}
            >
              {saveMutation.isPending && <Spinner className="mr-2" />}
              Encender
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

/** Chats en pausa (los atiende un asesor) y pausar / reanudar en bloque. */
function PausedChatsCard({ config, canEdit }: { config: AiAgentConfig; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const [confirm, setConfirm] = useState<'pause' | 'resume' | null>(null)

  const bulkMutation = useMutation({
    mutationFn: (paused: boolean) => setAllChatsPaused(paused),
    onSuccess: ({ config: next, changed }, paused) => {
      queryClient.setQueryData(aiAgentQueryKeys.config(), next)
      void queryClient.invalidateQueries({ queryKey: ['whatsappConversations'] })
      toast.success(
        paused
          ? `Asistente en pausa en ${changed} chat(s): solo responderá en chats nuevos`
          : `El asistente vuelve a responder en ${changed} chat(s)`,
      )
      setConfirm(null)
    },
    onError: (err) => toast.error(formatRailsError(err, 'No se pudo cambiar los chats')),
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BotOff className="size-4" />
          Chats en pausa: {config.pausedChats}
        </CardTitle>
        <CardDescription>
          En estos chats el asistente no responde porque los atiende un asesor. Un chat se pausa solo cuando un
          asesor escribe o cuando el asistente lo pasa a una persona; también se puede pausar o reanudar desde cada
          chat en la bandeja.
        </CardDescription>
      </CardHeader>
      {canEdit && (
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="flex-1" onClick={() => setConfirm('resume')} disabled={config.pausedChats === 0}>
            <Bot className="mr-2 size-4" />
            Reanudar todos
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => setConfirm('pause')}>
            <BotOff className="mr-2 size-4" />
            Pausar todos
          </Button>
        </CardContent>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => { if (!open && !bulkMutation.isPending) setConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === 'pause' ? '¿Pausar el asistente en todos los chats?' : '¿Reanudar el asistente en todos los chats?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'pause'
                ? 'El asistente dejará de responder en todos los chats que existen hoy. Solo atenderá a quienes escriban por primera vez.'
                : `El asistente volverá a responder en ${config.pausedChats} chat(s), incluidos los que atiende un asesor.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkMutation.isPending}
              onClick={(e) => {
                e.preventDefault()
                bulkMutation.mutate(confirm === 'pause')
              }}
            >
              {bulkMutation.isPending && <Spinner className="mr-2" />}
              {confirm === 'pause' ? 'Pausar todos' : 'Reanudar todos'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Chat de prueba: usa la configuración guardada, no envía nada ni toca el CRM. */
function TestChat({ disabled }: { disabled: boolean }) {
  const [turns, setTurns] = useState<(ChatTurn & { tools?: AiToolCall[] })[]>([])
  const [draft, setDraft] = useState('')
  const chatRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const testMutation = useMutation({
    mutationFn: ({ history, consent }: { history: ChatTurn[]; consent: boolean }) => testAiAgent(history, consent),
    onSuccess: (res) => setTurns((t) => [...t, { role: 'assistant', content: res.reply, tools: res.toolCalls }]),
    onError: (err) => toast.error(formatRailsError(err, 'El asistente no pudo responder')),
  })

  // Solo se desplaza la caja del chat: scrollIntoView movía también la página.
  useEffect(() => {
    const chat = chatRef.current
    if (chat) chat.scrollTop = chat.scrollHeight
  }, [turns, testMutation.isPending])

  // El campo se desactiva mientras responde; al terminar, el cursor vuelve a él.
  useEffect(() => {
    if (!testMutation.isPending && turns.length > 0) inputRef.current?.focus({ preventScroll: true })
  }, [testMutation.isPending, turns.length])

  const send = () => {
    const text = draft.trim()
    if (!text) return
    const next = [...turns, { role: 'user' as const, content: text }]
    setTurns(next)
    setDraft('')
    // Como en WhatsApp: una vez autorizados los datos, no se vuelve a pedir.
    const consent = turns.some((t) =>
      t.tools?.some((tool) => tool.name === 'registrar_autorizacion_datos' && tool.arguments.acepta === true),
    )
    testMutation.mutate({ history: next.map(({ role, content }) => ({ role, content })), consent })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4" />
            Probar el asistente
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setTurns([])} disabled={turns.length === 0}>
            <RotateCcw className="mr-1.5 size-3.5" />
            Reiniciar
          </Button>
        </div>
        <CardDescription>
          Escribe como si fueras un cliente. Usa la configuración guardada; no envía nada ni cambia el CRM.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div ref={chatRef} className="h-80 space-y-2 overflow-y-auto rounded-md border bg-muted/40 p-3">
          {turns.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">Ej: «Hola, ¿cuánto cuesta la ISO 9001?»</p>
          )}
          {turns.map((t, i) => (
            <div key={i} className={cn('flex', t.role === 'user' ? 'justify-start' : 'justify-end')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm',
                  t.role === 'user' ? 'border bg-card' : 'bg-primary/20',
                )}
              >
                <p className="whitespace-pre-wrap break-words">{t.content || '—'}</p>
                {t.tools && t.tools.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {t.tools.map((tool, j) => (
                      <span
                        key={j}
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px]',
                          tool.blocked
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            : 'bg-background/70 text-muted-foreground',
                        )}
                        title={tool.result}
                      >
                        {toolCallLabel(tool)}
                        {tool.name === 'calificar_lead' && typeof tool.arguments.temperatura === 'string'
                          ? `: ${temperatureLabel(tool.arguments.temperatura)}`
                          : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {testMutation.isPending && (
            <div className="flex justify-end">
              <span className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-muted-foreground">Escribiendo…</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder={disabled ? 'Falta la clave de OpenAI' : 'Escribe como cliente…'}
            disabled={disabled || testMutation.isPending}
          />
          <Button onClick={send} disabled={disabled || testMutation.isPending || !draft.trim()} aria-label="Enviar">
            <Send className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function temperatureLabel(t: string): string {
  return t === 'hot' ? 'caliente' : t === 'warm' ? 'tibio' : t === 'cold' ? 'frío' : t
}

const RUN_STATUS: Record<string, { label: string; className: string }> = {
  replied: { label: 'Respondió', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  handoff: { label: 'Pasó a asesor', className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  skipped: { label: 'No respondió', className: 'bg-muted text-muted-foreground' },
  error: { label: 'Error', className: 'bg-destructive/10 text-destructive' },
}

function ActivityCard() {
  const { data, isLoading } = useQuery({
    queryKey: aiAgentQueryKeys.activity(),
    queryFn: fetchAiAgentActivity,
    refetchInterval: 60_000,
  })
  const cost = data ? estimateCostUsd(data.last30.inputTokens, data.last30.outputTokens) : 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Actividad</CardTitle>
        {data && (
          <CardDescription>
            Últimos 30 días: {data.last30.replies} respuestas · {data.last30.handoffs} pasadas a asesor
            {data.last30.errors > 0 ? ` · ${data.last30.errors} errores` : ''} · costo aprox. USD {cost.toFixed(2)}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {data && <PilotMetrics metrics={data.metrics} />}
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !data || data.runs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Todavía no ha respondido ningún chat.</p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto text-sm">
            {data.runs.map((r) => (
              <li key={r.id} className="space-y-1 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{r.contactName ?? 'Contacto'}</span>
                  <Badge className={cn('shrink-0 border-0', RUN_STATUS[r.status]?.className)}>
                    {RUN_STATUS[r.status]?.label ?? r.status}
                  </Badge>
                </div>
                {r.reply && <p className="line-clamp-2 text-xs text-muted-foreground">{r.reply}</p>}
                {r.error && <p className="text-xs text-destructive">{r.error}</p>}
                <p className="text-[11px] text-muted-foreground">
                  {formatRelativeTime(r.createdAt)}
                  {r.toolCalls.length > 0 && ` · ${r.toolCalls.map(toolCallLabel).join(', ')}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/** Métricas del piloto (RFC-001 v2 §14), últimos 30 días. */
function PilotMetrics({ metrics }: { metrics: AiAgentMetrics }) {
  const { leads } = metrics
  const items = [
    { label: 'Conversaciones', value: metrics.conversations },
    { label: 'Leads calificados', value: leads.cold + leads.warm + leads.hot, detail: `${leads.hot} calientes · ${leads.warm} tibios · ${leads.cold} fríos` },
    { label: 'Demos agendadas', value: metrics.demos, detail: metrics.demosCompleted > 0 ? `${metrics.demosCompleted} realizadas` : undefined },
    { label: 'Pasadas a asesor', value: metrics.handoffs },
    { label: 'Referidos', value: metrics.referrals },
    { label: 'Autorizaciones de datos', value: metrics.consents, detail: metrics.optOuts > 0 ? `${metrics.optOuts} bajas` : undefined },
  ]
  return (
    <dl className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-md border bg-muted/30 px-3 py-2">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="text-lg font-semibold tabular-nums">{item.value}</dd>
          {item.detail && <dd className="text-[11px] text-muted-foreground">{item.detail}</dd>}
        </div>
      ))}
    </dl>
  )
}
