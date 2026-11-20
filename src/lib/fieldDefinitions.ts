import api from '@/lib/api'
import { formatDate } from '@/lib/utils'
import type { TenantFieldDefinition } from '@/types'

/** Campos personalizados activos del tenant para una entidad, en su orden. */
export async function fetchFieldDefinitions(
  entity: TenantFieldDefinition['entity'],
): Promise<TenantFieldDefinition[]> {
  const res = await api.get('/tenant_field_definitions', { params: { entity } })
  const items = (res.data as { data?: unknown[] })?.data ?? []
  return items
    .map((item) => {
      const r = item as { id?: string; attributes?: Record<string, unknown> }
      const a = r.attributes ?? {}
      return {
        id: String(r.id ?? ''),
        key: String(a.key ?? ''),
        label: String(a.label ?? ''),
        field_type: (a.field_type as TenantFieldDefinition['field_type']) ?? 'text',
        options: Array.isArray(a.options) ? (a.options as string[]) : [],
        required: Boolean(a.required),
        entity: (a.entity as TenantFieldDefinition['entity']) ?? entity,
        position: Number(a.position ?? 0),
        active: Boolean(a.active ?? true),
      }
    })
    .filter((d) => d.active)
    .sort((x, y) => x.position - y.position)
}

/** Enlace http(s) o dominio («www.empresa.com», «linkedin.com/in/…»). */
export function fieldValueUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (/^https?:\/\/\S+$/i.test(v)) return v
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v)) return `https://${v}`
  return null
}

/** Valor de un campo personalizado listo para mostrar, o null si está vacío. */
export function formatFieldValue(def: TenantFieldDefinition, value: unknown): string | null {
  if (value === null || value === undefined || String(value).trim() === '') return null
  switch (def.field_type) {
    case 'boolean':
      return value === true || value === 'true' ? 'Sí' : 'No'
    case 'date': {
      const s = String(value)
      return /^\d{4}-\d{2}-\d{2}/.test(s) ? formatDate(s, "d 'de' MMMM yyyy") : s
    }
    case 'number':
      return typeof value === 'number' ? value.toLocaleString('es-CO') : String(value)
    case 'currency':
      return typeof value === 'number' ? `$ ${value.toLocaleString('es-CO')}` : String(value)
    default:
      return String(value)
  }
}
