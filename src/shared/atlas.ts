/**
 * Формат атласа спрайтов: assets/spritesheet.png + assets/atlas.json.
 *
 * Сетка строго регулярная: одинаковые кадры rows×cols, отсчёт 0-based,
 * порядок слева направо, сверху вниз. Полный пример — в assets/README.md.
 */
import { PET_STATES, type PetState } from './mood'

interface AtlasCell {
  w: number
  h: number
}

interface AtlasGrid {
  cols: number
  rows: number
}

export interface AtlasAnimation {
  /** Зацикливать; false — проиграть один раз (и держать последний кадр). */
  loop: boolean
  /** Кадров в секунду. */
  fps: number
  /** [колонка, строка], 0-based. */
  frames: Array<[number, number]>
}

export interface Atlas {
  /** Имя файла изображения относительно assets/. Только имя, без путей. */
  image: string
  cell: AtlasCell
  grid: AtlasGrid
  animations: Record<string, AtlasAnimation>
}

export class AtlasError extends Error {
  constructor(message: string) {
    super(`atlas.json: ${message}`)
    this.name = 'AtlasError'
  }
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isPositiveIntOrZero(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/** Разобрать и валидировать atlas.json. Бросает AtlasError с внятным сообщением. */
export function parseAtlas(json: unknown): Atlas {
  if (typeof json !== 'object' || json === null) throw new AtlasError('ожидался объект')
  const raw = json as Record<string, unknown>

  const image = raw.image
  if (typeof image !== 'string' || image.length === 0) {
    throw new AtlasError('нет поля image')
  }
  if (image.includes('/') || image.includes('\\') || image.includes('..')) {
    throw new AtlasError(`image должен быть именем файла без путей: "${image}"`)
  }

  const cell = raw.cell as Record<string, unknown> | undefined
  if (!cell || !isPositiveInt(cell.w) || !isPositiveInt(cell.h)) {
    throw new AtlasError('cell: нужны целые положительные w и h')
  }
  if ((cell.w as number) > 1024 || (cell.h as number) > 1024) {
    throw new AtlasError(`кадр ${cell.w}×${cell.h} больше 1024px — слишком крупно`)
  }

  const grid = raw.grid as Record<string, unknown> | undefined
  if (!grid || !isPositiveInt(grid.cols) || !isPositiveInt(grid.rows)) {
    throw new AtlasError('grid: нужны целые положительные cols и rows')
  }

  const animations = raw.animations
  if (typeof animations !== 'object' || animations === null) {
    throw new AtlasError('нет поля animations')
  }
  const parsed: Record<string, AtlasAnimation> = {}
  for (const [key, value] of Object.entries(animations as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) {
      throw new AtlasError(`animations.${key}: ожидался объект`)
    }
    const anim = value as Record<string, unknown>

    const frames = anim.frames
    if (!Array.isArray(frames) || frames.length === 0) {
      throw new AtlasError(`animations.${key}.frames: нужен непустой массив`)
    }
    const coords: Array<[number, number]> = []
    frames.forEach((frame, index) => {
      if (!Array.isArray(frame) || frame.length !== 2) {
        throw new AtlasError(`animations.${key}.frames[${index}]: нужен парный [колонка, строка]`)
      }
      const [c, r] = frame as [unknown, unknown]
      if (!isPositiveIntOrZero(c) || !isPositiveIntOrZero(r)) {
        throw new AtlasError(`animations.${key}.frames[${index}]: координаты должны быть целыми неотрицательными`)
      }
      if (c >= (grid.cols as number) || r >= (grid.rows as number)) {
        throw new AtlasError(
          `animations.${key}.frames[${index}]: [${c},${r}] вне сетки ${grid.cols}×${grid.rows}`,
        )
      }
      coords.push([c, r])
    })

    const fps = anim.fps
    if (typeof fps !== 'number' || !Number.isFinite(fps) || fps <= 0) {
      throw new AtlasError(`animations.${key}: нужен fps > 0`)
    }

    parsed[key] = { loop: anim.loop !== false, fps, frames: coords }
  }

  return {
    image,
    cell: { w: cell.w as number, h: cell.h as number },
    grid: { cols: grid.cols as number, rows: grid.rows as number },
    animations: parsed,
  }
}

/** Каких обязательных анимаций не хватает. */
export function missingAnimations(atlas: Atlas): PetState[] {
  return PET_STATES.filter((state) => atlas.animations[state] === undefined)
}

/** Длительность кадра в мс. */
export function frameDuration(anim: AtlasAnimation): number {
  return 1000 / anim.fps
}
