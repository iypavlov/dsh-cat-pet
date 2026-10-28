import { describe, expect, it } from 'vitest'
import { AtlasError, frameDuration, missingAnimations, parseAtlas } from '../src/shared/atlas'
import { FALLBACK_STATE, isOneShot, PET_STATES } from '../src/shared/mood'

const valid = {
  image: 'spritesheet.webp',
  cell: { w: 192, h: 208 },
  grid: { cols: 8, rows: 4 },
  animations: {
    sit: { loop: true, fps: 6, frames: [[0, 0], [1, 0]] },
    lie: { loop: true, fps: 10, frames: [[0, 1]] },
    sleep: { loop: true, fps: 12, frames: [[0, 2], [1, 2]] },
    wake: { loop: false, fps: 8, frames: [[0, 3]] },
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

  it('отвергает fps <= 0', () => {
    const broken = { ...valid, animations: { sit: { loop: true, fps: 0, frames: [[0, 0]] } } }
    expect(() => parseAtlas(broken)).toThrow(/fps/)
  })

  it('отвергает отсутствующий fps', () => {
    const broken = { ...valid, animations: { sit: { loop: true, frames: [[0, 0]] } } }
    expect(() => parseAtlas(broken)).toThrow(/fps/)
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
})

describe('frameDuration', () => {
  it('считается из fps', () => {
    const atlas = parseAtlas(valid)
    expect(frameDuration(atlas.animations.wake!)).toBeCloseTo(125, 5)
    expect(frameDuration(atlas.animations.sit!)).toBeCloseTo(1000 / 6, 5)
  })
})

describe('states', () => {
  it('набор из четырёх «бытовых» состояний', () => {
    expect(PET_STATES).toEqual(['sit', 'lie', 'sleep', 'wake'])
    expect(FALLBACK_STATE).toBe('sit')
  })

  it('одноразовыми переходами считаются только lie и wake', () => {
    expect(PET_STATES.filter(isOneShot)).toEqual(['lie', 'wake'])
  })
})
