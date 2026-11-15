#!/usr/bin/env node
// 对照 closure-manifest（上游路径 + SHA-256）与 vendor 目录，列出：改动 / 删除 / 新增（非上游）的文件，
// 并与 PATCHES.md 登记的路径逐一比对（G02：登记集合必须与实际差异完全一致，否则失败）。
// 用法：node scripts/ok-patches.mjs [--check] [--json]
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const V = join(ROOT, 'packages/editor/src/vendor/open-knowledge')
const man = JSON.parse(readFileSync(join(ROOT, '.agents/dev/changes/2026-11-14-knowledge-ok-parity/evidence/closure-manifest.json'), 'utf8'))
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex')
const rel = (p) => p.replace(/^packages\/(app|core)\//, '$1/')

const modified = []
const removed = []
const manifestPaths = new Set()
for (const f of man.files) {
  const r = rel(f.upstream)
  manifestPaths.add(r)
  const dst = join(V, r)
  if (!existsSync(dst)) removed.push(r)
  else if (sha(dst) !== f.sha256) modified.push(r)
}
// 非上游文件：vendor 目录下不在清单里的（不含 PATCHES / UPSTREAM / LICENSE 说明文件与资源目录 locales / css 拷贝）
const added = []
const EXTRA_OK = new Set(['PATCHES.md', 'UPSTREAM.md', 'LICENSE'])
function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    if (statSync(p).isDirectory()) walk(p)
    else {
      const r = relative(V, p).split('\\').join('/')
      if (!manifestPaths.has(r) && !EXTRA_OK.has(r)) added.push(r)
    }
  }
}
walk(V)

const patchesFile = join(V, 'PATCHES.md')
const registered = new Set()
if (existsSync(patchesFile)) for (const m of readFileSync(patchesFile, 'utf8').matchAll(/`((?:app|core|server-bridge)\/[^`\s]+)`/g)) registered.add(m[1])
const actual = new Set([...modified, ...removed, ...added])
const unregistered = [...actual].filter((p) => !registered.has(p))
const stale = [...registered].filter((p) => !actual.has(p))

if (process.argv.includes('--json')) console.log(JSON.stringify({ modified, removed, added, unregistered, stale }, null, 2))
else console.log(`改动 ${modified.length}｜删除 ${removed.length}｜新增 ${added.length}｜PATCHES.md 登记 ${registered.size}｜未登记 ${unregistered.length}｜多余登记 ${stale.length}`)
if (unregistered.length) console.log('未登记：\n  ' + unregistered.join('\n  '))
if (stale.length) console.log('多余登记：\n  ' + stale.join('\n  '))
if (process.argv.includes('--check') && (unregistered.length || stale.length)) process.exit(1)
