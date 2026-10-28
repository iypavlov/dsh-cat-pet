/**
 * Котик — компонент оверлея в слоте `shell.overlay`.
 *
 * Что здесь решено (и почему):
 *  - позиция в localStorage долями экрана + clamp и при чтении, и при
 *    каждом ресайзе — питомец не может уехать за край (баг whale #13);
 *  - drag через pointer capture, 4px сопротивление клику;
 *  - проигрывание атласа — по таймингам кадров, пауза на скрытой
 *    вкладке и на скрытом питомце;
 *  - состояния приходят из модульного сигнала сенсора (см. sensor.ts),
 *    компонент не получает ctx и ничего не знает о сессиях.
 */
import {
  clampToViewport,
  defaultPosition,
  fromStorage,
  savePosition,
  STORAGE_KEY,
  type Point,
  type Size,
  type Viewport,
} from '../shared/position'
import { signalToState, type SessionSignal } from '../shared/session'
import type { Signal } from '../shared/signal'
import { FALLBACK_STATE, type PetState } from '../shared/mood'
import { sizeFor, type PetPrefs } from '../shared/prefs'
import { createPlayer, type PlayerHandle, type SheetData } from './renderer'

/** Перемещение меньше этой величины остаётся кликом. */
const SLOP_PX = 4

interface DragState {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
  moved: boolean
}

interface CatDeps {
  React: any
  signal: Signal<SessionSignal>
  prefs: Signal<PetPrefs>
  /** Сбросить позицию в домашний уголок (зовётся из панели настроек). */
  positionReset: Signal<{ n: number }>
  sheet: SheetData
}

function viewport(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  } catch {
    return false
  }
}

function readStored(size: Size): Point {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    raw = null
  }
  return fromStorage(raw, size, viewport())
}

function persist(point: Point): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, savePosition(point, viewport()))
  } catch {
    /* приватный режим или переполнение — позиция просто не запомнится */
  }
}

