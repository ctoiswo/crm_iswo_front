import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Bot,
  Briefcase,
  Building2,
  Calendar,
  ExternalLink,
  FileText,
  Globe,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Radio,
  StickyNote,
  UserRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { mailtoHref, telHref } from '@/lib/contactChannels'
import type { ContactSummary } from '@/lib/contactApi'
import { getCompanyLabel } from '@/lib/contactApi'
import { fetchFieldDefinitions, fieldValueUrl, formatFieldValue } from '@/lib/fieldDefinitions'
import { getAuthQueryScope } from '@/lib/queryClient'
import type { Opportunity } from '@/types'
import { formatDate, formatRelativeTime } from '@/lib/utils'

/** «CO» → «Colombia». Si no es un código ISO, se muestra tal cual. */
function countryName(code?: string | null): string | null {
  const c = code?.trim()
  if (!c) return null
  if (!/^[A-Za-z]{2}$/.test(c)) return c
  try {
    return new Intl.DisplayNames(['es'], { type: 'region' }).of(c.toUpperCase()) ?? c
  } catch {
    return c
  }
}

/** Texto visible de un enlace: sin «https://», sin «www.» ni «/» final. */
function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '')
}

const UTM_KEYS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
])

function humanizeFieldKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function landingPayloadEntries(customFields?: Record<string, unknown>) {
  const sub = customFields?.landing_submission
  if (!sub || typeof sub !== 'object') return []
  const payload = (sub as { payload?: Record<string, unknown> }).payload
  if (!payload || typeof payload !== 'object') return []
  return Object.entries(payload).filter(
    ([k, v]) => !UTM_KEYS.has(k) && v != null && String(v).trim() !== '',
  )
}

function landingMeta(customFields?: Record<string, unknown>) {
  const id = customFields?.landing_page_id
  const title = customFields?.landing_title
  const slug = customFields?.landing_slug
  return {
    id: id != null ? String(id) : undefined,
    title: typeof title === 'string' ? title : undefined,
    slug: typeof slug === 'string' ? slug : undefined,
  }
}

export interface OpportunityLeadSummaryProps {
  opportunity: Opportunity
  contactDetail?: ContactSummary | null
  canEditLead?: boolean
  onEditLead?: () => void
}

