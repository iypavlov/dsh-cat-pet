import { describe, expect, it } from 'vitest'
import { createSignal } from '../src/shared/signal'
import { CLEARED_SIGNAL, INITIAL_SIGNAL, runSince, signalToState, type SessionSignal } from '../src/shared/session'
import {
  LIE_AFTER_RUN_MS,
  SLEEP_AFTER_IDLE_MS,
  advanceMood,
  deriveState,
  isAgentBusy,
  isIdleTooLong,
  isLongRun,
  needsAttention,
  transitionState,
  type MoodFacts,
} from '../src/shared/mood'

/** Факты сессии с осмысленными умолчаниями: кошка сидит, агент молчит. */
function facts(overrides: Partial<MoodFacts> = {}): MoodFacts {
  return {
    running: false,
    working: false,
    pendingKey: null,
    error: null,
    typing: false,
    runForMs: 0,
    idleForMs: 0,
    ...overrides,
  }
}

describe('deriveState', () => {
  it('агент только что закончил → sit', () => {
    expect(deriveState(facts())).toBe('sit')
  })

  it('короткий ход → sit: ложиться и вставать за пять секунд — мельтешение', () => {
    expect(deriveState(facts({ running: true, runForMs: LIE_AFTER_RUN_MS - 1 }))).toBe('sit')
  })

  it('долгий ход → sleep: кошка спит, пока агент думает', () => {
    expect(deriveState(facts({ running: true, runForMs: LIE_AFTER_RUN_MS }))).toBe('sleep')
  })

  it('ход идёт с инструментами — на состояние это не влияет', () => {
    expect(deriveState(facts({ running: true, working: true, runForMs: LIE_AFTER_RUN_MS }))).toBe('sleep')
  })

  it('ожидание решения будит кошку, даже если ход шёл долго', () => {
    expect(deriveState(facts({ running: true, pendingKey: 'approve-1', runForMs: LIE_AFTER_RUN_MS * 10 }))).toBe('sit')
  })

  it('ошибка будит кошку, даже если ход шёл долго', () => {
    expect(deriveState(facts({ running: true, error: 'boom', runForMs: LIE_AFTER_RUN_MS * 10 }))).toBe('sit')
  })

  it('пустые строки ожидания и ошибки — не повод просыпаться', () => {
    expect(deriveState(facts({ running: true, pendingKey: '', error: '', runForMs: LIE_AFTER_RUN_MS }))).toBe('sleep')
  })

  it('ход не идёт — кошка сидит, сколько бы он ни длился до этого', () => {
    expect(deriveState(facts({ running: false, runForMs: LIE_AFTER_RUN_MS * 10 }))).toBe('sit')
  })

  it('минута без хода → sleep: в пустой сессии кошка укладывается', () => {
    expect(deriveState(facts({ idleForMs: SLEEP_AFTER_IDLE_MS }))).toBe('sleep')
  })

  it('пока человек печатает, кошка не спит — даже если ход молчит давно', () => {
    expect(deriveState(facts({ typing: true, idleForMs: SLEEP_AFTER_IDLE_MS * 10 }))).toBe('sit')
  })

  it('во время долгого хода бездействие не считается', () => {
    // runForMs уже за порогом → sleep по правилу «агент думает», а не по
    // бездействию; но важнее обратное: работающий агент не должен
    // одновременно выглядеть «полночи никто ничего не делал».
    expect(isIdleTooLong(facts({ running: true, idleForMs: SLEEP_AFTER_IDLE_MS * 10 }))).toBe(false)
  })

  it('ожидание решения важнее печати: кошка сидит и смотрит', () => {
    expect(deriveState(facts({ typing: true, pendingKey: 'approve-1', idleForMs: SLEEP_AFTER_IDLE_MS * 10 }))).toBe(
      'sit',
    )
  })
})

describe('isAgentBusy', () => {
  it('занятость — это идущий ход, и только он', () => {
    expect(isAgentBusy(facts({ running: true }))).toBe(true)
    expect(isAgentBusy(facts())).toBe(false)
  })

  it('ожидание решения НЕ занятость: агент стоит и ждёт человека', () => {
    expect(isAgentBusy(facts({ pendingKey: 'k' }))).toBe(false)
  })
})

