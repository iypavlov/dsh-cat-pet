/**
 * Проигрывание спрайт-атласа на canvas.
 *
 * Решения, продиктованные чужими багами производительности:
 *  - НЕ rAF-цикл на 60 Гц: кадры планируются по их длительностям через
 *    setTimeout (zhu1090093659/dsh-pet #17 — просадка всей страницы);
 *  - один лист = одна decode-операция, никакого растущего кэша битмап
 *    (#19 — 93 МБ на 372 кадра);
 *  - pause()/resume() для скрытой вкладки и скрытого питомца — в фоне
 *    не аллоцируется и не рисуется ничего (whale #3);
 *  - prefers-reduced-motion → один неподвижный первый кадр;
 *  - источник кадра — целые пиксели, при отрисовке — целые координаты.
 */
import { missingAnimations, parseAtlas, type Atlas } from '../shared/atlas'
import type { PetState } from '../shared/mood'
import { FALLBACK_STATE, isOneShot } from '../shared/mood'
import { advanceMood, transitionState } from '../shared/mood'
import { advance, nextDelay, type Timeline } from '../shared/timeline'

export interface SheetData {
  /** atlas.json (объект или JSON-строка) либо null, если арта ещё нет. */
  atlas: unknown
  /** data:URL изображения либо null. */
  image: string | null
}

interface PlayerOptions {
  canvas: HTMLCanvasElement
  sheet: SheetData
  /** CSS-размер отрисовки, px. */
  display: { w: number; h: number }
  reducedMotion: boolean
}

/**
 * Итог создания плеера.
 *   ready     — атлас разобран, кадры рисуются;
 *   no-art    — арта нет (заглушка sprite-data), плеер ничего не делает;
 *   bad-atlas — JSON атласа не прошёл валидацию.
 */
type PlayerStatus = 'ready' | 'no-art' | 'bad-atlas'

/** Результат разбора листа: либо рабочий плеер, либо причина отказа. */
export interface PlayerHandle {
  status: PlayerStatus
  /** Состояния, для которых в атласе нет своей анимации (уходят в sit). */
  missing: string[]
  setState(state: PetState): void
  pause(): void
  resume(): void
  destroy(): void
}

/** Таймлайн плеера: состояние + общая машина продвижения кадров. */
interface PlayerTimeline extends Timeline {
  state: PetState
}

