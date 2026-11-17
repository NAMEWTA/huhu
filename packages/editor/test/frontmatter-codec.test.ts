// S3 / spec C02：frontmatter 编解码对“看起来像数字的文本”与类型化值的保真（P-S3-04）。
import { describe, expect, test } from 'vitest'
import { applyPatchToDocument, parseFrontmatterYaml } from '../src/vendor/open-knowledge/core/src/frontmatter/yaml-codec'

function patch(yaml: string, p: Record<string, unknown>): string {
  const parsed = parseFrontmatterYaml(yaml)
  return applyPatchToDocument(parsed.doc, p)
}

describe('frontmatter 保真', () => {
  test('前导零文本不被改写成数字', () => {
    expect(patch('title: a\nzip: 007\n', { title: 'b' })).toBe('title: b\nzip: 007\n')
  })

  test('读出的值是文本', () => {
    const parsed = parseFrontmatterYaml('zip: 007\ncode: 0123\n')
    expect(parsed.map).toEqual({ zip: '007', code: '0123' })
  })

  test('显式加引号的 "007" 保持引号', () => {
    expect(patch('title: a\nq: "007"\n', { title: 'b' })).toBe('title: b\nq: "007"\n')
  })

  test('false / 0 / 空字符串 / null 与普通整数不受影响', () => {
    const out = patch('a: false\nb: 0\nc: ""\nd: null\ne: 12\n', { z: 'x' })
    expect(out).toContain('a: false')
    expect(out).toContain('b: 0')
    expect(out).toContain('c: ""')
    expect(out).toContain('d: null')
    expect(out).toContain('e: 12')
  })

  test('注释与未知键原样保留', () => {
    const out = patch('# keep me\ntitle: T # trailing\nzzz: 1\n', { title: 'U' })
    expect(out).toContain('# keep me')
    expect(out).toContain('zzz: 1')
    expect(out).toContain('title: U')
  })
})
