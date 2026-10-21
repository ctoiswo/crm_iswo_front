import { describe, expect, it } from 'vitest'
import { mapConfig } from '@/lib/aiAgentApi'

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
