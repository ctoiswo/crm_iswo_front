import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { MessageSquareWarning, Plus, Trash2 } from 'lucide-react'
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
import {
  aiAgentQueryKeys,
  updateAiAgentConfig,
  type AiAgentConfig,
  type AiObjection,
  type AiObjectionInput,
} from '@/lib/aiAgentApi'

type Row = AiObjectionInput & { approved_at: string | null; approved_by_name: string | null }

const TEXT_KEYS = ['trigger', 'response', 'reframe', 'validation_note'] as const

function toRows(list: AiObjection[]): Row[] {
  return list.map((o) => ({ ...o, approved: o.approved_at !== null }))
}

function toInput(rows: Row[]): AiObjectionInput[] {
  return rows.map(({ key, trigger, response, reframe, validation_note, approved }) => ({
    key,
    trigger,
    response,
    reframe,
    validation_note,
    approved,
  }))
}

/**
 * Objeciones (RFC-001 v2 del asistente §6) con aprobación de dirección (§18):
 * el asistente solo usa las aprobadas. Editar el texto de una aprobada le quita
 * la aprobación al guardar, porque lo aprobado es exactamente lo que se leyó.
 */
export function ObjectionsCard({ config, canEdit }: { config: AiAgentConfig; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<Row[]>(() => toRows(config.objections))
  const [reason, setReason] = useState('')
  useEffect(() => setRows(toRows(config.objections)), [config.objections])

  const saved = toRows(config.objections)
  const dirty = JSON.stringify(toInput(saved)) !== JSON.stringify(toInput(rows))
  const approvedCount = config.objections.filter((o) => o.approved_at).length

  const mutation = useMutation({
    mutationFn: () => updateAiAgentConfig({ objections: toInput(rows) }, { changeReason: reason }),
    onSuccess: ({ config: next }) => {
      queryClient.setQueryData(aiAgentQueryKeys.config(), next)
      void queryClient.invalidateQueries({ queryKey: aiAgentQueryKeys.versions() })
      setReason('')
      toast.success('Objeciones guardadas')
    },
    onError: (err) => toast.error(formatRailsError(err, 'No se pudieron guardar las objeciones')),
  })

  // Cambiar el texto quita la aprobación: hay que volver a aprobarla a conciencia.
  const update = (index: number, patch: Partial<Row>) =>
    setRows((list) =>
      list.map((row, i) => {
        if (i !== index) return row
        const textEdit = TEXT_KEYS.some((k) => k in patch && patch[k] !== row[k])
        return { ...row, ...patch, ...(textEdit ? { approved: false } : {}) }
      }),
    )

  // Texto distinto del guardado: la aprobación anterior ya no vale.
  const textChanged = (row: Row) => {
    const before = saved.find((s) => s.key === row.key)
    return !before || TEXT_KEYS.some((k) => before[k] !== row[k])
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareWarning className="size-4" />
          Objeciones
          <Badge variant="secondary">
            {approvedCount} de {config.objections.length} aprobadas
          </Badge>
        </CardTitle>
        <CardDescription>
          Respuestas a lo que suelen decir los clientes («es caro», «ya usamos Excel»). El asistente solo usa las que
          dirección aprobó; las demás las responde en forma general con la información del negocio. Si cambias el
          texto de una aprobada, al guardar queda sin aprobar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No hay objeciones.</p>}
        {rows.map((row, i) => {
          const changed = row.approved_at !== null && textChanged(row)
          return (
            <div key={row.key || i} className="space-y-3 rounded-md border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label htmlFor={`objection-trigger-${i}`}>Si el cliente dice…</Label>
                  <Input
                    id={`objection-trigger-${i}`}
                    value={row.trigger}
                    onChange={(e) => update(i, { trigger: e.target.value })}
                    maxLength={200}
                    disabled={!canEdit}
                  />
                </div>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-6 shrink-0"
                    aria-label="Quitar objeción"
                    onClick={() => setRows((list) => list.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`objection-response-${i}`}>El asistente responde…</Label>
                <Textarea
                  id={`objection-response-${i}`}
                  value={row.response}
                  onChange={(e) => update(i, { response: e.target.value })}
                  rows={3}
                  maxLength={2000}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`objection-reframe-${i}`}>Pregunta de reencuadre (opcional)</Label>
                <Input
                  id={`objection-reframe-${i}`}
                  value={row.reframe}
                  onChange={(e) => update(i, { reframe: e.target.value })}
                  maxLength={500}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`objection-note-${i}`}>Qué debe confirmar dirección (opcional)</Label>
                <Textarea
                  id={`objection-note-${i}`}
                  value={row.validation_note}
                  onChange={(e) => update(i, { validation_note: e.target.value })}
                  placeholder="Ej: que el número de módulos esté vigente"
                  rows={2}
                  maxLength={500}
                  disabled={!canEdit}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Switch
                    checked={row.approved}
                    onCheckedChange={(v) => update(i, { approved: v })}
                    disabled={!canEdit}
                    aria-label="Aprobada por dirección"
                  />
                  Aprobada por dirección
                </label>
                <span className="text-xs text-muted-foreground">
                  {changed && row.approved
                    ? 'Texto nuevo: se aprueba a tu nombre al guardar'
                    : changed
                      ? 'El texto cambió: queda sin aprobar al guardar'
                      : row.approved && row.approved_at
                      ? `${row.approved_by_name ?? 'Sin nombre'} · ${formatDate(row.approved_at, 'dd MMM yyyy, h:mm a')}`
                      : row.approved
                        ? 'Se aprueba a tu nombre al guardar'
                        : 'Sin aprobar: el asistente no la usa'}
                </span>
              </div>
            </div>
          )
        })}

        {canEdit && (
          <>
            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                setRows((list) => [
                  ...list,
                  {
                    key: '',
                    trigger: '',
                    response: '',
                    reframe: '',
                    validation_note: '',
                    approved: false,
                    approved_at: null,
                    approved_by_name: null,
                  },
                ])
              }
              disabled={rows.length >= 20}
            >
              <Plus className="mr-2 size-4" />
              Agregar objeción
            </Button>
            {dirty && (
              <div className="space-y-1.5">
                <Label htmlFor="objections-reason">Motivo del cambio (opcional)</Label>
                <Input
                  id="objections-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ej: Frank aprobó «Es caro» por correo el 20/11"
                  maxLength={300}
                />
                <p className="text-xs text-muted-foreground">
                  Queda en el historial de instrucciones con tu nombre y la fecha.
                </p>
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setRows(saved)} disabled={!dirty || mutation.isPending}>
                Descartar cambios
              </Button>
              <Button onClick={() => mutation.mutate()} disabled={!dirty || mutation.isPending}>
                {mutation.isPending && <Spinner className="mr-2" />}
                Guardar objeciones
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
