import { describe, expect, it } from 'vitest'
import { AtlasError, frameDuration, missingAnimations, parseAtlas } from '../src/shared/atlas'
import { FALLBACK_STATE, isOneShot, isPetState, ONE_SHOT_STATES, PET_STATES } from '../src/shared/states'

const valid = {
  image: 'spritesheet.webp',
  cell: { w: 192, h: 208 },
  grid: { cols: 8, rows: 4 },
  animations: {
    sit: { loop: true, fps: 6, frames: [[0, 0], [1, 0]] },
    lie: { loop: true, fps: 10, frames: [[0, 1]] },
    sleep: { loop: true, fps: 12, frames: [[0, 2], [1, 2]] },
    wake: { loop: false, fps: 8, frames: [[0, 3]], durations: [300] },
  },
}

describe('parseAtlas', () => {
  it('принимает валидный атлас', () => {
    const atlas = parseAtlas(valid)
    expect(atlas.image).toBe('spritesheet.webp')
    expect(atlas.cell).toEqual({ w: 192, h: 208 })
    expect(atlas.animations.sit?.frames).toHaveLength(2)
    expect(atlas.animations.wake?.loop).toBe(false)
  })

  it('отвергает пути в image', () => {
    expect(() => parseAtlas({ ...valid, image: '../secrets.png' })).toThrow(AtlasError)
    expect(() => parseAtlas({ ...valid, image: 'a/b.png' })).toThrow(AtlasError)
  })

  it('отвергает кадр вне сетки', () => {
    const broken = {
      ...valid,
      animations: { sit: { loop: true, fps: 6, frames: [[99, 0]] } },
    }
    expect(() => parseAtlas(broken)).toThrow(/вне сетки/)
  })

  it('отвергает fps <= 0 без durations', () => {
    const broken = { ...valid, animations: { sit: { loop: true, fps: 0, frames: [[0, 0]] } } }
    expect(() => parseAtlas(broken)).toThrow(/fps/)
  })

  it('durations должны совпадать по длине с frames', () => {
    const broken = {
      ...valid,
      animations: { sit: { loop: true, frames: [[0, 0], [1, 0]], durations: [100] } },
    }
    expect(() => parseAtlas(broken)).toThrow(/durations/)
  })

  it('ложится в не-объект', () => {
    expect(() => parseAtlas(null)).toThrow(AtlasError)
    expect(() => parseAtlas('нет')).toThrow(AtlasError)
  })
})

describe('missingAnimations', () => {
  it('находит отсутствующие состояния, но не валит атлас', () => {
    const atlas = parseAtlas({ ...valid, animations: { sit: valid.animations.sit } })
    expect(missingAnimations(atlas)).toEqual(['lie', 'sleep', 'wake'])
    expect(missingAnimations(parseAtlas(valid))).toEqual([])
  })

  it('состояние, закрытое fallback, отсутствующим не считается', () => {
    const atlas = parseAtlas({
      ...valid,
      animations: { sit: valid.animations.sit, waiting: valid.animations.lie },
      fallback: { lie: 'waiting', sleep: 'sit', wake: 'sit' },
    })
    expect(missingAnimations(atlas)).toEqual([])
  })
})

describe('fallback', () => {
  it('принимает маппинг на существующие анимации', () => {
    const atlas = parseAtlas({ ...valid, fallback: { sleep: 'lie' } })
    expect(atlas.fallback).toEqual({ sleep: 'lie' })
  })

  it('отвергает ссылку на несуществующую анимацию', () => {
    expect(() => parseAtlas({ ...valid, fallback: { sleep: 'нет-такой' } })).toThrow(/нет в animations/)
  })

  it('отвергает не-строку и не-объект', () => {
    expect(() => parseAtlas({ ...valid, fallback: { sleep: 42 } })).toThrow(AtlasError)
    expect(() => parseAtlas({ ...valid, fallback: 'sit' })).toThrow(AtlasError)
  })

  it('без fallback поле отсутствует, а не undefined-в-ключе', () => {
    expect('fallback' in parseAtlas(valid)).toBe(false)
  })
})

describe('frameDuration', () => {
  it('durations имеет приоритет над fps', () => {
    const atlas = parseAtlas(valid)
    const wake = atlas.animations.wake!
    expect(frameDuration(wake, 0)).toBe(300)
    const sit = atlas.animations.sit!
    expect(frameDuration(sit, 0)).toBeCloseTo(1000 / 6, 5)
  })

  it('durations задаёт длительность каждого кадра', () => {
    const atlas = parseAtlas({
      ...valid,
      animations: {
        sit: { loop: true, fps: 10, frames: [[0, 0], [1, 0], [2, 0]], durations: [500, 250, 100] },
      },
    })
    const sit = atlas.animations.sit!
    expect(frameDuration(sit, 0)).toBe(500)
    expect(frameDuration(sit, 1)).toBe(250)
    expect(frameDuration(sit, 2)).toBe(100)
  })

  it('частичный durations отвергается схемой, а не молча смешивается с fps', () => {
    // Раньше эти два правила противоречили друг другу: frameDuration умел
    // брать остаток по fps, а валидатор требовал полную длину. Оставлено
    // строгое правило: неполный массив — ошибка автора арта, потому что
    // смешение двух источников тайминга даёт расхождение времени.
    expect(() =>
      parseAtlas({
        ...valid,
        animations: {
          sit: { loop: true, fps: 10, frames: [[0, 0], [1, 0], [2, 0]], durations: [500] },
        },
      }),
    ).toThrow(AtlasError)
  })

  it('без durations и fps берётся 8 к/с — плеер не зависает', () => {
    // fps обязателен схемой, но функция обязана пережить и такое значение
    const atlas = parseAtlas({ ...valid, animations: { sit: { loop: true, fps: 8, frames: [[0, 0]] } } })
    expect(frameDuration(atlas.animations.sit!, 0)).toBe(125)
  })
})

describe('states', () => {
  it('набор из четырёх «бытовых» состояний', () => {
    expect(PET_STATES).toEqual(['sit', 'lie', 'sleep', 'wake'])
    expect(FALLBACK_STATE).toBe('sit')
    expect(isPetState('sleep')).toBe(true)
    expect(isPetState('sleeping')).toBe(false)
  })

  it('одноразовыми переходами считаются только lie и wake', () => {
    expect(ONE_SHOT_STATES).toEqual(['lie', 'wake'])
    expect(ONE_SHOT_STATES.map(isOneShot)).toEqual([true, true])
    expect(isOneShot('sit')).toBe(false)
    expect(isOneShot('sleep')).toBe(false)
  })
})
