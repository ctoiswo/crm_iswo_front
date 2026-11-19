import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, FlaskConical, Play, Trash2, XCircle } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { formatRailsError } from '@/lib/api'
import { cn, formatDate, formatRelativeTime } from '@/lib/utils'
import {
  aiAgentQueryKeys,
  deleteEvalCase,
  fetchEvalCases,
  fetchEvalRun,
  fetchEvalRuns,
  startEvalRun,
  type EvalRun,
} from '@/lib/aiAgentApi'

const RUN_LABEL: Record<EvalRun['status'], string> = {
  queued: 'En cola',
  running: 'Corriendo…',
  done: 'Terminada',
  error: 'Error',
}

const CATEGORY_LABEL: Record<string, string> = {
  etapa: 'Etapa',
  objecion: 'Objeción',
  paso_a_asesor: 'Paso a asesor',
  privacidad: 'Privacidad',
  injection: 'Manipulación',
  regresion: 'Regresión',
}

/**
 * Pruebas del asistente con el modelo real (RFC-001 v2 del asistente §13 y §14):
 * corre las conversaciones de referencia y los casos de regresión con la
 * configuración guardada, sin enviar nada por WhatsApp.
 */
export function EvalsCard({ canRun }: { canRun: boolean }) {
  const queryClient = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const [repeat, setRepeat] = useState('1')
  const [showAll, setShowAll] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: aiAgentQueryKeys.evals(),
    queryFn: fetchEvalRuns,
    refetchInterval: (query) =>
      query.state.data?.runs.some((r) => r.status === 'queued' || r.status === 'running') ? 5_000 : false,
  })
  const latest = data?.runs[0]
  const { data: detail } = useQuery({
    queryKey: aiAgentQueryKeys.evalRun(latest?.id ?? ''),
    queryFn: () => fetchEvalRun(latest!.id),
    enabled: latest?.status === 'done',
  })
  const { data: cases = [] } = useQuery({ queryKey: aiAgentQueryKeys.evalCases(), queryFn: fetchEvalCases })

  const runMutation = useMutation({
    mutationFn: () => startEvalRun(Number(repeat)),
    onSuccess: () => {
      toast.success('Prueba en curso: tarda unos minutos')
      setConfirm(false)
      void queryClient.invalidateQueries({ queryKey: aiAgentQueryKeys.evals() })
    },
    onError: (err) => {
      setConfirm(false)
      toast.error(formatRailsError(err, 'No se pudo lanzar la prueba'))
    },
  })
  const deleteMutation = useMutation({
    mutationFn: deleteEvalCase,
    onSuccess: () => {
      toast.success('Caso eliminado')
      void queryClient.invalidateQueries({ queryKey: aiAgentQueryKeys.evalCases() })
      void queryClient.invalidateQueries({ queryKey: aiAgentQueryKeys.evals() })
    },
    onError: (err) => toast.error(formatRailsError(err, 'No se pudo eliminar')),
  })

  const inProgress = latest?.status === 'queued' || latest?.status === 'running'
  const results = detail?.results ?? []
  const shown = showAll ? results : results.filter((r) => !r.passed)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="size-4" />
            Pruebas del asistente
          </CardTitle>
          {canRun && (
            <Button size="sm" onClick={() => setConfirm(true)} disabled={inProgress || runMutation.isPending}>
              {inProgress ? <Spinner className="mr-1.5" /> : <Play className="mr-1.5 size-3.5" />}
              Correr pruebas
            </Button>
          )}
        </div>
        <CardDescription>
          {data ? `${data.cases} conversaciones de referencia` : 'Conversaciones de referencia'} (etapas, objeciones,
          paso a asesor, privacidad y manipulación){data && data.regressionCases > 0 ? `, ${data.regressionCases} de regresión` : ''}.
          Usan el modelo real y la configuración guardada; no envían nada por WhatsApp. Córrelas después de cambiar las
          instrucciones.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : !latest ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Todavía no se han corrido.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {latest.status === 'done' ? (
                <Badge
                  className={cn(
                    'border-0',
                    latest.failed === 0
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-destructive/10 text-destructive',
                  )}
                >
                  {latest.passed}/{latest.total} OK
                </Badge>
              ) : (
                <Badge variant="outline">{RUN_LABEL[latest.status]}</Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {formatRelativeTime(latest.createdAt)}
                {latest.userName && ` · ${latest.userName}`}
                {latest.configVersion != null && ` · instrucciones v${latest.configVersion}`}
                {latest.repeat > 1 && ` · ${latest.repeat} veces cada una`}
              </span>
            </div>
            {latest.status === 'error' && <p className="text-xs text-destructive">{latest.error}</p>}

            {latest.status === 'done' && (
              <>
                {results.length > 0 && (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {showAll ? 'Todos los casos' : latest.failed > 0 ? 'Casos que fallaron' : 'Todos pasaron'}
                    </p>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowAll((v) => !v)}>
                      {showAll ? 'Ver solo fallas' : 'Ver todos'}
                    </Button>
                  </div>
                )}
                <ul className="max-h-96 divide-y overflow-y-auto text-sm">
                  {shown.map((r) => (
                    <li key={r.name} className="space-y-1 py-2">
                      <div className="flex items-center gap-2">
                        {r.passed ? (
                          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                        ) : (
                          <XCircle className="size-4 shrink-0 text-destructive" />
                        )}
                        <span className="min-w-0 truncate font-medium">{r.name}</span>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {CATEGORY_LABEL[r.category] ?? r.category}
                        </Badge>
                        {r.attempts > 1 && (
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {r.passedAttempts}/{r.attempts}
                          </span>
                        )}
                      </div>
                      {!r.passed && (
                        <>
                          <p className="text-xs text-destructive">{r.failures.join(' · ')}</p>
                          {r.reply && <p className="line-clamp-3 text-xs text-muted-foreground">«{r.reply}»</p>}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {data && data.runs.length > 1 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Corridas anteriores</p>
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {data.runs.slice(1, 6).map((r) => (
                    <li key={r.id}>
                      {formatDate(r.createdAt, 'dd MMM, h:mm a')} ·{' '}
                      {r.status === 'done' ? `${r.passed}/${r.total} OK` : RUN_LABEL[r.status]}
                      {r.configVersion != null && ` · v${r.configVersion}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {cases.length > 0 && (
          <div className="space-y-1.5 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">Casos de regresión ({cases.length})</p>
            <ul className="space-y-1 text-xs">
              {cases.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="line-clamp-1 text-muted-foreground">
                      «{c.messages[c.messages.length - 1]?.content}»
                      {c.createdByName && ` · ${c.createdByName}`}
                    </p>
                  </div>
                  {canRun && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      aria-label={`Eliminar el caso ${c.name}`}
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(c.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirm} onOpenChange={(open) => { if (!runMutation.isPending) setConfirm(open) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Correr las pruebas del asistente?</AlertDialogTitle>
            <AlertDialogDescription>
              Se corren {data?.cases ?? 'las'} conversaciones con el modelo real de OpenAI. Tarda unos minutos y cuesta
              unos centavos de dólar por vez. No se envía nada por WhatsApp ni cambia el CRM.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label>Veces por conversación</Label>
            <Select value={repeat} onValueChange={setRepeat}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 vez</SelectItem>
                <SelectItem value="2">2 veces</SelectItem>
                <SelectItem value="3">3 veces (más confiable: el modelo no siempre responde igual)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={runMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={runMutation.isPending}
              onClick={(e) => {
                e.preventDefault()
                runMutation.mutate()
              }}
            >
              {runMutation.isPending && <Spinner className="mr-2" />}
              Correr
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
