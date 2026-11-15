#!/usr/bin/env node
// S0：从闭包清单中提取 fetch('/api…') / WebSocket / okDesktop 调用点（机械提取，形状与映射需人工补）。
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
const ROOT = resolve(import.meta.dirname, '..')
const OK = join(ROOT, 'temp/sources/open-knowledge')
const CH = join(ROOT, '.agents/dev/changes/2026-11-14-knowledge-ok-parity/evidence')
const man = JSON.parse(readFileSync(join(CH, 'closure-manifest.json'), 'utf8'))
const rows = []
for (const f of man.files) {
  if (!/\.(tsx?|mts)$/.test(f.upstream)) continue
  const lines = readFileSync(join(OK, f.upstream), 'utf8').split('\n')
  lines.forEach((l, i) => {
    if (/^\s*(\/\/|\*)/.test(l)) return
    let m
    if ((m = l.match(/['"`](\/api\/[^'"`]*)['"`]/))) rows.push(['api', f.upstream, i + 1, m[1], l.trim().slice(0, 140)])
    else if (/new\s+WebSocket|new\s+HocuspocusProvider/.test(l)) rows.push(['ws', f.upstream, i + 1, 'collab', l.trim().slice(0, 140)])
    for (const d of l.matchAll(/okDesktop(?:\??\.)(\w+)(?:\??\.(\w+))?/g)) rows.push(['desktop', f.upstream, i + 1, d[2] ? `${d[1]}.${d[2]}` : d[1], l.trim().slice(0, 140)])
  })
}
const eps = new Set(rows.filter((r) => r[0] === 'api').map((r) => r[3].split('?')[0]))
const dm = new Set(rows.filter((r) => r[0] === 'desktop').map((r) => r[3]))
let out = `# 端点矩阵（机械提取）\n\n来源：\`scripts/ok-endpoints.mjs\` 对 closure-manifest 的 ${man.files.length} 个文件做静态扫描。**请求/响应形状与 Huhu 映射列未自动填写**，由 S1/S4/S5 实施时据 design.md §4 补全；动态拼接路径只能抓到字面量前缀。\n\n统计：调用点 ${rows.length}；不同 /api 路径 ${eps.size}；不同 okDesktop 成员 ${dm.size}。\n\n## /api 路径（去重）\n\n${[...eps].sort().map((e) => `- \`${e}\``).join('\n')}\n\n## okDesktop 成员（去重）\n\n${[...dm].sort().map((e) => `- \`${e}\``).join('\n')}\n\n## 调用点\n\n| 类型 | 文件:行 | 目标 | 代码 |\n|---|---|---|---|\n`
for (const r of rows) out += `| ${r[0]} | ${r[1].replace('packages/', '')}:${r[2]} | \`${r[3]}\` | \`${r[4].replace(/\|/g, '\\|').replace(/`/g, "'")}\` |\n`
writeFileSync(join(CH, 'endpoint-matrix.md'), out)
console.log({ calls: rows.length, apiPaths: eps.size, desktop: dm.size })
