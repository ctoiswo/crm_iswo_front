import { describe, expect, it } from 'vitest'
import { blockedPriceSentence, formatSeconds, mapActivity, mapEvalRun, mapMessageAiRun, mapReviewItem, mapConfig } from '@/lib/aiAgentApi'

describe('mapConfig', () => {
  it('lee el proceso comercial y su texto por defecto', () => {
    const c = mapConfig({
      enabled: true,
      sales_process: 'Siguiente paso: la demo',
      defaults: { tone: 't', sales_process: 'Etapas y siguiente paso', qualification: 'q', handoff_rules: 'h' },
    })
    expect(c.salesProcess).toBe('Siguiente paso: la demo')
    expect(c.defaults.sales_process).toBe('Etapas y siguiente paso')
  })

  it('sin proceso comercial (API anterior) queda vacío', () => {
    expect(mapConfig({}).salesProcess).toBe('')
    expect(mapConfig({}).objections).toEqual([])
  })

  it('lee los criterios de calificación y si comercial los validó', () => {
    const c = mapConfig({
      lead_criteria: { cold: 'Solo mira', warm: 'Tiene norma', hot: 'Auditoría', validated_at: '2026-11-19T10:00:00Z', validated_by_name: 'Ana' },
    })
    expect(c.leadCriteria).toEqual({ cold: 'Solo mira', warm: 'Tiene norma', hot: 'Auditoría', validated_at: '2026-11-19T10:00:00Z', validated_by_name: 'Ana' })
    expect(mapConfig({}).leadCriteria.validated_at).toBeNull()
  })

  it('lee responsable, fuente y validación de la base de conocimiento', () => {
    const c = mapConfig({
      knowledge: {
        owner_id: 7,
        owner_name: 'Ana',
        review_days: 30,
        sections: { business_info: { source: 'Brochure', validated_at: '2026-11-19T10:00:00Z', validated_by_name: 'Ana', stale: false } },
      },
    })
    expect(c.knowledge).toMatchObject({ ownerId: '7', ownerName: 'Ana', reviewDays: 30 })
    expect(c.knowledge.sections.business_info).toMatchObject({ source: 'Brochure', stale: false })
    expect(c.knowledge.sections.faq).toEqual({ source: '', validated_at: null, validated_by_name: null, stale: true })
  })

  it('lee las objeciones con su aprobación', () => {
    const c = mapConfig({
      objections: [
        { key: 'caro', trigger: 'Es caro', response: 'Incluye todo', approved_at: '2026-11-19T10:00:00Z', approved_by_name: 'Frank' },
        { key: 'excel', trigger: 'Ya usamos Excel', response: 'Migramos' },
      ],
    })
    expect(c.objections[0]).toMatchObject({ key: 'caro', approved_by_name: 'Frank', reframe: '', validation_note: '' })
    expect(c.objections[1].approved_at).toBeNull()
  })
})

describe('mapActivity', () => {
  it('lee versión, tiempos y tipo de paso a asesor de cada respuesta, y las métricas nuevas', () => {
    const a = mapActivity({
      data: [{ id: 1, status: 'handoff', config_version: 3, latency_ms: 9500, model_ms: 1200, handoff_type: 'agenda' }],
      meta: {
        metrics: {
          handoffs_by_type: { agenda: 2 },
          response_time: { median_ms: 9000, p90_ms: 12000, samples: 4 },
        },
      },
    })
    expect(a.runs[0]).toMatchObject({ configVersion: 3, latencyMs: 9500, modelMs: 1200, handoffType: 'agenda' })
    expect(a.metrics.handoffsByType).toEqual({ agenda: 2 })
    expect(a.metrics.responseTime).toEqual({ medianMs: 9000, p90Ms: 12000, samples: 4 })
  })

  it('respuestas anteriores (sin trazabilidad) quedan en null', () => {
    const a = mapActivity({ data: [{ id: 1, status: 'replied' }], meta: {} })
    expect(a.runs[0]).toMatchObject({ configVersion: null, latencyMs: null, handoffType: null })
    expect(a.metrics.responseTime).toEqual({ medianMs: null, p90Ms: null, samples: 0 })
  })
})

describe('formatSeconds', () => {
  it('muestra segundos con una decimal', () => {
    expect(formatSeconds(9500)).toBe('9,5 s')
    expect(formatSeconds(null)).toBe('—')
  })
})

describe('blockedPriceSentence', () => {
  it('devuelve la frase que bloqueó el filtro de precios', () => {
    const calls = [
      { name: 'filtro_precios', arguments: { frase: 'Cuesta $1.500.000.', valores: ['$1.500.000'] }, result: '' },
      { name: 'pasar_a_asesor', arguments: { tipo: 'precio_no_aprobado' }, result: '' },
    ]
    expect(blockedPriceSentence(calls)).toBe('Cuesta $1.500.000.')
    expect(blockedPriceSentence([])).toBeNull()
  })
})

describe('mapActivity: presupuesto', () => {
  it('lee el gasto del mes frente al tope', () => {
    const a = mapActivity({ data: [], meta: { budget: { month_usd: 3.25, monthly_budget_usd: 20, percent: 16 } } })
    expect(a.budget).toEqual({ monthUsd: 3.25, monthlyBudgetUsd: 20, percent: 16 })
  })
})

describe('mejora continua (RFC §17)', () => {
  it('lee la calificación de un mensaje del asistente', () => {
    expect(mapMessageAiRun(undefined)).toBeUndefined()
    expect(mapMessageAiRun({ id: 5, rating: 'partial', rating_note: 'Faltó SST' })).toEqual({
      id: '5',
      rating: 'partial',
      ratingNote: 'Faltó SST',
    })
    expect(mapMessageAiRun({ id: 6, rating: 'otra' })?.rating).toBeNull()
  })

  it('lee un elemento de la cola de revisión', () => {
    const item = mapReviewItem({ id: 9, reason: 'sin_informacion', contact_id: 3, question: '¿SST?', reply: '' })
    expect(item).toMatchObject({ id: '9', reason: 'sin_informacion', contactId: '3', question: '¿SST?', reply: null })
  })
})

describe('seguridad (RFC §16)', () => {
  it('lee los contadores de seguridad', () => {
    const a = mapActivity({ data: [], meta: { metrics: { injection_attempts: 2, sensitive_masked: 5 } } })
    expect(a.metrics).toMatchObject({ injectionAttempts: 2, sensitiveMasked: 5 })
  })
})

describe('mapEvalRun', () => {
  it('lee el resumen y el resultado de cada caso', () => {
    const r = mapEvalRun({
      id: 5, status: 'done', repeat: 2, total: 2, passed: 1, failed: 1, config_version: 7, user_name: 'Ana',
      results: [
        { name: 'saluda', category: 'etapa', passed: true, attempts: 2, passed_attempts: 2 },
        { name: 'precio', category: 'regresion', passed: false, failures: ['dice «gratis»'], reply: 'Es gratis', tools: [] },
      ],
    })
    expect(r).toMatchObject({ id: '5', status: 'done', passed: 1, failed: 1, configVersion: 7, userName: 'Ana' })
    expect(r.results[1]).toMatchObject({ passed: false, attempts: 1, passedAttempts: 0, failures: ['dice «gratis»'] })
  })
})
