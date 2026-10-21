/**
 * Панель настроек питомца для слота `settings.section`.
 *
 * Слот объявлен на уровне каркаса, а не фичевого пакета, поэтому его нет в
 * сгенерированном каталоге фичевых слотов — но он есть: ровно в таком виде
 * его занимают dshmarket (`id: 'market'`) и dsh-our-free-model.
 *
 * `t` приходит через `inject` регистрации, а не как пропс слота: шелл
 * прокидывает в компонент результат фабрики inject. Свой fallback-словарь
 * держим на случай, если хост не отдал locale-сервис — панель останется
 * читаемой, а не покажет сырые ключи.
 */
import { ru } from '../shared/locales'
import { PET_SIZES, SIZE_PX, type PetSize, type PetPrefs } from '../shared/prefs'
import type { Signal } from '../shared/signal'

interface SettingsDeps {
  React: any
  signal: Signal<PetPrefs>
  update: (patch: Partial<PetPrefs>) => void
  onResetPosition: () => void
}

export function createSettingsPanel(deps: SettingsDeps): (props: any) => unknown {
  const { React, signal, update, onResetPosition } = deps
  const { createElement: h, useSyncExternalStore } = React

  return function PetSettings(props: any): unknown {
    const prefs: PetPrefs = useSyncExternalStore(signal.subscribe, signal.get)

    // t из inject-фабрики; фолбэк — русский словарь, чтобы панель не
    // разваливалась на сырых ключах при отсутствии locale-сервиса.
    const injected = typeof props?.t === 'function' ? props.t : null
    const t = (key: keyof typeof ru): string => {
      if (injected) {
        const value = injected(key)
        if (typeof value === 'string' && value.length > 0 && value !== key) return value
      }
      return ru[key]
    }

    const row = (key: string, label: string, hint: string, control: unknown): unknown =>
      h(
        'div',
        { className: 'dsh-cat-setting', key },
        h(
          'div',
          { className: 'dsh-cat-setting__text' },
          h('div', { className: 'dsh-cat-setting__label' }, label),
          h('div', { className: 'dsh-cat-setting__hint' }, hint),
        ),
        control,
      )

    return h(
      'section',
      { className: 'dsh-cat-settings', 'data-plugin': 'dsh-cat-pet' },
      h('h3', { className: 'dsh-cat-settings__title' }, t('title')),
      h('p', { className: 'dsh-cat-settings__hint' }, t('description')),

      row(
        'enabled',
        t('enabled.label'),
        t('enabled.hint'),
        h('input', {
          type: 'checkbox',
          checked: prefs.enabled,
          'aria-label': t('enabled.label'),
          onChange: (event: any) => update({ enabled: !!event.target.checked }),
        }),
      ),

      row(
        'size',
        t('size.label'),
        t('size.hint'),
        h(
          'select',
          {
            value: prefs.size,
            disabled: !prefs.enabled,
            'aria-label': t('size.label'),
            onChange: (event: any) => {
              const next = event.target.value
              if ((PET_SIZES as readonly string[]).includes(next)) update({ size: next as PetSize })
            },
          },
          ...PET_SIZES.map((size: PetSize) =>
            h('option', { value: size, key: size }, `${t(`size.${size}` as keyof typeof ru)} · ${SIZE_PX[size]}px`),
          ),
        ),
      ),

      row(
        'react',
        t('react.label'),
        t('react.hint'),
        h('input', {
          type: 'checkbox',
          checked: prefs.reactToStatus,
          disabled: !prefs.enabled,
          'aria-label': t('react.label'),
          onChange: (event: any) => update({ reactToStatus: !!event.target.checked }),
        }),
      ),

      row(
        'reset',
        t('reset.label'),
        t('reset.hint'),
        h(
          'button',
          { type: 'button', className: 'dsh-cat-settings__reset', onClick: onResetPosition },
          t('reset.label'),
        ),
      ),
    )
  }
}
