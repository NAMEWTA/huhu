# Windows 阶段打包与启动检查

Windows x64，构建号 26300，Electron 44.9.1，electron-builder 26.18.0。打包前构建标识是 `7d4fef52af50626c327d03236574f4262a6b6991`。通过 `pnpm --filter @huhu/desktop run dist --win nsis --x64 --publish never` 打包，未配置签名证书。

| 文件 | SHA-256 |
| --- | --- |
| `HUHU-0.0.1-rc.4-win32-x64.exe`，243688958 字节 | `14d44ab4335fa6a0ff5ddb82f2b999fcdb77f73c42665959a326523f045b336a` |
| `win-unpacked/resources/app.asar` | `f7a122897b272a31491fadc8261a45bb0a54b8c90a6af38f4fd6d493ef583f18` |
| `win-unpacked/resources/herdr/win32-x64/herdr-core.exe` | `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d` |

`t38` 打包退出 0。`t42` 从解包后的 HUHU.exe 执行 Windows 包内冒烟，三项在窗口出现前退出 1，POSIX provider 夹具按平台跳过。实际包中的归档索引可读，但第一个失配项为 `node_modules/@huhu/contracts/package.json`。归档索引记录 258 字节，匹配 `7d4fef5` 的同文件。打包扫描后 Lead 合入 W6.0，改变了多份正在读取的工作区文件。归档中已知的 `out/main/index.js`、`out/build-info.json` 及根 `package.json` 内容落在索引预期位置之后 244 字节，各已用索引中记录的 SHA-256 验证。实际归档长度也比末项索引算出的长度多 244 字节。独立进程直接加载包内入口得到语法错误。

原始 Core 输出在原工作区 `temp/issue-baseline/core-finished/t38.log`、`t42.log`。归档探针是 `temp/issue-baseline/inspect-windows-stage.cjs` 和 `find-asar-offset.cjs`。首包只保留为失败证据。下一轮从独立检出的 `1b3b385797eee2dbd9d9af42c57be44dd8ad2562` 固定打包，继续核对索引、真实启动及包内资源。最终批次候选还需 #5 T7.1 和其余模块集成。
