/**
 * Настройки питомца: значения, валидация, хранение.
 *
 * Живут в localStorage, а не в конфиге хоста: питомец — чисто клиентская
 * сущность, а хост-часть остаётся точкой расширения. Читаем через тот же
 * безопасный паттерн, что и позицию: любое мусорное значение → дефолт,
 * без исключений наружу.
 */

export const PET_SIZES = ['small', 'medium', 'large', 'huge'] as const
export type PetSize = (typeof PET_SIZES)[number]

export interface PetPrefs {
  /** Показывать ли питомца вообще. */
  enabled: boolean
  size: PetSize
  /** Следовать за статусом агента или всегда держать sit. */
  reactToStatus: boolean
}

export const PREFS_STORAGE_KEY = 'dsh-cat-pet.prefs.v1'

export const PREF_DEFAULTS: PetPrefs = {
  enabled: true,
  size: 'medium',
  reactToStatus: true,
}

/**
 * Размер отрисовки в CSS-пикселях.
 *
 * Арт — ячейка 256x256, но кошка занимает в ней примерно 108x150 px,
 * остальное прозрачный воздух. Поэтому подписи в настройках показывают
 * и размер кадра, и фактическую высоту кошки: 256px кадра — это не
 * «кошка 256px».
 *
 * Масштаб меньше 1 (сжатие) безопасен и мыла не даёт. Опаснее растяжение:
 * при DPR 2 кадр 256px занимает 256 физических пикселей, то есть `huge`
 * упирается ровно в 1:1, а дальше уже пошло бы размытие.
 */
export const SIZE_PX: Record<PetSize, number> = {
  small: 96,
  medium: 128,
  large: 192,
  huge: 256,
}

export function isPetSize(value: unknown): value is PetSize {
  return typeof value === 'string' && (PET_SIZES as readonly string[]).includes(value)
}

/**
 * Привести произвольный объект к валидным настройкам. Неизвестные поля
 * отбрасываются: чужая/устаревшая запись не должна ломать питомца.
 */
export function normalizePrefs(raw: unknown): PetPrefs {
  if (typeof raw !== 'object' || raw === null) return { ...PREF_DEFAULTS }
  const value = raw as Record<string, unknown>
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : PREF_DEFAULTS.enabled,
    size: isPetSize(value.size) ? value.size : PREF_DEFAULTS.size,
    reactToStatus:
      typeof value.reactToStatus === 'boolean' ? value.reactToStatus : PREF_DEFAULTS.reactToStatus,
  }
}

export function parsePrefs(raw: string | null): PetPrefs {
  if (!raw) return { ...PREF_DEFAULTS }
  try {
    return normalizePrefs(JSON.parse(raw))
  } catch {
    return { ...PREF_DEFAULTS }
  }
}

export function serializePrefs(prefs: PetPrefs): string {
  return JSON.stringify(prefs)
}

/** Размер отрисовки для текущих настроек. */
export function sizeFor(prefs: PetPrefs): number {
  return SIZE_PX[prefs.size]
}
