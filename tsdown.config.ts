import { defineConfig } from 'tsdown'

// Два entry → два файла в lib/:
//   lib/index.js  — Host-половина (Node, Cordis-плагин), обычный ESM
//   lib/client.js — браузерная половина
//
// ПОЧЕМУ У КЛИЕНТА ФОРМАТ esm С «ГОЛЫМ» ИСХОДНИКОМ
// Шелл подключает lib/client.js как ОБЫЧНЫЙ СКРИПТ: файл обязан сам вызвать
// window.__ModuleLoader__.load(...) и не иметь ни import, ни export.
// `require` — НЕ глобальная переменная, а параметр фабрики, который подставляет
// сам шелл (`factory: require => {...}`, так у dsh-our-free-model). Поэтому
// оборачивать клиент в IIFE нельзя: это меняет верхний уровень файла и ломает
// вызов загрузчика. Гарантия «голого» скрипта держится на исходнике: в
// src/client/index.ts нет верхнеуровневых export/import, а локальные импорты
// tsdown инлайнит.
export default defineConfig([
  {
    entry: { index: 'src/host/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    // Явное расширение обязательно: на platform=node tsdown сам выбирает
    // .mjs, а package.json (main и exports) указывает на ./lib/index.js.
    // Без этого получается lib/index.mjs и плагин не находится по манифесту.
    outExtensions: () => ({ js: '.js' }),
    target: 'es2022',
    platform: 'node',
    deps: { neverBundle: [/^node:/, /^@deepseek-ai\//] },
    clean: true,
    dts: false,
  },
  {
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    outExtensions: () => ({ js: '.js' }),
    target: 'es2022',
    platform: 'browser',
    // React даёт шелл через require — бандлить его нельзя ни при каких условиях.
    deps: { neverBundle: ['react', 'react-dom'] },
    clean: false,
    dts: false,
  },
])