export function createCat(deps: CatDeps): (props: any) => unknown {
  const { React, signal, prefs, positionReset, sheet } = deps
  const { createElement: h, useEffect, useRef, useState, useSyncExternalStore } = React

  return function Cat(): unknown {
    const snapshot: SessionSignal = useSyncExternalStore(signal.subscribe, signal.get)
    const settings: PetPrefs = useSyncExternalStore(prefs.subscribe, prefs.get)
    const resetTick: { n: number } = useSyncExternalStore(positionReset.subscribe, positionReset.get)

    const size: number = sizeFor(settings)
    const display: Size = { w: size, h: size }
    // Выключенная реакция на статус — кошка просто сидит и не спит:
    // пользователь сам попросил не связывать её с агентом.
    //
    // Переходы `lie`/`wake` здесь НЕ выбираются: их доигрывает плеер,
    // который знает, закончилась ли одноразовая анимация (см. renderer.ts).
    // Компонент отдаёт только цель — так нет риска, что решение о переходе
    // будет принято дважды или потеряется между рендерами.
    const target: PetState = settings.reactToStatus ? signalToState(snapshot) : FALLBACK_STATE
    const state: PetState = target

    // React приходит из шелла нетипизированным (any), поэтому аргументы типа
    // в вызовах хуков запрещены (TS2347). Тип восстанавливаем аннотацией
    // переменной, иначе .current станет any и потеряется проверка.
    const [position, setPosition]: [Point, (p: Point) => void] = useState(() => readStored(display))
    const [carrying, setCarrying] = useState(false)
    // true, когда плеер собрал атлас и первый кадр уже на канвасе. До этого
    // момента атрибут состояния держим нейтральным, чтобы стили не мигали
    // позой, которой на экране ещё нет.
    const [drawn, setDrawn] = useState(false)

    const canvasRef: { current: HTMLCanvasElement | null } = useRef(null)
    const playerRef: { current: PlayerHandle | null } = useRef(null)
    const dragRef: { current: DragState | null } = useRef(null)
    const stateRef: { current: PetState } = useRef(state)
    const positionRef: { current: Point } = useRef(position)
    const displayRef: { current: Size } = useRef(display)

    stateRef.current = state
    positionRef.current = position
    displayRef.current = display

    /** Единственная точка изменения позиции: и drag, и resize идут через неё. */
    const applyPosition = (next: Point): void => {
      const clamped = clampToViewport(next, displayRef.current, viewport())
      positionRef.current = clamped
      setPosition(clamped)
    }

    // ── монтирование плеера атласа ──────────────────────────────────────────
    // Пересоздаётся при смене размера: канвас меняет физические пиксели,
    // и переиспользовать плеер с прежним DPR-бэкингом нельзя.
    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return undefined
      if (!settings.enabled) return undefined

      const player = createPlayer({
        canvas,
        sheet,
        display,
        reducedMotion: prefersReducedMotion(),
      })
      playerRef.current = player

      if (player.status === 'ready') {
        setDrawn(true)
        player.setState(stateRef.current)
        if (document.hidden) player.pause()
      }

      const onVisibility = (): void => {
        if (document.hidden) player.pause()
        else player.resume()
      }
      document.addEventListener('visibilitychange', onVisibility)

      return () => {
        document.removeEventListener('visibilitychange', onVisibility)
        player.destroy()
        playerRef.current = null
      }
    }, [display.w, display.h, settings.enabled])

    // ── состояние из сигнала → плеер ────────────────────────────────────────
    useEffect(() => {
      playerRef.current?.setState(state)
    }, [state])

    // ── смена размера: позицию пересчитываем, иначе котик окажется за краем ──
    useEffect(() => {
      applyPosition(positionRef.current)
    }, [display.w, display.h])

    // ── сброс позиции из панели настроек ────────────────────────────────────
    useEffect(() => {
      if (resetTick.n === 0) return
      // defaultPosition уже считает домашний уголок и клампит его — своей
      // копии этой арифметики здесь быть не должно.
      const home = defaultPosition(displayRef.current, viewport())
      applyPosition(home)
      persist(home)
    }, [resetTick])

    // ── ресайз окна: позиция обязана остаться на экране ─────────────────────
    useEffect(() => {
      const onResize = (): void => applyPosition(positionRef.current)
      window.addEventListener('resize', onResize)
      return () => window.removeEventListener('resize', onResize)
    }, [])

    // ── drag ────────────────────────────────────────────────────────────────
    const onPointerDown = (event: any): void => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: positionRef.current.x,
        originY: positionRef.current.y,
        moved: false,
      }
      setCarrying(true)
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId)
      } catch {
        /* захват — оптимизация, drag работает и без него */
      }
    }

    const onPointerMove = (event: any): void => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < SLOP_PX) return
      drag.moved = true
      applyPosition({ x: drag.originX + dx, y: drag.originY + dy })
    }

    const endDrag = (event: any): void => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      dragRef.current = null
      setCarrying(false)
      try {
        event.currentTarget.releasePointerCapture?.(event.pointerId)
      } catch {
        /* уже отпущено */
      }
      if (drag.moved) persist(positionRef.current)
    }

    // Выключенный питомец не рендерится вовсе: ранее смонтированный плеер
    // уже уничтожен эффектом выше, таймеров не осталось.
    if (!settings.enabled) return null

    const stateLabel = carrying ? 'carried' : state
    // Одна корневая нода — сам canvas: wrapper-див в слое оверлея
    // добавляет бы layout-шум, а атрибут состояния нужен и для стилей.
    const style = {
      position: 'fixed',
      left: `${Math.round(position.x)}px`,
      top: `${Math.round(position.y)}px`,
      width: `${display.w}px`,
      height: `${display.h}px`,
      pointerEvents: 'auto',
      cursor: carrying ? 'grabbing' : 'grab',
      touchAction: 'none',
      userSelect: 'none',
      WebkitUserSelect: 'none',
    } as const

    return h('canvas', {
      ref: canvasRef,
      className: 'dsh-cat-canvas',
      'data-pet-state': drawn ? state : 'idle',
      // width/height АТРИБУТЫ здесь НЕ ставим: их выставляет плеер с учётом
      // DPR, а присвоение атрибута на каждом рендере сбрасывало бы битмап
      // канваса и стирало уже нарисованный кадр. Логический размер задаётся
      // через CSS в style ниже.
      role: 'img',
      'aria-label': `Pet — ${stateLabel}`,
      title: stateLabel,
      style,
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    })
  }
}
