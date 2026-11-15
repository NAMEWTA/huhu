import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'vitest'
import { MarkdownManager } from '../src/vendor/open-knowledge/core/src/markdown/index'
import { sharedExtensions } from '../src/vendor/open-knowledge/core/src/extensions/shared'
import { normalizeBridge } from '../src/vendor/open-knowledge/core/src/bridge/normalize'
const loadGfmExamples = () => JSON.parse(readFileSync('/home/wta/projects/huhu/temp/sources/open-knowledge/packages/core/src/markdown/fixtures/gfm/examples.json', 'utf8')) as { markdown: string }[]

function walk(d: string, out: string[] = []) {
  for (const n of readdirSync(d)) {
    if (n === 'node_modules' || n === '.git' || n === 'temp' || n === 'out' || n === 'dist') continue
    const p = join(d, n)
    const s = statSync(p)
    if (s.isDirectory()) walk(p, out)
    else if (n.endsWith('.md')) out.push(p)
  }
  return out
}

test('SP-4 roundtrip', () => {
  const mm = new MarkdownManager({ extensions: sharedExtensions as never })
  const samples: { id: string; md: string }[] = []
  loadGfmExamples().forEach((e, i) => samples.push({ id: `gfm#${i}`, md: e.markdown }))
  const root = '/home/wta/projects/huhu'
  for (const d of ['.agents', 'docs', 'examples', 'tests']) {
    try { for (const f of walk(join(root, d))) samples.push({ id: f.replace(root + '/', ''), md: readFileSync(f, 'utf8') }) } catch {}
  }
  for (const f of ['CLAUDE.md', 'THIRD_PARTY_NOTICES.md']) samples.push({ id: f, md: readFileSync(join(root, f), 'utf8') })
  let byte = 0, norm = 0, idem = 0, crash = 0
  const diffs: string[] = []
  const hu = samples.filter((s) => !s.id.startsWith('gfm#'))
  const stat = (set: typeof samples) => {
    let b = 0, n = 0, i = 0, c = 0
    for (const s of set) {
      try {
        const rt = mm.serialize(mm.parseWithFallback(s.md))
        if (rt === s.md) b++
        if (normalizeBridge(rt) === normalizeBridge(s.md)) n++
        else if (diffs.length < 40) diffs.push(s.id)
        if (mm.serialize(mm.parseWithFallback(rt)) === rt) i++
      } catch { c++; if (diffs.length < 40) diffs.push('CRASH ' + s.id) }
    }
    return { total: set.length, byteEqual: b, normalizedEqual: n, idempotent: i, crash: c }
  }
  const res = { gfm: stat(samples.filter((s) => s.id.startsWith('gfm#'))), huhuMd: stat(hu), sampleDiffs: diffs }
  writeFileSync('/tmp/claude-1000/-home-wta-projects-huhu/afc137f4-21dc-459d-b6ca-97cd133eddf9/scratchpad/sp4.json', JSON.stringify(res, null, 2))
}, 600000)
