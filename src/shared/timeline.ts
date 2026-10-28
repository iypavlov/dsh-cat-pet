/**
 * Продвижение таймлайна анимации — чистая функция, покрытая тестами.
 *
 * Вынесена из плеера намеренно: это самая запутанная логика проекта
 * (зацикливание, одноразовые анимации, догон после фриза вкладки),
 * и её следует проверять без DOM и таймеров.
 */
import { frameDuration, type AtlasAnimation } from './atlas'

export interface Timeline {
  /** Имя играющей анимации. */
  animation: string
  /** Индекс текущего кадра. */
  index: number
  /**
   * Момент (в мс, по performance.now()), с которого отсчитывается
   * длительность текущего кадра. Сдвигается на длительность текущего
   * кадра при каждом переходе — иначе таймлайн разъезжается с реальным
   * временем.
   */
  startedAt: number
  /** Одноразовая анимация доиграла и замерла на последнем кадре. */
  stopped: boolean
}

/** Сколько кадров максимум догоняем за один вызов: защита от фриза вкладки. */
export const MAX_CATCH_UP = 8

/**
 * Продвинуть таймлайн до момента `now`.
 *
 * Возвращает число показанных кадров (0 — время ещё не пришло).
 * Мутирует переданный объект: аллокаций на кадр нет.
 */
export function advance(timeline: Timeline, anim: AtlasAnimation, now: number): number {
  if (timeline.stopped || anim.frames.length === 0) return 0

  let shown = 0
  let guard = 0

  while (guard < MAX_CATCH_UP) {
    const current = frameDuration(anim)
    if (now - timeline.startedAt < current) break

    guard += 1
    timeline.startedAt += current
    shown += 1

    if (timeline.index + 1 < anim.frames.length) {
      timeline.index += 1
      continue
    }
    if (anim.loop) {
      timeline.index = 0
      continue
    }
    // Одноразовая: замираем на последнем кадре и больше не тикаем.
    timeline.stopped = true
    break
  }

  // Если вкладка была заморожена дольше, чем успели догнать, — сбрасываем
  // опорное время, а не копим долг: иначе анимация будет «ускоренной»
  // ещё много кадров после возврата.
  if (guard >= MAX_CATCH_UP && now - timeline.startedAt > frameDuration(anim)) {
    timeline.startedAt = now
  }

  return shown
}

/** Задержка до показа следующего кадра, мс. */
export function nextDelay(timeline: Timeline, anim: AtlasAnimation): number {
  return frameDuration(anim)
}