describe('needsAttention', () => {
  it('ожидание решения и ошибка требуют внимания', () => {
    expect(needsAttention(facts({ pendingKey: 'k' }))).toBe(true)
    expect(needsAttention(facts({ error: 'boom' }))).toBe(true)
  })

  it('пустые строки — не сигнал', () => {
    expect(needsAttention(facts({ pendingKey: '' }))).toBe(false)
    expect(needsAttention(facts({ error: '' }))).toBe(false)
    expect(needsAttention(facts())).toBe(false)
  })
})

describe('isLongRun', () => {
  it('порог ровно на границе: 10 с — уже долго, 9 999 мс — ещё нет', () => {
    expect(isLongRun(facts({ running: true, runForMs: LIE_AFTER_RUN_MS }))).toBe(true)
    expect(isLongRun(facts({ running: true, runForMs: LIE_AFTER_RUN_MS - 1 }))).toBe(false)
  })

  it('без идущего хода длительность не считается', () => {
    expect(isLongRun(facts({ running: false, runForMs: LIE_AFTER_RUN_MS * 10 }))).toBe(false)
  })
})

describe('isIdleTooLong', () => {
  it('порог ровно на границе: минута — уже пора, на миллисекунду меньше — нет', () => {
    expect(isIdleTooLong(facts({ idleForMs: SLEEP_AFTER_IDLE_MS }))).toBe(true)
    expect(isIdleTooLong(facts({ idleForMs: SLEEP_AFTER_IDLE_MS - 1 }))).toBe(false)
  })

  it('работающий агент не бездействует, что бы ни лежало в idleForMs', () => {
    expect(isIdleTooLong(facts({ running: true, idleForMs: SLEEP_AFTER_IDLE_MS * 10 }))).toBe(false)
  })

  it('печать не отменяет факт простоя — это разные вопросы', () => {
    // Решение «спать или нет» принимает deriveState: печать перебивает сон
    // там. Сама же функция отвечает только за «простой случился».
    expect(isIdleTooLong(facts({ typing: true, idleForMs: SLEEP_AFTER_IDLE_MS }))).toBe(true)
  })

  it('порог бездействия заметно больше порога «хода долго»', () => {
    // Иначе кошка засыпала бы, пока человек читает ответ, ничего не нажимая.
    expect(SLEEP_AFTER_IDLE_MS).toBeGreaterThan(LIE_AFTER_RUN_MS)
  })
})

describe('transitionState', () => {
  it('засыпание проходит через lie', () => {
    expect(transitionState('sit', 'sleep')).toBe('lie')
  })

  it('пробуждение проходит через wake', () => {
    expect(transitionState('sleep', 'sit')).toBe('wake')
  })

  it('остальные переходы не подменяются', () => {
    expect(transitionState('sit', 'sit')).toBe('sit')
    expect(transitionState('sleep', 'sleep')).toBe('sleep')
    expect(transitionState('lie', 'sleep')).toBe('sleep')
    expect(transitionState('wake', 'sit')).toBe('sit')
  })
})

describe('advanceMood', () => {
  it('lie не прерывается, пока не доиграет', () => {
    expect(advanceMood('lie', false, 'sleep')).toBe('lie')
    expect(advanceMood('lie', false, 'sit')).toBe('lie')
  })

  it('доигранный lie ведёт в sleep', () => {
    expect(advanceMood('lie', true, 'sleep')).toBe('sleep')
  })

  it('wake не прерывается, пока не доиграет', () => {
    expect(advanceMood('wake', false, 'sit')).toBe('wake')
  })

  it('доигранный wake ведёт в sit', () => {
    expect(advanceMood('wake', true, 'sit')).toBe('sit')
  })

  it('в устойчивых состояниях возвращается цель', () => {
    expect(advanceMood('sit', false, 'sit')).toBe('sit')
    expect(advanceMood('sleep', false, 'sit')).toBe('sit')
  })
})

