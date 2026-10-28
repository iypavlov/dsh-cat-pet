#!/usr/bin/env node
/**
 * Собирает assets/ → src/client/sprite-data.ts.
 *
 *   assets/atlas.json        описание сетки и анимаций
 *   assets/spritesheet.webp  лист кадров (или .png/.jpg)
 *
 * Результат — модуль с двумя значениями: объект атласа и data:URL листа.
 * Если арта ещё нет, пишется заглушка с null — клиент просто ничего не
 * рисует и пишет одну строку в консоль, сборка не падает.
 *
 * Авторитетная валидация схемы — в src/shared/atlas.ts, она выполняется
 * клиентом при загрузке. Скрипт ловит только явный бардак (нет файла,
 * битый JSON, путь в image), чтобы ошибка всплыла на сборке, а не в UI.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const ASSETS = path.join(ROOT, 'assets')
const OUT = path.join(ROOT, 'src', 'client', 'sprite-data.ts')

const STUB = `/** ГЕНЕРИРУЕТСЯ tools/build-atlas.mjs — не править руками. */
import type { SheetData } from './renderer'

export const SHEET: SheetData = { atlas: null, image: null }
`

function fail(message) {
  console.error(`[build-atlas] ${message}`)
  process.exitCode = 1
}

async function findSheet() {
  let entries
  try {
    entries = await readdir(ASSETS)
  } catch {
    return null
  }
  return entries.find((name) => /^spritesheet\.(webp|png|jpe?g|gif)$/i.test(name)) ?? null
}

async function main() {
  const sheetName = await findSheet()
  const atlasPath = path.join(ASSETS, 'atlas.json')

  if (!sheetName || !existsSync(atlasPath)) {
    await writeFile(OUT, STUB, 'utf8')
    console.log(
      `[build-atlas] арта нет (${sheetName ? 'нет atlas.json' : 'нет spritesheet.*'}) — пишем заглушку`,
    )
    return
  }

  let atlas
  try {
    atlas = JSON.parse(await readFile(atlasPath, 'utf8'))
  } catch (error) {
    fail(`assets/atlas.json — некорректный JSON: ${error.message}`)
    return
  }

  // Проверки «на входе»: дальше схему валидирует клиент.
  if (typeof atlas?.image !== 'string' || atlas.image.length === 0) {
    fail('atlas.json: нет поля image')
    return
  }
  if (atlas.image.includes('/') || atlas.image.includes('\\') || atlas.image.includes('..')) {
    fail(`atlas.json: image должен быть именем файла, получено "${atlas.image}"`)
    return
  }
  if (atlas.image !== sheetName) {
    fail(`atlas.json image="${atlas.image}", а в assets/ лежит "${sheetName}"`)
    return
  }
  if (!atlas.animations || typeof atlas.animations !== 'object') {
    fail('atlas.json: нет поля animations')
    return
  }

  const bytes = await readFile(path.join(ASSETS, sheetName))
  const mime = sheetName.toLowerCase().endsWith('.png')
    ? 'image/png'
    : sheetName.toLowerCase().endsWith('.jpg') || sheetName.toLowerCase().endsWith('.jpeg')
      ? 'image/jpeg'
      : sheetName.toLowerCase().endsWith('.gif')
        ? 'image/gif'
        : 'image/webp'

  if (bytes.length > 4_000_000) {
    // Лист едет в бандл как base64 (×1.37) — предупреждаем, а не молчим.
    console.warn(
      `[build-atlas] внимание: лист ${Math.round(bytes.length / 1024)} КБ — в бандле станет ~${Math.round((bytes.length * 1.37) / 1024)} КБ`,
    )
  }

  const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`

  const source = `/** ГЕНЕРИРУЕТСЯ tools/build-atlas.mjs — не править руками. */
import type { SheetData } from './renderer'

export const SHEET: SheetData = {
  atlas: ${JSON.stringify(atlas)},
  image: ${JSON.stringify(dataUrl)},
}
`
  await mkdir(path.dirname(OUT), { recursive: true })
  await writeFile(OUT, source, 'utf8')

  const animations = Object.keys(atlas.animations)
  const cells = (atlas.grid?.cols ?? 0) * (atlas.grid?.rows ?? 0)
  console.log(
    `[build-atlas] ${sheetName} (${Math.round(bytes.length / 1024)} КБ) → sprite-data.ts; ` +
      `анимации: ${animations.join(', ')}; ячеек в сетке: ${cells}`,
  )
}

await main()
