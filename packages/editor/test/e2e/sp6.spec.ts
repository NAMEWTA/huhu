// SP-6 运行时闸门：真实 Electron 里 LocalDocProvider 挂上游 TiptapEditor / SourceEditor。
// 运行：pnpm --filter @huhu/editor exec vite build -c vite.harness.config.ts && pnpm exec playwright test -c playwright.vendor.config.ts
import { _electron as electron, expect, test, type Page } from '@playwright/test'
import path from 'node:path'

const HERE = import.meta.dirname
const MAIN = path.resolve(HERE, '../../harness/electron-main.cjs')
const DOC_A = '---\ntitle: Alpha\ntags: [a, b]\n---\n\n# Alpha\n\nFirst paragraph.\n\n- item one\n- item two\n\nSecond   paragraph with *emphasis*.\n'
const DOC_B = '# Beta\n\nBeta body line.\n\n| a | b |\n| - | - |\n| 1 | 2 |\n'

async function boot() {
  const app = await electron.launch({ args: [MAIN] })
  const page = await app.firstWindow()
  await page.waitForFunction(() => Boolean((window as never as { __harness?: unknown }).__harness), null, { timeout: 30_000 })
  return { app, page }
}

const open = async (page: Page, name: string) => {
  await page.evaluate((n) => (window as never as { __harness: { open(n: string): void } }).__harness.open(n), name)
}
const ytext = (page: Page, name: string) =>
  page.evaluate((n) => (window as never as { __harness: { ytext(n: string): string } }).__harness.ytext(n), name)

test.describe.configure({ mode: 'serial' })

test('SP-6：打开 / 无编辑不改源文本 / 输入 / 来回切 / 源码模式 / 撤销', async () => {
  const { app, page } = await boot()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.evaluate(([a, b]) => {
    const h = (window as never as { __harness: { seed(n: string, t: string): void } }).__harness
    h.seed('A.md', a as string)
    h.seed('B.md', b as string)
  }, [DOC_A, DOC_B])

  // 1. 打开 A，无编辑，Y.Text 逐字节等于磁盘内容
  await open(page, 'A.md')
  await expect(page.locator('.ProseMirror').first()).toContainText('First paragraph.', { timeout: 20_000 })
  expect(await ytext(page, 'A.md')).toBe(DOC_A)

  // 2. 输入后 Y.Text 反映编辑（PM → Text 桥）
  await page.locator('.ProseMirror').first().click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('TYPED-ONE')
  await expect.poll(() => ytext(page, 'A.md'), { timeout: 10_000 }).toContain('TYPED-ONE')
  const afterTyping = await ytext(page, 'A.md')

  // 3. 切到 B 再切回 A（editor-cache park）：内容与 Y.Text 一致，输入保留
  await open(page, 'B.md')
  await expect(page.locator('.ProseMirror').first()).toContainText('Beta body line.', { timeout: 20_000 })
  expect(await ytext(page, 'B.md')).toBe(DOC_B)
  await open(page, 'A.md')
  await expect(page.locator('.ProseMirror').first()).toContainText('TYPED-ONE', { timeout: 20_000 })
  expect(await ytext(page, 'A.md')).toBe(afterTyping)

  // 4. 源码模式：CodeMirror 显示同一份文本，在源码里输入后富文本跟随（Text → PM 桥）
  await page.evaluate(() => (window as never as { __harness: { setSourceMode(on: boolean): void } }).__harness.setSourceMode(true))
  await expect(page.locator('.cm-content').first()).toContainText('TYPED-ONE', { timeout: 20_000 })
  await page.locator('.cm-content').first().click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('SRC-TWO')
  await expect.poll(() => ytext(page, 'A.md'), { timeout: 10_000 }).toContain('SRC-TWO')
  await page.evaluate(() => (window as never as { __harness: { setSourceMode(on: boolean): void } }).__harness.setSourceMode(false))
  await expect(page.locator('.ProseMirror').first()).toContainText('SRC-TWO', { timeout: 20_000 })

  // 5. 撤销：富文本里 Ctrl+Z 回退最近的输入
  await page.locator('.ProseMirror').first().click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('UNDO-ME')
  await expect.poll(() => ytext(page, 'A.md'), { timeout: 10_000 }).toContain('UNDO-ME')
  await page.keyboard.press('Control+z')
  await expect.poll(() => ytext(page, 'A.md'), { timeout: 10_000 }).not.toContain('UNDO-ME')

  // 6. 打开 12 个文档触发 cache 驱逐（MAX_CACHE=10），再回到 A
  for (let i = 0; i < 12; i++) {
    await page.evaluate((i) => (window as never as { __harness: { seed(n: string, t: string): void } }).__harness.seed(`N${i}.md`, `# N${i}\n\nbody ${i}\n`), i)
    await open(page, `N${i}.md`)
    await expect(page.locator('.ProseMirror').first()).toContainText(`body ${i}`, { timeout: 20_000 })
  }
  await open(page, 'A.md')
  await expect(page.locator('.ProseMirror').first()).toContainText('SRC-TWO', { timeout: 20_000 })

  console.log('PAGE_ERRORS', JSON.stringify(errors))
  await page.screenshot({ path: path.resolve(HERE, '../../../../.agents/dev/changes/2026-11-14-knowledge-ok-parity/evidence/spikes/sp6-harness.png') })
  await app.close()
})
