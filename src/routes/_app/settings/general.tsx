import { createFileRoute } from '@tanstack/react-router'
import { requireSettingsRole } from '@/lib/authGuards'
import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Archive, Clock, Network } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import api, { formatRailsError } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'

export const Route = createFileRoute('/_app/settings/general')({
  beforeLoad: () => requireSettingsRole('admin'),
  component: GeneralSettingsPage,
})

const NETWORK_DEPTH_OPTIONS = [
  { value: 0, label: '0', description: 'Solo el consultor en el árbol' },
  { value: 1, label: '1 nivel', description: 'Referidos directos' },
  { value: 2, label: '2 niveles', description: 'Directos + sus referidos' },
  { value: 3, label: '3 niveles', description: 'Recomendado' },
  { value: 4, label: '4 niveles', description: 'Árbol amplio' },
  { value: 5, label: '5 niveles', description: 'Máximo en /network' },
]

function retentionDays(settings: Record<string, unknown> | undefined): number | null {
  const raw = (settings?.data_retention as { conversation_days?: unknown } | undefined)?.conversation_days
  const days = Number(raw)
  return raw != null && raw !== '' && Number.isFinite(days) && days > 0 ? days : null
}

function GeneralSettingsPage() {
  const tenant      = useAuthStore((s) => s.tenant)
  const setTenant   = useAuthStore((s) => s.setTenant)
  const queryClient = useQueryClient()
  const role        = useAuthStore((s) => s.user?.role)
  const canEdit     = role === 'admin'

  const currentStaleDays    = tenant?.settings?.stale_days    ?? 7
  const currentNetworkDepth = tenant?.settings?.network_depth ?? 3

  const [staleDays,    setStaleDays]    = useState(currentStaleDays)
  const [networkDepth, setNetworkDepth] = useState(currentNetworkDepth)
  // Retención de conversaciones (Ley 1581): null = sin borrado automático.
  const currentRetention = retentionDays(tenant?.settings)
  const [retention, setRetention] = useState<number | null>(currentRetention)

  useEffect(() => {
    setStaleDays(tenant?.settings?.stale_days    ?? 7)
    setNetworkDepth(tenant?.settings?.network_depth ?? 3)
    setRetention(retentionDays(tenant?.settings))
  }, [tenant?.settings])

  const saveMutation = useMutation({
    mutationFn: async (patch: {
      stale_days?: number
      network_depth?: number
      data_retention?: { conversation_days: number | null }
    }) => {
      const res = await api.patch('/tenant', {
        tenant: {
          settings: { ...(tenant?.settings ?? {}), ...patch },
        },
      })
      return res.data
    },
    onSuccess: (data) => {
      const raw = data?.data?.attributes
      if (raw && tenant) {
        setTenant({ ...tenant, settings: raw.settings ?? tenant.settings })
      }
      queryClient.invalidateQueries({ queryKey: ['tenant'] })
      toast.success('Configuración guardada')
    },
    onError: (err: unknown) => toast.error(formatRailsError(err, 'No se pudo guardar')),
  })

  const isDirty =
    staleDays    !== currentStaleDays ||
    networkDepth !== currentNetworkDepth ||
    retention    !== currentRetention

  const handleSave = () => {
    saveMutation.mutate({
      stale_days: staleDays,
      network_depth: networkDepth,
      data_retention: { conversation_days: retention },
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Configuración general</h2>
        <p className="text-sm text-muted-foreground">
          Comportamiento del pipeline y la red de consultores.
        </p>
      </div>

      {/* Stale days */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="size-4 text-amber-500" />
            Días de inactividad
          </CardTitle>
          <CardDescription>
            Una oportunidad se marca en amber (⚠) en el Kanban cuando supera este número de días
            sin actividad. RFC §6.4.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Umbral actual
            </span>
            <span className="text-2xl font-semibold tabular-nums">
              {staleDays} <span className="text-sm font-normal text-muted-foreground">días</span>
            </span>
          </div>
          <Slider
            value={[staleDays]}
            min={1}
            max={30}
            step={1}
            disabled={!canEdit}
            onValueChange={([v]) => setStaleDays(v)}
            className="[&_[data-slot=slider-range]]:bg-amber-500"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>1 día</span>
            <span>30 días</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Valor recomendado: <strong>7 días</strong>.
            Las oportunidades con más de {staleDays} días sin actividad aparecerán con el
            indicador <span className="text-amber-500 font-medium">⏱ estancada</span> en el Kanban.
          </p>
        </CardContent>
      </Card>

      <Separator />

      {/* Network depth */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Network className="size-4 text-indigo-500" />
            Profundidad de la red de referidos
          </CardTitle>
          <CardDescription>
            Profundidad del árbol en la pantalla Red de referidos. No comparte el pipeline
            entre consultores: cada uno solo ve sus propias oportunidades.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {NETWORK_DEPTH_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={!canEdit}
                onClick={() => setNetworkDepth(opt.value)}
                className={[
                  'flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-colors',
                  networkDepth === opt.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50',
                  !canEdit && 'opacity-50 cursor-not-allowed',
                ].join(' ')}
              >
                <span className="text-xl font-bold tabular-nums">{opt.value}</span>
                <span className="text-[10px] font-medium">{opt.label}</span>
                <span className="text-[9px] text-muted-foreground leading-tight">
                  {opt.description}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Con <strong>{networkDepth} {networkDepth === 1 ? 'nivel' : 'niveles'}</strong>, el
            consultor explora su red en <strong>/network</strong>
            {networkDepth === 0
              ? ' (solo su nodo).'
              : ` hasta ${networkDepth === 1 ? 'referidos directos' : `${networkDepth} niveles`}.`}
            {' '}En Oportunidades y Contactos cada consultor solo ve lo que él creó o le pertenece.
            Admin y manager ven todo el tenant.
          </p>
        </CardContent>
      </Card>

      <Separator />

      {/* Retención de conversaciones */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Archive className="size-4 text-sky-500" />
            Retención de conversaciones de WhatsApp
          </CardTitle>
          <CardDescription>
            Plazo de conservación (Ley 1581). Cada noche se borran los mensajes más viejos que el plazo y lo que el
            asistente IA anotó de ellos; los contactos y el pipeline no se tocan. Para borrar todo de una persona que
            lo pide, usa «Borrar datos personales» en su ficha de contacto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={retention !== null}
              disabled={!canEdit}
              onCheckedChange={(on) => setRetention(on ? 730 : null)}
            />
            {retention === null ? 'Sin borrado automático (se conservan)' : 'Borrar automáticamente'}
          </label>
          {retention !== null && (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={30}
                max={3650}
                value={retention}
                disabled={!canEdit}
                onChange={(e) => setRetention(Math.max(30, Number(e.target.value) || 30))}
                className="w-28"
              />
              <span className="text-sm text-muted-foreground">
                días ({(retention / 365).toFixed(1).replace('.', ',')} años). Mínimo 30.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            disabled={!isDirty || saveMutation.isPending}
            onClick={() => {
              setStaleDays(currentStaleDays)
              setNetworkDepth(currentNetworkDepth)
              setRetention(currentRetention)
            }}
          >
            Cancelar
          </Button>
          <Button
            disabled={!isDirty || saveMutation.isPending}
            onClick={handleSave}
          >
            {saveMutation.isPending ? (
              <><Spinner className="size-4" /> Guardando...</>
            ) : (
              'Guardar cambios'
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
