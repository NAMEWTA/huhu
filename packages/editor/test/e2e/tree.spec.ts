// S5 运行时验证：真实 Electron 里上游 FileTree 经 hostFetch 的 files 路由列出真实（内存）文件系统。
// 运行：pnpm --filter @huhu/editor exec vite build -c vite.harness.config.ts && pnpm exec playwright test -c playwright.vendor.config.ts tree
import { _electron as electron, expect, test } from '@playwright/test'
import path from 'node:path'

const MAIN = path.resolve(import.meta.dirname, '../../harness/electron-main.cjs')

async function boot() {
  const app = await electron.launch({ args: [MAIN], env: { ...process.env, HARNESS_PAGE: 'tree.html' } })
  const page = await app.firstWindow()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.waitForFunction(() => Boolean((window as never as { __tree?: unknown }).__tree), null, { timeout: 30_000 })
  return { app, page, errors }
}

const rows = (page: import('@playwright/test').Page) => page.locator('[data-item-path]')

test('S5：树列出真实文件（含空目录与非 Markdown）', async () => {
  const { app, page, errors } = await boot()
  page.on('console', (m) => console.log('CONSOLE', m.type(), m.text().slice(0, 300)))
  await page.waitForTimeout(4000)
  console.log('BODY', (await page.locator('body').innerText()).slice(0, 600), 'ERRORS', JSON.stringify(errors).slice(0, 1500), 'HTML', (await page.locator('#root').innerHTML()).slice(0, 300))
  await expect(rows(page).first()).toBeVisible({ timeout: 30_000 })
  const paths = await rows(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.itemPath))
  console.log('ROWS', JSON.stringify(paths))
  expect(paths).toEqual(expect.arrayContaining(['Notes/', 'Empty/', 'data.json', 'paper.pdf', 'readme.md']))
  expect(errors).toEqual([])
  await app.close()
})
