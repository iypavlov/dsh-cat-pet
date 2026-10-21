import { describe, expect, it } from 'vitest'
import { advance, MAX_CATCH_UP, nextDelay, type Timeline } from '../src/shared/timeline'
import type { AtlasAnimation } from '../src/shared/atlas'

/** Анимация из N кадров при 10 fps (100 мс на кадр). */
function anim(count: number, over: Partial<AtlasAnimation> = {}): AtlasAnimation {
  return {
    frames: Array.from({ length: count }, (_, i) => [i, 0] as [number, number]),
    fps: 10,
    loop: true,
    ...over,
  }
}

function timeline(over: Partial<Timeline> = {}): Timeline {
  return { animation: 'sit', index: 0, startedAt: 0, stopped: false, ...over }
}

describe('advance', () => {
  it('не двигает кадр, пока не истекла его длительность', () => {
    const t = timeline()
    expect(advance(t, anim(4), 99)).toBe(0)
    expect(t.index).toBe(0)
  })

  it('переключает кадр ровно на границе длительности', () => {
    const t = timeline()
    expect(advance(t, anim(4), 100)).toBe(1)
    expect(t.index).toBe(1)
  })

  it('зацикливается в конце', () => {
    const t = timeline({ index: 3 })
    advance(t, anim(4), 100)
    expect(t.index).toBe(0)
    expect(t.stopped).toBe(false)
  })

  it('одноразовая анимация замирает на последнем кадре', () => {
    const t = timeline({ index: 2 })
    advance(t, anim(3, { loop: false }), 100)
    expect(t.index).toBe(2)
    expect(t.stopped).toBe(true)
  })

  it('остановленный таймлайн больше не двигается', () => {
    const t = timeline({ index: 2, stopped: true })
    expect(advance(t, anim(3, { loop: false }), 10_000)).toBe(0)
    expect(t.index).toBe(2)
  })

  it('догоняет несколько кадров за один вызов', () => {
    const t = timeline()
    // 350 мс при 100 мс/кадр → 3 перехода.
    expect(advance(t, anim(8), 350)).toBe(3)
    expect(t.index).toBe(3)
  })

  it('не проматывает больше MAX_CATCH_UP кадров за вызов', () => {
    const t = timeline()
    const shown = advance(t, anim(500), 1000 * 100)
    expect(shown).toBe(MAX_CATCH_UP)
  })

  it('после длинного фриза сбрасывает опорное время, а не копит долг', () => {
    const t = timeline()
    const now = 100_000
    advance(t, anim(8), now)
    // Долг не должен остаться: следующий кадр ждёт полную длительность.
    expect(t.startedAt).toBe(now)
    expect(advance(t, anim(8), now + 99)).toBe(0)
  })

  // Это и есть регрессия: раньше startedAt сдвигался на длительность
  // ПРЕДЫДУЩЕГО кадра, из-за чего при разных durations время разъезжалось.
  it('использует длительность ТЕКУЩЕГО кадра при разных durations', () => {
    const variable = anim(3, { durations: [500, 100, 100], fps: undefined })
    const t = timeline()
    // Первый кадр длится 500 мс: на 499 перехода нет.
    expect(advance(t, variable, 499)).toBe(0)
    expect(advance(t, variable, 500)).toBe(1)
    expect(t.index).toBe(1)
    // Второй кадр длится 100 мс: с 500 до 600 — ровно один переход.
    expect(advance(t, variable, 600)).toBe(1)
    expect(t.index).toBe(2)
  })

  it('не зависает на анимации без кадров', () => {
    const t = timeline()
    expect(advance(t, anim(0), 1000)).toBe(0)
  })

  it('возвращает 0 при нулевом времени', () => {
    const t = timeline()
    expect(advance(t, anim(4), 0)).toBe(0)
  })
})

describe('nextDelay', () => {
  it('равен длительности текущего кадра', () => {
    expect(nextDelay(timeline({ index: 0 }), anim(4))).toBe(100)
  })

  it('учитывает durations', () => {
    const variable = anim(3, { durations: [500, 100, 100], fps: undefined })
    expect(nextDelay(timeline({ index: 0 }), variable)).toBe(500)
    expect(nextDelay(timeline({ index: 2 }), variable)).toBe(100)
  })
})
