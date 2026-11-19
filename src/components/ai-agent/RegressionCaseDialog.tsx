import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { formatRailsError } from '@/lib/api'
import { aiAgentQueryKeys, createEvalCase, fetchEvalCaseDraft, type ChatTurn } from '@/lib/aiAgentApi'

const ANY = '__any__'

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

/**
 * Convierte una respuesta de la cola «Por revisar» en caso de regresión
 * (RFC-001 v2 del asistente §17): la conversación real llega anonimizada del
 * servidor y se puede editar antes de guardar; se define qué debe pasar.
 */
export function RegressionCaseDialog({ runId, onClose }: { runId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: draft, isLoading } = useQuery({
    queryKey: ['aiAgent', 'evalCaseDraft', runId],
    queryFn: () => fetchEvalCaseDraft(runId as string),
    enabled: runId !== null,
  })
  const [name, setName] = useState('')
  const [messages, setMessages] = useState<ChatTurn[]>([])
  const [consent, setConsent] = useState(true)
  const [status, setStatus] = useState(ANY)
  const [excludes, setExcludes] = useState('')
  const [includes, setIncludes] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!draft) return
    setName(draft.name)
    setMessages(draft.messages)
    setConsent(draft.consent)
    setStatus(ANY)
    setExcludes('')
    setIncludes('')
    setNotes('')
  }, [draft])

  const expect = {
    ...(status !== ANY ? { status: status as 'replied' | 'handoff' } : {}),
    ...(lines(excludes).length ? { excludes: lines(excludes) } : {}),
    ...(lines(includes).length ? { includes_any: lines(includes) } : {}),
  }
  const valid =
    name.trim() !== '' &&
    Object.keys(expect).length > 0 &&
    messages.length > 0 &&
    messages[messages.length - 1].role === 'user' &&
    messages.every((m) => m.content.trim() !== '')

  const mutation = useMutation({
    mutationFn: () =>
      createEvalCase({ name, notes: notes.trim() || undefined, consent, messages, expect, run_id: runId ?? undefined }),
    onSuccess: () => {
      toast.success('Caso de regresión agregado: entra en la próxima prueba')
      void queryClient.invalidateQueries({ queryKey: aiAgentQueryKeys.evalCases() })
      void queryClient.invalidateQueries({ queryKey: aiAgentQueryKeys.evals() })
      onClose()
    },
    onError: (err) => toast.error(formatRailsError(err, 'No se pudo guardar el caso')),
  })

  return (
    <Dialog open={runId !== null} onOpenChange={(open) => { if (!open && !mutation.isPending) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Agregar como caso de regresión</DialogTitle>
          <DialogDescription>
            La conversación entra en las pruebas del asistente para que este error no vuelva a pasar. Los datos del
            cliente ya vienen ocultos; revisa que no quede nada personal antes de guardar.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !draft ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="regression-name">Nombre del caso</Label>
              <Input id="regression-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </div>

            <div className="space-y-2">
              <Label>Conversación (la última línea es la del cliente que se prueba)</Label>
              {messages.map((m, i) => (
                <div key={i} className="space-y-1">
                  <span className="text-xs text-muted-foreground">{m.role === 'user' ? 'Cliente' : 'Asistente'}</span>
                  <Textarea
                    value={m.content}
                    onChange={(e) =>
                      setMessages((list) => list.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)))
                    }
                    rows={2}
                    maxLength={2000}
                  />
                </div>
              ))}
              {messages.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => setMessages((list) => list.slice(1))}>
                  Quitar el primer mensaje
                </Button>
              )}
              {draft.reply && (
                <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  Lo que respondió el asistente: «{draft.reply}»
                </p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
              El cliente ya había autorizado sus datos
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Qué debe hacer</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>Cualquiera</SelectItem>
                    <SelectItem value="replied">Responder él mismo</SelectItem>
                    <SelectItem value="handoff">Pasar a un asesor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="regression-notes">Nota (opcional)</Label>
                <Input
                  id="regression-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej: dio un precio que no existe"
                  maxLength={1000}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="regression-excludes">No debe decir (una por línea)</Label>
                <Textarea
                  id="regression-excludes"
                  value={excludes}
                  onChange={(e) => setExcludes(e.target.value)}
                  rows={3}
                  placeholder={'Ej:\n$1.000.000\nhe agendado'}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="regression-includes">Debe decir alguna de (una por línea)</Label>
                <Textarea
                  id="regression-includes"
                  value={includes}
                  onChange={(e) => setIncludes(e.target.value)}
                  rows={3}
                  placeholder={'Ej:\nun asesor te confirmará'}
                />
              </div>
            </div>
            {Object.keys(expect).length === 0 && (
              <p className="text-xs text-muted-foreground">Define al menos una de las tres condiciones.</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending && <Spinner className="mr-2" />}
            Agregar caso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
