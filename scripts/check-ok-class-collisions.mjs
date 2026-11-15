#!/usr/bin/env node
// OK（Tailwind）样式与 Huhu 样式的碰撞守护（design §12，三类检查）：
//  A. OK 产出 CSS 的类名 ∩ Huhu 自有 CSS 的类名（两边都有规则 → 互相污染）
//  B. OK 产出 CSS 的类名 ∩ Huhu TSX / HTML 里“没有任何 CSS 规则”的类 token（如 hidden / truncate：
//     Huhu 依赖浏览器默认或别处，OK 的 Tailwind 工具类一出现就会改变它们）
//  C. `.ok-root` 之外的规则：不得声明自定义属性，不得选中 html / body / :root / 裸 `*`
// 用法：node scripts/check-ok-class-collisions.mjs <built-ok.css> [--allow-report]   退出码 1 = 有 C 类违规（A / B 只报告交集）
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import postcss from 'postcss'
import selectorParser from 'postcss-selector-parser'

const ROOT = resolve(import.meta.dirname, '..')
const builtPath = process.argv[2]
if (!builtPath) {
  console.error('用法：node scripts/check-ok-class-collisions.mjs <built-ok.css>')
  process.exit(2)
}

function classesIn(root) {
  const out = new Set()
  root.walkRules((r) => {
    if (r.parent?.type === 'atrule' && r.parent.name.endsWith("keyframes")) return
    selectorParser((sels) => sels.walkClasses((c) => out.add(c.value))).processSync(r.selector)
  })
  return out
}

function walk(dir, exts, acc = []) {
  for (const n of readdirSync(dir)) {
    if (['node_modules', 'dist', 'out', 'vendor', 'harness-dist', '.git', 'temp', 'test-results'].includes(n)) continue
    const p = join(dir, n)
    const s = statSync(p)
    if (s.isDirectory()) walk(p, exts, acc)
    else if (exts.some((e) => n.endsWith(e))) acc.push(p)
  }
  return acc
}

const okRoot = postcss.parse(readFileSync(resolve(builtPath), 'utf8'))
const okClasses = classesIn(okRoot)

// C：.ok-root 之外
const violations = []
okRoot.walkRules((r) => {
  if (r.parent?.type === 'atrule' && r.parent.name.endsWith("keyframes")) return
  for (const sel of r.selectors) {
    const scoped = /\.ok-root\b/.test(sel)
    if (sel.trim() === '::backdrop') continue
    const global = /^(html|body|:root|:host|\*)(\W|$)/.test(sel.trim()) || sel.trim() === '*'
    let declaresVar = false
    r.walkDecls((d) => {
      if (d.prop.startsWith('--')) declaresVar = true
    })
    // Tailwind 产出里没有 .ok-root 的普通类规则（.p-4 等）是预期的；只对“全局选择器”与“声明变量的非 .ok-root 规则”报错
    if (!scoped && (global || (declaresVar && !/^\.|^\[|^:is\(|^:where\(/.test(sel.trim())))) violations.push(`${sel.trim().slice(0, 80)}`)
  }
})

// A / B
const huhuCssFiles = [
  ...walk(join(ROOT, 'packages'), ['.css']),
  ...walk(join(ROOT, 'plugins'), ['.css']),
  ...walk(join(ROOT, 'apps'), ['.css']),
].filter((f) => !f.includes('/vendor/') && !f.includes('/ok/'))
const huhuClasses = new Set()
for (const f of huhuCssFiles) {
  try {
    for (const c of classesIn(postcss.parse(readFileSync(f, 'utf8')))) huhuClasses.add(c)
  } catch {}
}
const A = [...okClasses].filter((c) => huhuClasses.has(c)).sort()

const tokenRe = /class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{"([^"]*)"\}|\{'([^']*)'\})/g
const tokens = new Set()
for (const f of [...walk(join(ROOT, 'packages'), ['.tsx']), ...walk(join(ROOT, 'plugins'), ['.tsx']), ...walk(join(ROOT, 'apps'), ['.tsx', '.html'])]) {
  if (f.includes('/vendor/')) continue
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(tokenRe)) for (const t of (m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '').split(/\s+/)) if (/^[a-z][\w-]*$/.test(t)) tokens.add(t)
}
const B = [...tokens].filter((t) => okClasses.has(t) && !huhuClasses.has(t)).sort()

console.log(`OK 产出类名 ${okClasses.size}｜Huhu CSS 类名 ${huhuClasses.size}｜Huhu TSX/HTML 类 token ${tokens.size}`)
console.log(`A（两边都有规则）${A.length}：${A.slice(0, 40).join(' ')}`)
console.log(`B（Huhu 用但无 CSS 规则，OK 会给它加规则）${B.length}：${B.slice(0, 60).join(' ')}`)
console.log(`C（.ok-root 之外的全局 / 变量规则）${violations.length}${violations.length ? '：\n  ' + [...new Set(violations)].slice(0, 40).join('\n  ') : ''}`)
if (violations.length) process.exit(1)
