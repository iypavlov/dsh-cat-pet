/**
 * Локальная проекция DSH/Cordis API, которой пользуется плагин.
 *
 * Официальные типы живут в @deepseek-ai/cordis, но пакет не гарантирован
 * доступен в реестре, из которого ставится плагин, поэтому здесь описаны
 * только реально используемые члены. Как только официальный пакет можно
 * тянуть как devDependency — этот файл заменяется на re-export оттуда.
 */

/** Метаданные регистрации компонента в слоте. */
export interface SlotMeta {
  /** Имя слота — оно же ключ inject'а (например 'shell.overlay'). */
  name: string
  /** Стабильный id регистрации внутри слота (для keyed-слотов и dedup). */
  id?: string
  /** Порядок внутри list-слота: меньше — раньше. */
  order?: number
  priority?: number
  /** Подпись пункта в UI (для settings-слотов). */
  label?: () => string
  /** NS локали пункта. */
  locale?: string
}

/** Компонент слота. React-props приходят от владельца слота. */
export type SlotComponent = (props: Record<string, unknown>) => unknown

export interface SlotsService {
  /**
   * Объявить намерение вложить компонент в слот.
   * callback вызывается, когда слот доступен, и внутри него регистрируется
   * компонент через register(). Возвращает disposer.
   */
  inject(key: string, register: () => void | (() => void)): void

  /** Зарегистрировать компонент в слоте. Возвращает disposer. */
  register(meta: SlotMeta, component: SlotComponent): () => void
}

/** Сервис локали: регистрация словарей и получение функции перевода. */
export interface LocaleService {
  /** Зарегистрировать словари под своим namespace. */
  register(namespace: string, dictionaries: Record<string, unknown>): void
  /** Получить функцию перевода t для namespace. */
  bind(namespace: string): (key: string) => string
}

export interface Context {
  slots: SlotsService

  /**
   * Локаль. Обязательна для клиентской половины: без неё панель настроек
   * покажет сырые ключи вместо подписей. В `dsh.client.inject` пакета
   * объявлен `@deepseek-ai/dsh-client-locale` — именно ради этого поля.
   */
  locale?: LocaleService

  /**
   * Привязать ресурс к жизненному циклу плагина: функция возвращает
   * disposer, который вызовется при выгрузке.
   */
  effect(task: () => void | (() => void), label?: string): void

  /**
   * Подписка на события Cordis. Сейчас НЕ используется: состояния агента
   * читаются в браузере из клиентских проекций (useSession/useChat), а не
   * через хост-события. Оставлено как точка расширения.
   */
  on(event: string, listener: (...args: any[]) => unknown): () => void
}
