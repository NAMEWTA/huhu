// Lingui 配置（decisions OP-D06）：只发布 en / zh-Hans；目录是上游 vendor 的 .po，不在 Huhu 里重新提取。
import { defineConfig } from '@lingui/cli'
import { formatter } from '@lingui/format-po'

export default defineConfig({
  sourceLocale: 'en',
  locales: ['en', 'zh-Hans'],
  catalogs: [
    {
      path: '<rootDir>/src/vendor/open-knowledge/app/src/locales/{locale}/messages',
      include: ['src/vendor/open-knowledge/app/src'],
      exclude: ['**/node_modules/**', '**/*.test.*'],
    },
  ],
  format: formatter({ origins: false, printPlaceholdersInComments: false }),
})
