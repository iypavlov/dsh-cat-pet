/**
 * Словари локали питомца.
 *
 * Формат — плоские объекты «ключ → строка», как в рабочих плагинах
 * (dshmarket, dsh-our-free-model): ctx.locale.register(NS, { ru, en })
 * принимает именно такую карту, а ctx.locale.bind(NS) отдаёт функцию t.
 *
 * Английский словарь типизирован по русскому — пропущенный ключ станет
 * ошибкой компиляции, а не «undefined» в интерфейсе.
 */
export const ru = {
  nav: 'Pet',
  title: 'Котик Pet',
  description: 'Анимированный компаньон поверх интерфейса.',

  'enabled.label': 'Показывать питомца',
  'enabled.hint': 'Выключите, чтобы убрать котика, не удаляя плагин.',

  'size.label': 'Размер',
  'size.hint': 'Размер отрисовки на экране.',
  'size.small': 'Маленький',
  'size.medium': 'Средний',
  'size.large': 'Большой',
  'size.huge': 'Очень большой',

  'react.label': 'Реагировать на статус агента',
  'react.hint': 'Спит, пока агент думает или в сессии ничего не происходит, и просыпается на ваш ход.',

  'reset.label': 'Сбросить позицию',
  'reset.hint': 'Вернуть котика в правый нижний угол.',

  'state.sit': 'сидит',
  'state.lie': 'ложится',
  'state.sleep': 'спит',
  'state.wake': 'встаёт',
}

type PetKey = keyof typeof ru

export const en: Record<PetKey, string> = {
  nav: 'Pet',
  title: 'Pet the cat',
  description: 'An animated companion on top of the interface.',

  'enabled.label': 'Show the pet',
  'enabled.hint': 'Turn off to hide the cat without removing the plugin.',

  'size.label': 'Size',
  'size.hint': 'Rendered size on screen.',
  'size.small': 'Small',
  'size.medium': 'Medium',
  'size.large': 'Large',
  'size.huge': 'Very large',

  'react.label': 'React to agent status',
  'react.hint': 'Sleeps while the agent thinks or the session sits idle, and wakes on your turn.',

  'reset.label': 'Reset position',
  'reset.hint': 'Return the cat to the bottom-right corner.',

  'state.sit': 'sitting',
  'state.lie': 'lying down',
  'state.sleep': 'sleeping',
  'state.wake': 'waking up',
}
