/**
 * Сенсор сессии — невидимая записка в session-слоте.
 *
 * Регистрируется в `conversation.composer.dock`: это единственное место,
 * откуда видно, идёт ли tool-вызов, идёт ли поток ответа и ждёт ли ход
 * решения пользователя. Компонент ничего не рисует и публикует факты
 * в модульный сигнал, который слушает оверлей в `shell.overlay`.
 *
 * Хуки слота защищены через useOptional: их набор различается между
 * версиями DSH, и отсутствующий хук должен ухудшить сигнал на одну
 * строкку, а не уронить слот (так же поступает dsh-chibi-pet).
 */
import { CLEARED_SIGNAL, type SessionSignal } from '../shared/session'
import type { Signal } from '../shared/signal'

type AnyHook = (...args: any[]) => any

/**
 * Вызвать хук слота, если шелл его отдал, иначе — фолбэк.
 *
 * ВАЖНО про порядок хуков: набор стандартных пропсов слота фиксируется на
 * время жизни компонента, поэтому ветка «есть хук / нет хука» не меняется
 * между рендерами и порядок вызовов остаётся стабильным. Если бы пропсы
 * появлялись позже (хук пришёл на втором рендере), React ругался бы на
 * нарушение порядка — поэтому решение принимается один раз за монтирование
 * и запоминается в ref.
 */
function useOptional(hook: unknown, selector: AnyHook, fallback: unknown): any {
  return typeof hook === 'function' ? (hook as AnyHook)(selector) : fallback
}

/** Диагностика «каких хуков не хватило» — один раз на жизнь компонента. */
let reported = false

/** Форма доступных хуков, зафиксированная на первом рендере. */
interface HookShape {
  useSession: boolean
  useSessionStatus: boolean
  useChat: boolean
  keyboard: boolean
}

export function createSensor(React: any, signal: Signal<SessionSignal>): (props: any) => null {
  const { useEffect, useRef } = React

  return function PetSensor(props: any): null {
    const sessionId: string | null = typeof props.sessionId === 'string' ? props.sessionId : null
    // SessionInputShell этой сессии: единственный источник черновика.
    const keyboard: any = props.keyboard ?? null

    // Набор доступных хуков фиксируем на первом рендере (см. useOptional).
    // Тип — аннотацией переменной: React из шелла нетипизирован (any),
    // поэтому аргумент типа в вызове хука запрещён (TS2347).
    const shape: { current: HookShape | null } = useRef(null)
    if (shape.current === null) {
      shape.current = {
        useSession: typeof props.useSession === 'function',
        useSessionStatus: typeof props.useSessionStatus === 'function',
        useChat: typeof props.useChat === 'function',
        keyboard: typeof props.keyboard?.snapshot === 'object' && props.keyboard?.snapshot !== null,
      }
    }

    const running: boolean = useOptional(props.useSession, (snapshot: any) => !!snapshot?.running, false)
    const error: string | null = useOptional(
      props.useSession,
      (snapshot: any) => snapshot?.lastAgentError || null,
      null,
    )
    const pendingKey: string | null = useOptional(
      props.useSessionStatus,
      (statuses: any) => {
        if (!sessionId || !statuses || typeof statuses.get !== 'function') return null
        const status = statuses.get(sessionId)
        return status?.pendingInteraction ? String(status.pendingInteraction.key) : null
      },
      null,
    )
    // «Идут инструменты» — из снапшота чата: runningCalls непустой.
    const working: boolean = useOptional(
      props.useChat,
      (snapshot: any) => !!(snapshot?.legacy?.runningCalls && snapshot.legacy.runningCalls.length),
      false,
    )

    // «Человек начал печатать» — по непустому черновику поля ввода.
    //
    // Черновик меняется на каждое нажатие, но в снапшот сигнала уходит уже
    // СВЁРНУТЫЙ факт (boolean), поэтому лишних ре-рендеров котика нет.
    // Отдельную метку «последнее нажатие» не храним: нам нужно не «давно
    // ли печатали», а «печатают ли сейчас» — этого достаточно, чтобы
    // разбудить кошку и не дать ей уснуть при живом наборе текста.
    //
    // Черновик доступен только внутри сессии, поэтому `typing` идёт через
    // проп, а не через отдельный слот: вкладывать второй session-слот ради
    // одного boolean — лишний риск отказа регистрации.
    const typing: boolean = isTyping(keyboard?.snapshot)

    // Если шелл не отдал ни одного нужного хука, котик навсегда застынет в
    // sit. Молчать об этом нельзя — иначе выглядит как «плагин не работает».
    useEffect(() => {
      if (reported) return
      const missing = Object.entries(shape.current ?? {})
        .filter(([, present]) => !present)
        .map(([hook]) => hook)
      if (missing.length === 4) {
        reported = true
        console.warn(
          `[dsh-cat-pet] слот не отдал хуки сессии (${missing.join(', ')}) — ` +
            'котик будет сидеть; проверьте версию DSH',
        )
      }
    }, [])

    // Метки времени. Держим в ref, а не в состоянии: снапшот сигнала
    // обновляется эффектом ниже, и лишний ре-рендер на каждой смене метки
    // был бы бесполезен.
    //
    // Почему метка, а не счётчик: сенсор перерисовывается только при смене
    // фактов, а кошке нужно лечь ровно через N секунд ПОСЛЕ старта (или
    // конца) хода. Отсчитывает это renderer при отрисовке кадра — он и так
    // просыпается по таймеру.
    const runStartedAt: { current: number } = useRef(0)
    const runEndedAt: { current: number } = useRef(0)
    if (running && runStartedAt.current === 0) runStartedAt.current = Date.now()
    if (!running) {
      // Переход true → false означает, что ход только что завершился и
      // ход перешёл к человеку. Метку ставим один раз: при следующем
      // рендере `running` уже false, и мы её не сдвинем.
      if (runStartedAt.current !== 0) runEndedAt.current = Date.now()
      runStartedAt.current = 0
    }

    // Сенсор размонтирован (сессия закрыта/переключена) → котик садится.
    useEffect(() => () => signal.replace({ ...CLEARED_SIGNAL }), [])

    useEffect(() => {
      signal.set({
        focused: true,
        sessionId,
        running,
        working,
        pendingKey,
        error,
        typing,
        runStartedAt: runStartedAt.current,
        runEndedAt: runEndedAt.current,
      })
    }, [sessionId, running, working, pendingKey, error, typing])

    return null
  }
}

/**
 * Есть ли непустой текст в поле ввода.
 *
 * Черновик лежит в `SessionInputShell.snapshot.draft`; на некоторых
 * версиях DSH доступен ещё и `draftSnapshot.text`. Порядок проверок — от
 * самого точного к запасному, а не `||` по обоим сразу: так при смене
 * формы снапшота мы не примем пустой `draft` за «не печатает».
 *
 * Пробелы считаем текстом: человек мог начать с отступа, и будить кошку
 * на первом же символе правильнее, чем ждать буквы.
 */
function isTyping(snapshot: any): boolean {
  if (!snapshot || typeof snapshot !== 'object') return false
  const draft = snapshot.draft
  if (typeof draft === 'string') return draft.length > 0
  const text = snapshot.draftSnapshot?.text
  if (typeof text === 'string') return text.length > 0
  return false
}
