# Linux ASAR 测试文件排除

`electron-builder.yml` 的否定 glob 同时约束应用文件与 electron-builder 收集的运行依赖。过滤测试和 helper 文件名，测试与夹具专用目录，以及 OpenKnowledge 的 fixtures（包含 perf 样本）。运行时公共资产仍由应用和依赖原入口收集。

`node scripts/check-asar-contents.mjs <app.asar>` 通过 electron-builder 自身安装的 `@electron/asar` 枚举真实归档。路径标准化后对测试、helper、test-utils、测试目录及 vendor fixtures 断言，并检查桌面构建标识存在。任一禁入路径都失败并打印其归档路径。

重启后重跑 rc.4 的 Debian 构建，使用工作树已安装的 Electron 44.9.1。rc.4 ASAR 对照共有 247 个名称命中测试、helper 或专用目录规则，检查按预期拒绝。其 Debian 安装包由 `dpkg-deb` 识别为 `huhu`、`0.0.1~rc.4`、`amd64`，141,619,672 B。

### 打包时可变的测试输出

首次候选的路径检查没有匹配到测试源码，但读回归档时构建标识指向其他文件的字节。归档头把 `node_modules/@huhu/editor/test-results/vendor.json` 登记为 1,260,200 B，打包读取时定向测试已把它重写成 4,445 B。映射中的构建标识起始偏移 472,997,173，归档流中实际起始为 471,741,418，两者相差 1,255,755 B，恰好是报告的长度差。

最终过滤同时排除 `test-results`。断言脚本增加归档内应用清单与构建 JSON 的实际解析，核对应用名、版本和提交标识。该检查能区分仅路径正确与能够读出的真实归档。

### 最终结果

最终命令使用项目实际打包配置，`pnpm --filter @huhu/desktop run dist --linux deb --publish never -c.electronDist=<本机 Electron dist 的 realpath> -c.directories.output=/tmp/huhu-task03-verified-deb`。

`/tmp/huhu-task03-verified-deb/linux-unpacked/resources/app.asar` 为 508,744,062 B。脚本退出 0，共检查 50,787 项，读回提交标识 `2c15686fdad180acd2cf883850e9d08a9ce93ccd`。另从 ASAR 读回并逐字节核对了 `out/build-info.json`、`out/main/index.js`、`out/preload/index.cjs` 和 `out/renderer/index.html`。两端 Debian 压缩包大小与指纹见 [G07 记录](g07-budget.md)。

使用最终 Linux 解包目录的 `huhu` 复跑 packaged E2E，4/4 通过，覆盖笔记、任务、导出、内置 Herdr Core、CLI 与 Agent 规则监督进程。[打包应用验证日志](task03-packaged.txt)

从实际 Debian 安装包的 `./opt/HUHU/resources/app.asar` 读取压缩负载，SHA-256 `4ca580e58ee7d757534295873175de629c2a71f87851a7a5007e587bd8316ab2` 与上述检查过的解包 ASAR 完全一致。
