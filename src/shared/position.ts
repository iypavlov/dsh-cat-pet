/**
 * Позиция котика: clamp по вьюпорту и хранение в долях экрана.
 *
 * Доли (fx/fy), а не абсолютные пиксели: позиция переживает ресайз и
 * восстановление на другом разрешении. Обе функции чтения обязана
 * клампить — иначе питомец уезжает за экран (баг whale #13).
 *
 * Чистые функции без доступа к window: окно передаётся параметром,
 * поэтому логика покрыта тестами.
 */
export interface Point {
  x: number
  y: number
}

export interface Size {
  w: number
  h: number
}

export interface Viewport {
  width: number
  height: number
}

export const EDGE_MARGIN = 20
export const STORAGE_KEY = 'dsh-cat-pet.position.v1'

export function clampToViewport(point: Point, size: Size, viewport: Viewport): Point {
  const maxX = Math.max(EDGE_MARGIN, viewport.width - size.w - EDGE_MARGIN)
  const maxY = Math.max(EDGE_MARGIN, viewport.height - size.h - EDGE_MARGIN)
  return {
    x: Math.round(Math.min(Math.max(point.x, EDGE_MARGIN), maxX)),
    y: Math.round(Math.min(Math.max(point.y, EDGE_MARGIN), maxY)),
  }
}

/** Домашний уголок — правый нижний. */
export function defaultPosition(size: Size, viewport: Viewport): Point {
  return clampToViewport(
    { x: viewport.width - size.w - EDGE_MARGIN, y: viewport.height - size.h - EDGE_MARGIN },
    size,
    viewport,
  )
}

export function toStorage(point: Point, viewport: Viewport): { fx: number; fy: number } {
  return {
    fx: point.x / Math.max(1, viewport.width),
    fy: point.y / Math.max(1, viewport.height),
  }
}

/**
 * Прочитать сохранённую позицию из сырых строк localStorage.
 * Любая мусорная/чужая запись → домашний уголок, без исключений.
 */
export function fromStorage(raw: string | null, size: Size, viewport: Viewport): Point {
  if (!raw) return defaultPosition(size, viewport)
  try {
    const stored = JSON.parse(raw) as { fx?: unknown; fy?: unknown }
    if (typeof stored.fx !== 'number' || typeof stored.fy !== 'number') {
      return defaultPosition(size, viewport)
    }
    if (!Number.isFinite(stored.fx) || !Number.isFinite(stored.fy)) {
      return defaultPosition(size, viewport)
    }
    return clampToViewport(
      { x: stored.fx * viewport.width, y: stored.fy * viewport.height },
      size,
      viewport,
    )
  } catch {
    return defaultPosition(size, viewport)
  }
}

/** Безопасная запись: приватный режим/переполнение не должны ронять pet. */
export function savePosition(point: Point, viewport: Viewport): string {
  return JSON.stringify(toStorage(point, viewport))
}