export function OpportunityLeadSummary({
  opportunity,
  contactDetail,
  canEditLead,
  onEditLead,
}: OpportunityLeadSummaryProps) {
  const name =
    contactDetail?.fullName?.trim() ||
    opportunity.contact_name?.trim() ||
    'Sin nombre'
  const email =
    (contactDetail?.email && contactDetail.email !== '-' ? contactDetail.email : undefined) ||
    opportunity.contact_email
  const phone =
    (contactDetail?.phone && contactDetail.phone !== '-' ? contactDetail.phone : undefined) ||
    opportunity.contact_phone
  const company =
    getCompanyLabel(contactDetail?.company) !== '-'
      ? getCompanyLabel(contactDetail?.company)
      : opportunity.company_name
  const city = contactDetail?.city || opportunity.contact_city
  const country = countryName(contactDetail?.country)
  const location = [city, country].filter(Boolean).join(', ')
  const position = contactDetail?.position && contactDetail.position !== '-' ? contactDetail.position : null
  const contactNotes = contactDetail?.notes?.trim() || null

  // Campos propios del contacto que configuró la empresa (LinkedIn, Web…), en su orden.
  const { data: contactFieldDefs = [] } = useQuery({
    queryKey: ['tenant_field_definitions', 'contact', getAuthQueryScope()],
    queryFn: () => fetchFieldDefinitions('contact'),
    staleTime: 5 * 60 * 1000,
  })
  // Campos del negocio (oportunidad) para verlos junto al lead, en solo lectura;
  // se editan más abajo en «Negocio».
  const { data: dealFieldDefs = [] } = useQuery({
    queryKey: ['tenant_field_definitions', 'opportunity', getAuthQueryScope()],
    queryFn: () => fetchFieldDefinitions('opportunity'),
    staleTime: 5 * 60 * 1000,
  })
  const dealFields = useMemo(() => {
    const values = opportunity.custom_fields ?? {}
    const rows = dealFieldDefs
      .map((def) => ({ key: def.key, label: def.label, text: formatFieldValue(def, values[def.key]) }))
      .filter((f) => f.text)
    if (opportunity.expected_close_on) {
      rows.push({
        key: 'expected_close_on',
        label: 'Fecha de cierre',
        text: formatDate(opportunity.expected_close_on, "d 'de' MMMM yyyy"),
      })
    }
    return rows
  }, [dealFieldDefs, opportunity.custom_fields, opportunity.expected_close_on])

  const contactFields = useMemo(() => {
    const values = contactDetail?.customFields ?? {}
    return contactFieldDefs
      .map((def) => {
        const raw = values[def.key]
        return { def, text: formatFieldValue(def, raw), url: fieldValueUrl(raw) }
      })
      .filter((f) => f.text)
  }, [contactFieldDefs, contactDetail?.customFields])
  const source =
    opportunity.lead_source_label ||
    contactDetail?.sourceLabel ||
    undefined

  const landing = landingMeta(opportunity.custom_fields)
  const formEntries = landingPayloadEntries(opportunity.custom_fields)
  const hasLanding = Boolean(landing.id || landing.title || landing.slug || formEntries.length > 0)

  const created = opportunity.created_at
    ? formatDate(opportunity.created_at, "d 'de' MMMM yyyy, HH:mm")
    : '—'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Lead / contacto</h3>
          <p className="text-xs text-muted-foreground">
            Datos del prospecto y origen del lead en el CRM.
          </p>
        </div>
        {canEditLead && onEditLead && (
          <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" onClick={onEditLead}>
            <Pencil className="size-3.5 mr-1.5" />
            Editar
          </Button>
        )}
      </div>

      <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
        <div className="flex items-start gap-2">
          <UserRound className="size-4 mt-0.5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{name}</p>
            {position && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Briefcase className="size-3 shrink-0" />
                <span className="truncate">{position}</span>
              </p>
            )}
            {company && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Building2 className="size-3 shrink-0" />
                <span className="truncate">{company}</span>
              </p>
            )}
          </div>
        </div>

        {(email || phone) && (
          <div className="flex flex-col gap-1">
            {phone ? (
              <a
                href={telHref(phone)}
                className="text-xs text-primary inline-flex items-center gap-1.5 hover:underline"
              >
                <Phone className="size-3.5 shrink-0" />
                {phone}
              </a>
            ) : null}
            {email ? (
              <a
                href={mailtoHref(email)}
                className="text-xs text-primary inline-flex items-center gap-1.5 hover:underline break-all"
              >
                <Mail className="size-3.5 shrink-0" />
                {email}
              </a>
            ) : null}
          </div>
        )}

        {location && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" />
            {location}
          </p>
        )}

        {contactFields.length > 0 && (
          <dl className="grid gap-1 text-xs">
            {contactFields.map(({ def, text, url }) => (
              <div key={def.key} className="grid grid-cols-[minmax(7.5rem,11rem)_1fr] gap-2">
                <dt className="text-muted-foreground truncate" title={def.label}>
                  {def.label}
                </dt>
                <dd className="min-w-0 font-medium">
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-full items-center gap-1 text-primary hover:underline"
                    >
                      <span className="truncate">{shortUrl(url)}</span>
                      <ExternalLink className="size-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="break-words">{text}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {dealFields.length > 0 && (
          <dl className="grid gap-1 border-t pt-2 text-xs">
            {dealFields.map(({ key, label, text }) => (
              <div key={key} className="grid grid-cols-[minmax(7.5rem,11rem)_1fr] gap-2">
                <dt className="text-muted-foreground truncate" title={label}>
                  {label}
                </dt>
                <dd className="min-w-0 break-words font-medium">{text}</dd>
              </div>
            ))}
          </dl>
        )}

        {source && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Radio className="size-3.5 shrink-0" />
            Origen: {source}
          </p>
        )}

        {contactNotes && (
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <StickyNote className="mt-0.5 size-3.5 shrink-0" />
            <p className="whitespace-pre-wrap break-words line-clamp-4" title={contactNotes}>
              {contactNotes}
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Calendar className="size-3.5 shrink-0" />
          Creado: {created}
          {opportunity.last_activity_at && (
            <span className="text-muted-foreground/80">
              · actividad {formatRelativeTime(opportunity.last_activity_at)}
            </span>
          )}
        </p>
      </div>

      <AiProfileBlock profile={opportunity.ai_profile} />

      {hasLanding && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="size-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Landing page
              </p>
              <p className="text-sm font-medium truncate">
                {landing.title || landing.slug || 'Formulario público'}
              </p>
              {landing.slug && (
                <p className="text-xs text-muted-foreground font-mono truncate">/{landing.slug}</p>
              )}
            </div>
            {landing.id && (
              <Button variant="ghost" size="sm" className="h-7 shrink-0" asChild>
                <Link
                  to="/opportunities"
                  search={{ landing: landing.id, view: 'kanban' }}
                >
                  <ExternalLink className="size-3.5" />
                </Link>
              </Button>
            )}
          </div>

          {formEntries.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <FileText className="size-3" />
                Datos del formulario
              </p>
              <dl className="grid gap-1 text-xs">
                {formEntries.map(([key, value]) => (
                  <div key={key} className="flex gap-2 justify-between gap-x-3">
                    <dt className="text-muted-foreground shrink-0">{humanizeFieldKey(key)}</dt>
                    <dd className="font-medium text-right break-all">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {!formEntries.length && opportunity.notes?.includes('Envío landing') && (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6">
              {opportunity.notes}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** Lo que sabe el asistente IA del lead (RFC-001 v2 §11). */
function AiProfileBlock({ profile }: { profile?: Opportunity['ai_profile'] }) {
  if (!profile) return null
  const rows: [string, string | null][] = [
    ['Resumen', profile.summary],
    ['Última intención', profile.lastIntent],
    ['Necesidad', profile.need],
    ['Urgencia', profile.urgency],
    ['Presupuesto', profile.budget],
    ['Quién decide', profile.decisionMaker],
    ['Fecha de decisión', profile.decisionDate ? formatDate(profile.decisionDate, "d 'de' MMMM yyyy") : null],
  ]
  const filled = rows.filter(([, v]) => v)
  if (!filled.length && !profile.referrer && !profile.campaign) return null

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <Bot className="size-3.5" />
        Lo que sabe el asistente
        {profile.classifiedAt && (
          <span className="normal-case tracking-normal font-normal">· {formatRelativeTime(profile.classifiedAt)}</span>
        )}
      </p>
      <dl className="grid gap-1.5 text-xs">
        {filled.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[7.5rem_1fr] gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium break-words">{value}</dd>
          </div>
        ))}
        {profile.referrer && (
          <div className="grid grid-cols-[7.5rem_1fr] gap-2">
            <dt className="text-muted-foreground">Recomendado por</dt>
            <dd className="font-medium">
              <Link to="/contacts" search={{ selected: profile.referrer.id }} className="text-primary hover:underline">
                {profile.referrer.name}
              </Link>
            </dd>
          </div>
        )}
        {profile.campaign && (
          <div className="grid grid-cols-[7.5rem_1fr] gap-2">
            <dt className="text-muted-foreground">Campaña</dt>
            <dd className="font-medium break-words">
              {profile.campaign.url ? (
                <a href={profile.campaign.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  {profile.campaign.name}
                </a>
              ) : (
                profile.campaign.name
              )}
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}
