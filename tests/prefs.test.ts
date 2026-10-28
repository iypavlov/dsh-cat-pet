import { describe, expect, it } from 'vitest'
import {
  isPetSize,
  normalizePrefs,
  parsePrefs,
  PET_SIZES,
  PREF_DEFAULTS,
  serializePrefs,
  SIZE_PX,
  sizeFor,
} from '../src/shared/prefs'
import { createPrefsStore } from '../src/shared/prefs'

describe('normalizePrefs', () => {
  it('пропускает валидные значения', () => {
    expect(normalizePrefs({ enabled: false, size: 'large', reactToStatus: false })).toEqual({
      enabled: false,
      size: 'large',
      reactToStatus: false,
    })
  })

  it('мусор и отсутствующие поля → дефолты, без исключений', () => {
    expect(normalizePrefs(null)).toEqual(PREF_DEFAULTS)
    expect(normalizePrefs(42)).toEqual(PREF_DEFAULTS)
    expect(normalizePrefs({})).toEqual(PREF_DEFAULTS)
    // 'enormous' — заведомо несуществующий размер. Раньше здесь стояло
    // 'huge', но оно стало настоящим размером, и тест перестал бы ловить
    // регресс в валидации (проходил бы по счастливой случайности).
    expect(normalizePrefs({ enabled: 'yes', size: 'enormous', reactToStatus: 1 })).toEqual(PREF_DEFAULTS)
  })

  it('неизвестные ключи отбрасываются', () => {
    const result = normalizePrefs({ size: 'small', token: 'secret' })
    expect('token' in result).toBe(false)
    expect(result.size).toBe('small')
  })

  it('частичная запись дополняется дефолтами', () => {
    expect(normalizePrefs({ size: 'small' })).toEqual({ ...PREF_DEFAULTS, size: 'small' })
  })
})

describe('parsePrefs / serializePrefs', () => {
  it('переживает битый JSON', () => {
    expect(parsePrefs('{не json')).toEqual(PREF_DEFAULTS)
    expect(parsePrefs(null)).toEqual(PREF_DEFAULTS)
    expect(parsePrefs('')).toEqual(PREF_DEFAULTS)
  })

  it('round-trip сохраняет значения', () => {
    const prefs = { enabled: false, size: 'large' as const, reactToStatus: false }
    expect(parsePrefs(serializePrefs(prefs))).toEqual(prefs)
  })

  it('строку-число не принимает за объект настроек', () => {
    expect(parsePrefs('"large"')).toEqual(PREF_DEFAULTS)
    expect(parsePrefs('[1,2,3]')).toEqual(PREF_DEFAULTS)
  })
})

describe('размеры', () => {
  it('каждому имени соответствует пиксель и он растёт', () => {
    expect(SIZE_PX.small).toBeLessThan(SIZE_PX.medium)
    expect(SIZE_PX.medium).toBeLessThan(SIZE_PX.large)
    expect(SIZE_PX.large).toBeLessThan(SIZE_PX.huge)
    for (const size of PET_SIZES) expect(Number.isInteger(SIZE_PX[size])).toBe(true)
  })

  it('sizeFor всегда возвращает число', () => {
    for (const size of PET_SIZES) expect(sizeFor({ ...PREF_DEFAULTS, size })).toBe(SIZE_PX[size])
  })

  it('isPetSize отсекает чужие значения и prototype-мусор', () => {
    expect(isPetSize('large')).toBe(true)
    expect(isPetSize('LARGE')).toBe(false)
    expect(isPetSize('__proto__')).toBe(false)
    expect(isPetSize(null)).toBe(false)
  })
})

describe('createPrefsStore', () => {
  function fakeStorage(initial: string | null = null) {
    let value = initial
    return {
      getItem: () => value,
      setItem: (_key: string, next: string) => {
        value = next
      },
      read: () => value,
    }
  }

  it('читает сохранённое при создании', () => {
    const storage = fakeStorage(serializePrefs({ ...PREF_DEFAULTS, size: 'small' }))
    expect(createPrefsStore(storage).signal.get().size).toBe('small')
  })

  it('update пишет и в сигнал, и в хранилище', () => {
    const storage = fakeStorage()
    const store = createPrefsStore(storage)
    store.update({ enabled: false })
    expect(store.signal.get().enabled).toBe(false)
    expect(parsePrefs(storage.read()).enabled).toBe(false)
  })

  it('битое хранилище не роняет создание', () => {
    expect(createPrefsStore(fakeStorage('{broken')).signal.get()).toEqual(PREF_DEFAULTS)
  })

  it('недоступное хранилище не мешает менять настройки в рантайме', () => {
    const store = createPrefsStore(undefined)
    expect(() => store.update({ size: 'large' })).not.toThrow()
    expect(store.signal.get().size).toBe('large')
  })

  it('падение setItem не срывает обновление сигнала', () => {
    const store = createPrefsStore({
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    expect(() => store.update({ enabled: false })).not.toThrow()
    expect(store.signal.get().enabled).toBe(false)
  })
})
