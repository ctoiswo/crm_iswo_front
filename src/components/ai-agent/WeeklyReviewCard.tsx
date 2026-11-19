import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, CalendarCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatRelativeTime } from '@/lib/utils'
import {
  aiAgentQueryKeys,
  ERROR_CATEGORY_LABELS,
  fetchAiAgentActivity,
  fetchWeeklyReview,
} from '@/lib/aiAgentApi'

const pct = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`)

/**
 * Revisión semanal (RFC-001 v2 del asistente §17): tasas de los últimos 7 días,
 * en qué etapa quedaron los leads, objeciones más frecuentes, errores por
 * categoría (y si reinciden) y una muestra de hasta 30 conversaciones para leer.
 */
export function WeeklyReviewCard() {
  const { data, isLoading } = useQuery({ queryKey: aiAgentQueryKeys.weeklyReview(), queryFn: fetchWeeklyReview })
  const { data: activity } = useQuery({ queryKey: aiAgentQueryKeys.activity(), queryFn: fetchAiAgentActivity })
  const errors = Object.entries(activity?.metrics.errorsByCategory ?? {}).sort((a, b) => b[1].current - a[1].current)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarCheck className="size-4" />
          Revisión semanal
        </CardTitle>
        <CardDescription>
          Últimos 7 días. Lee la muestra de conversaciones, califica las respuestas en la bandeja y revisa qué errores
          se repiten.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !data ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-2">
              {[
                { label: 'Conversaciones', value: String(data.conversations) },
                { label: 'Pasadas a asesor', value: pct(data.handoffRate) },
                { label: 'Pidieron la baja', value: pct(data.optOutRate) },
                { label: 'Respuestas con error', value: pct(data.errorRate) },
              ].map((item) => (
                <div key={item.label} className="rounded-md border bg-muted/30 px-3 py-2">
                  <dt className="text-xs text-muted-foreground">{item.label}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{item.value}</dd>
                </div>
              ))}
            </dl>

            {data.stages.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Dónde están hoy sus leads</p>
                <ul className="space-y-0.5 text-sm">
                  {data.stages.map((s) => (
                    <li key={s.stage} className="flex justify-between gap-2">
                      <span className="truncate">{s.stage}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {s.count}
                        {s.won > 0 && ` · ${s.won} ganadas`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Objeciones más frecuentes</p>
              {data.objections.length === 0 ? (
                <p className="text-xs text-muted-foreground">Ninguna esta semana.</p>
              ) : (
                <ul className="space-y-0.5 text-sm">
                  {data.objections.map((o) => (
                    <li key={o.key} className="flex justify-between gap-2">
                      <span className="truncate">«{o.trigger}»</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{o.conversations} chats</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Errores por tipo (30 días frente a los 30 anteriores)</p>
              {errors.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Sin errores clasificados. Al calificar una respuesta como parcial o incorrecta, elige el tipo de error.
                </p>
              ) : (
                <ul className="space-y-0.5 text-sm">
                  {errors.map(([cat, n]) => (
                    <li key={cat} className="flex items-center justify-between gap-2">
                      <span className="truncate">{ERROR_CATEGORY_LABELS[cat] ?? cat}</span>
                      <span
                        className={cn(
                          'flex shrink-0 items-center gap-1 tabular-nums',
                          n.current > n.previous && n.previous > 0 ? 'text-destructive' : 'text-muted-foreground',
                        )}
                        title={`${n.previous} en los 30 días anteriores`}
                      >
                        {n.current}
                        {n.current > n.previous ? (
                          <ArrowUp className="size-3" />
                        ) : n.current < n.previous ? (
                          <ArrowDown className="size-3" />
                        ) : null}
                        <span className="text-[11px]">antes {n.previous}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Muestra para leer ({data.sample.length})
              </p>
              {data.sample.length === 0 ? (
                <p className="text-xs text-muted-foreground">El asistente no atendió chats esta semana.</p>
              ) : (
                <ul className="max-h-72 divide-y overflow-y-auto text-sm">
                  {data.sample.map((c) => {
                    const rated = Object.values(c.ratings).reduce((a, b) => a + b, 0)
                    return (
                      <li key={c.contactId} className="flex items-center justify-between gap-2 py-1.5">
                        <Link
                          to="/whatsapp"
                          search={{ contact: c.contactId }}
                          className="min-w-0 truncate underline-offset-2 hover:underline"
                        >
                          {c.contactName ?? 'Contacto'}
                        </Link>
                        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                          {c.handoff && <Badge variant="outline" className="text-[10px]">Pasó a asesor</Badge>}
                          {rated > 0 ? `${rated} calificada(s)` : 'Sin calificar'}
                          {c.lastAt && ` · ${formatRelativeTime(c.lastAt)}`}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
