import { describe, expect, it } from 'vitest'
import { formatSeconds, mapActivity, mapConfig } from '@/lib/aiAgentApi'

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
