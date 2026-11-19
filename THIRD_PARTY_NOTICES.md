# 第三方声明

HUHU Workbench 以 GPL-3.0-or-later 发布（见 LICENSE）。以下是随应用分发的第三方组件及其许可证；本文件由 `scripts/gen-notices.mjs` 生成，请勿手工编辑。

## 随包二进制与运行时

- Electron / Chromium：见应用目录中的 `LICENSE.electron.txt` 与 `LICENSES.chromium.html`。
- Herdr Core（`herdr-core`）：Apache-2.0，官方发布包 https://releases.herdr.dev/core/（版本与 SHA-256 见 `scripts/herdr.lock.json`），源码 https://github.com/herdrdev/herdr-core；其内含 ghostty（MIT）；Windows 包另含 Microsoft ConPTY（MIT）。完整声明随包放在 `resources/herdr/<平台>/THIRD-PARTY-NOTICES`。

## 随包字体

应用随包带有以下字体（均为 SIL Open Font License 1.1，经 Fontsource 的 npm 包分发，只取 latin 与 latin-ext 子集；中文使用系统字体，不随包）。HUHU 横版 logo 的字标是 Geist 字形的轮廓化图形。

| 字族 | 版权 | npm 包 |
| --- | --- | --- |
| Inter | Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter) | @fontsource-variable/inter@5.2.8 |
| Newsreader | Copyright 2020 The Newsreader Project Authors (http://github.com/productiontype/Newsreader) | @fontsource-variable/newsreader@5.3.0 |
| Geist | Copyright 2024 The Geist Project Authors (https://github.com/vercel/geist-font) | @fontsource-variable/geist@5.3.0 |
| Geist Mono | Copyright 2024 The Geist Project Authors (https://github.com/vercel/geist-font.git) | @fontsource-variable/geist-mono@5.3.0 |
| JetBrains Mono | Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono) | @fontsource-variable/jetbrains-mono@5.2.8 |

```text
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

## 复制或改造的源码（`docs/upstream/ledger.md`）

# 复制来源台账

| 编号 | 来源 | 提交 | 目标路径 | 说明 |
| --- | --- | --- | --- | --- |
| R-05 | DSH fcc0ad4 | vendor/{cordis,cosmokit,timer}/src/* | vendor/{cordis,cosmokit,timer}/src/* | 包名改为 @huhu/*，保留 MIT 许可文件与来源行 |
| R-08 | OK 44a2e0a | packages/server/src/file-watcher.ts | packages/vault/src/watch/ | 仅参照批处理/回退/重命名配对思路，按 HUHU 需求精简重写（模式，未复制代码） |
| R-09 | atomic-editor b6ed65f (kenforthewin, 0.6.2) | src/* | ~~packages/editor/src/vendor/atomic/~~（已删除） | **已退役**（知识库编辑器重构，R-46）：被 OK 编辑器取代，目录、样式 `editor-cm.css`、`atomic-initial-reveal-fade` 动画与“关于”页致谢一并删除；历史记录保留于此 |
| R-24 | open-knowledge 批注锚点 | packages/server/src/comments/anchor.ts、packages/core/src/comments/{passage-match}.ts、markdown/whitespace-char-ref.ts | plugins/notes/src/engine/comments/ | 复制（GPL-3.0-or-later，与本项目许可一致）；类型改为本地 Anchor，删除未使用导出，补 noUncheckedIndexedAccess 守卫 |
| R-40 | orca 7041ea0（Lovecast Inc.，MIT） | src/shared/agent-launch/catalog/tui-agent-config.ts、permissions/tui-agent-permissions.ts、agent-session/options/agent-session-option-catalog-claude-codex.ts、node-cli-command-resolution.ts、agent-launch/choices/agent-choice-cli-apply.ts | plugins/agent-cli/src/shared/catalog.ts、plugins/agent-cli/src/engine/{detect,launch}.ts | 智能体目录的检测命令、完全访问参数、模型 / effort / fast 的 CLI 映射、冲突标志表、安装目录表、启动参数合成顺序；按 HUHU 的三个智能体与数据驱动目录改写，并与本机 claude 2.1.323、codex 0.167.2 的 `--help` 核对 |
| R-41 | orca 7041ea0（Lovecast Inc.，MIT） | src/renderer/src/components/status-bar/icons.tsx（ClaudeIcon、OpenAIIcon）、components/agent/icons/agent-icon-glyphs.tsx（PiIcon） | plugins/agent-cli/src/ui/AgentIcon.tsx | 三个智能体的标识图形（仅用于标识对应工具）；改为数据表加首字母兜底 |
| R-42 | orca 7041ea0（Lovecast Inc.，MIT） | src/renderer/src/components/settings/agents/launch/{AgentDetectionCatalog,AgentCatalogRow,AgentLaunchDefaultsEditor}.tsx、tab-bar/{TabBarCreateEntry,QuickLaunchButton}.tsx、agent/AgentLaunchSetupPanel.tsx | plugins/agent-cli/src/ui/{AgentSettingsPage,LaunchMenu}.tsx | 仅复刻交互与结构（“已安装 N 个已检测”、逐条展开编辑、命令行预览；新建菜单的搜索、新终端、智能体行与子菜单、设置入口），按 HUHU 的组件与中文文案重写，未复制源码 |
| R-43 | orca 7041ea0（Lovecast Inc.，MIT） | src/renderer/src/components/editor/{pdf-viewer-session,pdf-document-loader,pdf-view-position,pdf-scale-preference,pdf-scale-preference-storage,pdf-js-document-options,pdf-orca-media-range-transport,image-viewer-zoom}.ts、lib/scroll-cache.ts（部分） | plugins/notes/src/vendor/orca/pdf/ | 复制并改造（范围传输改为注入的读取器 → `vault.readRange`；i18n 与存储键适配）；保留 MIT 许可文件与 `UPSTREAM.md` / `PATCHES.md`；PdfViewer / PdfFind 外壳按 Huhu 组件重写（未复制） |
| R-44 | orca 7041ea0（Lovecast Inc.，MIT） | config/patches/pdfjs-dist@6.3.289.patch、config/build-plugins/pdfjs-viewer-assets.ts | patches/pdfjs-dist@6.3.289.patch、apps/desktop/scripts/pdfjs-viewer-assets.ts | 复制：PDF.js 局部渲染补丁；cmaps / standard_fonts / wasm 的构建期本地打包与开发服务器中间件（pdfjs-dist 根改为从 plugins/notes 解析） |
| R-45 | orca 7041ea0（Lovecast Inc.，MIT） | src/main/browser/document-preview/doc-preview-protocol.ts（CSP 与协议处理思路） | apps/desktop/src/main/preview-{protocol,session}.ts | 仅借鉴“独立协议 + 严格 CSP + 路径守卫”的思路，按 Vault 路径模型与 sandbox iframe 方案自行实现（模式，未复制代码） |
| R-46 | open-knowledge 44a2e0a（Inkeep，GPL-3.0-or-later） | packages/core/src/{extensions,markdown,bridge,registry,frontmatter,comments,schemas,…}、packages/app/src/{editor,lib,components(ui、属性面板),hooks,locales,globals.css,…}（import 闭包 931 文件，清单 `.agents/dev/changes/2026-11-14-knowledge-ok-parity/evidence/closure-manifest.json`） | packages/editor/src/vendor/open-knowledge/{core,app}/ | 复制（与本项目同为 GPL-3.0-or-later）：Tiptap / Yjs 编辑器内核、Markdown 管线、属性面板、编辑器渲染优化（editor-cache、display-lock、块级 content-visibility 等）。**补丁逐文件登记**在 `packages/editor/src/vendor/open-knowledge/PATCHES.md`，`scripts/ok-patches.mjs --check` 校验；来源与冻结说明 `UPSTREAM.md`；许可证 `LICENSE`（取自上游 `HEAD:LICENSE`） |
| R-47 | open-knowledge 44a2e0a | packages/app/src/comments/*（评论面板、线程卡、边距轨、选区入口、锚点装饰与分层、store） | packages/editor/src/vendor/open-knowledge/app/src/comments/；适配层 plugins/notes/src/ui/comments/ | 复制 + 适配：`comments-client` 换成适配 Huhu `comments.*`；AI 派发 / 队列 / 发送栏不接（decisions OP-D19 / Q2）；补丁 P-S4-xx |
| R-48 | open-knowledge 44a2e0a | packages/app/src/components/{FileTree,file-tree-*,use-file-tree-listing,OkFileTree,FileTargetMenuItems,…}.tsx，依赖 `@pierre/trees@1.0.0-beta.4`（精确锁定） | packages/editor/src/vendor/open-knowledge/app/src/components/；适配层 packages/editor/src/host/{explorer.tsx,routes/files.ts} | 复制 + 适配：数据源 `vault.list`，隐藏改写 `hiddenPaths`（不写 `.okignore`），去掉 Open with AI / 模板导入；补丁 P-S5-01～05 |
| R-49 | open-knowledge 44a2e0a | packages/server/src/{server-observers,map-driven-splice,bridge-watchdog,bridge-quiescence,pre-drain-discriminator,bridge-intake,bridge-loss-detector,cc1-broadcast,doc-extensions,agent-activity,md-manager}.ts | packages/editor/src/vendor/open-knowledge/server-bridge/ | 复制：OK 把“编辑树 ↔ 源文本”的跨 CRDT 桥放在服务端；本地宿主把它搬到渲染进程原样运行（`LocalDocProvider`，无 Hocuspocus） |
| R-50 | open-knowledge 44a2e0a | packages/{core,app}/src 中与闭包同目录的 `*.test.*`、助手与 fixtures（167 原样 + 1 适配，另 70 个因被测模块不在闭包而不迁入） | packages/editor/src/vendor/open-knowledge/ 同路径；`pnpm test:vendor` | 复制：结果与三分类见 `evidence/vendor-test-results.md`，原样基线 `evidence/tests-manifest.json` |
| R-51 | open-knowledge 44a2e0a | patches/*.patch（9 条：@handlewithcare/remark-prosemirror、@lingui/core、@pierre/trees、@radix-ui/react-tooltip、@tiptap/extension-drag-handle、@tiptap/y-tiptap、cmdk、react-medium-image-zoom、y-indexeddb） | patches/ 与 pnpm-workspace.yaml 的 patchedDependencies | 原样复制；另 `pdfjs-dist@6.3.289` 补丁见 R-44 |
| R-52 | open-knowledge 44a2e0a | pnpm-lock.yaml 的解析版本 | pnpm-workspace.yaml 的 overrides（tiptap / ProseMirror / mdast / hast 等） | 版本对齐（行为基线）：浮动到更新的传递依赖会改变编辑器行为（例：mdast-util-gfm-task-list-item 2.0.1 把任务项序列化成 `- [ ] [ ] x`）；登记见 PATCHES.md P-D-01 |
| R-53 | prosemirror-view 1.41.8（MIT），参照 [1.42.9 聚焦修复](https://code.haverbeke.berlin/prosemirror/prosemirror-view/commit/2978d100a6c6f94bf59a97cbe88f53d3bcaf6f9d) 与 [1.43.0](https://www.npmjs.com/package/prosemirror-view/v/1.43.0) | `src/input.ts`、`dist/index.js`、`dist/index.cjs` | `patches/prosemirror-view@1.41.8.patch`，由 `pnpm-workspace.yaml` 登记 | B06 聚焦竞态。保留聚焦后形成的扩选。可编辑视图中，本次聚焦后的原生导航使折叠光标移动时，先让 DOM 观察器读取光标。无该导航时沿用原有恢复，组合输入期间不提前读取。升级依赖时复跑 `editor-selection-focus.spec.ts` 核对补丁能否移除。 |

## 黄金往返测试夹具

- Open Knowledge 固定在 `44a2e0a`（Inkeep，GPL-3.0-or-later）。`packages/editor/test/golden-roundtrip.test.ts` 直接从对应的 vendor 目录 `packages/editor/src/vendor/open-knowledge/core/src/markdown/fixtures/` 读取，目录映射到上游 `packages/core/src/markdown/fixtures/`。该目录有 10 个 Markdown 数据文件、6 个 JSON 数据文件、4 个 `.gitkeep` 和 2 个 TypeScript 管理文件。6 个 JSON 文件按 `markdown`、`input`、`source`、`blockForm`、`inlineForm` 展开共 109 个 Markdown 样本。数据文件与原测试副本逐字节一致。原项目许可证保留在 vendor 的 `LICENSE`。
- Huhu 的三份文本样本位于 `packages/editor/test/fixtures/golden/huhu/`。加密 PDF 是 Huhu 本地合成的测试夹具，位于 `tests/fixtures/password-protected.pdf`。使用本地单页 PDF 作输入，执行 `gs -q -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dEncryptionR=3 -dKeyLength=128 -sOwnerPassword=owner-fixture -sUserPassword=reader-fixture -sOutputFile=tests/fixtures/password-protected.pdf input.pdf`。

## npm 运行时依赖

| 包 | 版本 | 许可证 | 主页 |
| --- | --- | --- | --- |
| @agentclientprotocol/sdk | 1.2.1 | Apache-2.0 | https://github.com/agentclientprotocol/typescript-sdk#readme |
| @antfu/install-pkg | 2.1.0 | MIT | https://github.com/antfu-collective/install-pkg#readme |
| @babel/code-frame | 7.29.7 | MIT | https://babel.dev/docs/en/next/babel-code-frame |
| @babel/compat-data | 7.29.7 | MIT |  |
| @babel/core | 7.29.13 | MIT | https://babel.dev/docs/en/next/babel-core |
| @babel/generator | 7.29.13 | MIT | https://babel.dev/docs/en/next/babel-generator |
| @babel/generator | 7.29.14 | MIT | https://babel.dev/docs/en/next/babel-generator |
| @babel/helper-annotate-as-pure | 7.29.7 | MIT | https://babel.dev/docs/en/next/babel-helper-annotate-as-pure |
| @babel/helper-compilation-targets | 7.29.13 | MIT |  |
| @babel/helper-create-class-features-plugin | 7.29.13 | MIT |  |
| @babel/helper-globals | 7.29.7 | MIT |  |
| @babel/helper-member-expression-to-functions | 7.29.14 | MIT | https://babel.dev/docs/en/next/babel-helper-member-expression-to-functions |
| @babel/helper-module-imports | 7.29.7 | MIT | https://babel.dev/docs/en/next/babel-helper-module-imports |
| @babel/helper-module-transforms | 7.29.13 | MIT | https://babel.dev/docs/en/next/babel-helper-module-transforms |
| @babel/helper-module-transforms | 7.29.14 | MIT | https://babel.dev/docs/en/next/babel-helper-module-transforms |
| @babel/helper-optimise-call-expression | 7.29.7 | MIT | https://babel.dev/docs/en/next/babel-helper-optimise-call-expression |
| @babel/helper-plugin-utils | 7.29.7 | MIT | https://babel.dev/docs/en/next/babel-helper-plugin-utils |
| @babel/helper-replace-supers | 7.29.7 | MIT | https://babel.dev/docs/en/next/babel-helper-replace-supers |
| @babel/helper-skip-transparent-expression-wrappers | 7.29.13 | MIT |  |
| @babel/helper-string-parser | 7.29.13 | MIT | https://babel.dev/docs/en/next/babel-helper-string-parser |
| @babel/helper-string-parser | 7.29.14 | MIT | https://babel.dev/docs/en/next/babel-helper-string-parser |
| @babel/helper-validator-identifier | 7.29.7 | MIT |  |
| @babel/helper-validator-option | 7.29.7 | MIT |  |
| @babel/helpers | 7.29.13 | MIT | https://babel.dev/docs/en/next/babel-helpers |
| @babel/parser | 7.29.13 | MIT | https://babel.dev/docs/en/next/babel-parser |
| @babel/parser | 7.29.14 | MIT | https://babel.dev/docs/en/next/babel-parser |
| @babel/plugin-syntax-jsx | 7.29.7 | MIT | https://babel.dev/docs/en/next/babel-plugin-syntax-jsx |
| @babel/plugin-syntax-typescript | 7.29.7 | MIT | https://babel.dev/docs/en/next/babel-plugin-syntax-typescript |
| @babel/plugin-transform-arrow-functions | 7.29.7 | MIT | https://babel.dev/docs/en/next/babel-plugin-transform-arrow-functions |
| @babel/plugin-transform-modules-commonjs | 7.29.14 | MIT | https://babel.dev/docs/en/next/babel-plugin-transform-modules-commonjs |
| @babel/plugin-transform-typescript | 7.29.9 | MIT | https://babel.dev/docs/en/next/babel-plugin-transform-typescript |
| @babel/preset-typescript | 7.29.7 | MIT | https://babel.dev/docs/en/next/babel-preset-typescript |
| @babel/runtime | 7.29.13 | MIT | https://babel.dev/docs/en/next/babel-runtime |
| @babel/template | 7.29.7 | MIT | https://babel.dev/docs/en/next/babel-template |
| @babel/traverse | 7.29.13 | MIT | https://babel.dev/docs/en/next/babel-traverse |
| @babel/traverse | 7.29.14 | MIT | https://babel.dev/docs/en/next/babel-traverse |
| @babel/types | 7.29.11 | MIT | https://babel.dev/docs/en/next/babel-types |
| @babel/types | 7.29.14 | MIT | https://babel.dev/docs/en/next/babel-types |
| @braintree/sanitize-url | 6.0.2 | MIT | https://github.com/braintree/sanitize-url#readme |
| @braintree/sanitize-url | 7.1.2 | MIT | https://github.com/braintree/sanitize-url#readme |
| @cacheable/memory | 2.2.0 | MIT |  |
| @cacheable/utils | 2.5.0 | MIT |  |
| @chevrotain/cst-dts-gen | 11.0.3 | Apache-2.0 |  |
| @chevrotain/gast | 11.0.3 | Apache-2.0 |  |
| @chevrotain/regexp-to-ast | 11.0.3 | Apache-2.0 |  |
| @chevrotain/types | 11.0.3 | Apache-2.0 | https://chevrotain.io/documentation/ |
| @chevrotain/utils | 11.0.3 | Apache-2.0 |  |
| @codemirror/autocomplete | 6.20.4 | MIT |  |
| @codemirror/commands | 6.11.1 | MIT |  |
| @codemirror/lang-css | 6.3.1 | MIT |  |
| @codemirror/lang-html | 6.4.11 | MIT |  |
| @codemirror/lang-html | 6.4.12 | MIT |  |
| @codemirror/lang-javascript | 6.2.5 | MIT |  |
| @codemirror/lang-json | 6.0.2 | MIT |  |
| @codemirror/lang-markdown | 6.5.0 | MIT |  |
| @codemirror/lang-python | 6.2.1 | MIT |  |
| @codemirror/lang-rust | 6.0.2 | MIT |  |
| @codemirror/lang-yaml | 6.1.3 | MIT |  |
| @codemirror/language | 6.13.1 | MIT |  |
| @codemirror/legacy-modes | 6.5.3 | MIT |  |
| @codemirror/lint | 6.9.7 | MIT |  |
| @codemirror/lint | 6.9.8 | MIT |  |
| @codemirror/search | 6.7.2 | MIT |  |
| @codemirror/state | 6.7.6 | MIT |  |
| @codemirror/streamparser | 6.0.0 | MIT |  |
| @codemirror/view | 6.43.15 | MIT |  |
| @colors/colors | 1.5.0 | MIT | https://github.com/DABH/colors.js |
| @csstools/css-parser-algorithms | 3.0.5 | MIT | https://github.com/csstools/postcss-plugins/tree/main/packages/css-parser-algorithms#readme |
| @csstools/css-syntax-patches-for-csstree | 1.1.16 | MIT-0 | https://github.com/csstools/postcss-plugins/tree/main/packages/css-syntax-patches-for-csstree#readme |
| @csstools/css-tokenizer | 3.0.4 | MIT | https://github.com/csstools/postcss-plugins/tree/main/packages/css-tokenizer#readme |
| @csstools/media-query-list-parser | 4.0.3 | MIT | https://github.com/csstools/postcss-plugins/tree/main/packages/media-query-list-parser#readme |
| @csstools/selector-specificity | 5.0.0 | MIT-0 | https://github.com/csstools/postcss-plugins/tree/main/packages/selector-specificity#readme |
| @date-fns/tz | 1.5.0 | MIT | https://github.com/date-fns/date-fns#readme |
| @dnd-kit/accessibility | 3.1.1 | MIT |  |
| @dnd-kit/core | 6.3.1 | MIT |  |
| @dnd-kit/sortable | 10.0.0 | MIT |  |
| @dnd-kit/utilities | 3.2.2 | MIT |  |
| @dotenvx/dotenvx | 1.75.1 | BSD-3-Clause | https://github.com/dotenvx/dotenvx |
| @dotenvx/primitives | 0.8.0 | BSD-3-Clause | https://github.com/dotenvx/dotenvx |
| @dual-bundle/import-meta-resolve | 4.2.1 | MIT |  |
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
| @excalidraw/common | 0.18.0-abeeaeb | MIT |  |
| @excalidraw/element | 0.18.0-abeeaeb | MIT |  |
| @excalidraw/excalidraw | 0.18.0-abeeaeb | MIT | https://github.com/excalidraw/excalidraw/tree/master/packages/excalidraw |
| @excalidraw/fractional-indexing | 0.18.0-abeeaeb | CC0-1.0 | https://github.com/rocicorp/fractional-indexing#readme |
| @excalidraw/laser-pointer | 1.3.1 | MIT |  |
| @excalidraw/markdown-to-text | 0.1.2 | MIT | https://github.com/danestves/markdown-to-text.git |
| @excalidraw/math | 0.18.0-abeeaeb | MIT |  |
| @excalidraw/mermaid-to-excalidraw | 2.2.2 | MIT |  |
| @excalidraw/random-username | 1.1.0 | MIT |  |
| @exodus/bytes | 1.16.0 | MIT | https://github.com/ExodusOSS/bytes |
| @floating-ui/core | 1.8.0 | MIT | https://floating-ui.com |
| @floating-ui/dom | 1.8.0 | MIT | https://floating-ui.com |
| @floating-ui/react-dom | 2.1.9 | MIT | https://floating-ui.com/docs/react-dom |
| @floating-ui/utils | 0.2.12 | MIT | https://floating-ui.com |
| @fontsource-variable/geist | 5.3.0 | OFL-1.1 | https://fontsource.org/fonts/geist |
| @fontsource-variable/geist-mono | 5.3.0 | OFL-1.1 | https://fontsource.org/fonts/geist-mono |
| @fontsource-variable/inter | 5.2.8 | OFL-1.1 | https://fontsource.org/fonts/inter |
| @fontsource-variable/inter | 5.3.0 | OFL-1.1 | https://fontsource.org/fonts/inter |
| @fontsource-variable/jetbrains-mono | 5.2.8 | OFL-1.1 | https://fontsource.org/fonts/jetbrains-mono |
| @fontsource-variable/jetbrains-mono | 5.3.0 | OFL-1.1 | https://fontsource.org/fonts/jetbrains-mono |
| @fontsource-variable/newsreader | 5.3.0 | OFL-1.1 | https://fontsource.org/fonts/newsreader |
| @handlewithcare/remark-prosemirror | 0.1.5 | MIT |  |
| @hocuspocus/common | 4.8.0 | MIT | https://hocuspocus.dev |
| @hocuspocus/provider | 4.0.0-rc.1 | MIT | https://hocuspocus.dev |
| @hocuspocus/server | 4.0.0-rc.1 | MIT | https://hocuspocus.dev |
| @hono/node-server | 2.1.6 | MIT | https://github.com/honojs/node-server |
| @iconify/types | 2.0.0 | MIT | https://github.com/iconify/iconify |
| @iconify/utils | 3.1.7 | MIT | https://iconify.design/docs/libraries/utils/ |
| @isaacs/fs-minipass | 4.0.1 | ISC |  |
| @jest/schemas | 29.6.3 | MIT |  |
| @jest/types | 29.6.3 | MIT |  |
| @jridgewell/gen-mapping | 0.3.13 | MIT | https://github.com/jridgewell/sourcemaps/tree/main/packages/gen-mapping |
| @jridgewell/remapping | 2.3.5 | MIT | https://github.com/jridgewell/sourcemaps/tree/main/packages/remapping |
| @jridgewell/resolve-uri | 3.1.2 | MIT |  |
| @jridgewell/sourcemap-codec | 1.6.0 | MIT | https://github.com/jridgewell/sourcemaps/tree/main/packages/sourcemap-codec |
| @jridgewell/trace-mapping | 0.3.31 | MIT | https://github.com/jridgewell/sourcemaps/tree/main/packages/trace-mapping |
| @keyv/bigmap | 1.3.1 | MIT | https://github.com/jaredwray/keyv |
| @keyv/serialize | 1.1.1 | MIT | https://github.com/jaredwray/keyv |
| @lezer/common | 1.5.5 | MIT |  |
| @lezer/css | 1.3.9 | MIT |  |
| @lezer/highlight | 1.2.5 | MIT |  |
| @lezer/html | 1.3.13 | MIT |  |
| @lezer/javascript | 1.5.6 | MIT |  |
| @lezer/json | 1.0.3 | MIT |  |
| @lezer/lr | 1.4.12 | MIT |  |
| @lezer/markdown | 1.8.1 | MIT |  |
| @lezer/python | 1.1.19 | MIT |  |
| @lezer/rust | 1.0.3 | MIT |  |
| @lezer/yaml | 1.0.4 | MIT |  |
| @lifeomic/attempt | 3.1.0 | MIT | https://github.com/lifeomic/attempt#readme |
| @lingui/babel-plugin-extract-messages | 6.12.0 | MIT | https://lingui.dev |
| @lingui/babel-plugin-lingui-macro | 6.12.0 | MIT | https://lingui.dev |
| @lingui/babel-plugin-lingui-macro | 6.5.0 | MIT | https://lingui.dev |
| @lingui/cli | 6.12.0 | MIT | https://lingui.dev |
| @lingui/conf | 6.12.0 | MIT | https://lingui.dev |
| @lingui/conf | 6.5.0 | MIT | https://lingui.dev |
| @lingui/core | 6.12.0 | MIT | https://lingui.dev |
| @lingui/core | 6.5.0 | MIT | https://lingui.dev |
| @lingui/format-po | 6.12.0 | MIT | https://lingui.dev |
| @lingui/message-utils | 6.12.0 | MIT | https://lingui.dev |
| @lingui/message-utils | 6.5.0 | MIT | https://lingui.dev |
| @lingui/native-tools | 0.2.0 | MIT |  |
| @lingui/native-tools-linux-x64-gnu | 0.2.0 | MIT |  |
| @lingui/react | 6.5.0 | MIT | https://lingui.dev |
| @lingui/vite-plugin | 6.12.0 | MIT | https://lingui.dev |
| @malept/cross-spawn-promise | 2.0.0 | Apache-2.0 |  |
| @malept/flatpak-bundler | 0.4.0 | MIT | https://github.com/malept/flatpak-bundler#readme |
| @marijn/find-cluster-break | 1.0.4 | MIT | https://code.haverbeke.berlin/marijn/find-cluster-break |
| @mermaid-js/parser | 0.6.3 | MIT | https://github.com/mermaid-js/mermaid/tree/develop/packages/mermaid/parser/#readme |
| @messageformat/date-skeleton | 1.1.0 | MIT | http://messageformat.github.io/messageformat/api/date-skeleton/ |
| @messageformat/parser | 5.2.0 | MIT | http://messageformat.github.io/messageformat/api/parser/ |
| @modelcontextprotocol/sdk | 1.32.2 | MIT | https://modelcontextprotocol.io |
| @napi-rs/canvas | 1.1.1 | MIT |  |
| @napi-rs/canvas-linux-x64-gnu | 1.1.1 | MIT |  |
| @noble/hashes | 1.8.0 | MIT | https://paulmillr.com/noble/ |
| @noble/hashes | 2.4.0 | MIT | https://paulmillr.com/noble/ |
| @nodelib/fs.scandir | 2.1.5 | MIT |  |
| @nodelib/fs.stat | 2.0.5 | MIT |  |
| @nodelib/fs.walk | 1.2.8 | MIT |  |
| @opentelemetry/api | 1.9.1 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js/tree/main/api |
| @orama/orama | 3.1.18 | Apache-2.0 |  |
| @oxc-parser/binding-linux-x64-gnu | 0.156.0 | MIT | https://oxc.rs/docs/guide/usage/parser |
| @oxc-project/types | 0.156.0 | MIT | https://oxc.rs |
| @oxc-resolver/binding-linux-x64-gnu | 11.24.2 | MIT | https://oxc.rs |
| @oxfmt/binding-linux-x64-gnu | 0.78.0 | MIT | https://oxc.rs/docs/guide/usage/formatter |
| @oxlint/binding-linux-x64-gnu | 1.93.0 | MIT | https://oxc.rs/docs/guide/usage/linter |
| @panzoom/panzoom | 4.6.2 | MIT |  |
| @parcel/watcher | 2.6.0 | MIT |  |
| @parcel/watcher-linux-x64-glibc | 2.6.0 | MIT |  |
| @peculiar/asn1-schema | 2.11.1 | MIT | https://github.com/PeculiarVentures/asn1-schema/tree/master/packages/schema#readme |
| @peculiar/json-schema | 1.1.12 | MIT | https://github.com/PeculiarVentures/json-schema#readme |
| @peculiar/utils | 2.0.3 | MIT | https://github.com/PeculiarVentures/pvtsutils#readme |
| @peculiar/webcrypto | 1.7.2 | MIT | https://github.com/PeculiarVentures/webcrypto#readme |
| @pierre/trees | 1.0.0-beta.4 | Apache-2.0 |  |
| @playwright/test | 1.65.0 | Apache-2.0 | https://playwright.dev |
| @radix-ui/number | 1.1.1 | MIT | https://radix-ui.com/primitives |
| @radix-ui/primitive | 1.1.3 | MIT | https://radix-ui.com/primitives |
| @radix-ui/primitive | 1.1.7 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-accessible-icon | 1.1.7 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-accordion | 1.2.12 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-alert-dialog | 1.1.15 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-arrow | 1.1.15 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-arrow | 1.1.7 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-aspect-ratio | 1.1.7 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-avatar | 1.1.10 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-checkbox | 1.3.3 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-collapsible | 1.1.12 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-collection | 1.1.15 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-collection | 1.1.7 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-compose-refs | 1.1.2 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-compose-refs | 1.1.5 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-context | 1.1.2 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-context | 1.2.2 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-context-menu | 2.2.16 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-dialog | 1.1.15 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-dialog | 1.1.23 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-direction | 1.1.1 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-direction | 1.1.4 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-dismissable-layer | 1.1.11 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-dismissable-layer | 1.1.19 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-dropdown-menu | 2.1.16 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-focus-guards | 1.1.3 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-focus-guards | 1.1.6 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-focus-scope | 1.1.16 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-focus-scope | 1.1.7 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-form | 0.1.8 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-hover-card | 1.1.15 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-id | 1.1.1 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-id | 1.1.4 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-label | 2.1.7 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-menu | 2.1.16 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-menubar | 1.1.16 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-navigation-menu | 1.2.14 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-one-time-password-field | 0.1.8 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-password-toggle-field | 0.1.3 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-popover | 1.1.15 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-popover | 1.1.23 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-popper | 1.2.8 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-popper | 1.3.7 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-portal | 1.1.17 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-portal | 1.1.9 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-presence | 1.1.10 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-presence | 1.1.5 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-primitive | 2.1.10 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-primitive | 2.1.3 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-progress | 1.1.7 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-radio-group | 1.3.8 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-roving-focus | 1.1.11 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-roving-focus | 1.1.19 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-scroll-area | 1.2.10 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-select | 2.2.6 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-separator | 1.1.7 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-slider | 1.3.6 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-slot | 1.2.3 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-slot | 1.3.3 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-switch | 1.2.6 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-switch | 1.3.7 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-tabs | 1.1.13 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-toast | 1.2.15 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-toggle | 1.1.10 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-toggle-group | 1.1.11 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-toolbar | 1.1.11 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-tooltip | 1.2.16 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-tooltip | 1.2.8 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-callback-ref | 1.1.1 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-callback-ref | 1.1.4 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-controllable-state | 1.2.2 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-controllable-state | 1.2.6 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-effect-event | 0.0.2 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-effect-event | 0.0.5 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-escape-keydown | 1.1.1 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-is-hydrated | 0.1.0 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-is-hydrated | 0.1.3 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-layout-effect | 1.1.1 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-layout-effect | 1.1.4 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-previous | 1.1.1 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-rect | 1.1.1 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-rect | 1.1.4 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-size | 1.1.1 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-size | 1.1.4 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-visually-hidden | 1.2.11 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-visually-hidden | 1.2.3 | MIT | https://radix-ui.com/primitives |
| @radix-ui/rect | 1.1.1 | MIT | https://radix-ui.com/primitives |
| @radix-ui/rect | 1.1.3 | MIT | https://radix-ui.com/primitives |
| @rolldown/binding-linux-x64-gnu | 1.2.18 | MIT | https://rolldown.rs/ |
| @rolldown/plugin-babel | 0.2.4 | MIT | https://github.com/rolldown/plugins/tree/main/packages/babel#readme |
| @rolldown/pluginutils | 1.1.0 | MIT | https://github.com/rolldown/plugins/tree/main/packages/pluginutils#readme |
| @rollup/rollup-linux-x64-gnu | 4.68.1 | MIT | https://rollupjs.org/ |
| @sec-ant/readable-stream | 0.4.1 | MIT | https://github.com/Sec-ant/readable-stream |
| @sinclair/typebox | 0.27.12 | MIT |  |
| @sindresorhus/is | 4.6.0 | MIT |  |
| @sindresorhus/merge-streams | 4.0.0 | MIT |  |
| @standard-schema/spec | 1.1.0 | MIT | https://standardschema.dev |
| @swc/counter | 0.1.3 | Apache-2.0 | https://swc.rs |
| @swc/types | 0.1.28 | Apache-2.0 | https://swc.rs |
| @szmarczak/http-timer | 4.0.6 | MIT | https://github.com/szmarczak/http-timer#readme |
| @tabby_ai/hijri-converter | 1.0.5 | MIT |  |
| @tailwindcss/node | 4.3.5 | MIT | https://tailwindcss.com |
| @tailwindcss/oxide | 4.3.5 | MIT |  |
| @tailwindcss/oxide-linux-x64-gnu | 4.3.5 | MIT |  |
| @tailwindcss/oxide-wasm32-wasi | 4.3.5 | MIT |  |
| @tailwindcss/vite | 4.3.5 | MIT | https://tailwindcss.com |
| @tanstack/query-core | 5.101.2 | MIT | https://tanstack.com/query |
| @tanstack/query-core | 5.107.1 | MIT | https://tanstack.com/query |
| @tanstack/react-query | 5.101.2 | MIT | https://tanstack.com/query |
| @tanstack/react-query | 5.107.1 | MIT | https://tanstack.com/query |
| @tanstack/react-table | 8.21.3 | MIT | https://tanstack.com/table |
| @tanstack/react-virtual | 3.13.12 | MIT | https://tanstack.com/virtual |
| @tanstack/table-core | 8.21.3 | MIT | https://tanstack.com/table |
| @tanstack/virtual-core | 3.13.12 | MIT | https://tanstack.com/virtual |
| @testing-library/dom | 10.4.2 | MIT | https://github.com/testing-library/dom-testing-library#readme |
| @testing-library/react | 16.3.3 | MIT | https://github.com/testing-library/react-testing-library#readme |
| @testing-library/user-event | 14.6.12 | MIT | https://github.com/testing-library/user-event#readme |
| @tiptap/core | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-blockquote | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-bold | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-bubble-menu | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-bullet-list | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-code | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-code-block | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-collaboration | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-document | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-drag-handle | 3.22.3 | MIT | https://tiptap.dev/docs/editor/extensions/functionality/drag-handle |
| @tiptap/extension-dropcursor | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-file-handler | 3.22.3 | MIT | https://tiptap.dev/docs/editor/extensions/functionality/filehandler |
| @tiptap/extension-floating-menu | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-gapcursor | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-hard-break | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-heading | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-highlight | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-horizontal-rule | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-image | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-italic | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-link | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-list | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-list-item | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-list-keymap | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-node-range | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-ordered-list | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-paragraph | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-placeholder | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-strike | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-table | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-text | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-text-style | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extension-underline | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/extensions | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/pm | 3.22.4 | MIT | https://tiptap.dev |
| @tiptap/react | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/starter-kit | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/suggestion | 3.22.3 | MIT | https://tiptap.dev |
| @tiptap/y-tiptap | 3.0.3 | MIT |  |
| @ts-morph/common | 0.27.0 | MIT |  |
| @tweenjs/tween.js | 25.0.0 | MIT | https://github.com/tweenjs/tween.js |
| @types/aria-query | 5.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/aria-query |
| @types/cacheable-request | 6.0.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/cacheable-request |
| @types/chai | 5.2.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/chai |
| @types/culori | 4.0.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/culori |
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
| @types/diff-match-patch | 1.0.36 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/diff-match-patch |
| @types/estree | 1.0.10 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/estree |
| @types/estree-jsx | 1.0.5 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/estree-jsx |
| @types/fs-extra | 9.0.13 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/fs-extra |
| @types/geojson | 7946.0.16 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/geojson |
| @types/hast | 3.0.5 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/hast |
| @types/http-cache-semantics | 4.2.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/http-cache-semantics |
| @types/istanbul-lib-coverage | 2.0.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/istanbul-lib-coverage |
| @types/istanbul-lib-report | 3.0.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/istanbul-lib-report |
| @types/istanbul-reports | 3.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/istanbul-reports |
| @types/katex | 0.16.8 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/katex |
| @types/keyv | 3.1.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/keyv |
| @types/mdast | 4.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/mdast |
| @types/ms | 2.1.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/ms |
| @types/node | 18.19.130 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node |
| @types/node | 24.19.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node |
| @types/picomatch | 4.0.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/picomatch |
| @types/prismjs | 1.26.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/prismjs |
| @types/proper-lockfile | 4.1.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/proper-lockfile |
| @types/react | 19.3.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react |
| @types/react-dom | 19.3.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react-dom |
| @types/responselike | 1.0.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/responselike |
| @types/retry | 0.12.5 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/retry |
| @types/ssh2 | 1.15.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/ssh2 |
| @types/trusted-types | 2.0.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/trusted-types |
| @types/unist | 2.0.11 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/unist |
| @types/unist | 3.0.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/unist |
| @types/use-sync-external-store | 0.0.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/use-sync-external-store |
| @types/validate-npm-package-name | 4.0.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/validate-npm-package-name |
| @types/vimeo__player | 2.18.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/vimeo__player |
| @types/write-file-atomic | 4.0.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/write-file-atomic |
| @types/ws | 8.18.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/ws |
| @types/yargs | 17.0.35 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/yargs |
| @types/yargs-parser | 21.0.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/yargs-parser |
| @u-wave/react-vimeo | 0.9.12 | MIT | https://github.com/u-wave/react-vimeo#readme |
| @ungap/structured-clone | 1.4.0 | ISC | https://github.com/ungap/structured-clone#readme |
| @vimeo/player | 2.30.4 | MIT |  |
| @visimer/core | 1.1.3 | MIT | https://github.com/inkeep/visimer#readme |
| @visimer/dom | 1.1.3 | MIT | https://github.com/inkeep/visimer#readme |
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
| accessor-fn | 1.5.3 | MIT | https://github.com/vasturiano/accessor-fn |
| agent-base | 7.1.4 | MIT |  |
| ajv | 8.20.0 | MIT | https://ajv.js.org |
| ajv-formats | 2.1.1 | MIT | https://github.com/ajv-validator/ajv-formats#readme |
| ajv-formats | 3.0.1 | MIT | https://github.com/ajv-validator/ajv-formats#readme |
| ansi-colors | 4.1.3 | MIT | https://github.com/doowb/ansi-colors |
| ansi-regex | 5.0.1 | MIT |  |
| ansi-regex | 6.6.0 | MIT |  |
| ansi-styles | 4.3.0 | MIT |  |
| ansi-styles | 5.2.0 | MIT |  |
| anymatch | 3.1.3 | ISC | https://github.com/micromatch/anymatch |
| app-builder-lib | 26.18.0 | MIT | https://github.com/electron-userland/electron-builder |
| argparse | 2.0.1 | Python-2.0 |  |
| aria-hidden | 1.2.6 | MIT | https://github.com/theKashey/aria-hidden#readme |
| aria-query | 5.3.0 | Apache-2.0 | https://github.com/A11yance/aria-query#readme |
| array-union | 2.1.0 | MIT |  |
| asn1 | 0.2.6 | MIT |  |
| asn1js | 3.1.0 | BSD-3-Clause |  |
| assertion-error | 2.0.1 | MIT |  |
| ast-types | 0.16.3 | MIT | https://github.com/benjamn/ast-types |
| astral-regex | 2.0.0 | MIT |  |
| async | 3.2.6 | MIT | https://caolan.github.io/async/ |
| async-exit-hook | 2.0.1 | MIT |  |
| async-lock | 1.5.0 | MIT | https://github.com/rogierschouten/async-lock |
| async-mutex | 0.5.0 | MIT |  |
| asynckit | 0.4.0 | MIT | https://github.com/alexindigo/asynckit#readme |
| at-least-node | 1.0.0 | ISC | https://github.com/RyanZim/at-least-node#readme |
| atomically | 1.7.0 | MIT |  |
| aws4 | 1.13.2 | MIT |  |
| axe-core | 4.14.0 | MPL-2.0 | https://www.deque.com/axe/ |
| babel-plugin-react-compiler | 1.0.0 | MIT |  |
| bail | 2.0.2 | MIT |  |
| balanced-match | 1.0.2 | MIT | https://github.com/juliangruber/balanced-match |
| balanced-match | 2.0.0 | MIT | https://github.com/juliangruber/balanced-match |
| balanced-match | 4.0.4 | MIT |  |
| base64-js | 1.5.1 | MIT | https://github.com/beatgammit/base64-js |
| baseline-browser-mapping | 2.11.35 | Apache-2.0 |  |
| bcp-47 | 2.1.2 | MIT |  |
| bcp-47-match | 2.0.3 | MIT |  |
| bcrypt-pbkdf | 1.0.2 | BSD-3-Clause |  |
| bezier-js | 6.1.4 | MIT | https://github.com/Pomax/bezierjs |
| binary-extensions | 2.3.0 | MIT |  |
| bluebird | 3.7.2 | MIT | https://github.com/petkaantonov/bluebird |
| body-parser | 2.4.0 | MIT |  |
| boolean | 3.2.0 | MIT |  |
| brace-expansion | 1.1.21 | MIT | https://github.com/juliangruber/brace-expansion |
| brace-expansion | 2.1.7 | MIT | https://github.com/juliangruber/brace-expansion |
| brace-expansion | 5.0.12 | MIT |  |
| braces | 3.0.3 | MIT | https://github.com/micromatch/braces |
| browser-fs-access | 0.38.0 | Apache-2.0 | https://github.com/GoogleChromeLabs/browser-fs-access#readme |
| browserslist | 4.29.5 | MIT |  |
| buffer-from | 1.1.2 | MIT |  |
| buildcheck | 0.0.7 | MIT |  |
| builder-util | 26.16.0 | MIT | https://github.com/electron-userland/electron-builder |
| builder-util-runtime | 9.7.0 | MIT | https://github.com/electron-userland/electron-builder |
| bundle-name | 4.1.1 | MIT |  |
| bytes | 3.1.2 | MIT |  |
| bytestreamjs | 2.0.1 | BSD-3-Clause |  |
| cac | 6.7.14 | MIT |  |
| cac | 7.1.0 | MIT | https://github.com/cacjs/cac#readme |
| cacheable | 2.5.0 | MIT |  |
| cacheable-lookup | 5.0.4 | MIT | https://github.com/szmarczak/cacheable-lookup#readme |
| cacheable-request | 7.0.4 | MIT |  |
| call-bind-apply-helpers | 1.0.2 | MIT | https://github.com/ljharb/call-bind-apply-helpers#readme |
| call-bound | 1.0.4 | MIT | https://github.com/ljharb/call-bound#readme |
| callsites | 3.1.0 | MIT |  |
| camelcase | 6.3.0 | MIT |  |
| caniuse-lite | 1.0.30001823 | CC-BY-4.0 |  |
| canvas-color-tracker | 1.3.2 | MIT | https://github.com/vasturiano/canvas-color-tracker |
| canvas-roundrect-polyfill | 0.0.1 | MIT |  |
| ccount | 2.0.1 | MIT |  |
| chai | 5.3.3 | MIT | http://chaijs.com |
| chalk | 4.1.2 | MIT |  |
| chalk | 5.6.2 | MIT |  |
| character-entities | 2.0.2 | MIT |  |
| character-entities-html4 | 2.1.0 | MIT |  |
| character-entities-legacy | 3.0.0 | MIT |  |
| character-reference-invalid | 2.0.1 | MIT |  |
| check-error | 2.1.3 | MIT |  |
| chevrotain | 11.0.3 | Apache-2.0 | https://chevrotain.io/docs/ |
| chevrotain-allstar | 0.3.1 | MIT |  |
| chokidar | 3.6.0 | MIT | https://github.com/paulmillr/chokidar |
| chokidar | 5.0.0 | MIT | https://github.com/paulmillr/chokidar |
| chownr | 3.0.0 | BlueOak-1.0.0 |  |
| chromium-pickle-js | 0.2.0 | MIT |  |
| ci-info | 4.3.1 | MIT | https://github.com/watson/ci-info |
| ci-info | 4.5.0 | MIT | https://github.com/watson/ci-info |
| class-variance-authority | 0.7.1 | Apache-2.0 | https://github.com/joe-bell/cva#readme |
| cli-cursor | 5.0.0 | MIT |  |
| cli-spinners | 2.9.2 | MIT |  |
| cli-spinners | 3.4.0 | MIT |  |
| cli-table3 | 0.6.5 | MIT | https://github.com/cli-table/cli-table3 |
| cliui | 8.0.1 | ISC |  |
| clone-response | 1.0.3 | MIT |  |
| clsx | 1.1.1 | MIT |  |
| clsx | 2.1.1 | MIT |  |
| cmdk | 1.1.1 | MIT | https://github.com/pacocoursey/cmdk#readme |
| code-block-writer | 13.0.3 | MIT | https://github.com/dsherret/code-block-writer#readme |
| codemirror-lang-mermaid | 0.5.0 | MIT |  |
| color-convert | 2.0.1 | MIT |  |
| color-name | 1.1.4 | MIT | https://github.com/colorjs/color-name |
| colord | 2.12.0 | MIT |  |
| combined-stream | 1.0.8 | MIT | https://github.com/felixge/node-combined-stream |
| comma-separated-tokens | 2.0.3 | MIT |  |
| commander | 11.1.0 | MIT |  |
| commander | 12.1.0 | MIT |  |
| commander | 13.1.0 | MIT |  |
| commander | 14.0.3 | MIT |  |
| commander | 15.1.0 | MIT |  |
| commander | 5.1.0 | MIT |  |
| commander | 7.2.0 | MIT |  |
| commander | 8.3.0 | MIT |  |
| compare-version | 0.1.2 | MIT |  |
| concat-map | 0.0.1 | MIT |  |
| conf | 10.2.0 | MIT |  |
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
| cosmiconfig | 9.0.2 | MIT | https://github.com/cosmiconfig/cosmiconfig#readme |
| cpu-features | 0.0.10 | MIT |  |
| crc-32 | 0.3.0 | Apache-2.0 |  |
| crelt | 1.0.7 | MIT | https://code.haverbeke.berlin/marijn/crelt |
| croner | 11.0.0 | MIT | https://croner.56k.guru |
| cross-env | 7.0.3 | MIT | https://github.com/kentcdodds/cross-env#readme |
| cross-spawn | 7.0.6 | MIT | https://github.com/moxystudio/node-cross-spawn |
| crossws | 0.4.17 | MIT | https://crossws.h3.dev |
| css-functions-list | 3.3.3 | MIT | https://github.com/niksy/css-functions-list#readme |
| css-tree | 3.2.1 | MIT |  |
| csstype | 3.2.3 | MIT |  |
| culori | 4.0.2 | MIT |  |
| cytoscape | 3.35.0 | MIT | http://js.cytoscape.org |
| cytoscape-cose-bilkent | 4.1.0 | MIT | https://github.com/cytoscape/cytoscape.js-cose-bilkent |
| cytoscape-fcose | 2.2.0 | MIT | https://github.com/iVis-at-Bilkent/cytoscape.js-fcose |
| d3 | 7.9.2 | ISC | https://d3js.org |
| d3-array | 2.12.1 | BSD-3-Clause | https://d3js.org/d3-array/ |
| d3-array | 3.2.5 | ISC | https://d3js.org/d3-array/ |
| d3-axis | 3.0.1 | ISC | https://d3js.org/d3-axis/ |
| d3-binarytree | 1.0.2 | MIT | https://github.com/vasturiano/d3-binarytree |
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
| d3-force-3d | 3.0.6 | MIT | https://github.com/vasturiano/d3-force-3d |
| d3-format | 3.1.3 | ISC | https://d3js.org/d3-format/ |
| d3-geo | 3.1.2 | ISC | https://d3js.org/d3-geo/ |
| d3-hierarchy | 3.1.3 | ISC | https://d3js.org/d3-hierarchy/ |
| d3-interpolate | 3.0.2 | ISC | https://d3js.org/d3-interpolate/ |
| d3-octree | 1.1.0 | MIT | https://github.com/vasturiano/d3-octree |
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
| date-fns-jalali | 4.1.0-0 | MIT |  |
| dayjs | 1.11.23 | MIT | https://day.js.org |
| debounce-fn | 4.0.0 | MIT |  |
| debug | 4.4.3 | MIT |  |
| decimal.js | 10.6.0 | MIT |  |
| decode-named-character-reference | 1.3.0 | MIT |  |
| decompress-response | 6.0.0 | MIT |  |
| dedent | 1.7.2 | MIT | https://github.com/dmnd/dedent |
| deep-eql | 5.0.2 | MIT |  |
| deepmerge | 4.3.1 | MIT | https://github.com/TehShrike/deepmerge |
| default-browser | 5.5.1 | MIT |  |
| default-browser-id | 5.0.1 | MIT |  |
| defer-to-connect | 2.0.1 | MIT | https://github.com/szmarczak/defer-to-connect#readme |
| define-data-property | 1.1.4 | MIT | https://github.com/ljharb/define-data-property#readme |
| define-lazy-prop | 2.0.0 | MIT |  |
| define-lazy-prop | 3.0.0 | MIT |  |
| define-properties | 1.2.1 | MIT |  |
| delaunator | 5.1.0 | ISC |  |
| delayed-stream | 1.0.0 | MIT | https://github.com/felixge/node-delayed-stream |
| depd | 2.0.0 | MIT |  |
| dequal | 2.0.3 | MIT |  |
| detect-libc | 2.1.2 | Apache-2.0 |  |
| detect-node | 2.1.0 | MIT | https://github.com/iliakan/detect-node |
| detect-node-es | 1.1.0 | MIT | https://github.com/thekashey/detect-node |
| devlop | 1.1.0 | MIT |  |
| diff | 8.0.4 | BSD-3-Clause |  |
| diff | 9.0.0 | BSD-3-Clause |  |
| diff-match-patch | 1.0.5 | Apache-2.0 |  |
| dir-compare | 4.2.0 | MIT |  |
| dir-glob | 3.0.1 | MIT |  |
| dmg-builder | 26.18.0 | MIT | https://github.com/electron-userland/electron-builder |
| dom-accessibility-api | 0.5.16 | MIT |  |
| dompurify | 3.3.3 | (MPL-2.0 OR Apache-2.0) | https://github.com/cure53/DOMPurify |
| dot-prop | 6.0.1 | MIT |  |
| dotenv | 16.6.1 | BSD-2-Clause | https://github.com/motdotla/dotenv#readme |
| dotenv | 17.4.2 | BSD-2-Clause | https://github.com/motdotla/dotenv#readme |
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
| emoji-regex | 10.6.0 | MIT | https://mths.be/emoji-regex |
| emoji-regex | 8.0.0 | MIT | https://mths.be/emoji-regex |
| emojibase | 18.0.0 | MIT |  |
| emojibase-data | 16.0.2 | MIT |  |
| encodeurl | 2.0.1 | MIT |  |
| end-of-stream | 1.4.5 | MIT | https://github.com/mafintosh/end-of-stream |
| enhanced-resolve | 5.27.0 | MIT | https://github.com/webpack/enhanced-resolve#readme |
| enquirer | 2.4.1 | MIT | https://github.com/enquirer/enquirer |
| entities | 6.0.1 | BSD-2-Clause |  |
| entities | 9.0.0 | BSD-2-Clause |  |
| env-paths | 2.2.1 | MIT |  |
| env-paths | 3.0.0 | MIT |  |
| err-code | 2.0.3 | MIT |  |
| error-ex | 1.3.4 | MIT |  |
| es-define-property | 1.0.1 | MIT | https://github.com/ljharb/es-define-property#readme |
| es-errors | 1.3.0 | MIT | https://github.com/ljharb/es-errors#readme |
| es-module-lexer | 1.7.0 | MIT | https://github.com/guybedford/es-module-lexer#readme |
| es-object-atoms | 1.1.2 | MIT | https://github.com/ljharb/es-object-atoms#readme |
| es-set-tostringtag | 2.1.0 | MIT | https://github.com/es-shims/es-set-tostringtag#readme |
| es6-error | 4.1.1 | MIT | https://github.com/bjyoungblood/es6-error |
| es6-promise-pool | 2.5.0 | MIT |  |
| esbuild | 0.28.2 | MIT |  |
| escalade | 3.2.0 | MIT |  |
| escape-html | 1.0.3 | MIT |  |
| escape-string-regexp | 4.0.0 | MIT |  |
| escape-string-regexp | 5.0.0 | MIT |  |
| esprima | 4.0.1 | BSD-2-Clause | http://esprima.org |
| estree-util-is-identifier-name | 3.0.0 | MIT |  |
| estree-util-visit | 2.0.0 | MIT |  |
| estree-walker | 3.0.3 | MIT |  |
| etag | 1.8.1 | MIT |  |
| eventsource | 3.0.7 | MIT | https://github.com/EventSource/eventsource#readme |
| eventsource-parser | 3.1.1 | MIT | https://github.com/rexxars/eventsource-parser#readme |
| execa | 5.1.1 | MIT |  |
| execa | 9.6.1 | MIT |  |
| expect-type | 1.4.0 | Apache-2.0 | https://github.com/mmkal/expect-type#readme |
| exponential-backoff | 3.1.3 | Apache-2.0 | https://github.com/coveooss/exponential-backoff#readme |
| express | 5.3.0 | MIT | https://expressjs.com/ |
| express-rate-limit | 8.7.3 | MIT | https://github.com/express-rate-limit/express-rate-limit |
| extend | 3.0.2 | MIT |  |
| fast-check | 4.10.2 | MIT | https://fast-check.dev/ |
| fast-deep-equal | 3.1.3 | MIT | https://github.com/epoberezkin/fast-deep-equal#readme |
| fast-equals | 5.4.5 | MIT | https://github.com/planttheidea/fast-equals#readme |
| fast-glob | 3.3.3 | MIT |  |
| fast-uri | 3.1.9 | BSD-3-Clause | https://github.com/fastify/fast-uri |
| fastest-levenshtein | 1.0.16 | MIT | https://github.com/ka-weihe/fastest-levenshtein#README |
| fastq | 1.20.3 | ISC | https://github.com/mcollina/fastq#readme |
| fault | 2.0.1 | MIT |  |
| fd-package-json | 2.0.0 | MIT | https://github.com/es-tooling/fd-package-json#readme |
| fdir | 6.5.0 | MIT | https://github.com/thecodrr/fdir#readme |
| fflate | 0.8.3 | MIT | https://101arrowz.github.io/fflate |
| figures | 6.1.0 | MIT |  |
| file-entry-cache | 11.1.5 | MIT |  |
| filelist | 1.0.6 | Apache-2.0 | https://github.com/mde/filelist |
| fill-range | 7.1.1 | MIT | https://github.com/jonschlinkert/fill-range |
| finalhandler | 2.1.1 | MIT |  |
| find-up | 3.0.0 | MIT |  |
| flat-cache | 6.1.23 | MIT |  |
| flatted | 3.4.4 | ISC | https://github.com/WebReflection/flatted#readme |
| float-tooltip | 1.8.0 | MIT | https://github.com/vasturiano/float-tooltip |
| force-graph | 1.52.0 | MIT | https://github.com/vasturiano/force-graph |
| form-data | 4.0.6 | MIT |  |
| format | 0.2.2 | MIT | http://samhuri.net/proj/format |
| formatly | 0.11.4 | MIT |  |
| forwarded | 0.2.0 | MIT |  |
| fresh | 2.0.0 | MIT |  |
| frimousse | 0.3.0 | MIT | https://frimousse.liveblocks.io |
| fs-extra | 10.1.0 | MIT | https://github.com/jprichardson/node-fs-extra |
| fs-extra | 11.3.1 | MIT | https://github.com/jprichardson/node-fs-extra |
| fs-extra | 11.4.1 | MIT | https://github.com/jprichardson/node-fs-extra |
| fs-extra | 7.0.1 | MIT | https://github.com/jprichardson/node-fs-extra |
| fs-extra | 8.1.0 | MIT | https://github.com/jprichardson/node-fs-extra |
| fs-extra | 9.1.0 | MIT | https://github.com/jprichardson/node-fs-extra |
| fs.realpath | 1.0.0 | ISC |  |
| function-bind | 1.1.2 | MIT | https://github.com/Raynos/function-bind |
| fuzzy | 0.1.3 | MIT | https://github.com/mattyork/fuzzy |
| fuzzysort | 3.1.0 | MIT |  |
| gensync | 1.0.0-beta.2 | MIT | https://github.com/loganfsmyth/gensync |
| get-caller-file | 2.0.5 | ISC | https://github.com/stefanpenner/get-caller-file#readme |
| get-east-asian-width | 1.7.0 | MIT |  |
| get-intrinsic | 1.3.0 | MIT | https://github.com/ljharb/get-intrinsic#readme |
| get-nonce | 1.0.1 | MIT | https://github.com/theKashey/get-nonce |
| get-own-enumerable-keys | 1.0.0 | MIT |  |
| get-proto | 1.0.1 | MIT | https://github.com/ljharb/get-proto#readme |
| get-stream | 5.2.0 | MIT |  |
| get-stream | 6.0.1 | MIT |  |
| get-stream | 9.0.1 | MIT |  |
| get-tsconfig | 4.14.3 | MIT |  |
| glob | 7.2.3 | ISC |  |
| glob-parent | 5.1.2 | ISC |  |
| global-agent | 3.0.0 | BSD-3-Clause |  |
| global-modules | 2.0.0 | MIT | https://github.com/jonschlinkert/global-modules |
| global-prefix | 3.0.0 | MIT | https://github.com/jonschlinkert/global-prefix |
| globalthis | 1.0.4 | MIT |  |
| globby | 11.1.0 | MIT |  |
| globjoin | 0.1.4 | MIT | https://github.com/amobiz/globjoin |
| globrex | 0.1.2 | MIT |  |
| glur | 1.1.2 | MIT | https://github.com/andr83/glur/issues |
| gopd | 1.2.0 | MIT | https://github.com/ljharb/gopd#readme |
| got | 11.8.6 | MIT |  |
| graceful-fs | 4.2.11 | ISC |  |
| hachure-fill | 0.5.2 | MIT | https://github.com/pshihn/hachure-fill#readme |
| has-flag | 4.0.0 | MIT |  |
| has-property-descriptors | 1.0.2 | MIT | https://github.com/inspect-js/has-property-descriptors#readme |
| has-symbols | 1.1.0 | MIT | https://github.com/ljharb/has-symbols#readme |
| has-tostringtag | 1.0.2 | MIT | https://github.com/inspect-js/has-tostringtag#readme |
| hashery | 1.5.1 | MIT |  |
| hasown | 2.0.4 | MIT | https://github.com/inspect-js/hasOwn#readme |
| hast-util-embedded | 3.0.0 | MIT |  |
| hast-util-from-html | 2.0.3 | MIT |  |
| hast-util-from-parse5 | 8.0.3 | MIT |  |
| hast-util-has-property | 3.0.0 | MIT |  |
| hast-util-is-body-ok-link | 3.0.1 | MIT |  |
| hast-util-is-element | 3.0.0 | MIT |  |
| hast-util-minify-whitespace | 1.0.1 | MIT |  |
| hast-util-parse-selector | 4.0.0 | MIT |  |
| hast-util-phrasing | 3.0.1 | MIT |  |
| hast-util-to-html | 9.0.5 | MIT |  |
| hast-util-to-mdast | 10.1.2 | MIT |  |
| hast-util-to-text | 4.0.2 | MIT |  |
| hast-util-whitespace | 3.0.0 | MIT |  |
| hastscript | 9.0.1 | MIT |  |
| highlight.js | 11.11.1 | BSD-3-Clause | https://highlightjs.org/ |
| highlight.js | 11.11.2 | BSD-3-Clause | https://highlightjs.org/ |
| hono | 4.13.17 | MIT | https://hono.dev |
| hookified | 1.15.1 | MIT | https://github.com/jaredwray/hookified#readme |
| hookified | 2.2.0 | MIT | https://github.com/jaredwray/hookified#readme |
| hosted-git-info | 4.1.0 | ISC | https://github.com/npm/hosted-git-info |
| html-encoding-sniffer | 7.0.0 | MIT |  |
| html-tags | 3.3.1 | MIT |  |
| html-void-elements | 3.0.0 | MIT |  |
| http-cache-semantics | 4.3.0 | BSD-2-Clause |  |
| http-errors | 2.0.1 | MIT |  |
| http-proxy-agent | 7.0.2 | MIT |  |
| http2-wrapper | 1.0.3 | MIT | https://github.com/szmarczak/http2-wrapper#readme |
| https-proxy-agent | 7.0.6 | MIT |  |
| human-signals | 2.1.0 | Apache-2.0 | https://git.io/JeluP |
| human-signals | 8.0.1 | Apache-2.0 | https://www.github.com/ehmicky/human-signals |
| iconv-lite | 0.6.3 | MIT | https://github.com/ashtuchkin/iconv-lite |
| iconv-lite | 0.7.3 | MIT | https://github.com/pillarjs/iconv-lite |
| ignore | 5.3.2 | MIT |  |
| ignore | 7.0.14 | MIT |  |
| image-blob-reduce | 3.0.1 | MIT |  |
| immutable | 4.3.9 | MIT | https://immutable-js.com |
| import-fresh | 3.3.1 | MIT |  |
| import-meta-resolve | 4.2.0 | MIT |  |
| imurmurhash | 0.1.4 | MIT | https://github.com/jensyt/imurmurhash-js |
| index-array-by | 1.4.2 | MIT | https://github.com/vasturiano/index-array-by |
| inflight | 1.0.6 | ISC | https://github.com/isaacs/inflight |
| inherits | 2.0.4 | ISC |  |
| ini | 1.3.8 | ISC |  |
| internmap | 1.0.1 | ISC | https://github.com/mbostock/internmap/ |
| internmap | 2.0.3 | ISC | https://github.com/mbostock/internmap/ |
| ip-address | 10.7.6 | MIT |  |
| ipaddr.js | 1.9.1 | MIT |  |
| ipaddr.js | 2.4.0 | MIT |  |
| is-alphabetical | 2.0.1 | MIT |  |
| is-alphanumerical | 2.0.1 | MIT |  |
| is-arrayish | 0.2.1 | MIT |  |
| is-binary-path | 2.1.0 | MIT |  |
| is-decimal | 2.0.1 | MIT |  |
| is-docker | 2.2.1 | MIT |  |
| is-docker | 3.0.0 | MIT |  |
| is-extglob | 2.1.1 | MIT | https://github.com/jonschlinkert/is-extglob |
| is-fullwidth-code-point | 3.0.0 | MIT |  |
| is-glob | 4.0.3 | MIT | https://github.com/micromatch/is-glob |
| is-hexadecimal | 2.0.1 | MIT |  |
| is-in-ssh | 1.0.0 | MIT |  |
| is-inside-container | 1.0.0 | MIT |  |
| is-interactive | 2.0.0 | MIT |  |
| is-number | 7.0.0 | MIT | https://github.com/jonschlinkert/is-number |
| is-obj | 2.0.0 | MIT |  |
| is-obj | 3.0.0 | MIT |  |
| is-plain-obj | 4.1.0 | MIT |  |
| is-plain-object | 5.1.0 | MIT | https://github.com/jonschlinkert/is-plain-object |
| is-potential-custom-element-name | 1.0.1 | MIT | https://github.com/mathiasbynens/is-potential-custom-element-name |
| is-promise | 4.0.0 | MIT |  |
| is-regexp | 3.1.0 | MIT |  |
| is-stream | 2.0.1 | MIT |  |
| is-stream | 4.0.1 | MIT |  |
| is-unicode-supported | 1.3.0 | MIT |  |
| is-unicode-supported | 2.1.0 | MIT |  |
| is-wsl | 2.2.0 | MIT |  |
| is-wsl | 3.1.1 | MIT |  |
| isarray | 1.0.0 | MIT | https://github.com/juliangruber/isarray |
| isbinaryfile | 4.0.10 | MIT |  |
| isbinaryfile | 5.0.7 | MIT |  |
| isexe | 2.0.0 | ISC | https://github.com/isaacs/isexe#readme |
| isexe | 3.1.5 | BlueOak-1.0.0 |  |
| isexe | 4.0.0 | BlueOak-1.0.0 |  |
| isomorphic.js | 0.2.5 | MIT | https://github.com/dmonad/isomorphic.js#readme |
| jake | 10.9.4 | Apache-2.0 |  |
| jerrypick | 1.1.2 | MIT | https://github.com/vasturiano/jerrypick |
| jest-get-type | 29.6.3 | MIT |  |
| jest-validate | 29.7.0 | MIT |  |
| jiti | 2.7.0 | MIT |  |
| jose | 6.2.16 | MIT | https://github.com/panva/jose |
| jotai | 2.11.0 | MIT | https://github.com/pmndrs/jotai |
| jotai-scope | 0.7.2 | MIT |  |
| js-sha256 | 0.10.1 | MIT | https://github.com/emn178/js-sha256 |
| js-tokens | 4.0.0 | MIT |  |
| js-tokens | 9.0.1 | MIT |  |
| js-yaml | 4.3.2 | MIT |  |
| jsdom | 31.0.0 | MIT |  |
| jsesc | 3.1.0 | MIT | https://mths.be/jsesc |
| json-buffer | 3.0.1 | MIT | https://github.com/dominictarr/json-buffer |
| json-parse-even-better-errors | 2.3.1 | MIT |  |
| json-schema-traverse | 1.0.0 | MIT | https://github.com/epoberezkin/json-schema-traverse#readme |
| json-schema-typed | 7.0.3 | BSD-2-Clause | https://github.com/typeslick/json-schema-typed |
| json-schema-typed | 8.0.2 | BSD-2-Clause | https://github.com/RemyRylan/json-schema-typed/tree/main/dist/node |
| json-stringify-safe | 5.0.1 | ISC | https://github.com/isaacs/json-stringify-safe |
| json5 | 2.2.3 | MIT | http://json5.org/ |
| jsonfile | 4.0.0 | MIT |  |
| jsonfile | 6.2.1 | MIT |  |
| kapsule | 1.16.3 | MIT | https://github.com/vasturiano/kapsule |
| katex | 0.16.47 | MIT | https://katex.org |
| keyv | 4.5.4 | MIT | https://github.com/jaredwray/keyv |
| keyv | 5.6.0 | MIT | https://github.com/jaredwray/keyv |
| khroma | 2.1.0 | MIT |  |
| kind-of | 6.0.3 | MIT | https://github.com/jonschlinkert/kind-of |
| kleur | 3.0.3 | MIT |  |
| kleur | 4.1.5 | MIT |  |
| knip | 6.44.2 | ISC | https://knip.dev |
| known-css-properties | 0.37.0 | MIT | https://github.com/known-css/known-css-properties#readme |
| langium | 3.3.1 | MIT | https://langium.org |
| layout-base | 1.0.2 | MIT | https://github.com/iVis-at-Bilkent/layout-base#readme |
| layout-base | 2.0.1 | MIT | https://github.com/iVis-at-Bilkent/layout-base#readme |
| lazy-val | 1.0.5 | MIT | https://github.com/develar/lazy-val |
| leven | 3.1.0 | MIT |  |
| lib0 | 0.2.117 | MIT | https://github.com/dmonad/lib0#readme |
| lightningcss | 1.33.0 | MPL-2.0 |  |
| lightningcss-linux-x64-gnu | 1.33.0 | MPL-2.0 |  |
| lilconfig | 3.1.5 | MIT |  |
| lines-and-columns | 1.2.4 | MIT | https://github.com/eventualbuddha/lines-and-columns#readme |
| linkifyjs | 4.3.3 | MIT | https://linkify.js.org |
| locate-path | 3.0.0 | MIT |  |
| lodash | 4.18.1 | MIT | https://lodash.com/ |
| lodash-es | 4.17.21 | MIT | https://lodash.com/custom-builds |
| lodash-es | 4.18.1 | MIT | https://lodash.com/custom-builds |
| lodash.debounce | 4.0.8 | MIT | https://lodash.com/ |
| lodash.throttle | 4.1.1 | MIT | https://lodash.com/ |
| log-symbols | 6.0.0 | MIT |  |
| log-symbols | 7.0.1 | MIT |  |
| longest-streak | 3.1.0 | MIT |  |
| loose-envify | 1.4.0 | MIT | https://github.com/zertosh/loose-envify |
| loupe | 3.2.1 | MIT | https://github.com/chaijs/loupe |
| lowercase-keys | 2.0.0 | MIT |  |
| lowlight | 3.3.0 | MIT |  |
| lru-cache | 11.5.3 | BlueOak-1.0.0 |  |
| lru-cache | 5.1.1 | ISC |  |
| lru-cache | 6.0.0 | ISC |  |
| lucide-react | 1.24.0 | ISC | https://lucide.dev |
| lucide-react | 1.70.0 | ISC | https://lucide.dev |
| lz-string | 1.5.0 | MIT | http://pieroxy.net/blog/pages/lz-string/index.html |
| magic-string | 0.30.21 | MIT |  |
| magic-string | 1.4.5 | MIT |  |
| markdown-table | 3.1.0 | MIT |  |
| markdownlint | 0.41.1 | MIT | https://github.com/DavidAnson/markdownlint |
| marked | 16.4.2 | MIT | https://marked.js.org |
| matcher | 3.0.0 | MIT |  |
| math-intrinsics | 1.1.0 | MIT | https://github.com/es-shims/math-intrinsics#readme |
| mathml-tag-names | 2.1.3 | MIT |  |
| mdast-util-find-and-replace | 3.0.2 | MIT |  |
| mdast-util-from-markdown | 2.0.3 | MIT |  |
| mdast-util-from-markdown | 2.1.0 | MIT |  |
| mdast-util-frontmatter | 2.0.1 | MIT |  |
| mdast-util-gfm | 3.1.0 | MIT |  |
| mdast-util-gfm-autolink-literal | 2.0.1 | MIT |  |
| mdast-util-gfm-footnote | 2.1.0 | MIT |  |
| mdast-util-gfm-strikethrough | 2.0.0 | MIT |  |
| mdast-util-gfm-table | 2.0.0 | MIT |  |
| mdast-util-gfm-task-list-item | 2.0.0 | MIT |  |
| mdast-util-math | 3.0.0 | MIT |  |
| mdast-util-mdx | 3.0.0 | MIT |  |
| mdast-util-mdx-expression | 2.0.1 | MIT |  |
| mdast-util-mdx-jsx | 3.2.0 | MIT |  |
| mdast-util-mdxjs-esm | 2.0.1 | MIT |  |
| mdast-util-phrasing | 4.1.0 | MIT |  |
| mdast-util-to-hast | 13.2.1 | MIT |  |
| mdast-util-to-markdown | 2.1.2 | MIT |  |
| mdast-util-to-string | 4.0.0 | MIT |  |
| mdn-data | 2.27.1 | CC0-1.0 | https://developer.mozilla.org |
| media-typer | 1.1.1 | MIT |  |
| meow | 13.2.0 | MIT |  |
| merge-descriptors | 2.0.0 | MIT |  |
| merge-stream | 2.0.0 | MIT |  |
| merge2 | 1.4.1 | MIT | https://github.com/teambition/merge2 |
| mermaid | 11.12.2 | MIT |  |
| micromark | 4.0.2 | MIT |  |
| micromark | 4.0.3 | MIT |  |
| micromark-core-commonmark | 2.0.3 | MIT |  |
| micromark-core-commonmark | 2.0.4 | MIT |  |
| micromark-extension-directive | 4.0.0 | MIT |  |
| micromark-extension-frontmatter | 2.0.0 | MIT |  |
| micromark-extension-gfm | 3.0.0 | MIT |  |
| micromark-extension-gfm-autolink-literal | 2.1.0 | MIT |  |
| micromark-extension-gfm-footnote | 2.1.0 | MIT |  |
| micromark-extension-gfm-strikethrough | 2.1.0 | MIT |  |
| micromark-extension-gfm-table | 2.1.1 | MIT |  |
| micromark-extension-gfm-table | 2.1.2 | MIT |  |
| micromark-extension-gfm-tagfilter | 2.0.0 | MIT |  |
| micromark-extension-gfm-task-list-item | 2.1.0 | MIT |  |
| micromark-extension-math | 3.1.0 | MIT |  |
| micromark-extension-mdx | 2.1.0 | MIT |  |
| micromark-extension-mdx-expression | 3.0.1 | MIT |  |
| micromark-extension-mdx-jsx | 3.0.2 | MIT |  |
| micromark-extension-mdx-md | 2.0.0 | MIT |  |
| micromark-factory-destination | 2.0.1 | MIT |  |
| micromark-factory-label | 2.0.1 | MIT |  |
| micromark-factory-mdx-expression | 2.0.3 | MIT |  |
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
| micromark-util-events-to-acorn | 2.0.3 | MIT |  |
| micromark-util-html-tag-name | 2.0.1 | MIT |  |
| micromark-util-normalize-identifier | 2.0.1 | MIT |  |
| micromark-util-resolve-all | 2.0.1 | MIT |  |
| micromark-util-sanitize-uri | 2.0.1 | MIT |  |
| micromark-util-subtokenize | 2.1.0 | MIT |  |
| micromark-util-symbol | 2.0.1 | MIT |  |
| micromark-util-types | 2.0.2 | MIT |  |
| micromark-util-types | 2.0.3 | MIT |  |
| micromatch | 4.0.8 | MIT | https://github.com/micromatch/micromatch |
| mime | 2.6.0 | MIT |  |
| mime-db | 1.52.0 | MIT |  |
| mime-db | 1.54.0 | MIT |  |
| mime-types | 2.1.35 | MIT |  |
| mime-types | 3.0.2 | MIT |  |
| mimic-fn | 2.1.0 | MIT |  |
| mimic-fn | 3.1.0 | MIT |  |
| mimic-function | 5.0.1 | MIT |  |
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
| moo | 0.5.3 | BSD-3-Clause |  |
| ms | 2.1.3 | MIT |  |
| multimath | 2.0.0 | MIT |  |
| nan | 2.30.0 | MIT |  |
| nanoid | 3.3.20 | MIT |  |
| nanoid | 3.3.3 | MIT |  |
| nanoid | 4.0.2 | MIT |  |
| native-promise-only | 0.8.1 | MIT | http://github.com/getify/native-promise-only |
| negotiator | 1.1.0 | MIT |  |
| next-themes | 0.4.6 | MIT |  |
| node-abi | 4.40.0 | MIT | https://github.com/electron/node-abi#readme |
| node-addon-api | 7.1.1 | MIT | https://github.com/nodejs/node-addon-api |
| node-api-version | 0.2.1 | MIT |  |
| node-diff3 | 3.2.1 | MIT |  |
| node-gyp | 12.4.0 | MIT |  |
| node-int64 | 0.4.0 | MIT |  |
| node-releases | 2.0.63 | MIT |  |
| nopt | 9.0.0 | ISC |  |
| normalize-path | 3.0.0 | MIT | https://github.com/jonschlinkert/normalize-path |
| normalize-url | 6.1.0 | MIT |  |
| npm-run-path | 4.0.1 | MIT |  |
| npm-run-path | 6.0.0 | MIT |  |
| object-assign | 4.1.1 | MIT |  |
| object-inspect | 1.13.4 | MIT | https://github.com/inspect-js/object-inspect |
| object-keys | 1.1.1 | MIT |  |
| object-treeify | 1.1.33 | MIT | https://github.com/blackflux/object-treeify#readme |
| on-finished | 2.4.2 | MIT |  |
| once | 1.4.0 | ISC |  |
| onetime | 5.1.2 | MIT |  |
| onetime | 7.0.0 | MIT |  |
| open | 11.0.4 | MIT |  |
| open | 8.4.2 | MIT |  |
| ora | 8.2.0 | MIT |  |
| ora | 9.4.1 | MIT |  |
| orderedmap | 2.1.1 | MIT | https://github.com/marijnh/orderedmap#readme |
| oxc-parser | 0.156.0 | MIT | https://oxc.rs/docs/guide/usage/parser |
| oxc-resolver | 11.24.2 | MIT | https://oxc.rs |
| oxfmt | 0.78.0 | MIT | https://oxc.rs/docs/guide/usage/formatter |
| oxlint | 1.93.0 | MIT | https://oxc.rs/docs/guide/usage/linter |
| p-cancelable | 2.1.1 | MIT |  |
| p-limit | 2.3.0 | MIT |  |
| p-limit | 3.1.0 | MIT |  |
| p-locate | 3.0.0 | MIT |  |
| p-try | 2.2.0 | MIT |  |
| package-manager-detector | 1.9.0 | MIT | https://github.com/antfu-collective/package-manager-detector#readme |
| pako | 2.0.3 | MIT AND Zlib |  |
| parent-module | 1.0.1 | MIT |  |
| parse-entities | 4.0.2 | MIT |  |
| parse-json | 5.2.0 | MIT |  |
| parse-ms | 4.0.0 | MIT |  |
| parse5 | 7.3.0 | MIT | https://parse5.js.org |
| parse5 | 8.1.1 | MIT | https://parse5.js.org |
| parse5-parser-stream | 8.1.1 | MIT | https://parse5.js.org |
| parseurl | 1.3.3 | MIT |  |
| path-browserify | 1.0.1 | MIT | https://github.com/browserify/path-browserify |
| path-data-parser | 0.1.0 | MIT | https://github.com/pshihn/path-data-parser#readme |
| path-exists | 3.0.0 | MIT |  |
| path-is-absolute | 1.0.1 | MIT |  |
| path-key | 3.1.1 | MIT |  |
| path-key | 4.0.0 | MIT |  |
| path-to-regexp | 8.4.2 | MIT |  |
| path-type | 4.0.0 | MIT |  |
| pathe | 2.0.3 | MIT |  |
| pathval | 2.0.1 | MIT | https://github.com/chaijs/pathval |
| pdfjs-dist | 6.3.289 | Apache-2.0 | https://mozilla.github.io/pdf.js/ |
| pe-library | 0.4.1 | MIT | https://github.com/jet2jet/pe-library-js |
| perfect-freehand | 1.2.0 | MIT |  |
| pica | 7.1.1 | MIT | https://github.com/nodeca/pica |
| picocolors | 1.1.1 | ISC |  |
| picomatch | 2.3.2 | MIT | https://github.com/micromatch/picomatch |
| picomatch | 4.0.7 | MIT | https://github.com/micromatch/picomatch |
| pkce-challenge | 5.0.1 | MIT | https://github.com/crouchcd/pkce-challenge#readme |
| pkg-up | 3.1.0 | MIT |  |
| pkijs | 3.4.3 | BSD-3-Clause |  |
| playwright | 1.65.0 | Apache-2.0 | https://playwright.dev |
| playwright-core | 1.65.0 | Apache-2.0 | https://playwright.dev |
| plist | 3.1.0 | MIT |  |
| png-chunk-text | 1.0.0 | MIT | https://github.com/hughsk/png-chunk-text |
| png-chunks-encode | 1.0.0 | MIT | https://github.com/hughsk/png-chunks-encode |
| png-chunks-extract | 1.0.0 | MIT | https://github.com/hughsk/png-chunks-extract |
| pofile-ts | 4.0.3 | MIT | https://sebastian-software.github.io/pofile-ts/ |
| points-on-curve | 0.2.0 | MIT | https://github.com/pshihn/bezier-points#readme |
| points-on-curve | 1.0.1 | MIT | https://github.com/pshihn/bezier-points#readme |
| points-on-path | 0.2.1 | MIT | https://github.com/pshihn/points-on-path#readme |
| postcss | 8.5.32 | MIT | https://postcss.org/ |
| postcss-resolve-nested-selector | 0.1.7 | MIT | https://github.com/csstools/postcss-resolve-nested-selector |
| postcss-safe-parser | 7.1.0 | MIT |  |
| postcss-selector-parser | 7.2.1 | MIT | https://github.com/postcss/postcss-selector-parser |
| postcss-value-parser | 4.2.0 | MIT | https://github.com/TrySound/postcss-value-parser |
| powershell-utils | 0.2.1 | MIT |  |
| preact | 11.0.0-beta.0 | MIT | https://preactjs.com |
| preact | 11.2.0 | MIT | https://preactjs.com |
| preact-render-to-string | 6.6.5 | MIT | https://github.com/preactjs/preact-render-to-string |
| pretty-format | 27.5.1 | MIT |  |
| pretty-format | 29.7.0 | MIT |  |
| pretty-ms | 9.3.1 | MIT |  |
| prism-react-renderer | 2.4.1 | MIT |  |
| proc-log | 6.1.0 | ISC |  |
| process-nextick-args | 2.0.1 | MIT | https://github.com/calvinmetcalf/process-nextick-args |
| progress | 2.0.3 | MIT |  |
| promise-retry | 2.0.1 | MIT |  |
| prompts | 2.4.2 | MIT |  |
| prop-types | 15.8.1 | MIT | https://facebook.github.io/react/ |
| proper-lockfile | 4.1.2 | MIT | https://github.com/moxystudio/node-proper-lockfile |
| property-information | 7.2.0 | MIT |  |
| prosemirror-changeset | 2.4.1 | MIT |  |
| prosemirror-commands | 1.7.1 | MIT |  |
| prosemirror-dropcursor | 1.8.3 | MIT |  |
| prosemirror-gapcursor | 1.4.1 | MIT |  |
| prosemirror-history | 1.5.0 | MIT |  |
| prosemirror-keymap | 1.2.3 | MIT |  |
| prosemirror-model | 1.25.4 | MIT |  |
| prosemirror-schema-list | 1.5.1 | MIT |  |
| prosemirror-state | 1.4.4 | MIT |  |
| prosemirror-tables | 1.8.5 | MIT |  |
| prosemirror-transform | 1.12.0 | MIT |  |
| prosemirror-view | 1.41.8 | MIT |  |
| proxy-addr | 2.0.8 | MIT |  |
| pseudolocale | 3.1.0 | MIT |  |
| pump | 3.0.4 | MIT |  |
| punycode | 2.3.1 | MIT | https://mths.be/punycode |
| pure-rand | 8.4.2 | MIT | https://github.com/dubzzz/pure-rand#readme |
| purgecss | 8.0.0 | MIT | https://purgecss.com |
| pvtsutils | 1.3.6 | MIT | https://github.com/PeculiarVentures/pvtsutils#readme |
| pvutils | 1.2.0 | MIT |  |
| pwacompat | 2.0.17 | Apache-2.0 | https://github.com/GoogleChrome/pwacompat |
| qified | 0.10.1 | MIT | https://github.com/jaredwray/qified#readme |
| qs | 6.17.1 | BSD-3-Clause | https://github.com/ljharb/qs |
| queue-microtask | 1.2.3 | MIT | https://github.com/feross/queue-microtask |
| quick-lru | 5.1.1 | MIT |  |
| radix-ui | 1.4.3 | MIT | https://radix-ui.com/primitives |
| range-parser | 1.3.0 | MIT |  |
| raw-body | 3.0.2 | MIT |  |
| react | 19.3.1 | MIT | https://react.dev/ |
| react-day-picker | 9.14.0 | MIT | https://daypicker.dev |
| react-dom | 19.3.1 | MIT | https://react.dev/ |
| react-error-boundary | 6.1.2 | MIT | https://react-error-boundary-lib.vercel.app/ |
| react-force-graph-2d | 1.29.1 | MIT | https://github.com/vasturiano/react-force-graph |
| react-is | 16.13.1 | MIT | https://reactjs.org/ |
| react-is | 17.0.2 | MIT | https://reactjs.org/ |
| react-is | 18.3.1 | MIT | https://reactjs.org/ |
| react-kapsule | 2.6.0 | MIT | https://github.com/vasturiano/react-kapsule |
| react-lite-youtube-embed | 3.5.1 | MIT | https://github.com/ibrahimcesar/react-lite-youtube-embed |
| react-medium-image-zoom | 5.4.3 | BSD-3-Clause | https://github.com/rpearce/react-medium-image-zoom |
| react-remove-scroll | 2.7.2 | MIT |  |
| react-remove-scroll-bar | 2.3.8 | MIT |  |
| react-style-singleton | 2.2.3 | MIT | https://github.com/theKashey/react-style-singleton#readme |
| read-binary-file-arch | 1.0.6 | MIT | https://github.com/samuelmaddock/read-binary-file-arch#readme |
| readable-stream | 2.3.8 | MIT |  |
| readdirp | 3.6.0 | MIT | https://github.com/paulmillr/readdirp |
| readdirp | 5.1.1 | MIT | https://github.com/paulmillr/readdirp |
| recast | 0.23.21 | MIT | http://github.com/benjamn/recast |
| rehype-minify-whitespace | 6.0.2 | MIT |  |
| rehype-parse | 9.0.1 | MIT | https://github.com/rehypejs/rehype |
| rehype-remark | 10.0.1 | MIT |  |
| rehype-stringify | 10.0.1 | MIT | https://github.com/rehypejs/rehype |
| remark-frontmatter | 5.0.0 | MIT |  |
| remark-gfm | 4.0.1 | MIT |  |
| remark-github-alerts | 0.1.1 | MIT | https://github.com/hyoban/remark-github-alerts#readme |
| remark-math | 6.0.0 | MIT |  |
| remark-parse | 11.0.0 | MIT | https://remark.js.org |
| remark-rehype | 11.1.2 | MIT |  |
| remark-stringify | 11.0.0 | MIT | https://remark.js.org |
| require-directory | 2.1.1 | MIT | https://github.com/troygoode/node-require-directory/ |
| require-from-string | 2.0.2 | MIT |  |
| resedit | 1.7.2 | MIT | https://github.com/jet2jet/resedit-js |
| resolve-alpn | 1.2.1 | MIT | https://github.com/szmarczak/resolve-alpn#readme |
| resolve-from | 4.0.0 | MIT |  |
| resolve-from | 5.0.0 | MIT |  |
| resolve-pkg-maps | 1.0.0 | MIT |  |
| responselike | 2.0.1 | MIT |  |
| restore-cursor | 5.1.0 | MIT |  |
| retry | 0.12.0 | MIT | https://github.com/tim-kos/node-retry |
| reusify | 1.1.0 | MIT | https://github.com/mcollina/reusify#readme |
| rimraf | 2.6.3 | ISC |  |
| roarr | 2.15.4 | BSD-3-Clause |  |
| robust-predicates | 3.0.3 | Unlicense |  |
| rolldown | 1.2.18 | MIT | https://rolldown.rs/ |
| rollup | 4.68.1 | MIT | https://rollupjs.org/ |
| rope-sequence | 1.3.4 | MIT |  |
| roughjs | 4.6.4 | MIT | https://roughjs.com |
| roughjs | 4.6.6 | MIT | https://roughjs.com |
| router | 2.2.0 | MIT |  |
| run-applescript | 7.1.0 | MIT |  |
| run-parallel | 1.2.0 | MIT | https://github.com/feross/run-parallel |
| rw | 1.3.3 | BSD-3-Clause | https://github.com/mbostock/rw |
| safe-buffer | 5.1.2 | MIT | https://github.com/feross/safe-buffer |
| safer-buffer | 2.1.2 | MIT |  |
| sanitize-filename | 1.6.5 | WTFPL OR ISC |  |
| sass | 1.51.0 | MIT | https://github.com/sass/dart-sass |
| sax | 1.6.1 | BlueOak-1.0.0 |  |
| saxes | 6.0.0 | ISC |  |
| scheduler | 0.28.0 | MIT | https://react.dev/ |
| scheduler-polyfill | 1.3.0 | Apache-2.0 | https://github.com/GoogleChromeLabs/scheduler-polyfill |
| semver | 5.7.3 | ISC |  |
| semver | 6.3.2 | ISC |  |
| semver | 7.7.4 | ISC |  |
| semver | 7.8.6 | ISC |  |
| semver-compare | 1.0.0 | MIT | https://github.com/substack/semver-compare |
| send | 1.2.1 | MIT |  |
| serialize-error | 7.0.1 | MIT |  |
| serve-static | 2.2.1 | MIT |  |
| setprototypeof | 1.2.0 | ISC | https://github.com/wesleytodd/setprototypeof |
| shadcn | 4.13.0 | MIT |  |
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
| sisteransi | 1.0.5 | MIT |  |
| slash | 3.0.0 | MIT |  |
| slice-ansi | 4.0.0 | MIT |  |
| sliced | 1.0.1 | MIT |  |
| smol-toml | 1.9.1 | BSD-3-Clause |  |
| sonner | 2.0.7 | MIT | https://sonner.emilkowal.ski/ |
| source-map | 0.6.1 | BSD-3-Clause | https://github.com/mozilla/source-map |
| source-map | 0.7.6 | BSD-3-Clause | https://github.com/mozilla/source-map |
| source-map-js | 1.2.2 | BSD-3-Clause | https://github.com/7rulnik/source-map-js |
| source-map-support | 0.5.21 | MIT |  |
| space-separated-tokens | 2.0.2 | MIT |  |
| sprintf-js | 1.1.3 | BSD-3-Clause |  |
| ssh2 | 1.17.0 | MIT |  |
| stackback | 0.0.2 | MIT |  |
| stat-mode | 1.0.0 | MIT | https://github.com/TooTallNate/stat-mode |
| statuses | 2.0.2 | MIT |  |
| std-env | 3.10.0 | MIT |  |
| stdin-discarder | 0.2.2 | MIT |  |
| stdin-discarder | 0.3.2 | MIT |  |
| string_decoder | 1.1.1 | MIT | https://github.com/nodejs/string_decoder |
| string-width | 4.2.3 | MIT |  |
| string-width | 7.2.0 | MIT |  |
| string-width | 8.2.1 | MIT |  |
| stringify-entities | 4.0.4 | MIT |  |
| stringify-object | 5.0.0 | BSD-2-Clause |  |
| strip-ansi | 6.0.1 | MIT |  |
| strip-ansi | 7.2.0 | MIT |  |
| strip-bom | 3.0.0 | MIT |  |
| strip-final-newline | 2.0.0 | MIT |  |
| strip-final-newline | 4.0.0 | MIT |  |
| strip-json-comments | 5.0.3 | MIT |  |
| strip-literal | 3.1.0 | MIT | https://github.com/antfu/strip-literal#readme |
| style-mod | 4.1.4 | MIT | https://code.haverbeke.berlin/marijn/style-mod |
| stylelint | 16.26.1 | MIT | https://stylelint.io |
| stylis | 4.4.0 | MIT | https://github.com/thysultan/stylis.js |
| sumchecker | 3.0.1 | Apache-2.0 | https://github.com/malept/sumchecker#readme |
| supports-color | 7.2.0 | MIT |  |
| supports-hyperlinks | 3.2.0 | MIT |  |
| svg-tags | 1.0.0 | MIT |  |
| systeminformation | 5.33.22 | MIT | https://systeminformation.io |
| table | 6.10.1 | BSD-3-Clause |  |
| tailwind-merge | 3.6.0 | MIT | https://github.com/dcastil/tailwind-merge |
| tailwind-merge | 3.7.0 | MIT | https://github.com/dcastil/tailwind-merge |
| tailwind-scrollbar | 4.0.2 | MIT | https://github.com/adoxography/tailwind-scrollbar |
| tailwindcss | 4.3.2 | MIT | https://tailwindcss.com |
| tailwindcss | 4.3.5 | MIT | https://tailwindcss.com |
| tapable | 2.3.4 | MIT | https://github.com/webpack/tapable |
| tar | 7.5.22 | BlueOak-1.0.0 |  |
| temp | 0.9.4 | MIT |  |
| temp-file | 3.4.0 | MIT | https://github.com/develar/temp-file |
| tiny-async-pool | 1.3.0 | MIT |  |
| tiny-invariant | 1.3.3 | MIT |  |
| tinybench | 2.9.0 | MIT |  |
| tinycolor2 | 1.6.0 | MIT |  |
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
| to-regex-range | 5.0.1 | MIT | https://github.com/micromatch/to-regex-range |
| toidentifier | 1.0.1 | MIT |  |
| tough-cookie | 6.1.0 | BSD-3-Clause | https://github.com/salesforce/tough-cookie |
| tr46 | 7.0.0 | MIT |  |
| trim-lines | 3.0.1 | MIT |  |
| trim-trailing-lines | 2.1.0 | MIT |  |
| trough | 2.2.0 | MIT |  |
| truncate-utf8-bytes | 1.0.2 | WTFPL | https://github.com/parshap/truncate-utf8-bytes#readme |
| ts-dedent | 2.3.0 | MIT |  |
| ts-morph | 26.0.0 | MIT | https://github.com/dsherret/ts-morph#readme |
| tsconfck | 3.1.6 | MIT | https://github.com/dominikg/tsconfck/tree/main/packages/tsconfck#readme |
| tsconfig-paths | 4.2.0 | MIT |  |
| tslib | 2.9.1 | 0BSD | https://www.typescriptlang.org/ |
| tsx | 4.23.15 | MIT | https://tsx.hirok.io |
| tunnel-rat | 0.1.2 | MIT | https://github.com/pmndrs/tunnel-rat#readme |
| tw-animate-css | 1.4.0 | MIT | https://github.com/Wombosvideo/tw-animate-css#readme |
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
| unicorn-magic | 0.3.0 | MIT |  |
| unified | 11.0.5 | MIT | https://unifiedjs.com |
| unified-lint-rule | 3.0.1 | MIT |  |
| unist-util-find-after | 5.0.0 | MIT |  |
| unist-util-is | 6.0.1 | MIT |  |
| unist-util-position | 5.0.0 | MIT |  |
| unist-util-position-from-estree | 2.0.0 | MIT |  |
| unist-util-remove-position | 5.0.0 | MIT |  |
| unist-util-stringify-position | 4.0.0 | MIT |  |
| unist-util-visit | 5.1.0 | MIT |  |
| unist-util-visit | 5.2.0 | MIT |  |
| unist-util-visit-parents | 6.0.2 | MIT |  |
| universalify | 0.1.2 | MIT | https://github.com/RyanZim/universalify#readme |
| universalify | 2.0.1 | MIT | https://github.com/RyanZim/universalify#readme |
| unpipe | 1.0.0 | MIT |  |
| unzipper | 0.12.5 | MIT |  |
| update-browserslist-db | 1.3.4 | MIT |  |
| use-callback-ref | 1.3.3 | MIT |  |
| use-sidecar | 1.1.3 | MIT | https://github.com/theKashey/use-sidecar |
| use-sync-external-store | 1.7.0 | MIT |  |
| utf8-byte-length | 1.0.5 | (WTFPL OR MIT) | https://github.com/parshap/utf8-byte-length#readme |
| util-deprecate | 1.0.2 | MIT | https://github.com/TooTallNate/util-deprecate |
| uuid | 11.1.1 | MIT |  |
| validate-npm-package-name | 7.0.2 | ISC | https://github.com/npm/validate-npm-package-name |
| vary | 1.1.2 | MIT |  |
| vfile | 6.0.3 | MIT |  |
| vfile-location | 5.0.3 | MIT |  |
| vfile-message | 4.0.3 | MIT |  |
| vfile-message | 4.0.4 | MIT |  |
| vite | 7.3.8 | MIT | https://vite.dev |
| vite | 8.3.7 | MIT | https://vite.dev |
| vite-node | 3.2.4 | MIT | https://github.com/vitest-dev/vitest/blob/main/packages/vite-node#readme |
| vite-tsconfig-paths | 6.1.1 | MIT |  |
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
| weakmap-polyfill | 2.0.4 | MIT | https://github.com/polygonplanet/weakmap-polyfill |
| web-namespaces | 2.0.1 | MIT |  |
| web-vitals | 5.3.0 | Apache-2.0 |  |
| webcrypto-core | 1.9.2 | MIT | https://github.com/PeculiarVentures/webcrypto-core#readme |
| webidl-conversions | 8.0.1 | BSD-2-Clause |  |
| webworkify | 1.5.0 | MIT | https://github.com/substack/webworkify |
| whatwg-mimetype | 5.0.0 | MIT |  |
| whatwg-url | 17.3.0 | MIT |  |
| which | 1.3.1 | ISC |  |
| which | 2.0.2 | ISC |  |
| which | 4.0.0 | ISC |  |
| which | 5.0.0 | ISC |  |
| which | 6.0.1 | ISC |  |
| why-is-node-running | 2.3.0 | MIT | https://github.com/mafintosh/why-is-node-running |
| wrap-ansi | 7.0.0 | MIT |  |
| wrappy | 1.0.2 | ISC | https://github.com/npm/wrappy |
| write-file-atomic | 5.0.1 | ISC | https://github.com/npm/write-file-atomic |
| write-file-atomic | 8.0.0 | ISC | https://github.com/npm/write-file-atomic |
| ws | 8.22.2 | MIT | https://github.com/websockets/ws |
| wsl-utils | 1.0.1 | MIT |  |
| xml-name-validator | 5.0.0 | Apache-2.0 |  |
| xmlbuilder | 15.1.1 | MIT | http://github.com/oozcitak/xmlbuilder-js |
| xmlchars | 2.2.0 | MIT |  |
| y-codemirror.next | 0.3.5 | MIT | https://github.com/yjs/y-codemirror.next#readme |
| y-indexeddb | 9.0.12 | MIT | https://yjs.dev |
| y-protocols | 1.0.7 | MIT | https://github.com/yjs/y-protocols#readme |
| y18n | 5.0.8 | ISC | https://github.com/yargs/y18n |
| yallist | 3.1.1 | ISC |  |
| yallist | 4.0.0 | ISC |  |
| yallist | 5.0.0 | BlueOak-1.0.0 |  |
| yaml | 2.9.1 | ISC | https://eemeli.org/yaml/ |
| yargs | 17.7.3 | MIT | https://yargs.js.org/ |
| yargs-parser | 21.1.1 | ISC |  |
| yjs | 13.6.31 | MIT | https://docs.yjs.dev |
| yocto-queue | 0.1.0 | MIT |  |
| yocto-spinner | 1.2.2 | MIT |  |
| yoctocolors | 2.2.0 | MIT |  |
| zod | 3.25.76 | MIT | https://zod.dev |
| zod | 4.6.7 | MIT | https://zod.dev |
| zod-to-json-schema | 3.25.2 | ISC |  |
| zustand | 4.5.7 | MIT | https://github.com/pmndrs/zustand |
| zustand | 5.1.0 | MIT | https://github.com/pmndrs/zustand |
| zwitch | 2.0.4 | MIT |  |
