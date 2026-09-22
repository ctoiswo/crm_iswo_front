/**
 * Sonido de "mensaje nuevo" sintetizado con Web Audio — sin archivo de audio
 * externo que mantener/alojar. Dos tonos cortos ascendentes, similar al
 * "ding" de apps de chat. Falla en silencio si el navegador bloquea audio
 * sin interacción previa del usuario (política estándar de autoplay).
 */
let sharedContext: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!sharedContext) sharedContext = new Ctor()
  return sharedContext
}

function playTone(ctx: AudioContext, frequency: number, startAt: number, duration: number) {
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.value = frequency
  gain.gain.setValueAtTime(0, startAt)
  gain.gain.linearRampToValueAtTime(0.15, startAt + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration)
  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start(startAt)
  oscillator.stop(startAt + duration)
}

export function playNewMessageSound() {
  try {
    const ctx = getContext()
    if (!ctx) return
    if (ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime
    playTone(ctx, 740, now, 0.12)
    playTone(ctx, 988, now + 0.09, 0.16)
  } catch {
    // Autoplay bloqueado u otro fallo de audio — no es crítico, se ignora.
  }
}
