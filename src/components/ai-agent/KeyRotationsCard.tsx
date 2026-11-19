import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRailsError } from '@/lib/api'
import { cn, formatDate } from '@/lib/utils'
import {
  aiAgentQueryKeys,
  fetchKeyRotations,
  recordKeyRotation,
  type KeyRotation,
  type KeyRotationStatus,
} from '@/lib/aiAgentApi'

const STATUS: Record<KeyRotationStatus, { label: string; className: string }> = {
  ok: { label: 'Al día', className: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300' },
  due_soon: { label: 'Por vencer', className: 'border-amber-500/40 text-amber-700 dark:text-amber-300' },
  overdue: { label: 'Vencida', className: 'border-destructive/40 text-destructive' },
  unknown: { label: 'Sin registro', className: 'text-muted-foreground' },
}

const today = () => new Date().toLocaleDateString('en-CA')

/**
 * Rotación de claves (RFC-001 v2 del asistente §16): fecha de la última
 * rotación de cada clave, quién la registró y cuándo vence (12 meses). A los
 * 11 meses avisa al responsable de seguridad. Las claves no se ven aquí.
 */
export function KeyRotationsCard({ canEdit }: { canEdit: boolean }) {
  const { data = [], isLoading } = useQuery({ queryKey: aiAgentQueryKeys.keyRotations(), queryFn: fetchKeyRotations })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4" />
          Rotación de claves
        </CardTitle>
        <CardDescription>
          Cambia cada clave al menos una vez al año y registra aquí la fecha. A los 11 meses se avisa al responsable de
          seguridad. Las claves no se guardan ni se ven en esta pantalla.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          data.map((k) => <KeyRow key={k.key} item={k} canEdit={canEdit} />)
        )}
      </CardContent>
    </Card>
  )
}

function KeyRow({ item, canEdit }: { item: KeyRotation; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState(today())
  const mutation = useMutation({
    mutationFn: () => recordKeyRotation(item.key, date),
    onSuccess: (list) => {
      queryClient.setQueryData(aiAgentQueryKeys.keyRotations(), list)
      setEditing(false)
      toast.success('Rotación registrada')
    },
    onError: (err) => toast.error(formatRailsError(err, 'No se pudo registrar')),
  })
  const status = STATUS[item.status]

  return (
    <div className="space-y-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 text-sm font-medium">{item.label}</span>
        <Badge variant="outline" className={cn('text-[10px]', status.className)}>
          {item.configured ? status.label : 'No configurada'}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {item.rotatedOn
          ? `Rotada el ${formatDate(item.rotatedOn, "d 'de' MMMM yyyy")}${item.rotatedByName ? ` (registró ${item.rotatedByName})` : ''} · vence el ${formatDate(item.dueOn as string, "d 'de' MMMM yyyy")}`
          : 'Sin fecha de rotación registrada.'}
      </p>
      {canEdit &&
        (editing ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              mutation.mutate()
            }}
          >
            <Input
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 w-auto"
              aria-label={`Fecha de rotación de ${item.label}`}
            />
            <Button type="submit" size="sm" className="h-8" disabled={!date || mutation.isPending}>
              Guardar
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </form>
        ) : (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(true)}>
            Registrar rotación
          </Button>
        ))}
    </div>
  )
}
