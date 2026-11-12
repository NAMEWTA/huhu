# 第三方声明

HUHU Workbench 以 GPL-3.0-or-later 发布（见 LICENSE）。以下是随应用分发的第三方组件及其许可证；本文件由 `scripts/gen-notices.mjs` 生成，请勿手工编辑。

## 随包二进制与运行时

- Electron / Chromium：见应用目录中的 `LICENSE.electron.txt` 与 `LICENSES.chromium.html`。
- Herdr Core（`herdr-core`）：Apache-2.0，官方发布包 https://releases.herdr.dev/core/（版本与 SHA-256 见 `scripts/herdr.lock.json`），源码 https://github.com/herdrdev/herdr-core；其内含 ghostty（MIT）；Windows 包另含 Microsoft ConPTY（MIT）。完整声明随包放在 `resources/herdr/<平台>/THIRD-PARTY-NOTICES`。

## 复制或改造的源码（`docs/upstream/ledger.md`）

# 复制来源台账

| 编号 | 来源 | 提交 | 目标路径 | 说明 |
| --- | --- | --- | --- | --- |
| R-05 | DSH fcc0ad4 | vendor/{cordis,cosmokit,timer}/src/* | vendor/{cordis,cosmokit,timer}/src/* | 包名改为 @huhu/*，保留 MIT 许可文件与来源行 |
| R-08 | OK 44a2e0a | packages/server/src/file-watcher.ts | packages/vault/src/watch/ | 仅参照批处理/回退/重命名配对思路，按 HUHU 需求精简重写（模式，未复制代码） |
| R-09 | atomic-editor b6ed65f (kenforthewin, 0.6.2) | src/* | packages/editor/src/vendor/atomic/ | 复制并改造（inline-preview、wiki-links、主题、IME 组合保护），保留 MIT 许可文件与来源说明 `UPSTREAM.md` |
| R-24 | open-knowledge 批注锚点 | packages/server/src/comments/anchor.ts、packages/core/src/comments/{passage-match}.ts、markdown/whitespace-char-ref.ts | plugins/notes/src/engine/comments/ | 复制（GPL-3.0-or-later，与本项目许可一致）；类型改为本地 Anchor，删除未使用导出，补 noUncheckedIndexedAccess 守卫 |

## npm 运行时依赖

| 包 | 版本 | 许可证 | 主页 |
| --- | --- | --- | --- |
| @antfu/install-pkg | 2.1.0 | MIT | https://github.com/antfu-collective/install-pkg#readme |
| @babel/code-frame | 7.29.7 | MIT | https://babel.dev/docs/en/next/babel-code-frame |
| @babel/compat-data | 7.29.7 | MIT |  |
| @babel/core | 7.29.13 | MIT | https://babel.dev/docs/en/next/babel-core |
| @babel/generator | 7.29.13 | MIT | https://babel.dev/docs/en/next/babel-generator |
| @babel/helper-compilation-targets | 7.29.13 | MIT |  |
| @babel/helper-globals | 7.29.7 | MIT |  |
| @babel/helper-module-imports | 7.29.7 | MIT | https://babel.dev/docs/en/next/babel-helper-module-imports |
| @babel/helper-module-transforms | 7.29.13 | MIT | https://babel.dev/docs/en/next/babel-helper-module-transforms |
| @babel/helper-plugin-utils | 7.29.7 | MIT | https://babel.dev/docs/en/next/babel-helper-plugin-utils |
| @babel/helper-string-parser | 7.29.13 | MIT | https://babel.dev/docs/en/next/babel-helper-string-parser |
| @babel/helper-validator-identifier | 7.29.7 | MIT |  |
| @babel/helper-validator-option | 7.29.7 | MIT |  |
| @babel/helpers | 7.29.13 | MIT | https://babel.dev/docs/en/next/babel-helpers |
| @babel/parser | 7.29.13 | MIT | https://babel.dev/docs/en/next/babel-parser |
| @babel/plugin-transform-arrow-functions | 7.29.7 | MIT | https://babel.dev/docs/en/next/babel-plugin-transform-arrow-functions |
| @babel/runtime | 7.29.13 | MIT | https://babel.dev/docs/en/next/babel-runtime |
| @babel/template | 7.29.7 | MIT | https://babel.dev/docs/en/next/babel-template |
| @babel/traverse | 7.29.13 | MIT | https://babel.dev/docs/en/next/babel-traverse |
| @babel/types | 7.29.11 | MIT | https://babel.dev/docs/en/next/babel-types |
| @braintree/sanitize-url | 7.1.2 | MIT | https://github.com/braintree/sanitize-url#readme |
| @chevrotain/cst-dts-gen | 11.0.3 | Apache-2.0 |  |
| @chevrotain/gast | 11.0.3 | Apache-2.0 |  |
| @chevrotain/regexp-to-ast | 11.0.3 | Apache-2.0 |  |
| @chevrotain/types | 11.0.3 | Apache-2.0 | https://chevrotain.io/documentation/ |
| @chevrotain/utils | 11.0.3 | Apache-2.0 |  |
| @codemirror/commands | 6.11.1 | MIT |  |
| @codemirror/language | 6.13.1 | MIT |  |
| @codemirror/search | 6.7.2 | MIT |  |
| @codemirror/state | 6.7.6 | MIT |  |
| @codemirror/streamparser | 6.0.0 | MIT |  |
| @codemirror/view | 6.43.15 | MIT |  |
| @date-fns/tz | 1.5.0 | MIT | https://github.com/date-fns/date-fns#readme |
| @electron-internal/extract-zip | 1.0.8 | MIT |  |
| @electron/asar | 3.4.1 | MIT | https://github.com/electron/asar |
| @electron/fuses | 1.8.0 | MIT | https://github.com/electron/fuses#readme |
| @electron/get | 3.1.0 | MIT |  |
| @electron/get | 5.1.0 | MIT |  |
| @electron/notarize | 2.5.0 | MIT | https://github.com/electron/notarize#readme |
| @electron/osx-sign | 1.3.3 | BSD-2-Clause | https://github.com/electron/osx-sign |
| @electron/rebuild | 4.2.1 | MIT | https://github.com/electron/rebuild |
| @electron/universal | 2.0.3 | MIT |  |
| @esbuild/linux-x64 | 0.28.2 | MIT |  |
| @exodus/bytes | 1.16.0 | MIT | https://github.com/ExodusOSS/bytes |
| @floating-ui/core | 1.8.0 | MIT | https://floating-ui.com |
| @floating-ui/dom | 1.8.0 | MIT | https://floating-ui.com |
| @floating-ui/react-dom | 2.1.9 | MIT | https://floating-ui.com/docs/react-dom |
| @floating-ui/utils | 0.2.12 | MIT | https://floating-ui.com |
| @hono/node-server | 2.1.6 | MIT | https://github.com/honojs/node-server |
| @iconify/types | 2.0.0 | MIT | https://github.com/iconify/iconify |
| @iconify/utils | 3.1.7 | MIT | https://iconify.design/docs/libraries/utils/ |
| @isaacs/fs-minipass | 4.0.1 | ISC |  |
| @jridgewell/gen-mapping | 0.3.13 | MIT | https://github.com/jridgewell/sourcemaps/tree/main/packages/gen-mapping |
| @jridgewell/remapping | 2.3.5 | MIT | https://github.com/jridgewell/sourcemaps/tree/main/packages/remapping |
| @jridgewell/resolve-uri | 3.1.2 | MIT |  |
| @jridgewell/sourcemap-codec | 1.6.0 | MIT | https://github.com/jridgewell/sourcemaps/tree/main/packages/sourcemap-codec |
| @jridgewell/trace-mapping | 0.3.31 | MIT | https://github.com/jridgewell/sourcemaps/tree/main/packages/trace-mapping |
| @lezer/common | 1.5.5 | MIT |  |
| @lezer/highlight | 1.2.5 | MIT |  |
| @lezer/lr | 1.4.12 | MIT |  |
| @lezer/markdown | 1.8.1 | MIT |  |
| @malept/cross-spawn-promise | 2.0.0 | Apache-2.0 |  |
| @malept/flatpak-bundler | 0.4.0 | MIT | https://github.com/malept/flatpak-bundler#readme |
| @marijn/find-cluster-break | 1.0.4 | MIT | https://code.haverbeke.berlin/marijn/find-cluster-break |
| @mermaid-js/parser | 0.6.3 | MIT | https://github.com/mermaid-js/mermaid/tree/develop/packages/mermaid/parser/#readme |
| @modelcontextprotocol/sdk | 1.32.2 | MIT | https://modelcontextprotocol.io |
| @noble/hashes | 1.8.0 | MIT | https://paulmillr.com/noble/ |
| @oxc-parser/binding-linux-x64-gnu | 0.156.0 | MIT | https://oxc.rs/docs/guide/usage/parser |
| @oxc-project/types | 0.156.0 | MIT | https://oxc.rs |
| @oxc-resolver/binding-linux-x64-gnu | 11.24.2 | MIT | https://oxc.rs |
| @oxfmt/binding-linux-x64-gnu | 0.78.0 | MIT | https://oxc.rs/docs/guide/usage/formatter |
| @oxlint/binding-linux-x64-gnu | 1.93.0 | MIT | https://oxc.rs/docs/guide/usage/linter |
| @parcel/watcher | 2.6.0 | MIT |  |
| @parcel/watcher-linux-x64-glibc | 2.6.0 | MIT |  |
| @peculiar/asn1-schema | 2.11.1 | MIT | https://github.com/PeculiarVentures/asn1-schema/tree/master/packages/schema#readme |
| @peculiar/json-schema | 1.1.12 | MIT | https://github.com/PeculiarVentures/json-schema#readme |
| @peculiar/utils | 2.0.3 | MIT | https://github.com/PeculiarVentures/pvtsutils#readme |
| @peculiar/webcrypto | 1.7.2 | MIT | https://github.com/PeculiarVentures/webcrypto#readme |
| @playwright/test | 1.65.0 | Apache-2.0 | https://playwright.dev |
| @radix-ui/primitive | 1.1.7 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-arrow | 1.1.15 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-collection | 1.1.15 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-compose-refs | 1.1.5 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-context | 1.2.2 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-dialog | 1.1.23 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-direction | 1.1.4 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-dismissable-layer | 1.1.19 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-focus-guards | 1.1.6 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-focus-scope | 1.1.16 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-id | 1.1.4 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-popover | 1.1.23 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-popper | 1.3.7 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-portal | 1.1.17 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-presence | 1.1.10 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-primitive | 2.1.10 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-roving-focus | 1.1.19 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-slot | 1.3.3 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-switch | 1.3.7 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-tooltip | 1.2.16 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-callback-ref | 1.1.4 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-controllable-state | 1.2.6 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-effect-event | 0.0.5 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-is-hydrated | 0.1.3 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-layout-effect | 1.1.4 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-rect | 1.1.4 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-size | 1.1.4 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-visually-hidden | 1.2.11 | MIT | https://radix-ui.com/primitives |
| @radix-ui/rect | 1.1.3 | MIT | https://radix-ui.com/primitives |
| @rolldown/binding-linux-x64-gnu | 1.2.18 | MIT | https://rolldown.rs/ |
| @rolldown/pluginutils | 1.1.0 | MIT | https://github.com/rolldown/plugins/tree/main/packages/pluginutils#readme |
| @rollup/rollup-linux-x64-gnu | 4.68.1 | MIT | https://rollupjs.org/ |
| @sindresorhus/is | 4.6.0 | MIT |  |
| @standard-schema/spec | 1.1.0 | MIT | https://standardschema.dev |
| @szmarczak/http-timer | 4.0.6 | MIT | https://github.com/szmarczak/http-timer#readme |
| @tanstack/query-core | 5.107.1 | MIT | https://tanstack.com/query |
| @tanstack/react-query | 5.107.1 | MIT | https://tanstack.com/query |
| @testing-library/dom | 10.4.2 | MIT | https://github.com/testing-library/dom-testing-library#readme |
| @testing-library/react | 16.3.3 | MIT | https://github.com/testing-library/react-testing-library#readme |
| @types/aria-query | 5.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/aria-query |
| @types/cacheable-request | 6.0.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/cacheable-request |
| @types/chai | 5.2.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/chai |
| @types/d3 | 7.4.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3 |
| @types/d3-array | 3.2.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-array |
| @types/d3-axis | 3.0.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-axis |
| @types/d3-brush | 3.0.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-brush |
| @types/d3-chord | 3.0.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-chord |
| @types/d3-color | 3.1.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-color |
| @types/d3-contour | 3.0.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-contour |
| @types/d3-delaunay | 6.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-delaunay |
| @types/d3-dispatch | 3.0.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-dispatch |
| @types/d3-drag | 3.0.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-drag |
| @types/d3-dsv | 3.0.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-dsv |
| @types/d3-ease | 3.0.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-ease |
| @types/d3-fetch | 3.0.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-fetch |
| @types/d3-force | 3.0.10 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-force |
| @types/d3-format | 3.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-format |
| @types/d3-geo | 3.1.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-geo |
| @types/d3-hierarchy | 3.1.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-hierarchy |
| @types/d3-interpolate | 3.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-interpolate |
| @types/d3-path | 3.1.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-path |
| @types/d3-polygon | 3.0.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-polygon |
| @types/d3-quadtree | 3.0.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-quadtree |
| @types/d3-random | 3.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-random |
| @types/d3-scale | 4.0.9 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-scale |
| @types/d3-scale-chromatic | 3.1.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-scale-chromatic |
| @types/d3-selection | 3.0.12 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-selection |
| @types/d3-shape | 3.2.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-shape |
| @types/d3-time | 3.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-time |
| @types/d3-time-format | 4.0.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-time-format |
| @types/d3-timer | 3.0.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-timer |
| @types/d3-transition | 3.0.9 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-transition |
| @types/d3-zoom | 3.0.9 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-zoom |
| @types/debug | 4.1.13 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/debug |
| @types/deep-eql | 4.0.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/deep-eql |
| @types/estree | 1.0.10 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/estree |
| @types/estree-jsx | 1.0.5 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/estree-jsx |
| @types/fs-extra | 9.0.13 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/fs-extra |
| @types/geojson | 7946.0.16 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/geojson |
| @types/hast | 3.0.5 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/hast |
| @types/http-cache-semantics | 4.2.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/http-cache-semantics |
| @types/katex | 0.16.8 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/katex |
| @types/keyv | 3.1.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/keyv |
| @types/mdast | 4.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/mdast |
| @types/ms | 2.1.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/ms |
| @types/node | 18.19.130 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node |
| @types/node | 24.19.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node |
| @types/proper-lockfile | 4.1.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/proper-lockfile |
| @types/react | 19.3.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react |
| @types/react-dom | 19.3.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react-dom |
| @types/responselike | 1.0.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/responselike |
| @types/retry | 0.12.5 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/retry |
| @types/ssh2 | 1.15.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/ssh2 |
| @types/trusted-types | 2.0.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/trusted-types |
| @types/unist | 2.0.11 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/unist |
| @types/unist | 3.0.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/unist |
| @types/write-file-atomic | 4.0.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/write-file-atomic |
| @types/ws | 8.18.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/ws |
| @ungap/structured-clone | 1.4.0 | ISC | https://github.com/ungap/structured-clone#readme |
| @vitejs/plugin-react | 6.3.0 | MIT | https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react#readme |
| @vitest/expect | 3.2.7 | MIT | https://github.com/vitest-dev/vitest/tree/main/packages/expect#readme |
| @vitest/mocker | 3.2.7 | MIT | https://github.com/vitest-dev/vitest/tree/main/packages/mocker#readme |
| @vitest/pretty-format | 3.2.7 | MIT | https://github.com/vitest-dev/vitest/tree/main/packages/utils#readme |
| @vitest/runner | 3.2.7 | MIT | https://github.com/vitest-dev/vitest/tree/main/packages/runner#readme |
| @vitest/snapshot | 3.2.7 | MIT | https://github.com/vitest-dev/vitest/tree/main/packages/snapshot#readme |
| @vitest/spy | 3.2.7 | MIT | https://github.com/vitest-dev/vitest/tree/main/packages/spy#readme |
| @vitest/utils | 3.2.7 | MIT | https://github.com/vitest-dev/vitest/tree/main/packages/utils#readme |
| @xmldom/xmldom | 0.8.15 | MIT | https://github.com/xmldom/xmldom |
| @xterm/addon-fit | 0.11.0 | MIT |  |
| @xterm/xterm | 6.0.0 | MIT |  |
| abbrev | 4.0.0 | ISC |  |
| accepts | 2.0.0 | MIT |  |
| agent-base | 7.1.4 | MIT |  |
| ajv | 8.20.0 | MIT | https://ajv.js.org |
| ajv-formats | 3.0.1 | MIT | https://github.com/ajv-validator/ajv-formats#readme |
| ansi-regex | 5.0.1 | MIT |  |
| ansi-styles | 4.3.0 | MIT |  |
| ansi-styles | 5.2.0 | MIT |  |
| app-builder-lib | 26.18.0 | MIT | https://github.com/electron-userland/electron-builder |
| argparse | 2.0.1 | Python-2.0 |  |
| aria-hidden | 1.2.6 | MIT | https://github.com/theKashey/aria-hidden#readme |
| aria-query | 5.3.0 | Apache-2.0 | https://github.com/A11yance/aria-query#readme |
| asn1 | 0.2.6 | MIT |  |
| asn1js | 3.1.0 | BSD-3-Clause |  |
| assertion-error | 2.0.1 | MIT |  |
| async | 3.2.6 | MIT | https://caolan.github.io/async/ |
| async-exit-hook | 2.0.1 | MIT |  |
| asynckit | 0.4.0 | MIT | https://github.com/alexindigo/asynckit#readme |
| at-least-node | 1.0.0 | ISC | https://github.com/RyanZim/at-least-node#readme |
| aws4 | 1.13.2 | MIT |  |
| axe-core | 4.14.0 | MPL-2.0 | https://www.deque.com/axe/ |
| bail | 2.0.2 | MIT |  |
| balanced-match | 1.0.2 | MIT | https://github.com/juliangruber/balanced-match |
| balanced-match | 4.0.4 | MIT |  |
| base64-js | 1.5.1 | MIT | https://github.com/beatgammit/base64-js |
| baseline-browser-mapping | 2.11.35 | Apache-2.0 |  |
| bcp-47 | 2.1.2 | MIT |  |
| bcp-47-match | 2.0.3 | MIT |  |
| bcrypt-pbkdf | 1.0.2 | BSD-3-Clause |  |
| bluebird | 3.7.2 | MIT | https://github.com/petkaantonov/bluebird |
| body-parser | 2.4.0 | MIT |  |
| boolean | 3.2.0 | MIT |  |
| brace-expansion | 1.1.21 | MIT | https://github.com/juliangruber/brace-expansion |
| brace-expansion | 2.1.7 | MIT | https://github.com/juliangruber/brace-expansion |
| brace-expansion | 5.0.12 | MIT |  |
| browserslist | 4.29.5 | MIT |  |
| buffer-from | 1.1.2 | MIT |  |
| buildcheck | 0.0.7 | MIT |  |
| builder-util | 26.16.0 | MIT | https://github.com/electron-userland/electron-builder |
| builder-util-runtime | 9.7.0 | MIT | https://github.com/electron-userland/electron-builder |
| bytes | 3.1.2 | MIT |  |
| bytestreamjs | 2.0.1 | BSD-3-Clause |  |
| cac | 6.7.14 | MIT |  |
| cac | 7.1.0 | MIT | https://github.com/cacjs/cac#readme |
| cacheable-lookup | 5.0.4 | MIT | https://github.com/szmarczak/cacheable-lookup#readme |
| cacheable-request | 7.0.4 | MIT |  |
| call-bind-apply-helpers | 1.0.2 | MIT | https://github.com/ljharb/call-bind-apply-helpers#readme |
| call-bound | 1.0.4 | MIT | https://github.com/ljharb/call-bound#readme |
| caniuse-lite | 1.0.30001823 | CC-BY-4.0 |  |
| ccount | 2.0.1 | MIT |  |
| chai | 5.3.3 | MIT | http://chaijs.com |
| chalk | 4.1.2 | MIT |  |
| character-entities | 2.0.2 | MIT |  |
| character-entities-html4 | 2.1.0 | MIT |  |
| character-entities-legacy | 3.0.0 | MIT |  |
| character-reference-invalid | 2.0.1 | MIT |  |
| check-error | 2.1.3 | MIT |  |
| chevrotain | 11.0.3 | Apache-2.0 | https://chevrotain.io/docs/ |
| chevrotain-allstar | 0.3.1 | MIT |  |
| chownr | 3.0.0 | BlueOak-1.0.0 |  |
| chromium-pickle-js | 0.2.0 | MIT |  |
| ci-info | 4.3.1 | MIT | https://github.com/watson/ci-info |
| ci-info | 4.5.0 | MIT | https://github.com/watson/ci-info |
| cliui | 8.0.1 | ISC |  |
| clone-response | 1.0.3 | MIT |  |
| color-convert | 2.0.1 | MIT |  |
| color-name | 1.1.4 | MIT | https://github.com/colorjs/color-name |
| combined-stream | 1.0.8 | MIT | https://github.com/felixge/node-combined-stream |
| comma-separated-tokens | 2.0.3 | MIT |  |
| commander | 15.1.0 | MIT |  |
| commander | 5.1.0 | MIT |  |
| commander | 7.2.0 | MIT |  |
| commander | 8.3.0 | MIT |  |
| compare-version | 0.1.2 | MIT |  |
| concat-map | 0.0.1 | MIT |  |
| content-disposition | 2.0.1 | MIT |  |
| content-type | 1.0.5 | MIT |  |
| content-type | 2.1.0 | MIT |  |
| convert-source-map | 2.0.0 | MIT | https://github.com/thlorenz/convert-source-map |
| cookie | 0.7.2 | MIT |  |
| cookie-signature | 1.2.2 | MIT |  |
| core-util-is | 1.0.3 | MIT |  |
| cors | 2.8.6 | MIT |  |
| cose-base | 1.0.3 | MIT | https://github.com/iVis-at-Bilkent/cose-base#readme |
| cose-base | 2.2.0 | MIT | https://github.com/iVis-at-Bilkent/cose-base#readme |
| cpu-features | 0.0.10 | MIT |  |
| crelt | 1.0.7 | MIT | https://code.haverbeke.berlin/marijn/crelt |
| croner | 11.0.0 | MIT | https://croner.56k.guru |
| cross-spawn | 7.0.6 | MIT | https://github.com/moxystudio/node-cross-spawn |
| csstype | 3.2.3 | MIT |  |
| cytoscape | 3.35.0 | MIT | http://js.cytoscape.org |
| cytoscape-cose-bilkent | 4.1.0 | MIT | https://github.com/cytoscape/cytoscape.js-cose-bilkent |
| cytoscape-fcose | 2.2.0 | MIT | https://github.com/iVis-at-Bilkent/cytoscape.js-fcose |
| d3 | 7.9.2 | ISC | https://d3js.org |
| d3-array | 2.12.1 | BSD-3-Clause | https://d3js.org/d3-array/ |
| d3-array | 3.2.5 | ISC | https://d3js.org/d3-array/ |
| d3-axis | 3.0.1 | ISC | https://d3js.org/d3-axis/ |
| d3-brush | 3.0.1 | ISC | https://d3js.org/d3-brush/ |
| d3-chord | 3.0.2 | ISC | https://d3js.org/d3-chord/ |
| d3-color | 3.1.1 | ISC | https://d3js.org/d3-color/ |
| d3-contour | 4.0.3 | ISC | https://d3js.org/d3-contour/ |
| d3-delaunay | 6.0.6 | ISC | https://github.com/d3/d3-delaunay |
| d3-dispatch | 3.0.2 | ISC | https://d3js.org/d3-dispatch/ |
| d3-drag | 3.0.1 | ISC | https://d3js.org/d3-drag/ |
| d3-dsv | 3.0.2 | ISC | https://d3js.org/d3-dsv/ |
| d3-ease | 3.0.2 | BSD-3-Clause | https://d3js.org/d3-ease/ |
| d3-fetch | 3.0.2 | ISC | https://d3js.org/d3-fetch/ |
| d3-force | 3.0.1 | ISC | https://d3js.org/d3-force/ |
| d3-format | 3.1.3 | ISC | https://d3js.org/d3-format/ |
| d3-geo | 3.1.2 | ISC | https://d3js.org/d3-geo/ |
| d3-hierarchy | 3.1.3 | ISC | https://d3js.org/d3-hierarchy/ |
| d3-interpolate | 3.0.2 | ISC | https://d3js.org/d3-interpolate/ |
| d3-path | 1.0.9 | BSD-3-Clause | https://d3js.org/d3-path/ |
| d3-path | 3.1.1 | ISC | https://d3js.org/d3-path/ |
| d3-polygon | 3.0.2 | ISC | https://d3js.org/d3-polygon/ |
| d3-quadtree | 3.0.2 | ISC | https://d3js.org/d3-quadtree/ |
| d3-random | 3.0.2 | ISC | https://d3js.org/d3-random/ |
| d3-sankey | 0.12.3 | BSD-3-Clause | https://github.com/d3/d3-sankey |
| d3-scale | 4.0.3 | ISC | https://d3js.org/d3-scale/ |
| d3-scale-chromatic | 3.1.1 | ISC | https://d3js.org/d3-scale-chromatic/ |
| d3-selection | 3.0.1 | ISC | https://d3js.org/d3-selection/ |
| d3-shape | 1.3.7 | BSD-3-Clause | https://d3js.org/d3-shape/ |
| d3-shape | 3.2.1 | ISC | https://d3js.org/d3-shape/ |
| d3-time | 3.1.1 | ISC | https://d3js.org/d3-time/ |
| d3-time-format | 4.1.1 | ISC | https://d3js.org/d3-time-format/ |
| d3-timer | 3.0.2 | ISC | https://d3js.org/d3-timer/ |
| d3-transition | 3.0.2 | ISC | https://d3js.org/d3-transition/ |
| d3-zoom | 3.0.1 | ISC | https://d3js.org/d3-zoom/ |
| dagre-d3-es | 7.0.13 | MIT |  |
| data-urls | 8.0.0 | MIT |  |
| date-fns | 4.4.0 | MIT |  |
| dayjs | 1.11.23 | MIT | https://day.js.org |
| debug | 4.4.3 | MIT |  |
| decimal.js | 10.6.0 | MIT |  |
| decode-named-character-reference | 1.3.0 | MIT |  |
| decompress-response | 6.0.0 | MIT |  |
| deep-eql | 5.0.2 | MIT |  |
| defer-to-connect | 2.0.1 | MIT | https://github.com/szmarczak/defer-to-connect#readme |
| define-data-property | 1.1.4 | MIT | https://github.com/ljharb/define-data-property#readme |
| define-properties | 1.2.1 | MIT |  |
| delaunator | 5.1.0 | ISC |  |
| delayed-stream | 1.0.0 | MIT | https://github.com/felixge/node-delayed-stream |
| depd | 2.0.0 | MIT |  |
| dequal | 2.0.3 | MIT |  |
| detect-libc | 2.1.2 | Apache-2.0 |  |
| detect-node | 2.1.0 | MIT | https://github.com/iliakan/detect-node |
| detect-node-es | 1.1.0 | MIT | https://github.com/thekashey/detect-node |
| devlop | 1.1.0 | MIT |  |
| diff | 9.0.0 | BSD-3-Clause |  |
| dir-compare | 4.2.0 | MIT |  |
| dmg-builder | 26.18.0 | MIT | https://github.com/electron-userland/electron-builder |
| dom-accessibility-api | 0.5.16 | MIT |  |
| dompurify | 3.3.3 | (MPL-2.0 OR Apache-2.0) | https://github.com/cure53/DOMPurify |
| dotenv | 16.6.1 | BSD-2-Clause | https://github.com/motdotla/dotenv#readme |
| dotenv-expand | 11.0.7 | BSD-2-Clause |  |
| dunder-proto | 1.0.1 | MIT | https://github.com/es-shims/dunder-proto#readme |
| duplexer2 | 0.1.4 | BSD-3-Clause |  |
| ee-first | 1.1.1 | MIT |  |
| ejs | 3.1.10 | Apache-2.0 | https://github.com/mde/ejs |
| electron | 44.9.1 | MIT |  |
| electron-builder | 26.18.0 | MIT | https://github.com/electron-userland/electron-builder |
| electron-builder-squirrel-windows | 26.18.0 | MIT | https://github.com/electron-userland/electron-builder |
| electron-publish | 26.18.0 | MIT | https://github.com/electron-userland/electron-builder |
| electron-to-chromium | 1.5.478 | ISC |  |
| electron-vite | 6.0.0 | MIT | https://electron-vite.org |
| electron-winstaller | 5.4.0 | MIT |  |
| emoji-regex | 8.0.0 | MIT | https://mths.be/emoji-regex |
| encodeurl | 2.0.1 | MIT |  |
| end-of-stream | 1.4.5 | MIT | https://github.com/mafintosh/end-of-stream |
| entities | 9.0.0 | BSD-2-Clause |  |
| env-paths | 2.2.1 | MIT |  |
| env-paths | 3.0.0 | MIT |  |
| err-code | 2.0.3 | MIT |  |
| es-define-property | 1.0.1 | MIT | https://github.com/ljharb/es-define-property#readme |
| es-errors | 1.3.0 | MIT | https://github.com/ljharb/es-errors#readme |
| es-module-lexer | 1.7.0 | MIT | https://github.com/guybedford/es-module-lexer#readme |
| es-object-atoms | 1.1.2 | MIT | https://github.com/ljharb/es-object-atoms#readme |
| es-set-tostringtag | 2.1.0 | MIT | https://github.com/es-shims/es-set-tostringtag#readme |
| es6-error | 4.1.1 | MIT | https://github.com/bjyoungblood/es6-error |
| esbuild | 0.28.2 | MIT |  |
| escalade | 3.2.0 | MIT |  |
| escape-html | 1.0.3 | MIT |  |
| escape-string-regexp | 4.0.0 | MIT |  |
| escape-string-regexp | 5.0.0 | MIT |  |
| estree-util-is-identifier-name | 3.0.0 | MIT |  |
| estree-walker | 3.0.3 | MIT |  |
| etag | 1.8.1 | MIT |  |
| eventsource | 3.0.7 | MIT | https://github.com/EventSource/eventsource#readme |
| eventsource-parser | 3.1.1 | MIT | https://github.com/rexxars/eventsource-parser#readme |
| expect-type | 1.4.0 | Apache-2.0 | https://github.com/mmkal/expect-type#readme |
| exponential-backoff | 3.1.3 | Apache-2.0 | https://github.com/coveooss/exponential-backoff#readme |
| express | 5.3.0 | MIT | https://expressjs.com/ |
| express-rate-limit | 8.7.3 | MIT | https://github.com/express-rate-limit/express-rate-limit |
| extend | 3.0.2 | MIT |  |
| fast-deep-equal | 3.1.3 | MIT | https://github.com/epoberezkin/fast-deep-equal#readme |
| fast-uri | 3.1.9 | BSD-3-Clause | https://github.com/fastify/fast-uri |
| fd-package-json | 2.0.0 | MIT | https://github.com/es-tooling/fd-package-json#readme |
| fdir | 6.5.0 | MIT | https://github.com/thecodrr/fdir#readme |
| fflate | 0.8.3 | MIT | https://101arrowz.github.io/fflate |
| filelist | 1.0.6 | Apache-2.0 | https://github.com/mde/filelist |
| finalhandler | 2.1.1 | MIT |  |
| form-data | 4.0.6 | MIT |  |
| formatly | 0.11.4 | MIT |  |
| forwarded | 0.2.0 | MIT |  |
| fresh | 2.0.0 | MIT |  |
| fs-extra | 10.1.0 | MIT | https://github.com/jprichardson/node-fs-extra |
| fs-extra | 11.3.1 | MIT | https://github.com/jprichardson/node-fs-extra |
| fs-extra | 11.4.1 | MIT | https://github.com/jprichardson/node-fs-extra |
| fs-extra | 7.0.1 | MIT | https://github.com/jprichardson/node-fs-extra |
| fs-extra | 8.1.0 | MIT | https://github.com/jprichardson/node-fs-extra |
| fs-extra | 9.1.0 | MIT | https://github.com/jprichardson/node-fs-extra |
| fs.realpath | 1.0.0 | ISC |  |
| function-bind | 1.1.2 | MIT | https://github.com/Raynos/function-bind |
| gensync | 1.0.0-beta.2 | MIT | https://github.com/loganfsmyth/gensync |
| get-caller-file | 2.0.5 | ISC | https://github.com/stefanpenner/get-caller-file#readme |
| get-intrinsic | 1.3.0 | MIT | https://github.com/ljharb/get-intrinsic#readme |
| get-nonce | 1.0.1 | MIT | https://github.com/theKashey/get-nonce |
| get-proto | 1.0.1 | MIT | https://github.com/ljharb/get-proto#readme |
| get-stream | 5.2.0 | MIT |  |
| get-tsconfig | 4.14.3 | MIT |  |
| glob | 7.2.3 | ISC |  |
| global-agent | 3.0.0 | BSD-3-Clause |  |
| globalthis | 1.0.4 | MIT |  |
| gopd | 1.2.0 | MIT | https://github.com/ljharb/gopd#readme |
| got | 11.8.6 | MIT |  |
| graceful-fs | 4.2.11 | ISC |  |
| hachure-fill | 0.5.2 | MIT | https://github.com/pshihn/hachure-fill#readme |
| has-flag | 4.0.0 | MIT |  |
| has-property-descriptors | 1.0.2 | MIT | https://github.com/inspect-js/has-property-descriptors#readme |
| has-symbols | 1.1.0 | MIT | https://github.com/ljharb/has-symbols#readme |
| has-tostringtag | 1.0.2 | MIT | https://github.com/inspect-js/has-tostringtag#readme |
| hasown | 2.0.4 | MIT | https://github.com/inspect-js/hasOwn#readme |
| hast-util-from-dom | 5.0.1 | ISC |  |
| hast-util-from-html | 2.1.0 | MIT |  |
| hast-util-from-html-isomorphic | 2.0.0 | MIT |  |
| hast-util-from-parse5 | 8.0.4 | MIT |  |
| hast-util-parse-selector | 4.0.0 | MIT |  |
| hast-util-sanitize | 5.0.2 | MIT |  |
| hast-util-to-jsx-runtime | 2.3.7 | MIT |  |
| hast-util-to-text | 4.0.3 | MIT |  |
| hast-util-whitespace | 3.0.0 | MIT |  |
| hastscript | 9.0.3 | MIT |  |
| hono | 4.13.17 | MIT | https://hono.dev |
| hosted-git-info | 4.1.0 | ISC | https://github.com/npm/hosted-git-info |
| html-encoding-sniffer | 7.0.0 | MIT |  |
| html-url-attributes | 3.0.1 | MIT |  |
| http-cache-semantics | 4.3.0 | BSD-2-Clause |  |
| http-errors | 2.0.1 | MIT |  |
| http-proxy-agent | 7.0.2 | MIT |  |
| http2-wrapper | 1.0.3 | MIT | https://github.com/szmarczak/http2-wrapper#readme |
| https-proxy-agent | 7.0.6 | MIT |  |
| iconv-lite | 0.6.3 | MIT | https://github.com/ashtuchkin/iconv-lite |
| iconv-lite | 0.7.3 | MIT | https://github.com/pillarjs/iconv-lite |
| import-meta-resolve | 4.2.0 | MIT |  |
| inflight | 1.0.6 | ISC | https://github.com/isaacs/inflight |
| inherits | 2.0.4 | ISC |  |
| inline-style-parser | 0.2.9 | MIT |  |
| internmap | 1.0.1 | ISC | https://github.com/mbostock/internmap/ |
| internmap | 2.0.3 | ISC | https://github.com/mbostock/internmap/ |
| ip-address | 10.7.6 | MIT |  |
| ipaddr.js | 1.9.1 | MIT |  |
| is-alphabetical | 2.0.1 | MIT |  |
| is-alphanumerical | 2.0.1 | MIT |  |
| is-decimal | 2.0.1 | MIT |  |
| is-extglob | 2.1.1 | MIT | https://github.com/jonschlinkert/is-extglob |
| is-fullwidth-code-point | 3.0.0 | MIT |  |
| is-glob | 4.0.3 | MIT | https://github.com/micromatch/is-glob |
| is-hexadecimal | 2.0.1 | MIT |  |
| is-plain-obj | 4.1.0 | MIT |  |
| is-potential-custom-element-name | 1.0.1 | MIT | https://github.com/mathiasbynens/is-potential-custom-element-name |
| is-promise | 4.0.0 | MIT |  |
| isarray | 1.0.0 | MIT | https://github.com/juliangruber/isarray |
| isbinaryfile | 4.0.10 | MIT |  |
| isbinaryfile | 5.0.7 | MIT |  |
| isexe | 2.0.0 | ISC | https://github.com/isaacs/isexe#readme |
| isexe | 3.1.5 | BlueOak-1.0.0 |  |
| isexe | 4.0.0 | BlueOak-1.0.0 |  |
| jake | 10.9.4 | Apache-2.0 |  |
| jiti | 2.7.0 | MIT |  |
| jose | 6.2.16 | MIT | https://github.com/panva/jose |
| js-tokens | 4.0.0 | MIT |  |
| js-tokens | 9.0.1 | MIT |  |
| js-yaml | 4.3.2 | MIT |  |
| jsdom | 31.0.0 | MIT |  |
| jsesc | 3.1.0 | MIT | https://mths.be/jsesc |
| json-buffer | 3.0.1 | MIT | https://github.com/dominictarr/json-buffer |
| json-schema-traverse | 1.0.0 | MIT | https://github.com/epoberezkin/json-schema-traverse#readme |
| json-schema-typed | 8.0.2 | BSD-2-Clause | https://github.com/RemyRylan/json-schema-typed/tree/main/dist/node |
| json-stringify-safe | 5.0.1 | ISC | https://github.com/isaacs/json-stringify-safe |
| json5 | 2.2.3 | MIT | http://json5.org/ |
| jsonfile | 4.0.0 | MIT |  |
| jsonfile | 6.2.1 | MIT |  |
| katex | 0.16.22 | MIT | https://katex.org |
| keyv | 4.5.4 | MIT | https://github.com/jaredwray/keyv |
| khroma | 2.1.0 | UNKNOWN |  |
| knip | 6.44.2 | ISC | https://knip.dev |
| langium | 3.3.1 | MIT | https://langium.org |
| layout-base | 1.0.2 | MIT | https://github.com/iVis-at-Bilkent/layout-base#readme |
| layout-base | 2.0.1 | MIT | https://github.com/iVis-at-Bilkent/layout-base#readme |
| lazy-val | 1.0.5 | MIT | https://github.com/develar/lazy-val |
| lightningcss | 1.33.0 | MPL-2.0 |  |
| lightningcss-linux-x64-gnu | 1.33.0 | MPL-2.0 |  |
| lodash | 4.18.1 | MIT | https://lodash.com/ |
| lodash-es | 4.17.21 | MIT | https://lodash.com/custom-builds |
| lodash-es | 4.18.1 | MIT | https://lodash.com/custom-builds |
| longest-streak | 3.1.0 | MIT |  |
| loupe | 3.2.1 | MIT | https://github.com/chaijs/loupe |
| lowercase-keys | 2.0.0 | MIT |  |
| lru-cache | 11.5.3 | BlueOak-1.0.0 |  |
| lru-cache | 5.1.1 | ISC |  |
| lru-cache | 6.0.0 | ISC |  |
| lucide-react | 1.70.0 | ISC | https://lucide.dev |
| lz-string | 1.5.0 | MIT | http://pieroxy.net/blog/pages/lz-string/index.html |
| magic-string | 0.30.21 | MIT |  |
| magic-string | 1.4.5 | MIT |  |
| markdown-table | 3.1.0 | MIT |  |
| marked | 16.4.2 | MIT | https://marked.js.org |
| marked | 17.0.5 | MIT | https://marked.js.org |
| matcher | 3.0.0 | MIT |  |
| math-intrinsics | 1.1.0 | MIT | https://github.com/es-shims/math-intrinsics#readme |
| mdast-util-find-and-replace | 3.0.4 | MIT |  |
| mdast-util-from-markdown | 2.1.0 | MIT |  |
| mdast-util-gfm | 3.1.0 | MIT |  |
| mdast-util-gfm-autolink-literal | 2.1.0 | MIT |  |
| mdast-util-gfm-footnote | 2.1.0 | MIT |  |
| mdast-util-gfm-strikethrough | 2.0.1 | MIT |  |
| mdast-util-gfm-table | 2.0.1 | MIT |  |
| mdast-util-gfm-task-list-item | 2.0.1 | MIT |  |
| mdast-util-math | 3.0.0 | MIT |  |
| mdast-util-mdx-expression | 2.0.1 | MIT |  |
| mdast-util-mdx-jsx | 3.2.1 | MIT |  |
| mdast-util-mdxjs-esm | 2.0.1 | MIT |  |
| mdast-util-phrasing | 4.1.0 | MIT |  |
| mdast-util-to-hast | 13.2.1 | MIT |  |
| mdast-util-to-markdown | 2.2.3 | MIT |  |
| mdast-util-to-string | 4.0.0 | MIT |  |
| media-typer | 1.1.1 | MIT |  |
| merge-descriptors | 2.0.0 | MIT |  |
| mermaid | 11.12.2 | MIT |  |
| micromark | 4.0.3 | MIT |  |
| micromark-core-commonmark | 2.0.4 | MIT |  |
| micromark-extension-gfm | 3.0.0 | MIT |  |
| micromark-extension-gfm-autolink-literal | 2.1.0 | MIT |  |
| micromark-extension-gfm-footnote | 2.1.0 | MIT |  |
| micromark-extension-gfm-strikethrough | 2.1.0 | MIT |  |
| micromark-extension-gfm-table | 2.1.2 | MIT |  |
| micromark-extension-gfm-tagfilter | 2.0.0 | MIT |  |
| micromark-extension-gfm-task-list-item | 2.1.0 | MIT |  |
| micromark-extension-math | 3.1.0 | MIT |  |
| micromark-factory-destination | 2.0.1 | MIT |  |
| micromark-factory-label | 2.0.1 | MIT |  |
| micromark-factory-space | 2.1.0 | MIT |  |
| micromark-factory-title | 2.0.1 | MIT |  |
| micromark-factory-whitespace | 2.0.1 | MIT |  |
| micromark-util-character | 2.1.1 | MIT |  |
| micromark-util-chunked | 2.0.1 | MIT |  |
| micromark-util-classify-character | 2.0.1 | MIT |  |
| micromark-util-combine-extensions | 2.0.1 | MIT |  |
| micromark-util-decode-numeric-character-reference | 2.0.2 | MIT |  |
| micromark-util-decode-string | 2.0.1 | MIT |  |
| micromark-util-edit-map | 1.0.0 | MIT |  |
| micromark-util-encode | 2.0.1 | MIT |  |
| micromark-util-html-tag-name | 2.0.1 | MIT |  |
| micromark-util-normalize-identifier | 2.0.1 | MIT |  |
| micromark-util-resolve-all | 2.0.1 | MIT |  |
| micromark-util-sanitize-uri | 2.0.1 | MIT |  |
| micromark-util-subtokenize | 2.1.0 | MIT |  |
| micromark-util-symbol | 2.0.1 | MIT |  |
| micromark-util-types | 2.0.3 | MIT |  |
| mime | 2.6.0 | MIT |  |
| mime-db | 1.52.0 | MIT |  |
| mime-db | 1.54.0 | MIT |  |
| mime-types | 2.1.35 | MIT |  |
| mime-types | 3.0.2 | MIT |  |
| mimic-response | 1.0.1 | MIT |  |
| mimic-response | 3.1.0 | MIT |  |
| minimatch | 10.2.6 | BlueOak-1.0.0 |  |
| minimatch | 3.1.5 | ISC |  |
| minimatch | 5.1.9 | ISC |  |
| minimatch | 9.0.9 | ISC |  |
| minimist | 1.2.8 | MIT | https://github.com/minimistjs/minimist |
| minipass | 7.1.3 | BlueOak-1.0.0 |  |
| minizlib | 3.1.0 | MIT |  |
| mkdirp | 0.5.6 | MIT |  |
| ms | 2.1.3 | MIT |  |
| nan | 2.30.0 | MIT |  |
| nanoid | 3.3.20 | MIT |  |
| negotiator | 1.1.0 | MIT |  |
| node-abi | 4.40.0 | MIT | https://github.com/electron/node-abi#readme |
| node-addon-api | 7.1.1 | MIT | https://github.com/nodejs/node-addon-api |
| node-api-version | 0.2.1 | MIT |  |
| node-diff3 | 3.2.1 | MIT |  |
| node-gyp | 12.4.0 | MIT |  |
| node-int64 | 0.4.0 | MIT |  |
| node-releases | 2.0.63 | MIT |  |
| nopt | 9.0.0 | ISC |  |
| normalize-url | 6.1.0 | MIT |  |
| object-assign | 4.1.1 | MIT |  |
| object-inspect | 1.13.4 | MIT | https://github.com/inspect-js/object-inspect |
| object-keys | 1.1.1 | MIT |  |
| on-finished | 2.4.2 | MIT |  |
| once | 1.4.0 | ISC |  |
| oxc-parser | 0.156.0 | MIT | https://oxc.rs/docs/guide/usage/parser |
| oxc-resolver | 11.24.2 | MIT | https://oxc.rs |
| oxfmt | 0.78.0 | MIT | https://oxc.rs/docs/guide/usage/formatter |
| oxlint | 1.93.0 | MIT | https://oxc.rs/docs/guide/usage/linter |
| p-cancelable | 2.1.1 | MIT |  |
| p-limit | 3.1.0 | MIT |  |
| package-manager-detector | 1.9.0 | MIT | https://github.com/antfu-collective/package-manager-detector#readme |
| parse-entities | 4.0.2 | MIT |  |
| parse5 | 8.1.1 | MIT | https://parse5.js.org |
| parse5-parser-stream | 8.1.1 | MIT | https://parse5.js.org |
| parseurl | 1.3.3 | MIT |  |
| path-data-parser | 0.1.0 | MIT | https://github.com/pshihn/path-data-parser#readme |
| path-is-absolute | 1.0.1 | MIT |  |
| path-key | 3.1.1 | MIT |  |
| path-to-regexp | 8.4.2 | MIT |  |
| pathe | 2.0.3 | MIT |  |
| pathval | 2.0.1 | MIT | https://github.com/chaijs/pathval |
| pe-library | 0.4.1 | MIT | https://github.com/jet2jet/pe-library-js |
| picocolors | 1.1.1 | ISC |  |
| picomatch | 4.0.7 | MIT | https://github.com/micromatch/picomatch |
| pkce-challenge | 5.0.1 | MIT | https://github.com/crouchcd/pkce-challenge#readme |
| pkijs | 3.4.3 | BSD-3-Clause |  |
| playwright | 1.65.0 | Apache-2.0 | https://playwright.dev |
| playwright-core | 1.65.0 | Apache-2.0 | https://playwright.dev |
| plist | 3.1.0 | MIT |  |
| points-on-curve | 0.2.0 | MIT | https://github.com/pshihn/bezier-points#readme |
| points-on-path | 0.2.1 | MIT | https://github.com/pshihn/points-on-path#readme |
| postcss | 8.5.32 | MIT | https://postcss.org/ |
| pretty-format | 27.5.1 | MIT |  |
| proc-log | 6.1.0 | ISC |  |
| process-nextick-args | 2.0.1 | MIT | https://github.com/calvinmetcalf/process-nextick-args |
| progress | 2.0.3 | MIT |  |
| promise-retry | 2.0.1 | MIT |  |
| proper-lockfile | 4.1.2 | MIT | https://github.com/moxystudio/node-proper-lockfile |
| property-information | 7.2.0 | MIT |  |
| proxy-addr | 2.0.8 | MIT |  |
| pump | 3.0.4 | MIT |  |
| punycode | 2.3.1 | MIT | https://mths.be/punycode |
| pvtsutils | 1.3.6 | MIT | https://github.com/PeculiarVentures/pvtsutils#readme |
| pvutils | 1.2.0 | MIT |  |
| qs | 6.17.1 | BSD-3-Clause | https://github.com/ljharb/qs |
| quick-lru | 5.1.1 | MIT |  |
| range-parser | 1.3.0 | MIT |  |
| raw-body | 3.0.2 | MIT |  |
| react | 19.3.1 | MIT | https://react.dev/ |
| react-dom | 19.3.1 | MIT | https://react.dev/ |
| react-is | 17.0.2 | MIT | https://reactjs.org/ |
| react-markdown | 10.1.0 | MIT |  |
| react-remove-scroll | 2.7.2 | MIT |  |
| react-remove-scroll-bar | 2.3.8 | MIT |  |
| react-style-singleton | 2.2.3 | MIT | https://github.com/theKashey/react-style-singleton#readme |
| read-binary-file-arch | 1.0.6 | MIT | https://github.com/samuelmaddock/read-binary-file-arch#readme |
| readable-stream | 2.3.8 | MIT |  |
| rehype-katex | 7.0.1 | MIT |  |
| rehype-sanitize | 6.0.0 | MIT |  |
| remark-gfm | 4.0.1 | MIT |  |
| remark-math | 6.0.0 | MIT |  |
| remark-parse | 11.0.0 | MIT | https://remark.js.org |
| remark-rehype | 11.1.2 | MIT |  |
| remark-stringify | 11.0.0 | MIT | https://remark.js.org |
| require-directory | 2.1.1 | MIT | https://github.com/troygoode/node-require-directory/ |
| require-from-string | 2.0.2 | MIT |  |
| resedit | 1.7.2 | MIT | https://github.com/jet2jet/resedit-js |
| resolve-alpn | 1.2.1 | MIT | https://github.com/szmarczak/resolve-alpn#readme |
| resolve-pkg-maps | 1.0.0 | MIT |  |
| responselike | 2.0.1 | MIT |  |
| retry | 0.12.0 | MIT | https://github.com/tim-kos/node-retry |
| rimraf | 2.6.3 | ISC |  |
| roarr | 2.15.4 | BSD-3-Clause |  |
| robust-predicates | 3.0.3 | Unlicense |  |
| rolldown | 1.2.18 | MIT | https://rolldown.rs/ |
| rollup | 4.68.1 | MIT | https://rollupjs.org/ |
| roughjs | 4.6.6 | MIT | https://roughjs.com |
| router | 2.2.0 | MIT |  |
| rw | 1.3.3 | BSD-3-Clause | https://github.com/mbostock/rw |
| safe-buffer | 5.1.2 | MIT | https://github.com/feross/safe-buffer |
| safer-buffer | 2.1.2 | MIT |  |
| sanitize-filename | 1.6.5 | WTFPL OR ISC |  |
| sax | 1.6.1 | BlueOak-1.0.0 |  |
| saxes | 6.0.0 | ISC |  |
| scheduler | 0.28.0 | MIT | https://react.dev/ |
| semver | 5.7.3 | ISC |  |
| semver | 6.3.2 | ISC |  |
| semver | 7.7.4 | ISC |  |
| semver | 7.8.6 | ISC |  |
| semver-compare | 1.0.0 | MIT | https://github.com/substack/semver-compare |
| send | 1.2.1 | MIT |  |
| serialize-error | 7.0.1 | MIT |  |
| serve-static | 2.2.1 | MIT |  |
| setprototypeof | 1.2.0 | ISC | https://github.com/wesleytodd/setprototypeof |
| shebang-command | 2.0.0 | MIT |  |
| shebang-regex | 3.0.0 | MIT |  |
| side-channel | 1.1.1 | MIT | https://github.com/ljharb/side-channel#readme |
| side-channel-list | 1.0.1 | MIT | https://github.com/ljharb/side-channel-list#readme |
| side-channel-map | 1.0.1 | MIT | https://github.com/ljharb/side-channel-map#readme |
| side-channel-weakmap | 1.0.2 | MIT | https://github.com/ljharb/side-channel-weakmap#readme |
| siginfo | 2.0.0 | ISC | https://github.com/emilbayes/siginfo#readme |
| signal-exit | 3.0.7 | ISC | https://github.com/tapjs/signal-exit |
| signal-exit | 4.1.0 | ISC |  |
| simple-update-notifier | 2.0.0 | MIT | https://github.com/alexbrazier/simple-update-notifier.git |
| smol-toml | 1.9.1 | BSD-3-Clause |  |
| sonner | 2.0.7 | MIT | https://sonner.emilkowal.ski/ |
| source-map | 0.6.1 | BSD-3-Clause | https://github.com/mozilla/source-map |
| source-map-js | 1.2.2 | BSD-3-Clause | https://github.com/7rulnik/source-map-js |
| source-map-support | 0.5.21 | MIT |  |
| space-separated-tokens | 2.0.2 | MIT |  |
| sprintf-js | 1.1.3 | BSD-3-Clause |  |
| ssh2 | 1.17.0 | MIT |  |
| stackback | 0.0.2 | MIT |  |
| stat-mode | 1.0.0 | MIT | https://github.com/TooTallNate/stat-mode |
| statuses | 2.0.2 | MIT |  |
| std-env | 3.10.0 | MIT |  |
| string_decoder | 1.1.1 | MIT | https://github.com/nodejs/string_decoder |
| string-width | 4.2.3 | MIT |  |
| stringify-entities | 4.0.4 | MIT |  |
| strip-ansi | 6.0.1 | MIT |  |
| strip-json-comments | 5.0.3 | MIT |  |
| strip-literal | 3.1.0 | MIT | https://github.com/antfu/strip-literal#readme |
| style-mod | 4.1.4 | MIT | https://code.haverbeke.berlin/marijn/style-mod |
| style-to-object | 2.0.2 | MIT |  |
| stylis | 4.4.0 | MIT | https://github.com/thysultan/stylis.js |
| sumchecker | 3.0.1 | Apache-2.0 | https://github.com/malept/sumchecker#readme |
| supports-color | 7.2.0 | MIT |  |
| tar | 7.5.22 | BlueOak-1.0.0 |  |
| temp | 0.9.4 | MIT |  |
| temp-file | 3.4.0 | MIT | https://github.com/develar/temp-file |
| tiny-async-pool | 1.3.0 | MIT |  |
| tinybench | 2.9.0 | MIT |  |
| tinyexec | 0.3.2 | MIT | https://github.com/tinylibs/tinyexec#readme |
| tinyexec | 1.3.1 | MIT | https://github.com/tinylibs/tinyexec#readme |
| tinyglobby | 0.2.17 | MIT | https://superchupu.dev/tinyglobby |
| tinypool | 1.1.1 | MIT | https://github.com/tinylibs/tinypool#readme |
| tinypool | 2.2.0 | MIT | https://github.com/tinylibs/tinypool#readme |
| tinyrainbow | 2.0.0 | MIT | https://github.com/tinylibs/tinyrainbow#readme |
| tinyspy | 4.0.6 | MIT | https://github.com/tinylibs/tinyspy#readme |
| tldts | 7.4.19 | MIT | https://github.com/remusao/tldts#readme |
| tldts-core | 7.4.20 | MIT | https://github.com/remusao/tldts#readme |
| tmp | 0.2.7 | MIT | http://github.com/raszi/node-tmp |
| tmp-promise | 3.0.3 | MIT |  |
| toidentifier | 1.0.1 | MIT |  |
| tough-cookie | 6.1.0 | BSD-3-Clause | https://github.com/salesforce/tough-cookie |
| tr46 | 7.0.0 | MIT |  |
| trim-lines | 3.0.1 | MIT |  |
| trough | 2.2.0 | MIT |  |
| truncate-utf8-bytes | 1.0.2 | WTFPL | https://github.com/parshap/truncate-utf8-bytes#readme |
| ts-dedent | 2.3.0 | MIT |  |
| tslib | 2.9.1 | 0BSD | https://www.typescriptlang.org/ |
| tsx | 4.23.15 | MIT | https://tsx.hirok.io |
| tweetnacl | 0.14.5 | Unlicense | https://tweetnacl.js.org |
| type-fest | 0.13.1 | (MIT OR CC0-1.0) |  |
| type-is | 2.1.0 | MIT |  |
| typescript | 5.9.3 | Apache-2.0 | https://www.typescriptlang.org/ |
| unbash | 6.0.4 | ISC |  |
| undici | 6.29.1 | MIT | https://undici.nodejs.org |
| undici | 7.30.2 | MIT | https://undici.nodejs.org |
| undici | 8.12.4 | MIT | https://undici.nodejs.org |
| undici-types | 5.26.5 | MIT | https://undici.nodejs.org |
| undici-types | 7.24.6 | MIT | https://undici.nodejs.org |
| unified | 11.0.5 | MIT | https://unifiedjs.com |
| unist-util-is | 6.0.1 | MIT |  |
| unist-util-position | 5.0.0 | MIT |  |
| unist-util-remove-position | 5.0.0 | MIT |  |
| unist-util-stringify-position | 4.0.0 | MIT |  |
| unist-util-visit | 5.2.0 | MIT |  |
| unist-util-visit-parents | 6.1.0 | MIT |  |
| universalify | 0.1.2 | MIT | https://github.com/RyanZim/universalify#readme |
| universalify | 2.0.1 | MIT | https://github.com/RyanZim/universalify#readme |
| unpipe | 1.0.0 | MIT |  |
| unzipper | 0.12.5 | MIT |  |
| update-browserslist-db | 1.3.4 | MIT |  |
| use-callback-ref | 1.3.3 | MIT |  |
| use-sidecar | 1.1.3 | MIT | https://github.com/theKashey/use-sidecar |
| utf8-byte-length | 1.0.5 | (WTFPL OR MIT) | https://github.com/parshap/utf8-byte-length#readme |
| util-deprecate | 1.0.2 | MIT | https://github.com/TooTallNate/util-deprecate |
| uuid | 11.1.1 | MIT |  |
| vary | 1.1.2 | MIT |  |
| vfile | 6.0.3 | MIT |  |
| vfile-location | 5.0.4 | MIT |  |
| vfile-message | 4.0.4 | MIT |  |
| vite | 7.3.8 | MIT | https://vite.dev |
| vite | 8.3.7 | MIT | https://vite.dev |
| vite-node | 3.2.4 | MIT | https://github.com/vitest-dev/vitest/blob/main/packages/vite-node#readme |
| vitest | 3.2.7 | MIT | https://github.com/vitest-dev/vitest#readme |
| vscode-jsonrpc | 8.2.0 | MIT |  |
| vscode-languageserver | 9.0.1 | MIT |  |
| vscode-languageserver-protocol | 3.17.5 | MIT |  |
| vscode-languageserver-textdocument | 1.0.16 | MIT | https://github.com/microsoft/vscode-languageserver-node/tree/main/textDocument |
| vscode-languageserver-types | 3.17.5 | MIT |  |
| vscode-uri | 3.0.8 | MIT | https://github.com/microsoft/vscode-uri#readme |
| w3c-keyname | 2.2.8 | MIT | https://github.com/marijnh/w3c-keyname#readme |
| w3c-xmlserializer | 6.0.0 | MIT |  |
| walk-up-path | 4.0.0 | ISC |  |
| web-namespaces | 2.0.1 | MIT |  |
| webcrypto-core | 1.9.2 | MIT | https://github.com/PeculiarVentures/webcrypto-core#readme |
| webidl-conversions | 8.0.1 | BSD-2-Clause |  |
| whatwg-mimetype | 5.0.0 | MIT |  |
| whatwg-url | 17.3.0 | MIT |  |
| which | 2.0.2 | ISC |  |
| which | 5.0.0 | ISC |  |
| which | 6.0.1 | ISC |  |
| why-is-node-running | 2.3.0 | MIT | https://github.com/mafintosh/why-is-node-running |
| wrap-ansi | 7.0.0 | MIT |  |
| wrappy | 1.0.2 | ISC | https://github.com/npm/wrappy |
| write-file-atomic | 8.0.0 | ISC | https://github.com/npm/write-file-atomic |
| ws | 8.22.2 | MIT | https://github.com/websockets/ws |
| xml-name-validator | 5.0.0 | Apache-2.0 |  |
| xmlbuilder | 15.1.1 | MIT | http://github.com/oozcitak/xmlbuilder-js |
| xmlchars | 2.2.0 | MIT |  |
| y18n | 5.0.8 | ISC | https://github.com/yargs/y18n |
| yallist | 3.1.1 | ISC |  |
| yallist | 4.0.0 | ISC |  |
| yallist | 5.0.0 | BlueOak-1.0.0 |  |
| yaml | 2.9.1 | ISC | https://eemeli.org/yaml/ |
| yargs | 17.7.3 | MIT | https://yargs.js.org/ |
| yargs-parser | 21.1.1 | ISC |  |
| yocto-queue | 0.1.0 | MIT |  |
| zod | 4.6.7 | MIT | https://zod.dev |
| zod-to-json-schema | 3.25.2 | ISC |  |
| zustand | 5.1.0 | MIT | https://github.com/pmndrs/zustand |
| zwitch | 2.0.4 | MIT |  |
