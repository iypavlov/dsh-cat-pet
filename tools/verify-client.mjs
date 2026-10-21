#!/usr/bin/env node
/**
 * Приёмка собранного клиента: ловит ТИХУЮ поломку, из-за которой плагин
 * не загрузится без единой ошибки в консоли.
 *
 *   node tools/verify-client.mjs        (запускается из scripts.build)
 *
 * В чём опасность. Шелл подключает lib/client.js как обычный скрипт. Если в
 * файле окажется хоть один верхнеуровневый `export` или `import`, браузер
 * сочтёт файл модулем и НЕ выполнит его: window.__ModuleLoader__.load не
 * вызовется, плагин просто не появится. Сообщения об ошибке при этом не
 * будет — отсюда проверка.
 *
 * Что проверяется:
 *   1. файл существует и не пуст;
 *   2. нет верхнеуровневых import/export (кроме строк внутри кода);
 *   3. есть вызов window.__ModuleLoader__.load и он НЕ внутри блока;
 *   4. нет незакрытых относительных импортов (остатков './...');
 *   5. React не забандлен: нет объявления класса/функции React рядом с
 *      require('react') — иначе получим две копии React и «invalid hook call».
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const files = {
  host: path.join(ROOT, 'lib', 'index.js'),
  client: path.join(ROOT, 'lib', 'client.js'),
}

const problems = []
const notes = []

function fail(message) {
  problems.push(message)
}

async function checkHost() {
  let code
  try {
    code = await readFile(files.host, 'utf8')
  } catch {
    fail('lib/index.js не найден — сборка хост-половины не прошла')
    return
  }
  if (code.trim().length === 0) fail('lib/index.js пуст')
  if (!/\bexport\s+(const|function|default|\{)/.test(code)) {
    fail('lib/index.js: нет ни одного export — Cordis не увидит плагин')
  }
  if (!/\bname\s*=/.test(code)) notes.push('lib/index.js: не найдено объявление name')
}

async function checkClient() {
  let code
  try {
    code = await readFile(files.client, 'utf8')
  } catch {
    fail('lib/client.js не найден — сборка клиентской половины не прошла')
    return
  }
  if (code.trim().length === 0) {
    fail('lib/client.js пуст')
    return
  }

  const lines = code.split('\n')
  lines.forEach((line, i) => {
    const n = i + 1
    // Верхнеуровневые (без отступа) import/export — признак модуля.
    if (/^(import|export)\b/.test(line)) {
      fail(`lib/client.js:${n}: верхнеуровневый "${line.trim().slice(0, 40)}" — файл станет модулем и не выполнится`)
    }
  })

  if (!/window\.__ModuleLoader__\s*(\.|\?\.)\s*load/.test(code)) {
    fail('lib/client.js: нет вызова window.__ModuleLoader__.load — клиент не зарегистрируется')
  }
  // Вызов должен быть вне вложенного блока: ищем его без ведущих пробелов.
  const bare = lines.some((line) => /^window\.__ModuleLoader__\s*(\.|\?\.)\s*load/.test(line) || /^if\s*\(.*__ModuleLoader__/.test(line))
  if (!bare) fail('lib/client.js: вызов загрузчика вложен в блок — он может не выполниться на верхнем уровне')

  if (/from\s*['"]\.\.?\//.test(code)) {
    fail('lib/client.js: остался неразрешённый относительный импорт — локальные модули не заинлайнены')
  }

  // Две копии React — классическая причина «invalid hook call».
  if (/require\(\s*['"]react['"]\s*\)/.test(code) && /class\s+React\b|function\s+React\b|React\.version\s*=/.test(code)) {
    fail('lib/client.js: похоже, React забандлен вместо require("react") из шелла')
  }
  if (!/require\(\s*['"]react['"]\s*\)/.test(code)) {
    notes.push('lib/client.js: не найден require("react") — проверьте, что React берётся у шелла')
  }
}

await checkHost()
await checkClient()

for (const note of notes) console.log(`[verify-client] замечание: ${note}`)

if (problems.length > 0) {
  console.error('[verify-client] найдены проблемы:')
  for (const p of problems) console.error(`  ✗ ${p}`)
  process.exitCode = 1
} else {
  console.log('[verify-client] ok: lib/index.js (ESM) и lib/client.js (голый скрипт) пригодны к загрузке')
}
