/**
 * Проверка согласованности встроенного атласа и картинки.
 * Запуск: node tools/verify-atlas-embed.mjs
 *
 * Ловит ошибку, из-за которой котик рисуется пустым или обрезанным:
 * сетка в atlas.json не совпадает с реальными размерами PNG.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const file = process.argv[2] ?? path.join(process.cwd(), 'lib', 'client.js')
const code = await readFile(file, 'utf8')

const m = code.match(/atlas:\s*(\{[\s\S]*?\}),\s*image:\s*"(data:image\/png;base64,[^"]+)"/)
if (!m) {
  console.error('[verify-atlas] не найден блок SHEET с атласом и картинкой (арт не встроен?)')
  process.exitCode = 1
} else {
  const atlas = JSON.parse(m[1])
  const buf = Buffer.from(m[2].split(',')[1], 'base64')
  const expectedW = atlas.grid.cols * atlas.cell.w
  const expectedH = atlas.grid.rows * atlas.cell.h
  // PNG: сигнатура 8 байт, затем длина(4)+тип(4), затем IHDR: ширина и высота.
  const w = buf.readUInt32BE(16)
  const h = buf.readUInt32BE(20)

  console.log(`[verify-atlas] файл: ${file}`)
  console.log(`[verify-atlas] cell: ${atlas.cell.w}x${atlas.cell.h}, grid: ${atlas.grid.cols}x${atlas.grid.rows}`)
  console.log(`[verify-atlas] анимации: ${Object.keys(atlas.animations).join(', ')}`)
  console.log(`[verify-atlas] png: ${w}x${h}, ожидалось: ${expectedW}x${expectedH}`)

  const problems = []
  if (w !== expectedW || h !== expectedH) {
    problems.push(`сетка не совпадает с картинкой: png ${w}x${h}, а по atlas.json ${expectedW}x${expectedH}`)
  }
  for (const [name, anim] of Object.entries(atlas.animations)) {
    for (const [c, r] of anim.frames) {
      if (c >= atlas.grid.cols || r >= atlas.grid.rows) {
        problems.push(`${name}: кадр [${c},${r}] вне сетки ${atlas.grid.cols}x${atlas.grid.rows}`)
      }
    }
  }
  if (problems.length > 0) {
    console.error('[verify-atlas] проблемы:')
    for (const p of problems) console.error(`  ✗ ${p}`)
    process.exitCode = 1
  } else {
    console.log('[verify-atlas] ok: атлас согласован, кадры внутри сетки')
  }
}
