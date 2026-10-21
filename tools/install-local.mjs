#!/usr/bin/env node
/**
 * Установка плагина в профиль DSH БЕЗ команды `dsh plugin add`.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ СКРИПТ
 * `dsh` может отсутствовать в PATH (в этой сборке CLI лежит внутри app.asar),
 * а `pnpm build` НЕ доставляет результат в профиль: он только собирает lib/.
 * Из-за этого уже случалась поломка — котик оставался на старой сборке без
 * арта, потому что в профиле лежал прежний client.js.
 *
 * Этот скрипт делает ровно то же, что `dsh plugin add`:
 *   1. копирует lib/ и манифесты в node_modules профиля;
 *   2. прописывает пакет в dependencies и в dsh.profile.bundles.
 *
 * Запуск: pnpm install-local [--profile desktop] [--dry-run]
 */
import { cp, mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const profileArg = args.indexOf('--profile')
const profileName = profileArg !== -1 ? args[profileArg + 1] : 'desktop'

const dshHome = process.env.DSH_HOME ?? path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh')
const profileDir = path.join(dshHome, 'profiles', profileName)
const pkgDir = path.join(profileDir, 'node_modules', 'dsh-cat-pet')

if (!existsSync(profileDir)) {
  console.error(`[install-local] профиль не найден: ${profileDir}`)
  process.exitCode = 1
} else {
  const manifestPath = path.join(profileDir, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

  // ── 1. файлы пакета ──────────────────────────────────────────────────────
  const entries = ['lib', 'assets', 'cordis.patch.yml', 'package.json', 'README.md']
  const missing = entries.filter((e) => !existsSync(path.join(ROOT, e)))
  if (missing.length > 0) {
    console.error(`[install-local] нет файлов: ${missing.join(', ')} — сначала pnpm build`)
    process.exitCode = 1
  } else {
    if (!dryRun) {
      await mkdir(pkgDir, { recursive: true })
      for (const entry of entries) {
        const from = path.join(ROOT, entry)
        const to = path.join(pkgDir, entry)
        if (entry === 'lib' || entry === 'assets') {
          await cp(from, to, { recursive: true, force: true })
        } else {
          await copyFile(from, to)
        }
      }
    }

    // ── 2. манифест профиля ─────────────────────────────────────────────────
    // Бэкап делаем один раз, чтобы повторные установки его не перезатирали.
    const backupPath = `${manifestPath}.bak`
    if (!dryRun && !existsSync(backupPath)) {
      await copyFile(manifestPath, backupPath)
    }

    manifest.dependencies ??= {}
    manifest.dependencies['dsh-cat-pet'] = `file:${ROOT.replace(/\\/g, '/')}`
    manifest.dsh ??= {}
    manifest.dsh.profile ??= {}
    const bundles = new Set(manifest.dsh.profile.bundles ?? [])
    bundles.add('dsh-cat-pet')
    manifest.dsh.profile.bundles = [...bundles]

    if (!dryRun) {
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    }

    console.log(`[install-local] профиль: ${profileDir}`)
    console.log(`[install-local] пакет:   ${pkgDir}`)
    console.log(`[install-local] bundles: ${manifest.dsh.profile.bundles.join(', ')}`)
    console.log(
      dryRun
        ? '[install-local] --dry-run: ничего не изменено'
        : '[install-local] готово. Перезапустите DSH, чтобы профиль перечитался.',
    )
  }
}
