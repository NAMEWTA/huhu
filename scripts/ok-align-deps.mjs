#!/usr/bin/env node
// 把 packages/editor/package.json 里“Huhu 原本没有、为 OK vendor 新增”的依赖版本对齐到 OK app 的声明
// （app 优先于 core：app 对 tiptap / yjs 等是精确钉死，core 是 ^ 范围，合并时曾被 core 覆盖）。
// Huhu 原有依赖保持原样（版本差异由 SP-1 / S0 版本对照表记录）。
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const OK = process.env.OK_SRC ?? join(ROOT, 'temp/sources/open-knowledge')
const pjPath = join(ROOT, 'packages/editor/package.json')
const pj = JSON.parse(readFileSync(pjPath, 'utf8'))
const base = JSON.parse(execFileSync('git', ['show', '9b57d8f:packages/editor/package.json'], { cwd: ROOT }).toString())
const app = JSON.parse(readFileSync(join(OK, 'packages/app/package.json'), 'utf8'))
const appDeps = { ...app.dependencies, ...app.devDependencies }
const changed = []
for (const name of Object.keys(pj.dependencies)) {
  if (base.dependencies?.[name]) continue
  const want = appDeps[name]
  if (want && want !== pj.dependencies[name]) {
    changed.push(`${name}: ${pj.dependencies[name]} -> ${want}`)
    pj.dependencies[name] = want
  }
}
writeFileSync(pjPath, JSON.stringify(pj, null, 2) + '\n')
console.log(changed.join('\n') || 'no change')
