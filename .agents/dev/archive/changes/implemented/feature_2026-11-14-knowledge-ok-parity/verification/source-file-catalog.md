# OK 与 ORCA 的文件级来源（G01–G03）

[逐文件清单](../../../../../../../docs/upstream/ok-parity/source-file-catalog.jsonl.gz)来自两个固定 Git 树。每个上游文件列出固定点对象、目标、复制／适配／略过及原因。OK 的样式生成目标和 pnpm 补丁、ORCA 的构建文件及适配测试也登记在清单中。压缩文件逐行包含一个来源的 JSON 对象，可在仓库根运行以下命令逐文件查找。

```sh
node --input-type=module -e '
  import {readFileSync} from "node:fs";
  import {gunzipSync} from "node:zlib";
  for (const line of gunzipSync(readFileSync(process.argv[1])).toString().trim().split("\n")) {
    const source = JSON.parse(line);
    for (const row of source.files.filter(({upstream}) => upstream.includes(process.argv[2])))
      console.log(source.source, JSON.stringify(row));
  }' docs/upstream/ok-parity/source-file-catalog.jsonl.gz PdfViewer
```

| 来源 | 固定点 | 跟踪文件 | 重放清单 | 差异包 |
| --- | --- | ---: | --- | --- |
| Open Knowledge | `44a2e0a6acce5952da0764746e3693fded5025b4` | 7,621 | [vendor-replay.json](../../../../../../../docs/upstream/ok-parity/vendor-replay.json) | [vendor-replay.patch.gz](../../../../../../../docs/upstream/ok-parity/vendor-replay.patch.gz) |
| ORCA | `7041ea022826ec19d627cd3a129b665822e7bf0a` | 39,025 | [orca-replay.json](../../../../../../../docs/upstream/ok-parity/orca-replay.json) | [orca-replay.patch.gz](../../../../../../../docs/upstream/ok-parity/orca-replay.patch.gz) |

```sh
export OK_SRC=/path/to/open-knowledge ORCA_SRC=/path/to/orca
node scripts/ok-patches.mjs --check
node scripts/ok-patches.mjs --check-catalog
node scripts/ok-patches.mjs --check-vendor-directories
node scripts/ok-patches.mjs --replay
node scripts/ok-patches.mjs --orca --replay
```

`--check-catalog` 用固定对象重新生成，逐字节核对记录并拒绝目录漏登记。独立 CI job 用 `--check-vendor-directories` 核对两个目标目录的文件集合与 SHA-256。重放另外从固定 Git 对象取原始字节、应用差异包，再核对整目录。修改 vendor 后，先更新各自的 PATCHES.md，再以 `--refresh-replay`（ORCA 附加 `--orca`）和 `--refresh-catalog` 刷新产物。

切片边界与补丁增量见 [slice-patch-delta.md](slice-patch-delta.md)。历史闭包与原始哈希见 [closure-manifest.json](../../../../../../../docs/upstream/ok-parity/closure-manifest.json)。G04 的文件级结果见 vendor-test-catalog.json（本机原件 `temp/dev/feature_2026-11-14-knowledge-ok-parity/integration/legacy-7984bff4/vendor-test-catalog.json`）。

[固定上游测试枚举、Vitest 求差与跳过条件](vendor-test-catalog.md)。
