#!/usr/bin/env node
// S0：从 OK 编辑器 / 评论 / 文件树 / 属性面板入口出发，做静态 + 动态 import 闭包，输出清单。
// 用法：node scripts/ok-closure.mjs [--out <path>]
// 只读 temp/sources/open-knowledge；不改任何来源文件。
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = resolve(import.meta.dirname, '..')
const OK = join(ROOT, 'temp/sources/open-knowledge')
const APP_SRC = join(OK, 'packages/app/src')
const CORE_PKG = '@inkeep/open-knowledge-core'
const EXTS = ['.ts', '.tsx', '.mts', '.js', '.jsx', '.json', '.css']

const ENTRIES = [
  'editor/TiptapEditor.tsx',
  'editor/SourceEditor.tsx',
  'editor/DocumentContext.tsx',
  'editor/EditorContent.tsx',
  'comments/CommentsPanel.tsx',
  'comments/CommentListPanel.tsx',
  'comments/CommentMarginRail.tsx',
  'comments/CommentSelectionAffordance.tsx',
  'comments/PropertyCommentButton.tsx',
  'components/FileTree.tsx',
  'components/FileTargetMenuItems.tsx',
  'components/OkFileTree.tsx',
  'components/PropertyPanel.tsx',
].map((p) => join(APP_SRC, p))

const outArgIdx = process.argv.indexOf('--out')
const OUT =
  outArgIdx > 0
    ? resolve(process.argv[outArgIdx + 1])
    : join(ROOT, '.agents/dev/changes/2026-11-14-knowledge-ok-parity/evidence/closure-manifest.json')

const isTest = (f) =>
  /\.(test|dom\.test|e2e|test-helper|type-tests|reads)\.[tj]sx?$/.test(f) ||
  /\/(tests?|fixtures|__tests__|test-utils)\//.test(f) ||
  f.endsWith('.d.ts')

function resolveFile(base) {
  if (existsSync(base) && statSync(base).isFile()) return base
  for (const e of EXTS) if (existsSync(base + e)) return base + e
  for (const e of EXTS) if (existsSync(join(base, 'index' + e))) return join(base, 'index' + e)
  // TS 习惯：import './x.js' 实指 x.ts(x)
  const m = base.match(/^(.*)\.(js|mjs|jsx)$/)
  if (m) for (const e of ['.ts', '.tsx', '.mts']) if (existsSync(m[1] + e)) return m[1] + e
  return null
}

function coreSubpath(spec) {
  // @inkeep/open-knowledge-core 及其子路径；以 package.json exports 的 @inkeep/source 条件解析
  const pkg = JSON.parse(readFileSync(join(OK, 'packages/core/package.json'), 'utf8'))
  const key = spec === CORE_PKG ? '.' : '.' + spec.slice(CORE_PKG.length)
  const entry = pkg.exports?.[key]
  const rel = entry?.['@inkeep/source'] ?? entry?.development
  return rel ? join(OK, 'packages/core', rel) : null
}

const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\.meta\.glob\(\s*['"]([^'"]+)['"]/g

const seen = new Map() // file -> {kind}
const npm = new Map() // pkg -> Set(files)
const unresolved = []
const queue = [...ENTRIES]

function addNpm(spec, from) {
  const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
  if (!npm.has(name)) npm.set(name, new Set())
  npm.get(name).add(relative(OK, from))
}

while (queue.length) {
  const file = queue.pop()
  if (seen.has(file)) continue
  seen.set(file, true)
  if (!/\.(tsx?|mts|jsx?)$/.test(file)) continue
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3]
    if (!spec) continue
    let target = null
    if (spec.startsWith('.')) target = resolveFile(resolve(dirname(file), spec))
    else if (spec.startsWith('@/')) target = resolveFile(join(APP_SRC, spec.slice(2)))
    else if (spec === CORE_PKG || spec.startsWith(CORE_PKG + '/')) {
      const p = coreSubpath(spec)
      target = p && existsSync(p) ? p : null
    } else if (spec.startsWith('node:')) continue
    else {
      addNpm(spec, file)
      continue
    }
    if (!target) {
      if (!/\*/.test(spec)) unresolved.push({ from: relative(OK, file), spec })
      continue
    }
    if (isTest(target)) continue
    if (!seen.has(target)) queue.push(target)
  }
}

const sha = execFileSync('git', ['-C', OK, 'rev-parse', 'HEAD']).toString().trim()
const files = [...seen.keys()]
  .filter((f) => existsSync(f))
  .sort()
  .map((f) => {
    const buf = readFileSync(f)
    const rel = relative(OK, f)
    return {
      upstream: rel,
      area: rel.startsWith('packages/core/') ? 'core' : 'app',
      lines: buf.toString('utf8').split('\n').length,
      sha256: createHash('sha256').update(buf).digest('hex'),
    }
  })

const lock = existsSync(join(ROOT, 'pnpm-lock.yaml')) ? readFileSync(join(ROOT, 'pnpm-lock.yaml'), 'utf8') : ''
const rootPkgs = Object.assign(
  {},
  ...['', 'packages/editor/', 'plugins/notes/', 'packages/ui/']
    .map((d) => join(ROOT, d, 'package.json'))
    .filter(existsSync)
    .map((p) => {
      const j = JSON.parse(readFileSync(p, 'utf8'))
      return { ...j.dependencies, ...j.devDependencies }
    }),
)
const okDeps = Object.assign(
  {},
  ...['app', 'core'].map((d) => {
    const j = JSON.parse(readFileSync(join(OK, `packages/${d}/package.json`), 'utf8'))
    return { ...j.dependencies, ...j.devDependencies }
  }),
)
const deps = [...npm.keys()]
  .filter((n) => !n.startsWith('@inkeep/'))
  .sort()
  .map((n) => ({
    name: n,
    okVersion: okDeps[n] ?? null,
    huhuVersion: rootPkgs[n] ?? null,
    status: !rootPkgs[n] ? 'new' : rootPkgs[n] === okDeps[n] ? 'same' : 'version-diff',
    inLockfile: lock.includes(`\n  ${n}@`) || lock.includes(`'${n}@`),
  }))

const manifest = {
  generatedFrom: { okSha: sha, entries: ENTRIES.map((e) => relative(OK, e)) },
  totals: {
    files: files.length,
    app: files.filter((f) => f.area === 'app').length,
    core: files.filter((f) => f.area === 'core').length,
    lines: files.reduce((s, f) => s + f.lines, 0),
    npmPackages: deps.length,
    newDeps: deps.filter((d) => d.status === 'new').length,
    versionDiff: deps.filter((d) => d.status === 'version-diff').length,
  },
  unresolvedCount: unresolved.length,
  unresolved: unresolved.slice(0, 200),
  deps,
  files,
}
writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify(manifest.totals, null, 2), '\n→', OUT)
