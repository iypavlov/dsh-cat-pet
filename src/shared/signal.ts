/**
 * Мини-наблюдаемый сигнал: один снапшот + подписчики.
 *
 * Контракт совместим с React.useSyncExternalStore: getSnapshot обязан
 * возвращать ТОТ ЖЕ объект, пока значение не изменилось, поэтому set()
 * сравнивает поверхностно и не публикует «тот же» снапшот. Это же
 * снимает главную боль чужих реализаций — лишние перерисовки на каждый
 * поллинг-тик.
 */
export type Listener<T> = (value: T) => void

export interface Signal<T> {
  get(): T
  /** Частичное обновление; без изменений — no-op (без уведомления). */
  set(patch: Partial<T>): void
  /** Запись целиком (для сброса состояния сенсора). */
  replace(value: T): void
  subscribe(listener: Listener<T>): () => void
}

export function createSignal<T extends object>(initial: T): Signal<T> {
  let current: T = initial
  const listeners = new Set<Listener<T>>()

  function publish(next: T): void {
    if (shallowEquals(current, next)) return
    current = next
    // Копия списка: слушатель может отписаться прямо во время уведомления.
    for (const listener of [...listeners]) {
      try {
        listener(next)
      } catch (error) {
        console.error('[dsh-cat-pet] signal listener failed', error)
      }
    }
  }

  return {
    get: () => current,
    set(patch) {
      publish({ ...current, ...patch })
    },
    replace(value) {
      publish(value)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

function shallowEquals<T extends object>(a: T, b: T): boolean {
  const keysA = Object.keys(a)
  if (keysA.length !== Object.keys(b).length) return false
  for (const key of keysA) {
    if ((a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]) return false
  }
  return true
}
