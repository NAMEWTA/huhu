// 编辑器运行时验证用的最小页面（SP-2 / SP-3 / SP-6）：不进入 Huhu 应用构建。
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { lingui } from '@lingui/vite-plugin'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { okAliases } from './build/aliases.mjs'
import okScopePlugin from './build/ok-scope-plugin.mjs'

export default defineConfig({
  root: resolve(__dirname, 'harness'),
  base: './',
  plugins: [react(), babel({ plugins: ['@lingui/babel-plugin-lingui-macro'], presets: [] } as never), lingui(), tailwindcss()],
  css: { postcss: { plugins: [okScopePlugin()] } },
  resolve: {
    alias: okAliases(__dirname),
    dedupe: ['react', 'react-dom', 'yjs', 'prosemirror-model', 'prosemirror-state', 'prosemirror-view', '@codemirror/state', '@codemirror/view'],
  },
  build: {
    outDir: resolve(__dirname, 'harness-dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    rollupOptions: { input: { index: resolve(__dirname, 'harness/index.html'), tree: resolve(__dirname, 'harness/tree.html') } },
  },
  server: { port: 5199, strictPort: true },
})
