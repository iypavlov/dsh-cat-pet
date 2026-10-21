import { describe, expect, it } from 'vitest'
import { en, ru } from '../src/shared/locales'
import { PET_SIZES } from '../src/shared/prefs'
import { PET_STATES } from '../src/shared/states'

describe('словари локали', () => {
  it('английский покрывает все русские ключи', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort())
  })

  it('нет пустых значений и сырых ключей', () => {
    for (const [key, value] of Object.entries({ ...ru, ...en })) {
      expect(typeof value).toBe('string')
      expect(value.trim().length).toBeGreaterThan(0)
      // значение не должно совпадать со своим ключом — это признак
      // незаполненного перевода, который видно в интерфейсе
      expect(value).not.toBe(key)
    }
  })

  it('плейсхолдеров без подстановки нет', () => {
    for (const value of Object.values({ ...ru, ...en })) {
      expect(value).not.toMatch(/\{[^}]+\}/)
    }
  })

  it('есть ключ навигации и все четыре состояния', () => {
    expect(ru.nav).toBeTruthy()
    // Список берём из PET_STATES, а не литералом: иначе переименование
    // состояния оставило бы тест зелёным на устаревших ключах.
    for (const state of PET_STATES) {
      expect(ru).toHaveProperty(`state.${state}`)
      expect(en).toHaveProperty(`state.${state}`)
    }
  })

  it('ключи размеров совпадают с PET_SIZES', () => {
    for (const size of PET_SIZES) {
      expect(ru).toHaveProperty(`size.${size}`)
      expect(en).toHaveProperty(`size.${size}`)
    }
  })
})
