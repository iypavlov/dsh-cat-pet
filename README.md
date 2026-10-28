# dsh-cat-pet

[![npm](https://img.shields.io/npm/v/dsh-cat-pet)](https://www.npmjs.com/package/dsh-cat-pet)
[![license](https://img.shields.io/npm/l/dsh-cat-pet)](LICENSE)

Анимированный котик-компаньон для веб-интерфейса
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

![Котик: сидит и лежит](assets/preview.png)

Кошка живёт поверх интерфейса: её можно перетаскивать, она помнит позицию и
реагирует на то, чем занят агент — сидит, пока всё спокойно, ложится и
засыпает, пока агент думает, и просыпается, когда ход вернулся или вы
начали печатать.

## Установка

Плагин ставится тремя способами. Первый — обычный; второй пригодится, если
пакет из npm недоступен; третий нужен, только если вы правите код.

### Из npm

```bash
dsh plugin add dsh-cat-pet
```

Либо откройте **Plugins → Add plugin**, вставьте `dsh-cat-pet` и нажмите
**Install**. Пакет уже собран и не содержит install-скриптов, поэтому при
установке из npm ничего не компилируется и не запрашивается разрешение на
запуск build-скриптов.

### С GitHub

Если npm недоступен или нужна конкретная ревизия:

```bash
dsh plugin add github:iypavlov/dsh-cat-pet
```

В диалоге **Plugins → Add plugin** те же адреса понимаются и в других формах:

| Что вставить | Когда подходит |
| --- | --- |
| `github:iypavlov/dsh-cat-pet` | обычная установка с GitHub |
| `https://github.com/iypavlov/dsh-cat-pet` | то же самое, если удобнее полный адрес |
| `git@github.com:iypavlov/dsh-cat-pet.git` | если настроен доступ по SSH |
| `C:\путь\до\dsh-cat-pet` | локальная копия репозитория; путь обязан быть абсолютным |

Путь к `.tgz`-архиву установщик тоже понимает.

### Из исходников

Нужен, только если вы меняете код плагина.

```bash
git clone https://github.com/iypavlov/dsh-cat-pet.git
cd dsh-cat-pet
pnpm install
pnpm build          # сборка в lib/
pnpm install-local  # доставить в профиль DSH
```

`pnpm build` только собирает `lib/` и ничего не доставляет в профиль —
именно поэтому нужен `pnpm install-local`. После правок в коде повторите
обе команды.

### После установки

**Перезапустите DSH**: профиль читает свою копию пакета из `node_modules`,
и до перезапуска плагин не появится.

## Лицензия

MIT — см. [LICENSE](LICENSE).
