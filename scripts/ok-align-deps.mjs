#!/usr/bin/env node
// 把 packages/editor/package.json 里“Huhu 原本没有、为 OK vendor 新增”的依赖钉到 OK pnpm-lock.yaml 实际解析出的版本
// （OK 的 package.json 对 tiptap 等写 ^ 范围，真正的行为基线是它的锁文件；浮动到更新版本会带来不同的编辑器行为，
// 例如 @tiptap/react 3.34 的 reactMobileEnter 插件与上游 3.22.3 的 park / 重挂载不兼容——S0 SP-6 的实测发现）。
// Huhu 原有依赖保持原样。
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const OK = process.env.OK_SRC ?? join(ROOT, 'temp/sources/open-knowledge')
const pjPath = join(ROOT, 'packages/editor/package.json')
const pj = JSON.parse(readFileSync(pjPath, 'utf8'))
const base = JSON.parse(execFileSync('git', ['show', '9b57d8f:packages/editor/package.json'], { cwd: ROOT }).toString())
const lock = readFileSync(join(OK, 'pnpm-lock.yaml'), 'utf8')

function importerVersions(importer) {
  const start = lock.indexOf(`\n  ${importer}:\n`)
  if (start < 0) return {}
  const rest = lock.slice(start + 1)
  const end = rest.slice(3).search(/\n  \S/)
  const block = end < 0 ? rest : rest.slice(0, end + 3)
  const out = {}
  const re = /\n {6}'?([^\s':]+(?:\/[^\s':]+)?)'?:\n {8}specifier: [^\n]+\n {8}version: ([^\n]+)/g
  for (const m of block.matchAll(re)) out[m[1]] = m[2].replace(/\(.*$/, '').replace(/^link:.*$/, '')
  return out
}
const resolved = { ...importerVersions('packages/core'), ...importerVersions('packages/app') }
const changed = []
for (const name of Object.keys(pj.dependencies)) {
  if (base.dependencies?.[name]) continue
  const v = resolved[name]
  if (v && v !== pj.dependencies[name]) {
    changed.push(`${name}: ${pj.dependencies[name]} -> ${v}`)
    pj.dependencies[name] = v
  }
}
writeFileSync(pjPath, JSON.stringify(pj, null, 2) + '\n')
console.log(changed.join('\n') || 'no change')
