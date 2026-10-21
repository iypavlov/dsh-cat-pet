/**
 * Состояния котика.
 *
 * Набор простой и «бытовой»: кошка сидит, ложится, спит и встаёт.
 * Это не про статус агента напрямую, а про то, чем кошка занята.
 *
 *   sit   — сидит (по умолчанию, кошка ничем не занята)
 *   lie   — ложится (переход в сон, проигрывается один раз)
 *   sleep — спит (пока агент долго думает или в сессии затишье)
 *   wake  — встаёт (пробуждение, проигрывается один раз)
 */
export const PET_STATES = ['sit', 'lie', 'sleep', 'wake'] as const

export type PetState = (typeof PET_STATES)[number]

/** Состояние по умолчанию и при любой нераспознанной ситуации. */
export const FALLBACK_STATE: PetState = 'sit'

/** Состояния-переходы: играются один раз и замирают на последнем кадре. */
export const ONE_SHOT_STATES: readonly PetState[] = ['lie', 'wake']

export function isOneShot(state: PetState): boolean {
  return ONE_SHOT_STATES.includes(state)
}

export function isPetState(value: unknown): value is PetState {
  return typeof value === 'string' && (PET_STATES as readonly string[]).includes(value)
}
