import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
} from 'lucide-react'
import { formatRailsError } from '@/lib/api'
import {
  downloadContactImportTemplate,
  importContactsFromFile,
  previewContactImport,
  type ContactImportMapping,
  type ContactImportPreview,
  type ContactImportResult,
  type ContactImportTarget,
} from '@/lib/contactApi'
import { invalidateContactsQueries } from '@/lib/queryClient'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'

interface ContactImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ACCEPT =
  '.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv'

/** Campos que solo admiten una columna: si hay dos, la segunda va a Notas. */
const SINGLE_FIELDS = new Set([
  'first_name',
  'last_name',
  'full_name',
  'company',
  'document_id',
  'phone',
  'email',
  'position',
  'city',
  'country',
  'kind',
  'origin',
  'stage',
])
const NAME_FIELDS = ['first_name', 'last_name', 'full_name', 'company']

type Step = 'file' | 'map' | 'result'

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

export function ContactImportDialog({ open, onOpenChange }: ContactImportDialogProps) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('file')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ContactImportPreview | null>(null)
  const [mapping, setMapping] = useState<ContactImportMapping>({})
  const [importResult, setImportResult] = useState<ContactImportResult | null>(null)

  const reset = () => {
    setStep('file')
    setFile(null)
    setPreview(null)
    setMapping({})
    setImportResult(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  useEffect(() => {
    if (!open) reset()
  }, [open])

  const downloadTemplateMutation = useMutation({
    mutationFn: downloadContactImportTemplate,
    onSuccess: () => toast.success('Plantilla Excel descargada'),
    onError: (err: unknown) =>
      toast.error(formatRailsError(err, 'No se pudo descargar la plantilla')),
  })

  const previewMutation = useMutation({
    mutationFn: previewContactImport,
    onSuccess: (data) => {
      setPreview(data)
      setMapping(Object.fromEntries(data.columns.map((c) => [String(c.index), c.suggested])))
      setStep('map')
    },
    onError: (err: unknown) => {
      toast.error(formatRailsError(err, 'No se pudo leer el archivo'))
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
    },
  })

  const importMutation = useMutation({
    mutationFn: ({ f, m }: { f: File; m: ContactImportMapping }) => importContactsFromFile(f, m),
    onSuccess: async (data) => {
      await invalidateContactsQueries(queryClient)
      setImportResult(data)
      setStep('result')
      const errCount = data.errors?.length ?? 0
      if (data.created_count > 0 && errCount === 0) {
        toast.success(
          `Importación lista: ${plural(data.created_count, 'contacto creado', 'contactos creados')}`,
        )
      } else if (data.created_count === 0 && errCount > 0) {
        toast.error('No se importó ningún contacto. Revisa los errores en el detalle.')
      } else if (errCount > 0) {
        toast.warning(
          `Importación parcial: ${plural(data.created_count, 'creado', 'creados')}, ${plural(errCount, 'fila con error', 'filas con error')}`,
        )
      } else {
        toast.info('No había filas con datos para importar.')
      }
    },
    onError: (err: unknown) => toast.error(formatRailsError(err, 'No se pudo importar el archivo')),
  })

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0]
    if (!picked) return
    setFile(picked)
    setImportResult(null)
    previewMutation.mutate(picked)
  }

  const targetGroups = useMemo(() => {
    const groups = new Map<string, ContactImportTarget[]>()
    for (const t of preview?.targets ?? []) {
      groups.set(t.group, [...(groups.get(t.group) ?? []), t])
    }
    return [...groups.entries()]
  }, [preview])

  const targetLabel = useMemo(
    () => new Map((preview?.targets ?? []).map((t) => [t.value, t.label])),
    [preview],
  )

  // Avisos del mapeo: columnas repetidas al mismo campo y falta de nombre/empresa.
  const mappingNotes = useMemo(() => {
    if (!preview) return { repeated: [] as string[], noName: false, ignored: 0, toNotes: 0 }
    const values = preview.columns.map((c) => mapping[String(c.index)] ?? c.suggested)
    const counts = new Map<string, number>()
    values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1))
    const repeated = [...counts.entries()]
      .filter(([v, n]) => n > 1 && SINGLE_FIELDS.has(v))
      .map(([v]) => targetLabel.get(v) ?? v)
    return {
      repeated,
      noName: !values.some((v) => NAME_FIELDS.includes(v)),
      ignored: values.filter((v) => v === 'ignore').length,
      toNotes: values.filter((v) => v === 'notes').length,
    }
  }, [preview, mapping, targetLabel])

  const tooManyRows = preview ? preview.total_rows > preview.max_rows : false

  const submitImport = () => {
    if (!file) return
    importMutation.mutate({ f: file, m: mapping })
  }

  const errCount = importResult?.errors?.length ?? 0
  const warnings = importResult?.warnings ?? []
  const createdFields = importResult?.created_fields ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-4 py-4 sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="size-4" />
            Importar contactos
          </DialogTitle>
          <DialogDescription>
            {step === 'map'
              ? 'Revisa a dónde va cada columna de tu archivo. Ajusta lo que no esté bien y luego importa.'
              : step === 'result'
                ? 'Así quedó la importación.'
                : 'Sube tu base en Excel (.xlsx) o CSV (.csv) con las columnas que tengas. Antes de importar podrás revisar a dónde va cada una.'}
          </DialogDescription>
        </DialogHeader>

        <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={onPickFile} />

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6">
          <div className="min-w-0 space-y-3">
            {step === 'file' && (
              <>
                <div className="space-y-2 rounded-md border px-4 py-3">
                  <p className="text-sm font-medium">Archivo con tu base de contactos</p>
                  <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                    <li>Sirve tal como lo tienes: títulos en cualquier fila, en otra hoja o sin títulos.</li>
                    <li>
                      Los datos quedan con el mismo formato en el CRM: nombres con mayúscula inicial,
                      celular con indicativo, cédula o NIT limpios.
                    </li>
                    <li>Lo que no tenga un campo en el CRM queda en Notas; no se pierde nada.</li>
                  </ul>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full gap-2"
                    disabled={previewMutation.isPending}
                    onClick={() => inputRef.current?.click()}
                  >
                    {previewMutation.isPending ? (
                      <>
                        <Spinner className="size-4" />
                        Leyendo {file?.name}…
                      </>
                    ) : (
                      <>
                        <FileSpreadsheet className="size-4" />
                        Elegir archivo (.xlsx o .csv)
                      </>
                    )}
                  </Button>
                </div>

                <div className="flex flex-col gap-3 rounded-md border bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">¿Empiezas de cero?</p>
                    <p className="text-xs text-muted-foreground">
                      Usa la plantilla: Nombres, Apellidos, Cédula o NIT, Celular, Correo y Origen del lead.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    disabled={downloadTemplateMutation.isPending}
                    onClick={() => downloadTemplateMutation.mutate()}
                  >
                    {downloadTemplateMutation.isPending ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                    Descargar plantilla
                  </Button>
                </div>
              </>
            )}

            {step === 'map' && preview && (
              <>
                <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                  <FileSpreadsheet className="size-4 shrink-0 text-emerald-500" />
                  <span className="min-w-0 flex-1 truncate" title={preview.filename}>
                    {preview.filename}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {plural(preview.total_rows, 'fila', 'filas')}
                    {preview.sheet_name ? ` · hoja «${preview.sheet_name}»` : ''}
                  </span>
                </div>

                {preview.header_row === null && (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
                    No encontramos títulos de columna: las identificamos por su contenido. Revísalas.
                  </p>
                )}
                {tooManyRows && (
                  <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
                    El archivo tiene {preview.total_rows} filas y el máximo por importación es{' '}
                    {preview.max_rows}. Divídelo en varios archivos.
                  </p>
                )}

                <ul className="divide-y rounded-md border">
                  {preview.columns.map((col) => {
                    const key = String(col.index)
                    const value = mapping[key] ?? col.suggested
                    return (
                      <li
                        key={key}
                        className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium" title={col.header}>
                            {col.header}
                          </p>
                          <p
                            className="truncate text-xs text-muted-foreground"
                            title={col.samples.join(' · ')}
                          >
                            {col.samples.length ? col.samples.join(' · ') : 'Sin datos'}
                          </p>
                        </div>
                        <select
                          aria-label={`Destino de la columna ${col.header}`}
                          value={value}
                          onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                          className={`h-9 w-full rounded-md border bg-background px-2 text-sm sm:w-64 ${
                            value === 'ignore' ? 'text-muted-foreground' : ''
                          }`}
                        >
                          {targetGroups.map(([group, targets]) => (
                            <optgroup key={group} label={group}>
                              {targets.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.value === 'notes' ? 'Notas («Título: valor»)' : t.label}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </li>
                    )
                  })}
                </ul>

                <div className="space-y-1 text-xs text-muted-foreground">
                  {mappingNotes.noName && (
                    <p className="text-amber-700 dark:text-amber-400">
                      Ninguna columna va a nombre o empresa: las filas sin nombre darán error.
                    </p>
                  )}
                  {mappingNotes.repeated.length > 0 && (
                    <p>
                      Varias columnas van a {mappingNotes.repeated.map((r) => `«${r}»`).join(', ')}: se usa
                      la primera con datos y las demás quedan en Notas.
                    </p>
                  )}
                  {(mappingNotes.toNotes > 0 || mappingNotes.ignored > 0) && (
                    <p>
                      {mappingNotes.toNotes > 0 && `${plural(mappingNotes.toNotes, 'columna', 'columnas')} a Notas`}
                      {mappingNotes.toNotes > 0 && mappingNotes.ignored > 0 && ' · '}
                      {mappingNotes.ignored > 0 && `${plural(mappingNotes.ignored, 'columna', 'columnas')} sin importar`}
                    </p>
                  )}
                  {!preview.can_create_fields && (
                    <p>Para guardar una columna en un campo propio, un administrador puede crearlo en Ajustes → Campos.</p>
                  )}
                </div>
              </>
            )}

            {step === 'result' && importResult && (
              <div
                className={`rounded-md border px-3 py-2.5 text-sm ${
                  errCount > 0 && importResult.created_count === 0
                    ? 'border-destructive/40 bg-destructive/5'
                    : errCount > 0 || warnings.length > 0
                      ? 'border-amber-500/40 bg-amber-500/5'
                      : 'border-emerald-500/40 bg-emerald-500/5'
                }`}
              >
                <div className="flex items-start gap-2">
                  {errCount > 0 || warnings.length > 0 ? (
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  )}
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-foreground">Resultado</p>
                    <ul className="space-y-0.5 text-xs text-muted-foreground">
                      <li>
                        <span className="text-foreground">{importResult.created_count}</span> creados
                      </li>
                      {importResult.skipped_count > 0 && (
                        <li>
                          <span className="text-foreground">{importResult.skipped_count}</span> filas vacías
                          omitidas
                        </li>
                      )}
                      {errCount > 0 && (
                        <li>
                          <span className="text-foreground">{errCount}</span> filas con error
                        </li>
                      )}
                      {warnings.length > 0 && (
                        <li>
                          <span className="text-foreground">{warnings.length}</span> avisos (se importaron
                          con un ajuste)
                        </li>
                      )}
                      {createdFields.length > 0 && (
                        <li>
                          Campos nuevos del contacto:{' '}
                          <span className="text-foreground">{createdFields.join(', ')}</span>
                        </li>
                      )}
                    </ul>
                    {errCount > 0 && (
                      <ul className="mt-2 max-h-32 overflow-y-auto rounded border bg-background/80 px-2 py-1.5 text-xs text-foreground">
                        {importResult.errors.map((e) => (
                          <li key={`${e.row}-${e.message}`} className="py-0.5">
                            {e.row > 0 ? (
                              <>
                                Fila <strong>{e.row}</strong>: {e.message}
                              </>
                            ) : (
                              e.message
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {warnings.length > 0 && (
                      <ul className="mt-2 max-h-32 overflow-y-auto rounded border border-amber-500/30 bg-background/80 px-2 py-1.5 text-xs text-foreground">
                        {warnings.map((w) => (
                          <li key={`${w.row}-${w.message}`} className="py-0.5">
                            Fila <strong>{w.row}</strong>: {w.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-row flex-wrap items-center justify-end gap-2 border-t px-4 py-3 sm:px-6 sm:py-4">
          {step === 'map' && (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto gap-1.5 px-2 sm:px-4"
              disabled={importMutation.isPending}
              onClick={reset}
            >
              <ArrowLeft className="size-4" />
              Otro archivo
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            className={step === 'map' ? 'hidden sm:inline-flex' : undefined}
            onClick={() => onOpenChange(false)}
          >
            {step === 'result' ? 'Cerrar' : 'Cancelar'}
          </Button>
          {step === 'map' && preview && (
            <Button
              type="button"
              disabled={importMutation.isPending || tooManyRows || preview.total_rows === 0}
              onClick={submitImport}
            >
              {importMutation.isPending ? (
                <>
                  <Spinner className="mr-1 size-4" />
                  Importando…
                </>
              ) : (
                `Importar ${plural(preview.total_rows, 'fila', 'filas')}`
              )}
            </Button>
          )}
          {step === 'result' && (
            <Button type="button" onClick={reset}>
              Importar otro archivo
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