export function createPlayer(options: PlayerOptions): PlayerHandle {
  const { canvas, sheet, display, reducedMotion } = options
  const context = canvas.getContext('2d')
  const noop: PlayerHandle = {
    status: 'no-art',
    missing: [],
    setState: () => {},
    pause: () => {},
    resume: () => {},
    destroy: () => {},
  }
  if (!context) return noop
  if (!sheet.atlas || !sheet.image) return noop

  // Сужение типа обязательно закрепить отдельной const: `context` объявлен
  // через getContext() и внутри вложенных функций TS не сохраняет, что он
  // не null (иначе TS18047 в drawFrame).
  const ctx2d: CanvasRenderingContext2D = context

  let atlas: Atlas
  try {
    atlas = parseAtlas(typeof sheet.atlas === 'string' ? JSON.parse(sheet.atlas) : sheet.atlas)
  } catch (error) {
    console.error('[dsh-cat-pet]', error)
    return { ...noop, status: 'bad-atlas', missing: [] }
  }

  const missing = missingAnimations(atlas).map(String)
  if (missing.length > 0) {
    console.warn(`[dsh-cat-pet] в атласе нет анимаций: ${missing.join(', ')} — будет sit`)
  }

  const image = new Image()
  image.decoding = 'async'
  let decoded = false
  let destroyed = false
  image.addEventListener('load', () => {
    decoded = true
    paintNow()
  }, { once: true })
  image.addEventListener('error', () => {
    console.error('[dsh-cat-pet] не удалось декодировать spritesheet:', sheet.image)
  }, { once: true })
  image.src = sheet.image

  // Дисплей в физических пикселях; рисуем целыми координатами.
  const ratio = Math.min(window.devicePixelRatio || 1, 3)
  canvas.width = Math.max(1, Math.round(display.w * ratio))
  canvas.height = Math.max(1, Math.round(display.h * ratio))
  canvas.style.width = `${display.w}px`
  canvas.style.height = `${display.h}px`

  let timeline: PlayerTimeline | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let paused = false
  let currentState: PetState = FALLBACK_STATE
  /** Последняя цель от компонента — нужна, когда доиграет переход. */
  let targetState: PetState = FALLBACK_STATE

  /**
   * Какая анимация играет для состояния. Если своей анимации у состояния
   * нет, отыгрываем `sit`, иначе первую попавшуюся — лишь бы не упасть.
   */
  function animationFor(state: PetState): string {
    if (atlas.animations[state]) return state
    if (atlas.animations[FALLBACK_STATE]) return FALLBACK_STATE
    return Object.keys(atlas.animations)[0]!
  }

  function resolve(state: PetState): PlayerTimeline {
    const animation = animationFor(state)
    if (timeline && timeline.state === state && timeline.animation === animation) return timeline
    timeline = { state, animation, index: 0, startedAt: performance.now(), stopped: false }
    return timeline
  }

  function drawFrame(animation: string, index: number): void {
    if (!decoded) return
    const definition = atlas.animations[animation]
    if (!definition) return
    const [c, r] = definition.frames[Math.min(index, definition.frames.length - 1)]!
    const sx = c * atlas.cell.w
    const sy = r * atlas.cell.h
    ctx2d.setTransform(1, 0, 0, 1, 0, 0)
    ctx2d.clearRect(0, 0, canvas.width, canvas.height)
    ctx2d.drawImage(image, sx, sy, atlas.cell.w, atlas.cell.h, 0, 0, canvas.width, canvas.height)
  }

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function scheduleNext(): void {
    clearTimer()
    if (paused || destroyed || !timeline || timeline.stopped || reducedMotion) return
    const definition = atlas.animations[timeline.animation]
    if (!definition) return
    timer = setTimeout(step, nextDelay(timeline, definition))
  }

  /** Один шаг таймлайна: показать следующий кадр и запланировать следующий. */
  function step(): void {
    if (!timeline || paused || destroyed || reducedMotion) return
    const definition = atlas.animations[timeline.animation]
    if (!definition) return
    advance(timeline, definition, performance.now())
    if (timeline.stopped) {
      drawFrame(timeline.animation, definition.frames.length - 1)
      clearTimer()
      // Одноразовый переход доиграл — уходим в устойчивое состояние.
      // Решение принимает advanceMood, а не плеер: правила «lie → sleep,
      // wake → sit» лежат в mood.ts рядом с остальной логикой поведения и
      // покрыты тестами. Дублировать их здесь значило бы завести вторую
      // копию, которая рано или поздно разойдётся с первой.
      //
      // play(), а не setState(): currentState уже выставлен строкой выше, а
      // setState() считает переход от СТАРОГО состояния и запустил бы
      // анимацию перехода повторно.
      if (isOneShot(currentState)) {
        const next = advanceMood(currentState, true, targetState)
        currentState = next
        play(next)
      }
      return
    }
    drawFrame(timeline.animation, timeline.index)
    scheduleNext()
  }

  function paintNow(): void {
    if (!timeline) return
    drawFrame(timeline.animation, timeline.index)
    if (!reducedMotion && !paused && !timeline.stopped) scheduleNext()
  }

  /**
   * Показать анимацию и запустить её таймлайн с нуля.
   *
   * Отдельная функция, потому что запуск нужен в двух местах: при смене
   * состояния и при переходе после доигранного одноразового перехода.
   */
  function play(state: PetState): void {
    const next = resolve(state)
    next.startedAt = performance.now()
    next.index = 0
    next.stopped = false
    clearTimer()
    if (reducedMotion) {
      drawFrame(next.animation, 0)
      return
    }
    if (!paused) {
      drawFrame(next.animation, 0)
      scheduleNext()
    }
  }

  return {
    status: 'ready',
    missing,
    /**
     * `target` — состояние по фактам сессии. Одноразовые переходы
     * выбираются здесь, а не в компоненте: только плеер знает, доиграл
     * ли предыдущий переход, и только он может запустить следующий.
     */
    setState(target: PetState) {
      // Пока играет одноразовый переход, цель запоминаем, но экран не
      // трогаем: иначе кадры «ложится» дёрнулись бы на полпути.
      if (timeline && isOneShot(currentState)) {
        targetState = target
        return
      }
      targetState = target
      const next = transitionState(currentState, target)
      if (next === currentState && timeline) return
      currentState = next
      play(next)
    },
    pause() {
      paused = true
      clearTimer()
    },
    resume() {
      if (!paused) return
      paused = false
      if (timeline && !timeline.stopped && !reducedMotion) {
        timeline.startedAt = performance.now()
        scheduleNext()
      }
    },
    destroy() {
      destroyed = true
      clearTimer()
      timeline = null
    },
  }
}
