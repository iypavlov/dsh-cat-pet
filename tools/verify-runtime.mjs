#!/usr/bin/env node
/**
 * Приёмка клиентской половины БЕЗ браузера.
 *
 * Загружает lib/client.js в эмуляции шелла DSH: подставляет window,
 * __ModuleLoader__ и require('react'), после чего проверяет, что плагин
 * зарегистрировался и его apply() отработал по контракту слотов.
 *
 * ЗАЧЕМ: это единственная проверка, которая ловит ошибки, невидимые
 * ни компилятору, ни юнит-тестам: неверный контракт слотов, падение
 * на этапе инициализации, отсутствие регистраций, ошибки порядка вызовов.
 *
 * ОГРАНИЧЕНИЕ: React здесь — заглушка-мок, а не настоящий React. Хуки не
 * выполняются по-настоящему, поэтому проверяется ЗАГРУЗКА и КОНТРАКТ, а не
 * рендеринг. Для настоящего рендеринга нужен браузер.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const problems = []

// ── минимальный DOM ────────────────────────────────────────────────────────
const head = { children: [], appendChild(node) { this.children.push(node) } }
const documentStub = {
  head,
  createElement: () => ({ setAttribute() {}, style: {}, textContent: '' }),
  addEventListener() {},
  removeEventListener() {},
  hidden: false,
}
const storageData = new Map()
const localStorageStub = {
  getItem: (k) => (storageData.has(k) ? storageData.get(k) : null),
  setItem: (k, v) => storageData.set(k, String(v)),
  removeItem: (k) => storageData.delete(k),
}

let loaded = null
const windowStub = {
  document: documentStub,
  localStorage: localStorageStub,
  devicePixelRatio: 1,
  innerWidth: 1920,
  innerHeight: 1080,
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  __ModuleLoader__: {
    load(module) {
      loaded = module
    },
  },
}
windowStub.window = windowStub

// ── заглушка React: хуки возвращают предсказуемые значения ─────────────────
function makeReact() {
  const createElement = (type, props, ...children) => ({ type, props, children })
  return {
    createElement,
    Fragment: 'Fragment',
    // useState: значение + сеттер-заглушка.
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    // useRef: стабильный объект.
    useRef: (init) => ({ current: init }),
    useEffect: () => {},
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn(),
  }
}

function fakeRequire(id) {
  if (id === 'react') return makeReact()
  if (id === 'react-dom') return { createPortal: (x) => x }
  throw new Error(`неожиданный require("${id}") — шелл такого модуля не даёт`)
}

// ── эмуляция загрузки ──────────────────────────────────────────────────────
const code = await readFile(path.join(ROOT, 'lib', 'client.js'), 'utf8')

const sandbox = { window: windowStub, document: documentStub, console, setTimeout, clearTimeout, performance, Math, JSON, Object, Array, Set, Map, String, Number, Boolean, Error, Date, isNaN, parseInt, parseFloat }
sandbox.globalThis = sandbox

// Выполняем как обычный скрипт (как это делает шелл через <script>).
const runner = new Function(
  'window', 'document', 'console', 'setTimeout', 'clearTimeout', 'performance',
  `${code}\n;return typeof window !== 'undefined';`,
)
runner(windowStub, documentStub, console, setTimeout, clearTimeout, performance)

if (!loaded) {
  problems.push('клиент не вызвал window.__ModuleLoader__.load — плагин не зарегистрируется')
} else {
  if (loaded.id !== 'dsh-cat-pet') problems.push(`неверный id модуля: ${loaded.id}`)
  if (typeof loaded.factory !== 'function') {
    problems.push('factory не является функцией')
  } else {
    // ── эмуляция apply(): контракт слотов ──────────────────────────────────
    const plugin = loaded.factory(fakeRequire)
    if (typeof plugin.apply !== 'function') problems.push('factory не вернул apply()')

    const registered = []
    const injectedSlots = []
    const effects = []
    const localeRegistrations = []
    const declaredSlots = new Set(['shell.overlay', 'conversation.composer.dock', 'settings.section'])

    const ctx = {
      effect(fn, label) {
        effects.push(label)
        const disposer = fn()
        return typeof disposer === 'function' ? disposer : () => {}
      },
      locale: {
        register(ns, dict) {
          localeRegistrations.push({ ns, keys: Object.keys(dict) })
          return () => {}
        },
        bind: (ns) => (key) => `${ns}:${key}`,
      },
      slots: {
        inject(name, cb) {
          injectedSlots.push(name)
          if (!declaredSlots.has(name)) throw new Error(`слот "${name}" не объявлен шеллом`)
          return cb()
        },
        register(meta, component) {
          registered.push({ meta, component })
          return () => {}
        },
      },
    }

    try {
      plugin.apply(ctx)
    } catch (error) {
      problems.push(`apply() бросил исключение: ${error.message}`)
    }

    // Слот оверлея — там живёт котик.
    const overlay = registered.find((r) => r.meta.name === 'shell.overlay')
    if (!overlay) problems.push('нет регистрации в shell.overlay — котик не появится')
    else {
      if (typeof overlay.component !== 'function') problems.push('компонент оверлея не функция')
      // Рендерим компонент вручную: заглушка React не выполняет хуки, но
      // проверяет, что компонент не падает на первом вызове.
      try {
        const tree = overlay.component({})
        if (tree === undefined) problems.push('компонент оверлея вернул undefined')
      } catch (error) {
        problems.push(`компонент оверлея упал при вызове: ${error.message}`)
      }
    }

    if (!registered.some((r) => r.meta.name === 'settings.section')) {
      problems.push('нет регистрации в settings.section — панель настроек не появится')
    }
    if (!registered.some((r) => r.meta.name === 'conversation.composer.dock')) {
      problems.push('нет сенсора в conversation.composer.dock — статус не будет читаться')
    }

    if (localeRegistrations.length === 0) problems.push('словари локали не зарегистрированы')
    else {
      const first = localeRegistrations[0]
      if (!first.keys.includes('ru') || !first.keys.includes('en')) {
        problems.push(`в словарях нет ru/en: ${first.keys.join(', ')}`)
      }
    }

    if (effects.length === 0) problems.push('apply() не зарегистрировал ни одного эффекта')

    // settings.section должен отдавать t через inject.
    const settings = registered.find((r) => r.meta.name === 'settings.section')
    if (settings && typeof settings.meta.inject !== 'function') {
      problems.push('settings.section: нет inject() — панель не получит t')
    } else if (settings) {
      const props = settings.meta.inject()
      if (typeof props?.t !== 'function') problems.push('settings.section: inject() не отдаёт t')
    }

    console.log(`[verify-runtime] загрузка: id=${loaded.id}`)
    console.log(`[verify-runtime] inject-слоты: ${injectedSlots.join(', ') || 'нет'}`)
    console.log(`[verify-runtime] регистрации: ${registered.map((r) => r.meta.name).join(', ')}`)
    console.log(`[verify-runtime] эффекты: ${effects.join(' | ')}`)
  }
}

if (problems.length > 0) {
  console.error('[verify-runtime] найдены проблемы:')
  for (const p of problems) console.error(`  ✗ ${p}`)
  process.exitCode = 1
} else {
  console.log('[verify-runtime] ok: клиент регистрируется и его apply() соблюдает контракт слотов')
}
