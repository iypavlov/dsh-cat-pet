/**
 * Хранилище настроек — тот же паттерн, что и у сигнала сессии: одна
 * подписка на всех потребителей.
 *
 * Панель настроек пишет, котик читает. Через отдельный сигнал, а не через
 * React-контекст, потому что панель и котик живут в РАЗНЫХ слотах и не
 * являются соседями в дереве — контекст бы до них не дошёл.
 */
import {
  PREF_DEFAULTS,
  PREFS_STORAGE_KEY,
  parsePrefs,
  serializePrefs,
  type PetPrefs,
} from './prefs'
import { createSignal, type Signal } from './signal'

export function createPrefsStore(storage?: { getItem(k: string): string | null; setItem(k: string, v: string): void }): {
  signal: Signal<PetPrefs>
  update(patch: Partial<PetPrefs>): void
} {
  const read = (): PetPrefs => {
    try {
      return parsePrefs(storage ? storage.getItem(PREFS_STORAGE_KEY) : null)
    } catch {
      return { ...PREF_DEFAULTS }
    }
  }

  const signal = createSignal<PetPrefs>(read())

  return {
    signal,
    update(patch) {
      signal.set(patch)
      try {
        storage?.setItem(PREFS_STORAGE_KEY, serializePrefs(signal.get()))
      } catch {
        /* приватный режим — настройка подействует до перезагрузки */
      }
    },
  }
}
