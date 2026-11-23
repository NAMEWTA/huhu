# GitHub 预览版交付

仓库为 NAMEWTA/huhu，代码直接交付 main。当前预览版为 [v0.0.2-rc.1](https://github.com/NAMEWTA/huhu/releases/tag/v0.0.2-rc.1)，[发布记录](releases/2026-11-23-0.0.2-rc.1.md)。

沿用根目录 pnpm build，再由 apps/desktop 的 electron-builder 生成制品；脚本 scripts/accept-linux-candidate.sh 绑定源码提交、制品哈希和固定 provider，按 mode 串行验证。GitHub CI 与本地验证分别记录，不能互相冒充。

发布先创建 prerelease 草稿上传附件，使用 GitHub Release API 逐项核对 uploaded 状态、大小与 SHA-256 后才公开。认证使用已配置 gh 登录，不在仓库保存令牌。发布标签必须指向实际制品提交，后续测试和文档提交另记。

回退可取上一版制品，不假设数据降级兼容。当前无服务器部署、数据迁移或自动更新操作；已提供 Windows x64、macOS Apple Silicon 和 Linux x64 制品；线上账号及用户实机验证另记。

固定版本补包使用 `.github/workflows/preview-platforms.yml`：手动workflow_dispatch输入v0.0.2-rc.1，源码锁定e14bc4c7，不移动标签；两平台包内门禁通过后向现有Release补附件并合并校验清单。Windows下载Core使用PowerShell避免GNU tar解析盘符；macOS包内测试使用短TMPDIR以容纳隔离夹具的Unix socket。原全量CI保持独立且不弱化。
