/**
 * Стили котика.
 *
 * Правила, продиктованные чужими багами (см. README «Чего избегаем»):
 *  - у корневого canvas pointer-events: auto только потому, что это сам
 *    объект перетаскивания; никакой обёртки — лишних слоёв и перехвата
 *    скролла нет;
 *  - никаких backdrop-filter/filter на анимациях: каждый кадр пересчитывал
 *    бы фильтр и просаживал всю страницу;
 *  - z-index держим низким и фиксированным — конфликт двух drag-систем
 *    ронял шелл (whale #8);
 *  - позиция задаётся инлайном (целые px), здесь — только постоянное.
 */
export const CSS = `
.dsh-cat-canvas {
  z-index: 30;
  display: block;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  /* Гарантия целых пикселей при смещении: без неё 2x-экраны дают мыло. */
  transform: translateZ(0);
}

.dsh-cat-canvas:active {
  cursor: grabbing;
}

/* ── панель настроек ──────────────────────────────────────────────────────
   Формы наследуют тему шелла: никаких своих цветов, кроме рамок, иначе
   на светлой теме панель становится нечитаемой. */

.dsh-cat-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dsh-cat-settings__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.dsh-cat-settings__hint {
  margin: 0;
  font-size: 12px;
  opacity: 0.72;
}

.dsh-cat-setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.dsh-cat-setting__text {
  flex: 1 1 auto;
  min-width: 0;
}

.dsh-cat-setting__label {
  line-height: 18px;
}

.dsh-cat-setting__hint {
  font-size: 11px;
  line-height: 15px;
  opacity: 0.66;
}

.dsh-cat-setting select,
.dsh-cat-setting input[type='checkbox'] {
  flex: 0 0 auto;
}

.dsh-cat-settings__reset {
  align-self: flex-start;
  font: inherit;
  font-size: 13px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid currentColor;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
`
