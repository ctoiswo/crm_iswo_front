import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Thermometer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { formatRailsError } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { aiAgentQueryKeys, updateAiAgentConfig, type AiAgentConfig, type CriteriaLevel } from '@/lib/aiAgentApi'

const LEVELS: { key: CriteriaLevel; label: string; className: string }[] = [
  { key: 'cold', label: 'Frío', className: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  { key: 'warm', label: 'Tibio', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  { key: 'hot', label: 'Caliente', className: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' },
]

type Form = Record<CriteriaLevel, string> & { validated: boolean }

function toForm(config: AiAgentConfig): Form {
  const c = config.leadCriteria
  return { cold: c.cold, warm: c.warm, hot: c.hot, validated: c.validated_at !== null }
}

/**
 * Criterios de frío / tibio / caliente (RFC-001 v2 del asistente §7). Se usan
 * siempre; «Validados con comercial» deja constancia de quién los revisó y se
 * apaga si cambia un texto.
 */
export function LeadCriteriaCard({ config, canEdit }: { config: AiAgentConfig; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<Form>(() => toForm(config))
  const [reason, setReason] = useState('')
  useEffect(() => setForm(toForm(config)), [config])

  const saved = toForm(config)
  const dirty = JSON.stringify(saved) !== JSON.stringify(form)
  const textChanged = LEVELS.some(({ key }) => saved[key] !== form[key])
  const { validated_at: validatedAt, validated_by_name: validatedBy } = config.leadCriteria

  const mutation = useMutation({
    mutationFn: () => updateAiAgentConfig({ lead_criteria: form }, { changeReason: reason }),
    onSuccess: ({ config: next }) => {
      queryClient.setQueryData(aiAgentQueryKeys.config(), next)
      void queryClient.invalidateQueries({ queryKey: aiAgentQueryKeys.versions() })
      setReason('')
      toast.success('Criterios guardados')
    },
    onError: (err) => toast.error(formatRailsError(err, 'No se pudieron guardar los criterios')),
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Thermometer className="size-4" />
          Criterios de calificación
          {validatedAt ? (
            <Badge className="border-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              Validados con comercial
            </Badge>
          ) : (
            <Badge variant="outline">Sin validar con comercial</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Con estos criterios el asistente decide si un lead es frío, tibio o caliente. Cuando es caliente, avisa al
          asesor de inmediato.
          {validatedAt && ` Validados por ${validatedBy ?? 'sin nombre'} el ${formatDate(validatedAt, 'dd MMM yyyy')}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {LEVELS.map(({ key, label, className }) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`criteria-${key}`} className="flex items-center gap-2">
              <Badge className={`border-0 ${className}`}>{label}</Badge>
              {form[key] !== config.criteriaDefaults[key] && canEdit && (
                <button
                  type="button"
                  className="text-xs font-normal text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => setForm((f) => ({ ...f, [key]: config.criteriaDefaults[key], validated: false }))}
                >
                  Volver al del RFC
                </button>
              )}
            </Label>
            <Textarea
              id={`criteria-${key}`}
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value, validated: false }))}
              rows={2}
              maxLength={1000}
              disabled={!canEdit}
            />
          </div>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Switch
              checked={form.validated}
              onCheckedChange={(v) => setForm((f) => ({ ...f, validated: v }))}
              disabled={!canEdit}
              aria-label="Validados con comercial"
            />
            Validados con comercial
          </label>
          <span className="text-xs text-muted-foreground">
            {textChanged && !form.validated && validatedAt
              ? 'Cambiaste un criterio: queda sin validar al guardar'
              : form.validated && (textChanged || !validatedAt)
                ? 'Se marca a tu nombre al guardar'
                : !form.validated
                  ? 'El asistente los usa igual; la marca deja constancia de la revisión'
                  : ''}
          </span>
        </div>

        {canEdit && (
          <>
            {dirty && (
              <div className="space-y-1.5">
                <Label htmlFor="criteria-reason">Motivo del cambio (opcional)</Label>
                <Input
                  id="criteria-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ej: reunión con comercial del 20/11"
                  maxLength={300}
                />
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setForm(saved)} disabled={!dirty || mutation.isPending}>
                Descartar cambios
              </Button>
              <Button
                onClick={() => mutation.mutate()}
                disabled={!dirty || mutation.isPending || LEVELS.some(({ key }) => !form[key].trim())}
              >
                {mutation.isPending && <Spinner className="mr-2" />}
                Guardar criterios
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
