// 从 tsconfig.vendor.json 的 paths 生成 Vite 别名（单一事实来源：类型检查与构建用同一份映射）。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

export function okAliases(editorRoot) {
  const cfg = JSON.parse(readFileSync(resolve(editorRoot, 'tsconfig.vendor.json'), 'utf8'))
  const out = []
  for (const [key, targets] of Object.entries(cfg.compilerOptions.paths)) {
    const target = resolve(editorRoot, targets[0].replace(/\*$/, ''))
    if (key.endsWith('/*')) out.push({ find: new RegExp(`^${esc(key.slice(0, -2))}/(.*)$`), replacement: `${target}/$1` })
    else out.push({ find: new RegExp(`^${esc(key)}$`), replacement: target })
  }
  return out
}
