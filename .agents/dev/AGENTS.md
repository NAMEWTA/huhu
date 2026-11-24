# 开发资料导航

- `./changes/` 保存活跃任务；`./notes/` 保存仍指导开发的长期知识。
- `./deploy/` 保存环境与发布证据；`./archive/` 保存历史，不代表当前实现。
- `./project/` 保存项目非秘密配置；`./context/` 保存开发环境、资源预算、能力限制与任务上下文。
- `./worktree/` 放忽略的 Git 检出。运行原件放项目根 `temp/dev/<change-id>/` 下的 `tasks/<task-stem>/<run-id>/` 或 `integration/<run-id>/`，不入 Git。`task-stem` 为票据去掉 `.md` 的名称。
- 路径相对于本文件所在目录；按任务读取相关子目录的 `AGENTS.md` 和少量记录，不整库加载。
- 提交前用 `node scripts/check-development-evidence.mjs` 检查暂存后的证据布局。验证原件存入忽略的 `temp/dev/` 或 `temp/system/`。确认原型及恢复资料保留在其专用目录。
- 项目资料不写入 `../skills/`；系统维护资料独立放在 `../system/`。
