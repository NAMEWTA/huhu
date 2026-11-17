// S5 运行时验证：真实 Electron 里上游 FileTree 经 hostFetch 的 files 路由列出 / 操作真实（内存）文件系统。
// 运行：pnpm --filter @huhu/editor exec vite build -c vite.harness.config.ts && pnpm exec playwright test -c playwright.vendor.config.ts tree
import { _electron as electron, expect, test, type Page } from '@playwright/test'
import path from 'node:path'

const MAIN = path.resolve(import.meta.dirname, '../../harness/electron-main.cjs')

async function boot() {
  const app = await electron.launch({ args: [MAIN], env: { ...process.env, HARNESS_PAGE: 'tree.html' } })
  const page = await app.firstWindow()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.waitForFunction(() => Boolean((window as never as { __tree?: unknown }).__tree), null, { timeout: 30_000 })
  await expect(page.locator('[data-item-path]').first()).toBeVisible({ timeout: 30_000 })
  return { app, page, errors }
}
const paths = (page: Page) => page.locator('[data-item-path]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.itemPath))
const row = (page: Page, p: string) => page.locator(`[data-item-path="${p}"]`).first()

test.describe.configure({ mode: 'serial' })

test('A01 / A05：树列出真实文件（含空目录与非 Markdown），展开惰性加载子级', async () => {
  const { app, page, errors } = await boot()
  expect(await paths(page)).toEqual(expect.arrayContaining(['Notes/', 'Empty/', 'data.json', 'paper.pdf', 'readme.md']))
  await row(page, 'Notes/').click()
  await expect(row(page, 'Notes/a.md')).toBeVisible()
  expect(await paths(page)).toEqual(expect.arrayContaining(['Notes/a.md', 'Notes/b.md', 'Notes/pic.png']))
  await row(page, 'Empty/').click()
  expect(errors).toEqual([])
  await app.close()
})

test('A06：右键菜单对文件 / 目录各自出现，Esc 关闭', async () => {
  const { app, page } = await boot()
  await row(page, 'readme.md').click({ button: 'right' })
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible({ timeout: 10_000 })
  const fileItems = (await menu.getByRole('menuitem').allInnerTexts()).map((s) => s.trim())
  expect(fileItems).toEqual(expect.arrayContaining(['Copy path', 'Duplicate', 'Rename', 'Hide this file', 'Delete']))
  expect(fileItems).not.toContain('Open with AI') // P-S5-02：登记为不适用
  expect(fileItems).not.toContain('Import as template')
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await row(page, 'Notes/').click({ button: 'right' })
  await expect(page.getByRole('menu')).toBeVisible()
  const dirItems = (await page.getByRole('menu').getByRole('menuitem').allInnerTexts()).map((s) => s.trim())
  expect(dirItems).toEqual(expect.arrayContaining(['New file', 'New folder', 'Expand all', 'Hide folder', 'Delete']))
  expect(dirItems).not.toContain('Open with AI')
  await app.close()
})

const pick = async (page: Page, p: string, item: string) => {
  await row(page, p).click({ button: 'right' })
  await page.getByRole('menuitem', { name: item, exact: true }).click()
}
const tree = <T,>(page: Page, fn: () => T) => page.evaluate(fn)

test('A02 / A03：隐藏只改 hiddenPaths，树里消失；文件仍真实存在', async () => {
  const { app, page, errors } = await boot()
  await pick(page, 'Archives/', 'Hide folder')
  await expect(row(page, 'Archives/')).toBeHidden({ timeout: 10_000 })
  expect(await tree(page, () => window.__tree.hidden)).toEqual(['Archives'])
  expect(await tree(page, () => window.__tree.files.has('Archives/x.md'))).toBe(true) // 文件未动
  expect(errors).toEqual([])
  await app.close()
})

test('A07：复制 / 删除（回收站）走宿主能力', async () => {
  const { app, page } = await boot()
  await pick(page, 'readme.md', 'Duplicate')
  await expect.poll(() => tree(page, () => JSON.stringify(window.__tree.log))).toContain('duplicate')
  await pick(page, 'data.json', 'Delete')
  await page.getByRole('alertdialog').getByRole('button', { name: /delete|move to/i }).first().click()
  await expect.poll(() => tree(page, () => window.__tree.files.has('data.json'))).toBe(false)
  expect(await tree(page, () => JSON.stringify(window.__tree.log))).toContain('"trash"')
  await app.close()
})

test('A07：重命名（Markdown 与非 Markdown）经 rename 能力', async () => {
  const { app, page } = await boot()
  await pick(page, 'paper.pdf', 'Rename')
  await page.keyboard.press('Control+A')
  await page.keyboard.type('paper2') // 上游保持扩展名
  await page.keyboard.press('Enter')
  await expect.poll(() => tree(page, () => window.__tree.files.has('paper2.pdf'))).toBe(true)
  expect(await tree(page, () => window.__tree.files.has('paper.pdf'))).toBe(false)
  await app.close()
})
