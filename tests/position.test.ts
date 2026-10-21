import { describe, expect, it } from 'vitest'
import {
  clampToViewport,
  defaultPosition,
  EDGE_MARGIN,
  fromStorage,
  savePosition,
  toStorage,
} from '../src/shared/position'

const SIZE = { w: 96, h: 96 }
const FULL = { width: 1920, height: 1080 }

describe('clampToViewport', () => {
  it('оставляет точку внутри с полями', () => {
    const point = clampToViewport({ x: 500, y: 300 }, SIZE, FULL)
    expect(point).toEqual({ x: 500, y: 300 })
  })

  it('не даёт уйти за левый/верхний край', () => {
    expect(clampToViewport({ x: -500, y: -500 }, SIZE, FULL)).toEqual({
      x: EDGE_MARGIN,
      y: EDGE_MARGIN,
    })
  })

  it('не даёт уйти за правый/нижний край', () => {
    expect(clampToViewport({ x: 99999, y: 99999 }, SIZE, FULL)).toEqual({
      x: FULL.width - SIZE.w - EDGE_MARGIN,
      y: FULL.height - SIZE.h - EDGE_MARGIN,
    })
  })

  it('окно меньше питомца не ломает раскладку', () => {
    const point = clampToViewport({ x: 500, y: 500 }, SIZE, { width: 60, height: 40 })
    expect(point.x).toBe(EDGE_MARGIN)
    expect(point.y).toBe(EDGE_MARGIN)
  })

  it('всегда целые пиксели', () => {
    const point = clampToViewport({ x: 123.6, y: 456.4 }, SIZE, FULL)
    expect(Number.isInteger(point.x)).toBe(true)
    expect(Number.isInteger(point.y)).toBe(true)
  })
})

describe('defaultPosition', () => {
  it('домашний уголок — правый нижний, в границах', () => {
    const point = defaultPosition(SIZE, FULL)
    expect(point).toEqual({ x: 1920 - 96 - EDGE_MARGIN, y: 1080 - 96 - EDGE_MARGIN })
    expect(point.x + SIZE.w + EDGE_MARGIN).toBeLessThanOrEqual(FULL.width)
  })
})

describe('storage', () => {
  it('доли экрана переживают смену разрешения', () => {
    const stored = savePosition({ x: 960, y: 540 }, FULL)
    const restored = fromStorage(stored, SIZE, { width: 1280, height: 720 })
    // та же относительная точка + clamp
    expect(restored.x).toBe(640)
    expect(restored.y).toBe(360)
  })

  it('чтение после сужения окна клампит (баг whale #13)', () => {
    // питомец сидел у правого края широкого экрана
    const stored = savePosition({ x: 1800, y: 900 }, FULL)
    const restored = fromStorage(stored, SIZE, { width: 800, height: 600 })
    expect(restored.x).toBeLessThanOrEqual(800 - SIZE.w - EDGE_MARGIN)
    expect(restored.y).toBeLessThanOrEqual(600 - SIZE.h - EDGE_MARGIN)
    expect(restored.x).toBeGreaterThanOrEqual(EDGE_MARGIN)
  })

  it('мусор, null и чужие ключи → домашний уголок', () => {
    expect(fromStorage(null, SIZE, FULL)).toEqual(defaultPosition(SIZE, FULL))
    expect(fromStorage('не json', SIZE, FULL)).toEqual(defaultPosition(SIZE, FULL))
    expect(fromStorage('{"fx":"строка","fy":1}', SIZE, FULL)).toEqual(defaultPosition(SIZE, FULL))
    expect(fromStorage('{"fx":0}', SIZE, FULL)).toEqual(defaultPosition(SIZE, FULL))
    expect(fromStorage('{"fx":NaN,"fy":1}', SIZE, FULL)).toEqual(defaultPosition(SIZE, FULL))
  })

  it('NaN/Infinity в долях не проходят', () => {
    expect(fromStorage('{"fx":1e999,"fy":0}', SIZE, FULL)).toEqual(defaultPosition(SIZE, FULL))
  })

  it('round-trip сохраняет точку', () => {
    const point = { x: 300, y: 400 }
    const restored = fromStorage(savePosition(point, FULL), SIZE, FULL)
    expect(restored).toEqual(point)
  })

  it('toStorage делит на максимум 1 — нулевое окно не даёт деления на ноль', () => {
    const value = toStorage({ x: 10, y: 10 }, { width: 0, height: 0 })
    expect(Number.isFinite(value.fx)).toBe(true)
    expect(Number.isFinite(value.fy)).toBe(true)
  })
})
