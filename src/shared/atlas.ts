/**
 * Формат атласа спрайтов: assets/spritesheet.*(изображение) + assets/atlas.json.
 *
 * Сетка строго регулярная: одинаковые кадры rows×cols, отсчёт 0-based,
 * порядок слева направо, сверху вниз. Полный пример — в README.
 */
import { PET_STATES, type PetState } from './states'

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
  /** Кадров в секунду. Альтернатива — durations. */
  fps?: number
  /** Длительности кадров в мс; если есть — имеет приоритет над fps. */
  durations?: number[]
  /** [колонка, строка], 0-based. */
  frames: Array<[number, number]>
}

export interface Atlas {
  /** Имя файла изображения относительно assets/. Только имя, без путей. */
  image: string
  cell: AtlasCell
  grid: AtlasGrid
  animations: Record<string, AtlasAnimation>
  /**
   * Необязательный маппинг «состояние → имя анимации» для тех состояний,
   * своей анимации у которых нет. Нужен, когда автор арта называет
   * анимации иначе, чем состояния плагина.
   */
  fallback?: Record<string, string>
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

/**
 * Разобрать и валидировать atlas.json. Бросает AtlasError с внятным
 * сообщением — клиент уходит в canvas-заглушку вместо кота.
 */
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
    const durations = anim.durations
    if (durations !== undefined) {
      if (!Array.isArray(durations) || durations.length !== coords.length) {
        throw new AtlasError(`animations.${key}.durations: длина должна совпадать с frames (${coords.length})`)
      }
      for (const d of durations) {
        if (typeof d !== 'number' || !Number.isFinite(d) || d <= 0) {
          throw new AtlasError(`animations.${key}.durations: все значения должны быть > 0 мс`)
        }
      }
    } else if (typeof fps !== 'number' || !Number.isFinite(fps) || fps <= 0) {
      throw new AtlasError(`animations.${key}: нужен fps > 0 или durations`)
    }

    parsed[key] = {
      loop: anim.loop !== false,
      ...(typeof fps === 'number' ? { fps } : {}),
      ...(Array.isArray(durations) ? { durations: durations as number[] } : {}),
      frames: coords,
    }
  }

  // Необязательный маппинг «состояние → имя анимации»: значения обязаны
  // ссылаться на существующие анимации, иначе молча получим пустой кадр.
  let fallback: Record<string, string> | undefined
  if (raw.fallback !== undefined) {
    if (typeof raw.fallback !== 'object' || raw.fallback === null) {
      throw new AtlasError('fallback: ожидался объект вида { состояние: "имя анимации" }')
    }
    fallback = {}
    for (const [state, animation] of Object.entries(raw.fallback as Record<string, unknown>)) {
      if (typeof animation !== 'string' || animation.length === 0) {
        throw new AtlasError(`fallback.${state}: ожидалось имя анимации строкой`)
      }
      if (parsed[animation] === undefined) {
        throw new AtlasError(`fallback.${state}: анимации "${animation}" нет в animations`)
      }
      fallback[state] = animation
    }
  }

  return {
    image,
    cell: { w: cell.w as number, h: cell.h as number },
    grid: { cols: grid.cols as number, rows: grid.rows as number },
    animations: parsed,
    ...(fallback ? { fallback } : {}),
  }
}

function isPositiveIntOrZero(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/**
 * Каких обязательных анимаций не хватает. Состояние, закрытое через
 * `fallback`, отсутствующим не считается — оно отрисуется фолбэком.
 */
export function missingAnimations(atlas: Atlas): PetState[] {
  return PET_STATES.filter(
    (state) => atlas.animations[state] === undefined && atlas.fallback?.[state] === undefined,
  )
}

/** Длительность кадра в мс: durations имеет приоритет над fps. */
export function frameDuration(anim: AtlasAnimation, index: number): number {
  const custom = anim.durations?.[index]
  if (custom !== undefined) return custom
  const fps = anim.fps ?? 8
  return 1000 / fps
}
