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
  // ПРЕДЫДУЩЕГО кадра, из-за чего таймлайн разъезжался с реальным временем.
  it('сдвигает startedAt ровно на длительность текущего кадра', () => {
    const t = timeline()
    // 250 мс при 100 мс/кадр → три перехода, опорное время на 300.
    expect(advance(t, anim(8), 250)).toBe(2)
    expect(t.startedAt).toBe(200)
    expect(advance(t, anim(8), 300)).toBe(1)
    expect(t.startedAt).toBe(300)
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

  it('не зависит от индекса кадра', () => {
    expect(nextDelay(timeline({ index: 0 }), anim(4))).toBe(100)
    expect(nextDelay(timeline({ index: 2 }), anim(4))).toBe(100)
  })
})
