# 补齐 Windows/macOS 预览版
Lead t3p，本机默认 Core，工作区 /home/wta/projects/huhu。用户明确要求 GitHub Actions 构建并发布到现有 v0.0.2-rc.1。沿用 main，无新 worktree。完整原 CI 失败保留；补包 workflow 明确仅构建与打包后冒烟验证。不要本地编译。所有 worker 不带权限绕过参数。
