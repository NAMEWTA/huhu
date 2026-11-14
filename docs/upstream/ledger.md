# 复制来源台账

| 编号 | 来源 | 提交 | 目标路径 | 说明 |
| --- | --- | --- | --- | --- |
| R-05 | DSH fcc0ad4 | vendor/{cordis,cosmokit,timer}/src/* | vendor/{cordis,cosmokit,timer}/src/* | 包名改为 @huhu/*，保留 MIT 许可文件与来源行 |
| R-08 | OK 44a2e0a | packages/server/src/file-watcher.ts | packages/vault/src/watch/ | 仅参照批处理/回退/重命名配对思路，按 HUHU 需求精简重写（模式，未复制代码） |
| R-09 | atomic-editor b6ed65f (kenforthewin, 0.6.2) | src/* | packages/editor/src/vendor/atomic/ | 复制并改造（inline-preview、wiki-links、主题、IME 组合保护），保留 MIT 许可文件与来源说明 `UPSTREAM.md` |
| R-24 | open-knowledge 批注锚点 | packages/server/src/comments/anchor.ts、packages/core/src/comments/{passage-match}.ts、markdown/whitespace-char-ref.ts | plugins/notes/src/engine/comments/ | 复制（GPL-3.0-or-later，与本项目许可一致）；类型改为本地 Anchor，删除未使用导出，补 noUncheckedIndexedAccess 守卫 |
| R-40 | orca 7041ea0（Lovecast Inc.，MIT） | src/shared/agent-launch/catalog/tui-agent-config.ts、permissions/tui-agent-permissions.ts、agent-session/options/agent-session-option-catalog-claude-codex.ts、node-cli-command-resolution.ts、agent-launch/choices/agent-choice-cli-apply.ts | plugins/agent-cli/src/shared/catalog.ts、plugins/agent-cli/src/engine/{detect,launch}.ts | 智能体目录的检测命令、完全访问参数、模型 / effort / fast 的 CLI 映射、冲突标志表、安装目录表、启动参数合成顺序；按 HUHU 的三个智能体与数据驱动目录改写，并与本机 claude 2.1.323、codex 0.167.2 的 `--help` 核对 |
| R-41 | orca 7041ea0（Lovecast Inc.，MIT） | src/renderer/src/components/status-bar/icons.tsx（ClaudeIcon、OpenAIIcon）、components/agent/icons/agent-icon-glyphs.tsx（PiIcon） | plugins/agent-cli/src/ui/AgentIcon.tsx | 三个智能体的标识图形（仅用于标识对应工具）；改为数据表加首字母兜底 |
| R-42 | orca 7041ea0（Lovecast Inc.，MIT） | src/renderer/src/components/settings/agents/launch/{AgentDetectionCatalog,AgentCatalogRow,AgentLaunchDefaultsEditor}.tsx、tab-bar/{TabBarCreateEntry,QuickLaunchButton}.tsx、agent/AgentLaunchSetupPanel.tsx | plugins/agent-cli/src/ui/{AgentSettingsPage,LaunchMenu}.tsx | 仅复刻交互与结构（“已安装 N 个已检测”、逐条展开编辑、命令行预览；新建菜单的搜索、新终端、智能体行与子菜单、设置入口），按 HUHU 的组件与中文文案重写，未复制源码 |

