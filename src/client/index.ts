/**
 * Pet — браузерная половина плагина.
 *
 * Регистрируется как модуль шелла через window.__ModuleLoader__.load и
 * вкладывает три записи:
 *
 *   shell.overlay               — сам котик (canvas, drag, позиция, анимация)
 *   conversation.composer.dock  — невидимый сенсор текущей сессии
 *   settings.section            — панель настроек (размер, вкл/выкл, сброс)
 *
 * Связь между ними — модульные сигналы: сенсор видит факты сессии,
 * панель пишет настройки, оверлей читает оба и не знает ничего о пропсах
 * чужих слотов. React берётся из шелла (require('react')) — своего
 * бандлера и зависимостей у плагина нет.
 *
 * ПРАВИЛО: у файла не должно быть верхнеуровневых import/export —
 * иначе lib/client.js перестанет грузиться как обычный скрипт.
 * Локальные импорты tsdown инлайнит.
 */
import { createSignal } from '../shared/signal'
import { INITIAL_SIGNAL, type SessionSignal } from '../shared/session'
import { createPrefsStore } from '../shared/prefs'
import { en, ru } from '../shared/locales'
import { createCat } from './cat'
import { createSensor } from './sensor'
import { createSettingsPanel } from './settings'
import { SHEET } from './sprite-data'
import { CSS } from './style'

const ID = 'dsh-cat-pet'
const NAME = 'cat-pet'
const LOCALE_NS = 'cat-pet'

interface ModuleLoaderWindow {
  __ModuleLoader__?: {
    load: (module: { id: string; factory: (require: (id: string) => any) => any }) => void
  }
}

declare global {
  interface Window extends ModuleLoaderWindow {}
}

function factory(require: (id: string) => any): {
  name: string
  inject: string[]
  apply: (ctx: any) => void
} {
  const React = require('react')

  const signal = createSignal<SessionSignal>({ ...INITIAL_SIGNAL })
  // Счётчик-сигнал: панель настроек просит вернуть котика в уголок.
  const positionReset = createSignal<{ n: number }>({ n: 0 })

  const storage = safeStorage()
  const store = createPrefsStore(storage ?? undefined)

  // bind() до регистраций: t нужен и в label, и в inject панели.
  let t: (key: string) => string = (key) => (ru as Record<string, string>)[key] ?? key

  const Cat = createCat({ React, signal, prefs: store.signal, positionReset, sheet: SHEET })
  const PetSensor = createSensor(React, signal)
  const Settings = createSettingsPanel({
    React,
    signal: store.signal,
    update: store.update,
    onResetPosition: () => positionReset.set({ n: positionReset.get().n + 1 }),
  })

  function apply(ctx: any): void {
    // Словари регистрируются как эффект: выгрузка плагина снимает их сама.
    ctx.effect(
      () => ctx.locale?.register?.(LOCALE_NS, { ru, en }),
      'cat-pet: dictionaries',
    )
    if (typeof ctx.locale?.bind === 'function') {
      const bound = ctx.locale.bind(LOCALE_NS)
      if (typeof bound === 'function') t = bound
    }

    ctx.effect(() => {
      const style = document.createElement('style')
      style.setAttribute('data-plugin', ID)
      style.textContent = CSS
      document.head.appendChild(style)
      return () => {
        style.remove()
      }
    }, 'cat-pet: styles')

    // Котик — во весь кадр приложения.
    ctx.slots.inject('shell.overlay', () =>
      ctx.slots.register(
        {
          name: 'shell.overlay',
          id: NAME,
          order: 50,
        },
        Cat,
      ),
    )

    // Сенсор: session-слот, из которого видно факты хода. Ничего не рисует.
    // order как у рабочего dsh-chibi-pet не задаём: пустой сенсор не должен
    // никого сдвигать, а лишние опции — лишний повод для отказа регистрации.
    ctx.slots.inject('conversation.composer.dock', () =>
      ctx.slots.register(
        {
          name: 'conversation.composer.dock',
          id: `${NAME}-sensor`,
        },
        PetSensor,
      ),
    )

    // Панель настроек. Слот объявлен каркасом (не фичевым пакетом), поэтому
    // его нет в каталоге фичевых слотов — но он есть, и `inject` доставляет
    // в компонент функцию t, как это делают dshmarket и dsh-our-free-model.
    ctx.slots.inject('settings.section', () =>
      ctx.slots.register(
        {
          name: 'settings.section',
          id: NAME,
          order: 45,
          label: () => t('nav'),
          locale: LOCALE_NS,
          inject: () => ({ t }),
        },
        Settings,
      ),
    )
  }

  return { name: NAME, inject: ['slots', 'locale'], apply }
}

/** localStorage может быть недоступен (приватный режим, песочница). */
function safeStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } | null {
  try {
    const probe = '__dsh_cat_pet_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return null
  }
}

if (typeof window !== 'undefined' && window.__ModuleLoader__?.load) {
  window.__ModuleLoader__.load({ id: ID, factory })
} else if (typeof console !== 'undefined') {
  console.error(`[${ID}] window.__ModuleLoader__ недоступен — модуль загружен не шеллом DSH`)
}
