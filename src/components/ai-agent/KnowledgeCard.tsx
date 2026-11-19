import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BookCheck, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { formatRailsError } from '@/lib/api'
import { fetchUsersList } from '@/lib/userApi'
import { formatDate } from '@/lib/utils'
import {
  aiAgentQueryKeys,
  KNOWLEDGE_SECTIONS,
  updateAiAgentConfig,
  type AiAgentConfig,
  type KnowledgeSection,
} from '@/lib/aiAgentApi'

const NO_OWNER = '__none__'

type Form = {
  ownerId: string | null
  reviewDays: number
  sections: Record<KnowledgeSection, { source: string; validated: boolean; revalidate: boolean }>
}

function toForm(config: AiAgentConfig): Form {
  const k = config.knowledge
  const section = (key: KnowledgeSection) => ({
    source: k.sections[key].source,
    validated: k.sections[key].validated_at !== null,
    revalidate: false,
  })
  return {
    ownerId: k.ownerId,
    reviewDays: k.reviewDays,
    sections: { business_info: section('business_info'), faq: section('faq'), sales_process: section('sales_process') },
  }
}

/**
 * Base de conocimiento (RFC-001 v2 del asistente §10 y §15): quién la
 * mantiene y, por apartado, de dónde sale y cuándo se validó. Cambiar el texto
 * de un apartado borra su validación (lo hace el servidor al guardar).
 */
export function KnowledgeCard({ config, canEdit }: { config: AiAgentConfig; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<Form>(() => toForm(config))
  useEffect(() => setForm(toForm(config)), [config])
  const { data: users = [] } = useQuery({
    queryKey: ['users', 'for-ai-agent-owner'],
    queryFn: () => fetchUsersList({ items: 200 }),
    enabled: canEdit,
  })
  const staff = users.filter((u) => ['admin', 'manager', 'consultant'].includes(String(u.role)))

  const saved = toForm(config)
  const dirty = JSON.stringify(saved) !== JSON.stringify(form)
  const pending = KNOWLEDGE_SECTIONS.filter(({ key }) => config.knowledge.sections[key].stale).length

  const mutation = useMutation({
    mutationFn: () =>
      updateAiAgentConfig(
        { knowledge: { owner_id: form.ownerId, review_days: form.reviewDays, sections: form.sections } },
        { changeReason: 'Responsable y fuentes de la información' },
      ),
    onSuccess: ({ config: next }) => {
      queryClient.setQueryData(aiAgentQueryKeys.config(), next)
      void queryClient.invalidateQueries({ queryKey: aiAgentQueryKeys.versions() })
      toast.success('Guardado')
    },
    onError: (err) => toast.error(formatRailsError(err, 'No se pudo guardar')),
  })

  const setSection = (key: KnowledgeSection, patch: Partial<Form['sections'][KnowledgeSection]>) =>
    setForm((f) => ({ ...f, sections: { ...f.sections, [key]: { ...f.sections[key], ...patch } } }))

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <BookCheck className="size-4" />
          Responsable y fuentes de la información
          {pending > 0 ? (
            <Badge className="border-0 bg-amber-500/15 text-amber-700 dark:text-amber-300">
              {pending} por validar
            </Badge>
          ) : (
            <Badge className="border-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Al día</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Quién mantiene la información que usa el asistente y, por apartado, de dónde sale y cuándo se validó. Si
          cambias el texto de un apartado, queda sin validar hasta que alguien lo revise.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Responsable</Label>
            {canEdit ? (
              <Select
                value={form.ownerId ?? NO_OWNER}
                onValueChange={(v) => setForm((f) => ({ ...f, ownerId: v === NO_OWNER ? null : v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_OWNER}>Sin definir</SelectItem>
                  {staff.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm">{config.knowledge.ownerName ?? 'Sin definir'}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="knowledge-review-days">Revisar cada (días)</Label>
            <Input
              id="knowledge-review-days"
              type="number"
              min={7}
              max={730}
              value={form.reviewDays}
              onChange={(e) => setForm((f) => ({ ...f, reviewDays: Number(e.target.value) }))}
              disabled={!canEdit}
            />
          </div>
        </div>

        {KNOWLEDGE_SECTIONS.map(({ key, label }) => {
          const current = config.knowledge.sections[key]
          const row = form.sections[key]
          return (
            <div key={key} className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{label}</span>
                {current.validated_at && !current.stale ? (
                  <span className="text-xs text-muted-foreground">
                    Validada el {formatDate(current.validated_at, 'dd MMM yyyy')} por{' '}
                    {current.validated_by_name ?? 'sin nombre'}
                  </span>
                ) : current.validated_at ? (
                  <Badge className="border-0 bg-amber-500/15 text-amber-700 dark:text-amber-300">
                    Vencida: validada el {formatDate(current.validated_at, 'dd MMM yyyy')}
                  </Badge>
                ) : (
                  <Badge variant="outline">Sin validar</Badge>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`knowledge-source-${key}`} className="text-xs text-muted-foreground">
                  Fuente
                </Label>
                <Input
                  id={`knowledge-source-${key}`}
                  value={row.source}
                  onChange={(e) => setSection(key, { source: e.target.value })}
                  placeholder="Ej: Información del negocio v2 (PDF aprobado por dirección)"
                  maxLength={500}
                  disabled={!canEdit}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={row.validated}
                    onCheckedChange={(v) => setSection(key, { validated: v, revalidate: false })}
                    disabled={!canEdit}
                    aria-label={`${label} validada`}
                  />
                  Validada
                </label>
                {canEdit && current.validated_at && row.validated && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSection(key, { revalidate: !row.revalidate })}
                    className={row.revalidate ? 'text-emerald-700 dark:text-emerald-300' : undefined}
                  >
                    <RefreshCw className="mr-1.5 size-3.5" />
                    {row.revalidate ? 'Se valida hoy al guardar' : 'Validar de nuevo hoy'}
                  </Button>
                )}
              </div>
            </div>
          )
        })}

        {canEdit && (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setForm(saved)} disabled={!dirty || mutation.isPending}>
              Descartar cambios
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={!dirty || mutation.isPending}>
              {mutation.isPending && <Spinner className="mr-2" />}
              Guardar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
