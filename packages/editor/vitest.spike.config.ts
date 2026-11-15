import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
const base = resolve(__dirname, 'src/vendor/open-knowledge')
export default defineConfig({
  resolve: { alias: [
    { find: /^@inkeep\/open-knowledge-core\/(.*)$/, replacement: base + '/core/src/$1' },
    { find: /^@\//, replacement: base + '/app/src/' },
  ] },
  test: { include: ['spike/**/*.test.ts'], environment: 'node' },
})
