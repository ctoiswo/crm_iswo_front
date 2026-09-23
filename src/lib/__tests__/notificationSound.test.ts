import { describe, it, expect, vi, beforeEach } from 'vitest'

class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  state: 'suspended' | 'running' = 'suspended'
  /** Simula si el navegador acepta el gesto como activación válida. */
  static acceptGesture = false
  constructor() {
    FakeAudioContext.instances.push(this)
  }
  resume = vi.fn(async () => {
    if (FakeAudioContext.acceptGesture) this.state = 'running'
  })
}

describe('unlockAudioOnFirstInteraction', () => {
  beforeEach(() => {
    vi.resetModules()
    FakeAudioContext.instances = []
    FakeAudioContext.acceptGesture = false
    ;(window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext
  })

  it('reintenta en el siguiente gesto si el primero no desbloqueó el audio (mobile)', async () => {
    const { unlockAudioOnFirstInteraction } = await import('../notificationSound')
    unlockAudioOnFirstInteraction()

    window.dispatchEvent(new Event('pointerdown'))
    await Promise.resolve()
    const ctx = FakeAudioContext.instances[0]!
    expect(ctx.state).toBe('suspended')

    FakeAudioContext.acceptGesture = true
    window.dispatchEvent(new Event('touchend'))
    await vi.waitFor(() => expect(ctx.state).toBe('running'))
  })

  it('deja de escuchar gestos cuando el audio ya quedó desbloqueado', async () => {
    FakeAudioContext.acceptGesture = true
    const { unlockAudioOnFirstInteraction } = await import('../notificationSound')
    unlockAudioOnFirstInteraction()

    window.dispatchEvent(new Event('click'))
    const ctx = FakeAudioContext.instances[0]!
    await vi.waitFor(() => expect(ctx.state).toBe('running'))
    await Promise.resolve()
    const callsAfterUnlock = ctx.resume.mock.calls.length

    window.dispatchEvent(new Event('keydown'))
    expect(ctx.resume.mock.calls.length).toBe(callsAfterUnlock)
  })
})