describe('signalToState', () => {
  it('ход не идёт → sit, даже если метка начала осталась от прошлого хода', () => {
    expect(signalToState(INITIAL_SIGNAL)).toBe('sit')
    expect(signalToState({ ...INITIAL_SIGNAL, runStartedAt: 1_000 }, 999_999)).toBe('sit')
  })

  it('ход на пороге 10 с усыпляет, за миллисекунду до — нет', () => {
    const running: SessionSignal = { ...INITIAL_SIGNAL, running: true, runStartedAt: 1_000 }
    expect(signalToState(running, 1_000 + LIE_AFTER_RUN_MS)).toBe('sleep')
    expect(signalToState(running, 1_000 + LIE_AFTER_RUN_MS - 1)).toBe('sit')
  })

  it('ожидание решения и ошибка перебивают сон', () => {
    const running: SessionSignal = { ...INITIAL_SIGNAL, running: true, runStartedAt: 1_000 }
    const late = 1_000 + LIE_AFTER_RUN_MS * 10
    expect(signalToState({ ...running, pendingKey: 'approve-1' }, late)).toBe('sit')
    expect(signalToState({ ...running, error: 'boom' }, late)).toBe('sit')
  })

  it('бездействие считается от конца хода, а не от его начала', () => {
    const idle: SessionSignal = { ...INITIAL_SIGNAL, runEndedAt: 1_000 }
    expect(signalToState(idle, 1_000 + SLEEP_AFTER_IDLE_MS)).toBe('sleep')
    expect(signalToState(idle, 1_000 + SLEEP_AFTER_IDLE_MS - 1)).toBe('sit')
  })

  it('ход ещё ни разу не завершался — спать не от чего', () => {
    // runEndedAt = 0 у свежей сессии: без этой проверки кошка уснула бы
    // сразу после открытия вкладки.
    expect(signalToState(INITIAL_SIGNAL, SLEEP_AFTER_IDLE_MS * 100)).toBe('sit')
  })

  it('новый ход сбрасывает отсчёт бездействия', () => {
    // Сенсор обнуляет runEndedAt на старте хода; здесь это проверяется на
    // уровне чистой функции: идущий ход не может быть «простоем».
    const running: SessionSignal = { ...INITIAL_SIGNAL, running: true, runStartedAt: 9_000, runEndedAt: 0 }
    expect(signalToState(running, 9_000 + SLEEP_AFTER_IDLE_MS * 10)).toBe('sleep')
  })

  it('начатая печать будит кошку из сна по бездействию', () => {
    const idle: SessionSignal = { ...INITIAL_SIGNAL, runEndedAt: 1_000 }
    const late = 1_000 + SLEEP_AFTER_IDLE_MS * 10
    expect(signalToState({ ...idle, typing: true }, late)).toBe('sit')
  })
})

describe('runSince', () => {
  it('нулевая метка — ход не идёт, ложное «уже долго» не появляется', () => {
    expect(runSince(0, 999_999)).toBe(0)
  })

  it('считает прошедшее время', () => {
    expect(runSince(1_000, 4_000)).toBe(3_000)
  })

  it('отрицательную разницу не пропускает', () => {
    expect(runSince(4_000, 1_000)).toBe(0)
  })
})

describe('createSignal', () => {
  it('не публикует, если содержимое не изменилось', () => {
    const signal = createSignal<SessionSignal>({ ...INITIAL_SIGNAL })
    let calls = 0
    signal.subscribe(() => {
      calls += 1
    })

    signal.set({ running: false })
    expect(calls).toBe(0)

    signal.set({ running: true })
    expect(calls).toBe(1)

    signal.set({ running: true })
    expect(calls).toBe(1)
  })

  it('getSnapshot стабилен — нужен контракт useSyncExternalStore', () => {
    const signal = createSignal<SessionSignal>({ ...INITIAL_SIGNAL })
    const first = signal.get()
    signal.set({ running: false })
    expect(signal.get()).toBe(first)
    signal.set({ running: true })
    expect(signal.get()).not.toBe(first)
  })

  it('replace перезаписывает целиком и уведомляет только при изменении', () => {
    const signal = createSignal<SessionSignal>({ ...INITIAL_SIGNAL, running: true })
    let calls = 0
    signal.subscribe(() => {
      calls += 1
    })
    signal.replace({ ...CLEARED_SIGNAL })
    expect(calls).toBe(1)
    signal.replace({ ...CLEARED_SIGNAL })
    expect(calls).toBe(1)
    expect(signal.get().running).toBe(false)
  })

  it('ошибка в слушателе не роняет остальных', () => {
    const signal = createSignal<SessionSignal>({ ...INITIAL_SIGNAL })
    let reached = false
    signal.subscribe(() => {
      throw new Error('bad listener')
    })
    signal.subscribe(() => {
      reached = true
    })
    signal.set({ running: true })
    expect(reached).toBe(true)
  })

  it('отписка работает', () => {
    const signal = createSignal<SessionSignal>({ ...INITIAL_SIGNAL })
    let calls = 0
    const off = signal.subscribe(() => {
      calls += 1
    })
    off()
    signal.set({ running: true })
    expect(calls).toBe(0)
  })
})
