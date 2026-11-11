# Atomic Editor source provenance — HUHU V4

- Upstream: https://github.com/kenforthewin/atomic-editor
- Reviewed package version: 0.6.2
- Fixed commit: `b6ed65f01bde4510031bc7a495520bc1a7688c66`
- Retrieved through the GitHub connector on 2026-11-06.
- Original LICENSE retained verbatim in `LICENSE`.

Copied upstream paths:

| Local path | Upstream path | Local change |
| --- | --- | --- |
| inline-preview.ts | src/inline-preview.ts | Composition guard; disabled/readOnly task guard; Chinese task aria labels |
| wiki-links.ts | src/wiki-links.ts | Omitted autocomplete contribution and its autocomplete-only helpers; retained rendering/navigation helpers; composition guard and tree-growth rebuild; fallback label keeps target text visible |
| read-only.ts | src/read-only.ts | None |
| tree-progress.ts | src/tree-progress.ts | None |
| highlight.ts | （未拷贝） | HUHU 不启用其自定义高亮解析器，本仓库不放这个文件 |
| atomic-theme.ts | src/atomic-theme.ts | None |
| styles/inline-preview.css | src/styles/inline-preview.css | None; HUHU theme overrides are in editor.css |
| huhu-composition.ts | HUHU integration | New source: composition effect/field |

HUHU uses the low-level factories, not the React wrapper. Wiki suggestions/autocomplete are not shipped in this build; insertion is via HUHU's explicit link form. Atomic editable tables are deliberately not copied: the reviewed serializer drops alignment markers, and upstream issue #18 / PR #19 report table-space input problems. HUHU table preview is a source-preserving block decoration using Lezer Table ranges, marked and DOMPurify; its interaction contract is informed by SoloMD `app/src/lib/cm-live-blocks.ts` at `80d57987dccbeaaff089d39a9ca3112e467778ea`.

Upgrade procedure: diff the fixed upstream files, reapply only documented patches, keep the source-authoritative contract, run `qa/editor-v3.mjs` and `qa/knowledge-v3.mjs`, then perform native IME/browser QA. The synthetic composition test is not native IME certification.

## 本仓库的本地处理

- 每个 .ts 文件顶部加一行 `// @ts-nocheck`（上游未启用本仓库的 exactOptionalPropertyTypes / noUncheckedIndexedAccess 等严格项）；其余内容与固定提交一致。
- 格式化与 lint 不处理这个目录（.oxfmtrc.json / oxlint.json 的忽略项）。
