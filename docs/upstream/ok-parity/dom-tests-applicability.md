# 固定上游 DOM 测试适用性

固定 OK 提交为 `44a2e0a6acce5952da0764746e3693fded5025b4`。从 Git 文件树枚举全部 596 个 `*.dom.test.*`，包含各包的测试路径。
对集成基线 `03dc93b` 使用较宽的同名查找，纳入 TypeScript 实现及组件、编辑器、评论、hooks、lib。用它覆盖审查指出的 41 项，并为同样符合条件的文件补充判断。
同名有实现且此前未迁入的文件共 89 项。下表用「是」标记。测试实际运行结果见 [runs.md](../../../.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/parity/runs.md)。

| 结论 | 文件数 |
| --- | ---: |
| 不适用 | 511 |
| 原样迁入 | 77 |
| 适配迁入 | 8 |

| 上游文件 | 基线候选 | 结论 | 目标或适用性依据 |
| --- | --- | --- | --- |
| `packages/app/src/App.dom.test.tsx` | — | 不适用 | App 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/App.history-traversal.dom.test.tsx` | — | 不适用 | App.history-traversal 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/build/electron-mode-class.dom.test.ts` | — | 不适用 | electron-mode-class 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/comments/QueueNewChatRow.dom.test.tsx` | 是 | 不适用 | OK 批注队列启动 Agent 对话，Huhu 批注直接存储。 |
| `packages/app/src/comments/comment-chips.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/comments/comment-chips.dom.test.tsx |
| `packages/app/src/comments/comment-composer-submit.dom.test.tsx` | — | 不适用 | comment-composer-submit 属于OK 评论队列、远端协作或其专属 UI，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/comments/comment-send-footer.dom.test.tsx` | — | 不适用 | comment-send-footer 属于OK 评论队列、远端协作或其专属 UI，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/comments/edit-propagation.dom.test.tsx` | — | 不适用 | edit-propagation 属于OK 评论队列、远端协作或其专属 UI，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/comments/jump-scroll-ownership.dom.test.ts` | — | 不适用 | jump-scroll-ownership 属于OK 评论队列、远端协作或其专属 UI，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/comments/open-thread-panel.dom.test.tsx` | — | 不适用 | open-thread-panel 属于OK 评论队列、远端协作或其专属 UI，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/comments/orphan-deleted-quote.dom.test.tsx` | — | 不适用 | orphan-deleted-quote 属于OK 评论队列、远端协作或其专属 UI，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/comments/project-file-groups.dom.test.tsx` | — | 不适用 | project-file-groups 属于OK 评论队列、远端协作或其专属 UI，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/comments/property-anchor-click.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/comments/property-anchor-click.dom.test.tsx |
| `packages/app/src/comments/property-row-rect.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/comments/property-row-rect.dom.test.tsx |
| `packages/app/src/comments/queue-shortcut-scope.dom.test.tsx` | — | 不适用 | queue-shortcut-scope 属于OK 评论队列、远端协作或其专属 UI，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/comments/queued-toggle.dom.test.tsx` | — | 不适用 | queued-toggle 属于OK 评论队列、远端协作或其专属 UI，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/comments/reveal-comment.dom.test.ts` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/comments/reveal-comment.dom.test.ts |
| `packages/app/src/comments/reveal-thread.dom.test.ts` | — | 不适用 | reveal-thread 属于OK 评论队列、远端协作或其专属 UI，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/comments/thread-card-click.dom.test.tsx` | — | 不适用 | thread-card-click 属于OK 评论队列、远端协作或其专属 UI，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/comments/thread-card-jump-miss.dom.test.tsx` | — | 不适用 | thread-card-jump-miss 属于OK 评论队列、远端协作或其专属 UI，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/comments/thread-card-property-miss.dom.test.tsx` | — | 不适用 | thread-card-property-miss 属于OK 评论队列、远端协作或其专属 UI，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/comments/thread-edit-save.dom.test.tsx` | — | 不适用 | thread-edit-save 属于OK 评论队列、远端协作或其专属 UI，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/comments/thread-edited-stamp.dom.test.tsx` | — | 不适用 | thread-edited-stamp 属于OK 评论队列、远端协作或其专属 UI，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/comments/use-send-queue.dom.test.tsx` | 是 | 不适用 | OK 批注队列与远端发送状态，Huhu 本地提交由批注路由承载。 |
| `packages/app/src/components/ActivityPanelDiffView.dom.test.tsx` | — | 不适用 | ActivityPanelDiffView 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/ActivityPanelDiffView.error-boundary.dom.test.tsx` | — | 不适用 | ActivityPanelDiffView.error-boundary 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/AddPropertiesButton.dom.test.tsx` | — | 不适用 | AddPropertiesButton 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/AddPropertyNameField.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/AddPropertyNameField.dom.test.tsx |
| `packages/app/src/components/AddPropertyRow.add-property-focus.dom.test.tsx` | — | 不适用 | AddPropertyRow.add-property-focus 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/AgentDiffPane.cache-key.dom.test.tsx` | — | 不适用 | AgentDiffPane.cache-key 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/AgentDiffPane.destination.dom.test.tsx` | — | 不适用 | AgentDiffPane.destination 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/AgentDiffPane.overlay-gate.dom.test.tsx` | — | 不适用 | AgentDiffPane.overlay-gate 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/AgentDiffPane.property-scroll.dom.test.tsx` | — | 不适用 | AgentDiffPane.property-scroll 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/AgentIconCluster.dom.test.tsx` | 是 | 不适用 | OK Agent 会话徽标，Huhu 编辑器没有对应会话入口。 |
| `packages/app/src/components/AppErrorBoundary.dom.test.tsx` | — | 不适用 | AppErrorBoundary 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/AppHeader.auth-prompt.dom.test.tsx` | — | 不适用 | AppHeader.auth-prompt 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/AppHeader.dom.test.tsx` | — | 不适用 | AppHeader 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/AppHeader.publish-focus.dom.test.tsx` | — | 不适用 | AppHeader.publish-focus 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/AppMenubar.dom.test.tsx` | — | 不适用 | AppMenubar 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/AssetPreview.dom.test.tsx` | — | 不适用 | AssetPreview 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/AssetPreview.text-dispatch.dom.test.tsx` | — | 不适用 | AssetPreview.text-dispatch 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/AuthModal.dom.test.tsx` | — | 不适用 | AuthModal 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/AuthModal.host-probe.dom.test.tsx` | — | 不适用 | AuthModal.host-probe 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/AutoSyncOnboardingDialog.dom.test.tsx` | — | 不适用 | AutoSyncOnboardingDialog 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/BetaBadge.dom.test.tsx` | — | 不适用 | BetaBadge 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/BottomComposer.dom.test.tsx` | — | 不适用 | BottomComposer 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/BottomComposer.drop.dom.test.tsx` | — | 不适用 | BottomComposer.drop 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/BranchRecycleBanner.dom.test.tsx` | — | 不适用 | BranchRecycleBanner 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/BugReportHistory.dom.test.tsx` | — | 不适用 | BugReportHistory 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/BugReportHistory.locale.dom.test.tsx` | — | 不适用 | BugReportHistory.locale 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/BugReportSendToast.dom.test.tsx` | — | 不适用 | BugReportSendToast 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/CloneDialog.dom.test.tsx` | — | 不适用 | CloneDialog 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/CommandPalette.dom.test.tsx` | — | 不适用 | CommandPalette 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/ComposerAddMenu.dom.test.tsx` | — | 不适用 | ComposerAddMenu 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/ComposerContextChips.dom.test.tsx` | — | 不适用 | ComposerContextChips 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/ConflictView.dom.test.tsx` | — | 不适用 | ConflictView 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/ConflictsSection.dom.test.tsx` | — | 不适用 | ConflictsSection 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/ConnectingBanner.dom.test.tsx` | — | 不适用 | ConnectingBanner 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/ConsentDialogBody.dom.test.tsx` | — | 不适用 | ConsentDialogBody 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/CopyButton.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/CopyButton.dom.test.tsx |
| `packages/app/src/components/CreateProjectDialog.cascade-staleness.dom.test.tsx` | — | 不适用 | CreateProjectDialog.cascade-staleness 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/CreateProjectDialog.pack.dom.test.tsx` | — | 不适用 | CreateProjectDialog.pack 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/CreateProjectDialog.runtime.dom.test.tsx` | — | 不适用 | CreateProjectDialog.runtime 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/CreateProjectMenuTrigger.dom.test.tsx` | — | 不适用 | CreateProjectMenuTrigger 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/CreatedItemsList.dom.test.tsx` | — | 不适用 | CreatedItemsList 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/DiffViewBoundary.dom.test.tsx` | — | 不适用 | DiffViewBoundary 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/DiffViewBoundary.missing-conflict.dom.test.tsx` | — | 不适用 | DiffViewBoundary.missing-conflict 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/DocChangeNotice.dom.test.tsx` | — | 不适用 | DocChangeNotice 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/DocPanel.dom.test.tsx` | 是 | 不适用 | Huhu 用笔记详情栏承载大纲、链接、属性和批注，OK 的独立面板布局未挂载。 |
| `packages/app/src/components/DocPanelToggle.dom.test.tsx` | — | 不适用 | DocPanelToggle 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/DockWorkspace.dom.test.tsx` | — | 不适用 | DockWorkspace 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/DocumentErrorBoundary.dom.test.tsx` | — | 不适用 | DocumentErrorBoundary 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/EditorActivityPool.conflict-swap.dom.test.tsx` | — | 不适用 | EditorActivityPool.conflict-swap 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/EditorActivityPool.mount-gate.dom.test.tsx` | — | 不适用 | EditorActivityPool.mount-gate 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/EditorActivityPool.park.dom.test.tsx` | — | 不适用 | EditorActivityPool.park 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/EditorActivityPool.scroll-suppression.dom.test.tsx` | — | 不适用 | EditorActivityPool.scroll-suppression 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/EditorActivityPool.toolbar-inset.dom.test.tsx` | — | 不适用 | EditorActivityPool.toolbar-inset 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/EditorActivityPool.warm-skeleton.dom.test.tsx` | — | 不适用 | EditorActivityPool.warm-skeleton 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/EditorArea.composer-surface.dom.test.tsx` | — | 不适用 | EditorArea.composer-surface 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/EditorArea.dom.test.tsx` | — | 不适用 | EditorArea 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/EditorArea.lint-config-dispatch.dom.test.tsx` | — | 不适用 | EditorArea.lint-config-dispatch 的服务端诊断入口按 OP-D19 Q2 排除。 |
| `packages/app/src/components/EditorArea.share-receive-miss.dom.test.tsx` | — | 不适用 | EditorArea.share-receive-miss 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/EditorBreadcrumb.dom.test.tsx` | — | 不适用 | EditorBreadcrumb 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/EditorFooter.checkout.dom.test.tsx` | — | 不适用 | EditorFooter.checkout 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/EditorFooter.dom.test.tsx` | — | 不适用 | EditorFooter 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/EditorHeader.dom.test.tsx` | — | 不适用 | EditorHeader 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/EditorPane.agents-panel-reload-visibility.dom.test.tsx` | — | 不适用 | EditorPane.agents-panel-reload-visibility 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/EditorPane.dom.test.tsx` | — | 不适用 | EditorPane 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/EditorTabTargetMenuItems.dom.test.tsx` | — | 不适用 | EditorTabTargetMenuItems 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/EditorTabs.dnd-portal.dom.test.tsx` | — | 不适用 | EditorTabs.dnd-portal 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/EditorTabs.dom.test.tsx` | — | 不适用 | EditorTabs 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/EditorToolbar.dom.test.tsx` | — | 不适用 | EditorToolbar 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/EditorToolbar.slides.dom.test.tsx` | — | 不适用 | EditorToolbar.slides 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/EditorWorkspace.dom.test.tsx` | — | 不适用 | EditorWorkspace 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/EmptyEditorState.dom.test.tsx` | — | 不适用 | EmptyEditorState 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/EnableSyncConfirmDialog.dom.test.tsx` | — | 不适用 | EnableSyncConfirmDialog 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/ExcalidrawDocEditor.langcode.dom.test.tsx` | — | 不适用 | ExcalidrawDocEditor.langcode 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/ExploreSkills.dom.test.tsx` | — | 不适用 | ExploreSkills 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/FeedbackCard.dom.test.tsx` | — | 不适用 | FeedbackCard 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/FeedbackForm.attachments.dom.test.tsx` | — | 不适用 | FeedbackForm.attachments 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/FeedbackFormDialog.dom.test.tsx` | — | 不适用 | FeedbackFormDialog 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/FeedbackMenuTrigger.dom.test.tsx` | — | 不适用 | FeedbackMenuTrigger 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/FileListHost.dom.test.tsx` | — | 不适用 | FileListHost 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/FileListToggle.dom.test.tsx` | — | 不适用 | FileListToggle 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/FileSidebar.dom.test.tsx` | — | 不适用 | FileSidebar 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/FileSidebar.menu-action.dom.test.tsx` | — | 不适用 | FileSidebar.menu-action 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/FileSidebar.share.dom.test.tsx` | — | 不适用 | FileSidebar.share 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/FileTargetMenuItems.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/FileTargetMenuItems.dom.test.tsx |
| `packages/app/src/components/FileTargetRenameDialog.dom.test.tsx` | — | 不适用 | FileTargetRenameDialog 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/FileTree.create.dom.test.tsx` | — | 不适用 | FileTree.create 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/FileTree.duplicate.dom.test.tsx` | — | 不适用 | FileTree.duplicate 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/FileTree.preview-tabs.dom.test.tsx` | — | 不适用 | FileTree.preview-tabs 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/FileTree.problem-badge.dom.test.tsx` | — | 不适用 | FileTree.problem-badge 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/FileTree.restart-server.dom.test.tsx` | — | 不适用 | FileTree.restart-server 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/FileTree.selection-mirror.dom.test.tsx` | — | 不适用 | FileTree.selection-mirror 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/FileTree.share.dom.test.tsx` | — | 不适用 | FileTree.share 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/FileTree.showall-lazy.dom.test.tsx` | — | 不适用 | FileTree.showall-lazy 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/FileTree.showall-lifecycle.dom.test.tsx` | — | 不适用 | FileTree.showall-lifecycle 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/FileTree.showall-truncation.dom.test.tsx` | — | 不适用 | FileTree.showall-truncation 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/FileTree.superseded-refresh.dom.test.tsx` | — | 不适用 | FileTree.superseded-refresh 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/FileTreeFilteredToZeroNotice.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/FileTreeFilteredToZeroNotice.dom.test.tsx |
| `packages/app/src/components/FrontmatterRow.enum.dom.test.tsx` | — | 不适用 | FrontmatterRow.enum 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/GraphPanel.external-link-open.dom.test.tsx` | — | 不适用 | GraphPanel.external-link-open 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/GraphPanel.fullscreen-safe-area.dom.test.tsx` | — | 不适用 | GraphPanel.fullscreen-safe-area 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/GraphPanel.skill-nodes-toggle.dom.test.tsx` | — | 不适用 | GraphPanel.skill-nodes-toggle 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/HeaderPaneButtons.dom.test.tsx` | — | 不适用 | HeaderPaneButtons 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/HeaderSearchBar.dom.test.tsx` | — | 不适用 | HeaderSearchBar 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/HelpPopover.dom.test.tsx` | — | 不适用 | HelpPopover 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/ImageAttachmentTextarea.dom.test.tsx` | — | 不适用 | ImageAttachmentTextarea 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/ImportSkillForm.dom.test.tsx` | — | 不适用 | ImportSkillForm 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/InstanceBadge.dom.test.tsx` | — | 不适用 | InstanceBadge 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/LargeFileEditorState.dom.test.tsx` | — | 不适用 | LargeFileEditorState 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/LinksPanel.dom.test.tsx` | 是 | 不适用 | OK 文档链接侧栏的导航与宽度行为由 Huhu 详情栏承载，本地链接通过宿主路由另验。 |
| `packages/app/src/components/LintConfigEditor.dom.test.tsx` | — | 不适用 | LintConfigEditor 的服务端诊断入口按 OP-D19 Q2 排除。 |
| `packages/app/src/components/McpConsentDialog.dom.test.tsx` | — | 不适用 | McpConsentDialog 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/MermaidDocEditor.dom.test.tsx` | — | 不适用 | MermaidDocEditor 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/NavigationHistoryControls.dom.test.tsx` | — | 不适用 | NavigationHistoryControls 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/NavigatorApp.dom.test.tsx` | — | 不适用 | NavigatorApp 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/NavigatorApp.first-run.dom.test.tsx` | — | 不适用 | NavigatorApp.first-run 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/NavigatorApp.menu-action.dom.test.tsx` | — | 不适用 | NavigatorApp.menu-action 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/NavigatorApp.settings.dom.test.tsx` | — | 不适用 | NavigatorApp.settings 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/NewSkillDialog.dom.test.tsx` | — | 不适用 | NewSkillDialog 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/NewTemplateDialog.dom.test.tsx` | — | 不适用 | NewTemplateDialog 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/NewWorktreeDialog.dom.test.tsx` | — | 不适用 | NewWorktreeDialog 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/NotInSidebarIndicator.dom.test.tsx` | — | 不适用 | NotInSidebarIndicator 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/NoteWindowDeletedState.dom.test.tsx` | — | 不适用 | NoteWindowDeletedState 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/NoteWindowMainActionReceiver.dom.test.ts` | — | 不适用 | NoteWindowMainActionReceiver 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/NothingOpen.dom.test.tsx` | — | 不适用 | NothingOpen 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/OkBlob.rage.dom.test.tsx` | — | 不适用 | OkBlob.rage 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/OkBlobRunner.dom.test.tsx` | — | 不适用 | OkBlobRunner 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/OkBlobRunnerEasterEgg.dom.test.tsx` | — | 不适用 | OkBlobRunnerEasterEgg 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/OkBlobRunnerPage.dom.test.tsx` | — | 不适用 | OkBlobRunnerPage 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/OnboardingCard.dom.test.tsx` | — | 不适用 | OnboardingCard 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/OnboardingCardMount.dom.test.tsx` | — | 不适用 | OnboardingCardMount 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/OutlinePanel.dispatch.dom.test.tsx` | — | 不适用 | OutlinePanel.dispatch 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/OutlinePanel.stale-result.dom.test.tsx` | — | 不适用 | OutlinePanel.stale-result 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/PackCardGrid.dom.test.tsx` | — | 不适用 | PackCardGrid 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/PageHeader.preview-promotion.dom.test.tsx` | — | 不适用 | PageHeader.preview-promotion 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/PageListContext.identity-targets.dom.test.tsx` | — | 不适用 | PageListContext.identity-targets 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/PageListContext.loading-stability.dom.test.tsx` | — | 不适用 | PageListContext.loading-stability 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/PageListContext.push-coalescing.dom.test.tsx` | — | 不适用 | PageListContext.push-coalescing 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/PageListContext.teardown-reporting.dom.test.tsx` | — | 不适用 | PageListContext.teardown-reporting 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/ProblemsPanel.dom.test.tsx` | 是 | 不适用 | 服务端 Lint 和 Problems 面板按 OP-D19 Q2 排除。 |
| `packages/app/src/components/ProblemsPanel.okf-nav.dom.test.tsx` | — | 不适用 | ProblemsPanel.okf-nav 的服务端诊断入口按 OP-D19 Q2 排除。 |
| `packages/app/src/components/ProjectSwitcher.dom.test.tsx` | — | 不适用 | ProjectSwitcher 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/PropertyDiffBlock.dom.test.tsx` | — | 不适用 | PropertyDiffBlock 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/PropertyDisclosure.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/PropertyDisclosure.dom.test.tsx |
| `packages/app/src/components/PropertyDisplayRow.dom.test.tsx` | — | 不适用 | PropertyDisplayRow 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/PropertyInlineLinks.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/PropertyInlineLinks.dom.test.tsx |
| `packages/app/src/components/PropertyPanel.block-level-problem.dom.test.tsx` | — | 不适用 | PropertyPanel.block-level-problem 的服务端诊断入口按 OP-D19 Q2 排除。 |
| `packages/app/src/components/PropertyPanel.nested-crud.dom.test.tsx` | — | 不适用 | PropertyPanel.nested-crud 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/PropertyPanel.preview-promotion.dom.test.tsx` | — | 不适用 | PropertyPanel.preview-promotion 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/PropertyPanel.staged-required.dom.test.tsx` | — | 不适用 | PropertyPanel.staged-required 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/PropertyWidgets.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/PropertyWidgets.dom.test.tsx |
| `packages/app/src/components/PublishToGitHubDialog.dom.test.tsx` | — | 不适用 | PublishToGitHubDialog 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/ReadonlyPropertyPanel.dom.test.tsx` | — | 不适用 | ReadonlyPropertyPanel 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/RecentProjectsMenu.dom.test.tsx` | — | 不适用 | RecentProjectsMenu 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/RenderedDiffView.dom.test.tsx` | — | 不适用 | RenderedDiffView 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/RenderedDiffView.live-doc.dom.test.tsx` | — | 不适用 | RenderedDiffView.live-doc 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/ReportBugCrashInviteTrigger.dom.test.tsx` | — | 不适用 | ReportBugCrashInviteTrigger 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/ReportBugDialog.dom.test.tsx` | — | 不适用 | ReportBugDialog 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/ReportBugMenuTrigger.dom.test.tsx` | — | 不适用 | ReportBugMenuTrigger 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/RotatingComposerPlaceholder.dom.test.tsx` | — | 不适用 | RotatingComposerPlaceholder 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/SchemaConfigEditor.dom.test.tsx` | — | 不适用 | SchemaConfigEditor 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/SeedDialog.dom.test.tsx` | — | 不适用 | SeedDialog 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/ServerDriftToast.dom.test.tsx` | — | 不适用 | ServerDriftToast 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/SessionsHost.agents.dom.test.tsx` | — | 不适用 | SessionsHost.agents 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/SessionsHost.terminal-dock.dom.test.tsx` | — | 不适用 | SessionsHost.terminal-dock 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/SessionsHost.terminal-rehydration.dom.test.tsx` | — | 不适用 | SessionsHost.terminal-rehydration 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/SessionsHost.terminal-reload-survival.dom.test.tsx` | — | 不适用 | SessionsHost.terminal-reload-survival 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/SessionsHost.terminal-restore-detached-host.dom.test.tsx` | — | 不适用 | SessionsHost.terminal-restore-detached-host 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/SettingsButton.dom.test.tsx` | — | 不适用 | SettingsButton 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/ShareBranchSwitchDialog.dom.test.tsx` | — | 不适用 | ShareBranchSwitchDialog 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/ShareButton.dom.test.tsx` | — | 不适用 | ShareButton 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/ShareFreshnessWarning.dom.test.tsx` | — | 不适用 | ShareFreshnessWarning 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/ShareMetadataRows.dom.test.tsx` | — | 不适用 | ShareMetadataRows 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/ShareReceiveDialog.dom.test.tsx` | — | 不适用 | ShareReceiveDialog 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/ShareReceiveMissDialog.dom.test.tsx` | — | 不适用 | ShareReceiveMissDialog 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/ShareReceiveMissPanel.dom.test.tsx` | — | 不适用 | ShareReceiveMissPanel 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/SharingModeField.dom.test.tsx` | — | 不适用 | SharingModeField 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/SkillBundlePreview.dom.test.tsx` | — | 不适用 | SkillBundlePreview 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/SkillConsentRow.dom.test.tsx` | — | 不适用 | SkillConsentRow 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/SkillDeleteDialog.warnings.dom.test.tsx` | — | 不适用 | SkillDeleteDialog.warnings 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/SkillDirectoryResult.dom.test.tsx` | — | 不适用 | SkillDirectoryResult 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/SkillEditorActions.dom.test.tsx` | — | 不适用 | SkillEditorActions 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/SkillFileDeleteDialog.dom.test.tsx` | — | 不适用 | SkillFileDeleteDialog 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/SkillFileViewer.dom.test.tsx` | — | 不适用 | SkillFileViewer 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/SkillForkDialog.dom.test.tsx` | — | 不适用 | SkillForkDialog 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/SkillInstallMenu.confirm.dom.test.tsx` | — | 不适用 | SkillInstallMenu.confirm 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/SkillInstallMenu.dom.test.tsx` | — | 不适用 | SkillInstallMenu 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/SkillInstallMenu.rows.dom.test.tsx` | — | 不适用 | SkillInstallMenu.rows 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/SkillPluginBundleDialog.dom.test.tsx` | — | 不适用 | SkillPluginBundleDialog 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/SkillPreviewTab.builtin-actions.dom.test.tsx` | — | 不适用 | SkillPreviewTab.builtin-actions 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/SkillPreviewTab.dom.test.tsx` | — | 不适用 | SkillPreviewTab 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/SkillPreviewTab.redirect.dom.test.tsx` | — | 不适用 | SkillPreviewTab.redirect 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/SkillProperties.dom.test.tsx` | — | 不适用 | SkillProperties 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/SkillRevealMenuItem.dom.test.tsx` | — | 不适用 | SkillRevealMenuItem 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/SkillScopeSegment.dom.test.tsx` | — | 不适用 | SkillScopeSegment 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/SkillTrackInGitDialog.dom.test.tsx` | — | 不适用 | SkillTrackInGitDialog 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/SkillsSidebarDock.height.dom.test.tsx` | — | 不适用 | SkillsSidebarDock.height 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/SkillsSidebarDock.reveal.dom.test.tsx` | — | 不适用 | SkillsSidebarDock.reveal 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/SkillsSidebarSection.pin-keyboard.dom.test.tsx` | — | 不适用 | SkillsSidebarSection.pin-keyboard 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/SkillsSidebarSection.sync.dom.test.tsx` | — | 不适用 | SkillsSidebarSection.sync 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/SkillsTree.install-confirm.dom.test.tsx` | — | 不适用 | SkillsTree.install-confirm 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/SkillsTree.pin-readiness.dom.test.tsx` | — | 不适用 | SkillsTree.pin-readiness 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/SlidesToolbarControls.dom.test.tsx` | — | 不适用 | SlidesToolbarControls 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/SubscribeCard.dom.test.tsx` | — | 不适用 | SubscribeCard 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/SubscribeForm.dom.test.tsx` | — | 不适用 | SubscribeForm 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/SyncBlockingChanges.dom.test.tsx` | — | 不适用 | SyncBlockingChanges 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/SyncStatusBadge.dom.test.tsx` | — | 不适用 | SyncStatusBadge 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/SystemDocSubscriber.dom.test.tsx` | — | 不适用 | SystemDocSubscriber 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/TemplateForm-admission-classification.dom.test.tsx` | — | 不适用 | TemplateForm-admission-classification 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/TemplateForm-admission-detail.dom.test.tsx` | — | 不适用 | TemplateForm-admission-detail 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/TemplateForm.dom.test.tsx` | — | 不适用 | TemplateForm 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/TemplateForm.rename.dom.test.tsx` | — | 不适用 | TemplateForm.rename 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/TemplateProperties.dom.test.tsx` | — | 不适用 | TemplateProperties 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/TemplateRow.dom.test.tsx` | — | 不适用 | TemplateRow 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/TerminalAgentConnectionBanner.dom.test.tsx` | — | 不适用 | TerminalAgentConnectionBanner 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/TerminalCliMissingBanner.dom.test.tsx` | — | 不适用 | TerminalCliMissingBanner 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/TerminalCliUnverifiedBanner.dom.test.tsx` | — | 不适用 | TerminalCliUnverifiedBanner 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/TerminalExitNotice.dom.test.tsx` | — | 不适用 | TerminalExitNotice 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/TerminalGate.dom.test.tsx` | — | 不适用 | TerminalGate 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/TerminalNewChatButton.dom.test.tsx` | — | 不适用 | TerminalNewChatButton 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/TerminalNoticeBanner.dom.test.tsx` | — | 不适用 | TerminalNoticeBanner 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/TerminalPanel.dom.test.tsx` | — | 不适用 | TerminalPanel 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/TerminalPanel.launch.dom.test.tsx` | — | 不适用 | TerminalPanel.launch 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/TerminalPanel.resize-scrollback.dom.test.tsx` | — | 不适用 | TerminalPanel.resize-scrollback 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/TerminalStartingNotice.dom.test.tsx` | — | 不适用 | TerminalStartingNotice 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/TerminalTabStrip.dom.test.tsx` | — | 不适用 | TerminalTabStrip 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/TerminalWindowApp.config-provider.dom.test.tsx` | — | 不适用 | TerminalWindowApp.config-provider 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/TerminalWindowApp.dom.test.tsx` | — | 不适用 | TerminalWindowApp 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/TextDocEditor.dom.test.tsx` | — | 不适用 | TextDocEditor 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/TextViewer.error-message.dom.test.tsx` | — | 不适用 | TextViewer.error-message 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/ThemePicker.dom.test.tsx` | — | 不适用 | ThemePicker 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/TimelineDiffPane.destination.dom.test.tsx` | — | 不适用 | TimelineDiffPane.destination 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/TimelineDiffPane.dom.test.tsx` | — | 不适用 | TimelineDiffPane 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/TimelineDiffPane.property-diff.dom.test.tsx` | — | 不适用 | TimelineDiffPane.property-diff 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/TimelineDiffPane.source-diff.dom.test.tsx` | — | 不适用 | TimelineDiffPane.source-diff 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/TimelinePanel.dom.test.tsx` | 是 | 不适用 | OK 时间线读取远端历史，Huhu 使用版本模块，编辑器不挂 Timeline。 |
| `packages/app/src/components/TimelinePanel.restore-dismissal.dom.test.tsx` | — | 不适用 | TimelinePanel.restore-dismissal 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/TrashFailureModal.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/TrashFailureModal.dom.test.tsx |
| `packages/app/src/components/UpdateNotices.dom.test.tsx` | — | 不适用 | UpdateNotices 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/UserText.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/UserText.dom.test.tsx |
| `packages/app/src/components/ValidationFreshness.dom.test.tsx` | — | 不适用 | ValidationFreshness 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/ViewerStatusPane.open-file.dom.test.tsx` | — | 不适用 | ViewerStatusPane.open-file 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/WebProjectName.dom.test.tsx` | — | 不适用 | WebProjectName 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/WorkingAvatar.dom.test.tsx` | — | 不适用 | WorkingAvatar 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/acp/AgentMarkdown.dom.test.tsx` | — | 不适用 | AgentMarkdown 属于Agent 客户端协议、身份与会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/acp/GitHubReferenceCard.dom.test.tsx` | — | 不适用 | GitHubReferenceCard 属于Agent 客户端协议、身份与会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/acp/PlanChecklist.dom.test.tsx` | — | 不适用 | PlanChecklist 属于Agent 客户端协议、身份与会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/acp/RegisteredAgentIcon.dom.test.tsx` | 是 | 不适用 | OK 已注册的 Agent 身份图标，属于 ACP 会话壳。 |
| `packages/app/src/components/acp/ThreadHistoryPanel.dom.test.tsx` | — | 不适用 | ThreadHistoryPanel 属于Agent 客户端协议、身份与会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/acp/ThreadView.comments.dom.test.tsx` | — | 不适用 | ThreadView.comments 属于Agent 客户端协议、身份与会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/acp/ThreadView.composed.dom.test.tsx` | — | 不适用 | ThreadView.composed 属于Agent 客户端协议、身份与会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/acp/ThreadView.composer-placeholder.dom.test.tsx` | — | 不适用 | ThreadView.composer-placeholder 属于Agent 客户端协议、身份与会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/acp/ThreadView.crash-recovery.dom.test.tsx` | — | 不适用 | ThreadView.crash-recovery 属于Agent 客户端协议、身份与会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/acp/ThreadView.dom.test.tsx` | — | 不适用 | ThreadView 属于Agent 客户端协议、身份与会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/acp/ThreadView.draft-delivery.dom.test.tsx` | — | 不适用 | ThreadView.draft-delivery 属于Agent 客户端协议、身份与会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/acp/ThreadView.empty-state.dom.test.tsx` | — | 不适用 | ThreadView.empty-state 属于Agent 客户端协议、身份与会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/acp/ThreadView.registered-draft-delivery.dom.test.tsx` | — | 不适用 | ThreadView.registered-draft-delivery 属于Agent 客户端协议、身份与会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/acp/ThreadView.user-message-actions.dom.test.tsx` | — | 不适用 | ThreadView.user-message-actions 属于Agent 客户端协议、身份与会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/acp/ThreadView.working-loop.dom.test.tsx` | — | 不适用 | ThreadView.working-loop 属于Agent 客户端协议、身份与会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/acp/UserMessageEditor.dom.test.tsx` | — | 不适用 | UserMessageEditor 属于Agent 客户端协议、身份与会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/acp/calendar-day-store.dom.test.tsx` | — | 不适用 | calendar-day-store 属于Agent 客户端协议、身份与会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/acp/live-region-queue.dom.test.ts` | — | 不适用 | live-region-queue 属于Agent 客户端协议、身份与会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/acp/use-minutes-since.dom.test.tsx` | — | 不适用 | use-minutes-since 属于Agent 客户端协议、身份与会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/acp/use-reference-rules.dom.test.tsx` | — | 不适用 | use-reference-rules 属于Agent 客户端协议、身份与会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/acp/working-status-loop.dom.test.tsx` | — | 不适用 | working-status-loop 属于Agent 客户端协议、身份与会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/composer-shared-draft.dom.test.tsx` | — | 不适用 | composer-shared-draft 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/conflict-view-regressions.dom.test.tsx` | — | 不适用 | conflict-view-regressions 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/editor-area-panel-space.dom.test.tsx` | — | 不适用 | editor-area-panel-space 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/editor/SelectionAnnouncer.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/editor/SelectionAnnouncer.dom.test.tsx |
| `packages/app/src/components/empty-state/CopyablePromptList.dom.test.tsx` | — | 不适用 | CopyablePromptList 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/empty-state/CreatePromptComposer.dom.test.tsx` | — | 不适用 | CreatePromptComposer 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/empty-state/EmptyStateHeader.dom.test.tsx` | — | 不适用 | EmptyStateHeader 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/file-tree-extension-badge.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/file-tree-extension-badge.dom.test.tsx |
| `packages/app/src/components/file-tree-problem-indicators.dom.test.tsx` | 是 | 不适用 | 文件树上的 OK 服务端 Lint 问题计数按 OP-D19 Q2 排除。 |
| `packages/app/src/components/file-tree-refresh.dom.test.tsx` | — | 不适用 | file-tree-refresh 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/file-tree-rename-chip.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/file-tree-rename-chip.dom.test.tsx |
| `packages/app/src/components/file-tree-rename-focus-reconciliation.dom.test.tsx` | — | 不适用 | file-tree-rename-focus-reconciliation 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/focus-composer-on-card-pointer.dom.test.ts` | — | 不适用 | focus-composer-on-card-pointer 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/handoff/AgentSplitButton.non-modal.dom.test.tsx` | — | 不适用 | AgentSplitButton.non-modal 属于Agent 接管和外部终端会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/handoff/ExternalHandoffGate.dom.test.tsx` | 是 | 不适用 | OK 外部代理接管权限弹窗依赖其终端代理配置，Huhu 使用自己的工作台。 |
| `packages/app/src/components/handoff/OpenInAgentContextSubmenu.dom.test.tsx` | 是 | 不适用 | 文件树菜单的“交给 Agent”，属于 OK Agent 会话。 |
| `packages/app/src/components/handoff/OpenInAgentContextSubmenu.gate.dom.test.tsx` | — | 不适用 | OpenInAgentContextSubmenu.gate 属于Agent 接管和外部终端会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/handoff/OpenInAgentEmptySpaceSubmenu.dom.test.tsx` | — | 不适用 | OpenInAgentEmptySpaceSubmenu 属于Agent 接管和外部终端会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/handoff/OpenInAgentMenuItem.dom.test.tsx` | 是 | 不适用 | 为 OK Agent 启动文件会话，Huhu 文件打开用 DocTab。 |
| `packages/app/src/components/hidden-activity-dom-retention.dom.test.tsx` | — | 不适用 | hidden-activity-dom-retention 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/icons/icon-ids.dom.test.tsx` | — | 不适用 | icon-ids 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/multi-conflict-both.dom.test.tsx` | — | 不适用 | multi-conflict-both 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/pierre-conflict.dom.test.ts` | — | 不适用 | pierre-conflict 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/properties-collapsed-store.dom.test.tsx` | 是 | 适配迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/properties-collapsed-store.dom.test.tsx。在 Node 26 与 jsdom 的全局对象中注入隔离的 Storage 测试替身。 |
| `packages/app/src/components/rail-hidden-column-clamps-to-zero.dom.test.tsx` | — | 不适用 | rail-hidden-column-clamps-to-zero 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/recent-remove-controls.dom.test.tsx` | — | 不适用 | recent-remove-controls 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/resizable-panel-layout-mismatch.dom.test.tsx` | — | 不适用 | resizable-panel-layout-mismatch 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/resizable-panel-listener-attach.dom.test.tsx` | — | 不适用 | resizable-panel-listener-attach 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/resizable-panel-pointercancel-collapse-drift.dom.test.tsx` | — | 不适用 | resizable-panel-pointercancel-collapse-drift 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/resizable-panel-pointerleave-delta.dom.test.tsx` | — | 不适用 | resizable-panel-pointerleave-delta 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/settings/AboutSection.dom.test.tsx` | — | 不适用 | AboutSection 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/AccountSection.dom.test.tsx` | — | 不适用 | AccountSection 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/AgentConnectionDialogs.dom.test.tsx` | 是 | 不适用 | OK 设置中的 Agent 连接和授权对话框。 |
| `packages/app/src/components/settings/AgentConnectionsSection.dom.test.tsx` | — | 不适用 | AgentConnectionsSection 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/BuiltInSkillsSection.dom.test.tsx` | — | 不适用 | BuiltInSkillsSection 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/ColorThemePicker.dom.test.tsx` | — | 不适用 | ColorThemePicker 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/ContentRulesSection.dom.test.tsx` | — | 不适用 | ContentRulesSection 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/CustomThemeEditor.dom.test.tsx` | — | 不适用 | CustomThemeEditor 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/EnterpriseHostsSection.dom.test.tsx` | — | 不适用 | EnterpriseHostsSection 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/FrontmatterPluginSection.dom.test.tsx` | — | 不适用 | FrontmatterPluginSection 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/HotkeysSection.dom.test.tsx` | — | 不适用 | HotkeysSection 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/LinkPreviewsSection.dom.test.tsx` | — | 不适用 | LinkPreviewsSection 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/LintingSection.dom.test.tsx` | — | 不适用 | LintingSection 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/NetworkAccessSection.dom.test.tsx` | — | 不适用 | NetworkAccessSection 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/OkCliPathRow.dom.test.tsx` | — | 不适用 | OkCliPathRow 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/OkignoreSection.dom.test.tsx` | — | 不适用 | OkignoreSection 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/ProjectSkillSection.dom.test.tsx` | — | 不适用 | ProjectSkillSection 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/SavedThemesTiles.dom.test.tsx` | — | 不适用 | SavedThemesTiles 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/ScopeBadge.dom.test.tsx` | — | 不适用 | ScopeBadge 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/SearchSection.dom.test.tsx` | — | 不适用 | SearchSection 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/SettingsConfigNotices.dom.test.tsx` | — | 不适用 | SettingsConfigNotices 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/SettingsDialogBody.dom.test.tsx` | — | 不适用 | SettingsDialogBody 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/SettingsDialogBody.sections.dom.test.tsx` | — | 不适用 | SettingsDialogBody.sections 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/SettingsDialogBody.sync-mode.dom.test.tsx` | — | 不适用 | SettingsDialogBody.sync-mode 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/SettingsDialogErrorBoundary.dom.test.tsx` | — | 不适用 | SettingsDialogErrorBoundary 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/SettingsDialogShell.dom.test.tsx` | — | 不适用 | SettingsDialogShell 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/SettingsDialogShell.install-flag.dom.test.tsx` | — | 不适用 | SettingsDialogShell.install-flag 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/SettingsDialogShell.link-previews.dom.test.tsx` | — | 不适用 | SettingsDialogShell.link-previews 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/SettingsDialogShell.search.dom.test.tsx` | — | 不适用 | SettingsDialogShell.search 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/SettingsDialogShell.spellcheck.dom.test.tsx` | — | 不适用 | SettingsDialogShell.spellcheck 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/SettingsDialogShell.terminal.dom.test.tsx` | — | 不适用 | SettingsDialogShell.terminal 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/SettingsDialogShell.update-checking.dom.test.tsx` | — | 不适用 | SettingsDialogShell.update-checking 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/SettingsSectionHeader.dom.test.tsx` | — | 不适用 | SettingsSectionHeader 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/SharingSection.dom.test.tsx` | — | 不适用 | SharingSection 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/SkillTargetsPicker.dom.test.tsx` | — | 不适用 | SkillTargetsPicker 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/SkillsManagerSection.dom.test.tsx` | — | 不适用 | SkillsManagerSection 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/SkillsManagerSection.scope.dom.test.tsx` | — | 不适用 | SkillsManagerSection.scope 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/SlidesPluginSection.dom.test.tsx` | — | 不适用 | SlidesPluginSection 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/SpellcheckLanguagesRow.dom.test.tsx` | — | 不适用 | SpellcheckLanguagesRow 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/SpellcheckRow.dom.test.tsx` | — | 不适用 | SpellcheckRow 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/SyncSection.publish-focus.dom.test.tsx` | — | 不适用 | SyncSection.publish-focus 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/TerminalSection.dom.test.tsx` | — | 不适用 | TerminalSection 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/ThemePluginSection.dom.test.tsx` | — | 不适用 | ThemePluginSection 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/ThemePreviewCanvas.dom.test.tsx` | — | 不适用 | ThemePreviewCanvas 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/applies-to-folder-picker.dom.test.tsx` | — | 不适用 | applies-to-folder-picker 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/field-controls.theme-cards.dom.test.tsx` | — | 不适用 | field-controls.theme-cards 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/frontmatter-schema-field-editor.dom.test.tsx` | — | 不适用 | frontmatter-schema-field-editor 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/markdownlint-rule-browser.dom.test.tsx` | — | 不适用 | markdownlint-rule-browser 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/rule-option-field.dom.test.tsx` | — | 不适用 | rule-option-field 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/schema-section.slots.dom.test.tsx` | — | 不适用 | schema-section.slots 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/settings/use-config-form.dom.test.tsx` | — | 不适用 | use-config-form 属于OK 独立设置页、项目配置和主题，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/components/skill-install-cluster.dom.test.ts` | — | 不适用 | skill-install-cluster 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/skill-provenance-mark.dom.test.tsx` | — | 不适用 | skill-provenance-mark 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/terminal-theme.dom.test.ts` | — | 不适用 | terminal-theme 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/components/ui/alert-dialog.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/ui/alert-dialog.dom.test.tsx |
| `packages/app/src/components/ui/alert.dom.test.tsx` | — | 不适用 | alert 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/ui/calendar.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/ui/calendar.dom.test.tsx |
| `packages/app/src/components/ui/card.dom.test.tsx` | — | 不适用 | card 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/ui/combobox.dom.test.tsx` | — | 不适用 | combobox 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/ui/command.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/ui/command.dom.test.tsx |
| `packages/app/src/components/ui/context-menu.dom.test.tsx` | — | 不适用 | context-menu 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/ui/dialog.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/ui/dialog.dom.test.tsx |
| `packages/app/src/components/ui/dropdown-menu.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/ui/dropdown-menu.dom.test.tsx |
| `packages/app/src/components/ui/empty.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/ui/empty.dom.test.tsx |
| `packages/app/src/components/ui/loading-image.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/ui/loading-image.dom.test.tsx |
| `packages/app/src/components/ui/pane-card.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/ui/pane-card.dom.test.tsx |
| `packages/app/src/components/ui/panel.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/ui/panel.dom.test.tsx |
| `packages/app/src/components/ui/popover.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/ui/popover.dom.test.tsx |
| `packages/app/src/components/ui/progress.dom.test.tsx` | — | 不适用 | progress 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/ui/select.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/ui/select.dom.test.tsx |
| `packages/app/src/components/ui/sheet.dom.test.tsx` | — | 不适用 | sheet 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/ui/sidebar-escape.dom.test.tsx` | — | 不适用 | sidebar-escape 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/ui/sidebar.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/ui/sidebar.dom.test.tsx |
| `packages/app/src/components/ui/sidebar.partition.dom.test.tsx` | — | 不适用 | sidebar.partition 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/ui/sidebar.web-shortcut-gate.dom.test.tsx` | — | 不适用 | sidebar.web-shortcut-gate 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/components/ui/spinner.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/ui/spinner.dom.test.tsx |
| `packages/app/src/components/ui/tag-pill-input.dom.test.tsx` | — | 不适用 | tag-pill-input 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/components/ui/tooltip.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/ui/tooltip.dom.test.tsx |
| `packages/app/src/components/use-file-tree-listing.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/components/use-file-tree-listing.dom.test.tsx |
| `packages/app/src/components/use-live-xterm-theme.dom.test.tsx` | — | 不适用 | use-live-xterm-theme 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/editor/BackgroundThrottleReporter.dom.test.tsx` | — | 不适用 | BackgroundThrottleReporter 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/editor/ComposerMentionInput.dom.test.tsx` | 是 | 不适用 | OK AI 组合栏输入，Huhu 正文 @ 引用由宿主索引承载。 |
| `packages/app/src/editor/DocumentContext.branch-fanout.dom.test.tsx` | — | 不适用 | DocumentContext.branch-fanout 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/editor/DocumentContext.dom.test.tsx` | 是 | 不适用 | 套件测试 OK 标签、分屏、远端连接和会话恢复。Huhu 用 DocumentProvider、DocumentSession 和 DocTab。 |
| `packages/app/src/editor/DocumentContext.folder-tab-sync.dom.test.tsx` | — | 不适用 | DocumentContext.folder-tab-sync 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/editor/DocumentContext.getPool-namespace.dom.test.ts` | — | 不适用 | DocumentContext.getPool-namespace 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/editor/DocumentContext.snapshot-stability.dom.test.tsx` | — | 不适用 | DocumentContext.snapshot-stability 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/editor/EditorContent.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/EditorContent.dom.test.tsx |
| `packages/app/src/editor/SourceEditor.dom.test.tsx` | 是 | 适配迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/SourceEditor.dom.test.tsx。保留源码输入、导航、源码模式切换、撤销等测试，移除 Ask AI 与 Problems 面板两组断言。 |
| `packages/app/src/editor/TiptapEditor.hash-ladder.dom.test.tsx` | — | 不适用 | TiptapEditor.hash-ladder 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/editor/TiptapEditor.outline-nav-breadcrumb.dom.test.tsx` | — | 不适用 | TiptapEditor.outline-nav-breadcrumb 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/editor/TiptapEditor.outline-nav.dom.test.tsx` | — | 不适用 | TiptapEditor.outline-nav 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/editor/TiptapEditor.replay-create-retry.dom.test.tsx` | — | 不适用 | TiptapEditor.replay-create-retry 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/editor/anchor-target.dom.test.ts` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/anchor-target.dom.test.ts |
| `packages/app/src/editor/bubble-menu/FootnoteBubbleButton.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/bubble-menu/FootnoteBubbleButton.dom.test.tsx |
| `packages/app/src/editor/bubble-menu/LinkEditPopover.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/bubble-menu/LinkEditPopover.dom.test.tsx |
| `packages/app/src/editor/bubble-menu/ViewInSourceBubbleButton.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/bubble-menu/ViewInSourceBubbleButton.dom.test.tsx |
| `packages/app/src/editor/caret-label-layer.dom.test.ts` | 是 | 不适用 | 协作对端的光标身份标签，Huhu 使用本地单人编辑。 |
| `packages/app/src/editor/caret-reveal.dom.test.ts` | — | 不适用 | caret-reveal 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/editor/clipboard/copy-image.dom.test.ts` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/copy-image.dom.test.ts |
| `packages/app/src/editor/components/CodePreviewEditModal.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/components/CodePreviewEditModal.dom.test.tsx |
| `packages/app/src/editor/components/EmojiInsertPopover.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/components/EmojiInsertPopover.dom.test.tsx |
| `packages/app/src/editor/components/ExcalidrawEmbed.dom.test.tsx` | 是 | 不适用 | 依赖 OK 工作区白板的嵌入与编辑入口，Huhu 笔记未提供该白板应用。 |
| `packages/app/src/editor/components/Image.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/components/Image.dom.test.tsx |
| `packages/app/src/editor/components/Mermaid.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/components/Mermaid.dom.test.tsx |
| `packages/app/src/editor/components/MirrorSource.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/components/MirrorSource.dom.test.tsx |
| `packages/app/src/editor/components/PreviewBlockedNotice.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/components/PreviewBlockedNotice.dom.test.tsx |
| `packages/app/src/editor/components/PropPanel.dom.test.tsx` | — | 适配迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/components/PropPanel.dom.test.tsx。差异见来源重放清单与补丁。 |
| `packages/app/src/editor/components/PropPanel.mirror.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/components/PropPanel.mirror.dom.test.tsx |
| `packages/app/src/editor/components/SrcAutocomplete.dom.test.tsx` | — | 适配迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/components/SrcAutocomplete.dom.test.tsx。差异见来源重放清单与补丁。 |
| `packages/app/src/editor/components/Tabs.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/components/Tabs.dom.test.tsx |
| `packages/app/src/editor/components/TagView.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/components/TagView.dom.test.tsx |
| `packages/app/src/editor/components/Video.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/components/Video.dom.test.tsx |
| `packages/app/src/editor/components/live-doc-pool.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/components/live-doc-pool.dom.test.tsx |
| `packages/app/src/editor/components/snapshot-url-pool.dom.test.ts` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/components/snapshot-url-pool.dom.test.ts |
| `packages/app/src/editor/components/use-mirror-source.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/components/use-mirror-source.dom.test.tsx |
| `packages/app/src/editor/composer-drop-parity.dom.test.tsx` | — | 不适用 | composer-drop-parity 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/editor/composer-mention/ComposerMentionMenu.dom.test.tsx` | 是 | 不适用 | OK AI 组合栏引用建议，正文用独立编辑器建议菜单。 |
| `packages/app/src/editor/composer-mention/ComposerSlashMenu.dom.test.tsx` | 是 | 不适用 | OK AI 组合栏命令，正文斜杠菜单由 Electron 矩阵验证。 |
| `packages/app/src/editor/composer-mention/composer-slash-input.dom.test.tsx` | — | 不适用 | composer-slash-input 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/editor/document-scrollports.dom.test.ts` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/document-scrollports.dom.test.ts |
| `packages/app/src/editor/editor-rig.dom.test.tsx` | — | 不适用 | editor-rig 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/editor/extensions/CodeBlockView.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/CodeBlockView.dom.test.tsx |
| `packages/app/src/editor/extensions/ImageInlineZoomView.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/ImageInlineZoomView.dom.test.tsx |
| `packages/app/src/editor/extensions/ImageReferenceView.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/ImageReferenceView.dom.test.tsx |
| `packages/app/src/editor/extensions/InternalLinkPropPanel.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/InternalLinkPropPanel.dom.test.tsx |
| `packages/app/src/editor/extensions/JsxComponentView.ask-ai.dom.test.tsx` | — | 不适用 | JsxComponentView.ask-ai 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/editor/extensions/JsxComponentView.auto-convert.dom.test.tsx` | — | 不适用 | JsxComponentView.auto-convert 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/editor/extensions/JsxComponentView.mermaid-expand.dom.test.tsx` | — | 不适用 | JsxComponentView.mermaid-expand 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/editor/extensions/JsxComponentView.mirror.dom.test.tsx` | — | 不适用 | JsxComponentView.mirror 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/editor/extensions/JsxInlineView.dom.test.tsx` | — | 适配迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/JsxInlineView.dom.test.tsx。差异见来源重放清单与补丁。 |
| `packages/app/src/editor/extensions/RawMdxFallbackCMView.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/RawMdxFallbackCMView.dom.test.tsx |
| `packages/app/src/editor/extensions/WikiLinkEmbedImageView.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/WikiLinkEmbedImageView.dom.test.tsx |
| `packages/app/src/editor/extensions/WikiLinkPropPanel.destination.dom.test.tsx` | — | 不适用 | WikiLinkPropPanel.destination 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/editor/extensions/WikiLinkPropPanel.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/WikiLinkPropPanel.dom.test.tsx |
| `packages/app/src/editor/extensions/drag-handle.dom.test.ts` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/drag-handle.dom.test.ts |
| `packages/app/src/editor/extensions/marked-inline-leaf-editing.dom.test.tsx` | — | 不适用 | marked-inline-leaf-editing 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/editor/extensions/shared.dom.test.tsx` | — | 适配迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/shared.dom.test.tsx。差异见来源重放清单与补丁。 |
| `packages/app/src/editor/extensions/slash-command-atomicity.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/slash-command-atomicity.dom.test.tsx |
| `packages/app/src/editor/extensions/source-dirty-flip.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/source-dirty-flip.dom.test.tsx |
| `packages/app/src/editor/extensions/source-dirty-fold-atomicity.dom.test.tsx` | — | 适配迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/source-dirty-fold-atomicity.dom.test.tsx。差异见来源重放清单与补丁。 |
| `packages/app/src/editor/extensions/suggestion-atomicity.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/suggestion-atomicity.dom.test.tsx |
| `packages/app/src/editor/extensions/suggestion-floating-ui.dom.test.ts` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/suggestion-floating-ui.dom.test.ts |
| `packages/app/src/editor/extensions/suggestion-ime-triggers.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/suggestion-ime-triggers.dom.test.tsx |
| `packages/app/src/editor/extensions/trailing-affordance.dom.test.ts` | — | 适配迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/trailing-affordance.dom.test.ts。差异见来源重放清单与补丁。 |
| `packages/app/src/editor/extensions/wiki-link-icon.dom.test.tsx` | — | 不适用 | wiki-link-icon 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/editor/interaction-layer.dom.test.ts` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/interaction-layer.dom.test.ts |
| `packages/app/src/editor/internal-link-helpers.anchor.dom.test.ts` | — | 不适用 | internal-link-helpers.anchor 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/editor/link-path-suggestions.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/link-path-suggestions.dom.test.tsx |
| `packages/app/src/editor/link-preview/ExternalLinkPreviewCard.dom.test.tsx` | 是 | 不适用 | OK 外部链接抓取卡片，Huhu 默认禁止外链预览请求（OP-D19 Q3）。 |
| `packages/app/src/editor/link-preview/InternalDocPreviewCard.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/link-preview/InternalDocPreviewCard.dom.test.tsx |
| `packages/app/src/editor/link-preview/use-internal-doc-preview.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/link-preview/use-internal-doc-preview.dom.test.tsx |
| `packages/app/src/editor/scroll-navigation-ownership.dom.test.tsx` | — | 不适用 | scroll-navigation-ownership 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/editor/selection/place-caret.dom.test.ts` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/selection/place-caret.dom.test.ts |
| `packages/app/src/editor/slash-command/SlashCommandMenu.dom.test.tsx` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/slash-command/SlashCommandMenu.dom.test.tsx |
| `packages/app/src/editor/slash-command/apply-item.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/slash-command/apply-item.dom.test.tsx |
| `packages/app/src/editor/slash-command/mirror-source-insert.dom.test.tsx` | — | 不适用 | mirror-source-insert 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/editor/source-undo-mode-flip.dom.test.ts` | — | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/source-undo-mode-flip.dom.test.ts |
| `packages/app/src/editor/use-composer-attachments.dom.test.tsx` | — | 不适用 | use-composer-attachments 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/editor/useDocDiagnostics.dom.test.tsx` | 是 | 不适用 | 服务端 Lint 诊断执行和会话配置按 OP-D19 Q2 排除。 |
| `packages/app/src/editor/useFrontmatterDiagnostics.dom.test.tsx` | 是 | 不适用 | 依赖 OK Lint 默认插件注册表。Huhu 使用本地 YAML 语法反馈，服务端 Lint 按 Q2 排除。 |
| `packages/app/src/editor/useFrontmatterDiagnostics.okf.dom.test.tsx` | — | 不适用 | useFrontmatterDiagnostics.okf 的服务端诊断入口按 OP-D19 Q2 排除。 |
| `packages/app/src/editor/utils/editor-visible-region.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/utils/editor-visible-region.dom.test.tsx |
| `packages/app/src/editor/validation-audit-client.dom.test.tsx` | 是 | 不适用 | OK 服务端 Lint 审计请求，宿主 Lint 开关为 false。 |
| `packages/app/src/editor/wiki-link-suggestion/WikiLinkSuggestionMenu.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/editor/wiki-link-suggestion/WikiLinkSuggestionMenu.dom.test.tsx |
| `packages/app/src/hooks/use-conflict-composer-prefill.dom.test.tsx` | — | 不适用 | use-conflict-composer-prefill 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/hooks/use-conflict-footer-height.dom.test.tsx` | — | 不适用 | use-conflict-footer-height 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/hooks/use-conflicts.dom.test.tsx` | 是 | 不适用 | OK 同步冲突存储及远端状态轮询，由 Huhu DocumentSession 的版本与冲突合并承载。 |
| `packages/app/src/hooks/use-create-blank-skill.dom.test.tsx` | — | 不适用 | use-create-blank-skill 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/hooks/use-doc-notices.dom.test.tsx` | — | 不适用 | use-doc-notices 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/hooks/use-document-stats.dom.test.tsx` | — | 不适用 | use-document-stats 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/hooks/use-enable-sync-with-confirm.dom.test.tsx` | — | 不适用 | use-enable-sync-with-confirm 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/hooks/use-explore-preview-install.dom.test.tsx` | — | 不适用 | use-explore-preview-install 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/hooks/use-explore-preview-install.scope.dom.test.tsx` | — | 不适用 | use-explore-preview-install.scope 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/hooks/use-feedback-nudge.dom.test.tsx` | — | 不适用 | use-feedback-nudge 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/hooks/use-find-in-viewer.dom.test.tsx` | — | 不适用 | use-find-in-viewer 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/hooks/use-folder-config.dom.test.ts` | 是 | 不适用 | OK 文件夹配置和模板元数据服务，Huhu 模板保存为 Vault 中的普通文件。 |
| `packages/app/src/hooks/use-generated-index-settings.dom.test.tsx` | — | 不适用 | use-generated-index-settings 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/hooks/use-git-worktree-status.dom.test.tsx` | — | 不适用 | use-git-worktree-status 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/hooks/use-installed-clis.dom.test.tsx` | — | 不适用 | use-installed-clis 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/hooks/use-language-bridge.dom.test.tsx` | 是 | 不适用 | OK 显示语言的应用壳同步由 Huhu 设置系统承载，H03 由对应宿主验收。 |
| `packages/app/src/hooks/use-move-skill-scope.dom.test.tsx` | — | 不适用 | use-move-skill-scope 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/hooks/use-no-push-permission-toast.dom.test.tsx` | — | 不适用 | use-no-push-permission-toast 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/hooks/use-onboarding-card-visible.dom.test.tsx` | — | 不适用 | use-onboarding-card-visible 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/hooks/use-onboarding-file-completion.dom.test.tsx` | — | 不适用 | use-onboarding-file-completion 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/hooks/use-open-skill-for-edit.dom.test.tsx` | — | 不适用 | use-open-skill-for-edit 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/hooks/use-open-skill.dom.test.tsx` | — | 不适用 | use-open-skill 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/hooks/use-rename-skill.dom.test.tsx` | — | 不适用 | use-rename-skill 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/hooks/use-rotating-suggestion.dom.test.tsx` | — | 不适用 | use-rotating-suggestion 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/hooks/use-selection-context.dom.test.tsx` | 是 | 不适用 | OK 把选区同步至 AI 组合栏和 Agent 会话的上下文通路。 |
| `packages/app/src/hooks/use-semantic-search-status.dom.test.ts` | — | 不适用 | use-semantic-search-status 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/hooks/use-skill-scope-move.dom.test.tsx` | — | 不适用 | use-skill-scope-move 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/hooks/use-skills.dom.test.tsx` | — | 不适用 | use-skills 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/hooks/use-sync-auth-prompt.dom.test.tsx` | — | 不适用 | use-sync-auth-prompt 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/hooks/use-terminal-enabled.dom.test.tsx` | — | 不适用 | use-terminal-enabled 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/hooks/use-theme-bridge.dom.test.tsx` | 是 | 不适用 | OK 应用壳与原生主题同步，Huhu 以本地主题设置和 OkRoot 提供者接入。 |
| `packages/app/src/hooks/use-update-channel.dom.test.tsx` | — | 不适用 | use-update-channel 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/hooks/use-worktree-autosync-notice.dom.test.tsx` | — | 不适用 | use-worktree-autosync-notice 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/hooks/useActiveHeading.dom.test.tsx` | 是 | 不适用 | OK OutlinePanel 的选中条目跟踪；Huhu 使用笔记详情里的大纲。 |
| `packages/app/src/hooks/useActiveHeading.source-mode.dom.test.tsx` | — | 不适用 | useActiveHeading.source-mode 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/lib/acp/activity-clock.dom.test.tsx` | — | 不适用 | activity-clock 属于Agent 客户端协议、身份与会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/lib/acp/catalog.dom.test.tsx` | — | 不适用 | catalog 属于Agent 客户端协议、身份与会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/lib/acp/dev-thread-harness.dom.test.tsx` | — | 不适用 | dev-thread-harness 属于Agent 客户端协议、身份与会话，对应模块未装入 Huhu 的编辑器闭包。 |
| `packages/app/src/lib/acp/image-attachment.dom.test.ts` | 是 | 不适用 | ACP 对话的图像附件编码，Huhu 普通笔记文件上传走 notes.attach。 |
| `packages/app/src/lib/bool-pref.dom.test.ts` | 是 | 不适用 | OK 壳层全局偏好的存取，Huhu 编辑器设置来源为 settings.get。 |
| `packages/app/src/lib/bug-report-capture.dom.test.ts` | — | 不适用 | bug-report-capture 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/lib/color-theme-epoch.dom.test.tsx` | 是 | 不适用 | OK 主题全局订阅与重载，Huhu 用 workbench 主题桥。 |
| `packages/app/src/lib/config-context.dom.test.tsx` | 是 | 不适用 | OK 壳层配置来自协作项目，Huhu 切换到本地宿主配置。 |
| `packages/app/src/lib/config-provider.dom.test.tsx` | 是 | 不适用 | OK 配置下发和主题预览回滚，其入口替换为 HostConfigProvider。 |
| `packages/app/src/lib/config-provider.theme-readiness.dom.test.tsx` | — | 不适用 | config-provider.theme-readiness 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/lib/config-provider.user-synced.dom.test.tsx` | — | 不适用 | config-provider.user-synced 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/lib/css-color-to-hex.dom.test.ts` | 是 | 不适用 | OK 主题设置入口的取色与配置写回，Huhu 复用项目 UI 色板。 |
| `packages/app/src/lib/dev-pseudo-locale.dom.test.ts` | 是 | 不适用 | OK 开发伪语言与编译后的 en/messages.json，Huhu 仅打包 en 和 zh-Hans。 |
| `packages/app/src/lib/diff-change-nav.dom.test.tsx` | — | 不适用 | diff-change-nav 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/lib/dock-session-persistence.dom.test.ts` | — | 不适用 | dock-session-persistence 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/lib/editor-toolbar-overlap.dom.test.ts` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/lib/editor-toolbar-overlap.dom.test.ts |
| `packages/app/src/lib/excalidraw-env.dom.test.ts` | 是 | 不适用 | OK 白板嵌入环境初始化，Huhu 编辑面未接对应工作区白板。 |
| `packages/app/src/lib/excalidraw-lang.dom.test.ts` | — | 不适用 | excalidraw-lang 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/lib/excalidraw-scene.roundtrip.dom.test.ts` | — | 不适用 | excalidraw-scene.roundtrip 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/lib/fouc-prepaint.dom.test.ts` | — | 不适用 | fouc-prepaint 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/lib/ime-composition.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/lib/ime-composition.dom.test.tsx |
| `packages/app/src/lib/language-fouc-prepaint.dom.test.ts` | — | 不适用 | language-fouc-prepaint 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/lib/locale-load-failure-notice.dom.test.tsx` | 是 | 不适用 | OK workspace 启动时的语言加载通知，Huhu 使用本地 Lingui 装配。 |
| `packages/app/src/lib/narrow-workspace-session.dom.test.ts` | — | 不适用 | narrow-workspace-session 是 OK 桌面窗口／应用壳入口，Huhu 用 ResourceTree、DocTab 和工作台宿主。 |
| `packages/app/src/lib/note-window-focus.dom.test.ts` | 是 | 不适用 | OK 独立笔记窗口初始化焦点，Huhu 使用工作台中的 DocTab。 |
| `packages/app/src/lib/note-window-main-actions.dom.test.ts` | 是 | 不适用 | OK 独立笔记窗口 IPC，Huhu 使用工作台路由。 |
| `packages/app/src/lib/note-window-mode.dom.test.ts` | 是 | 不适用 | OK 独立笔记窗口 URL 模式，Huhu 无此路由。 |
| `packages/app/src/lib/overlay-layers.dom.test.tsx` | 是 | 原样迁入 | packages/editor/src/vendor/open-knowledge/app/src/lib/overlay-layers.dom.test.tsx |
| `packages/app/src/lib/pointer-position.dom.test.ts` | — | 不适用 | pointer-position 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/lib/read-cached-language-preference.dom.test.ts` | — | 不适用 | read-cached-language-preference 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/lib/saved-themes-client.dom.test.tsx` | 是 | 不适用 | OK 主题服务 API，Huhu 用本地 workbench 主题配置。 |
| `packages/app/src/lib/single-file-mode.dom.test.tsx` | 是 | 不适用 | OK 独立单文件启动与授权，Huhu 笔记始终属于已打开 Vault。 |
| `packages/app/src/lib/skill-host-icon-coverage.dom.test.tsx` | — | 不适用 | skill-host-icon-coverage 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/lib/skill-scope.dom.test.ts` | 是 | 不适用 | OK Agent 技能目录的作用域与切换，不属于本地正文编辑。 |
| `packages/app/src/lib/skills-api.duplicate.dom.test.ts` | — | 不适用 | skills-api.duplicate 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/lib/skills-api.list.dom.test.ts` | — | 不适用 | skills-api.list 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/lib/skills-api.move-scope.dom.test.ts` | — | 不适用 | skills-api.move-scope 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/lib/skills-api.pack-skill.dom.test.ts` | — | 不适用 | skills-api.pack-skill 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/lib/tab-session-restore-recovery-notice.dom.test.tsx` | 是 | 不适用 | OK 工作台标签会话恢复提示，Huhu 起用自己的 DocTab 与会话协议。 |
| `packages/app/src/lib/theme-color-transitions.dom.test.tsx` | 是 | 不适用 | OK 应用壳切主题动画偏好，与 Huhu 的主题切换入口不同。 |
| `packages/app/src/lib/use-apply-config-color-theme.dom.test.tsx` | 是 | 不适用 | OK 配置驱动的主题写回和缓存，Huhu 统一管理主题。 |
| `packages/app/src/lib/use-apply-config-language-degraded.dom.test.tsx` | — | 不适用 | use-apply-config-language-degraded 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/lib/use-apply-config-language-load-failure.dom.test.tsx` | — | 不适用 | use-apply-config-language-load-failure 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/lib/use-apply-config-language-pseudo.dom.test.tsx` | — | 不适用 | use-apply-config-language-pseudo 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/lib/use-apply-config-language-supersede.dom.test.tsx` | — | 不适用 | use-apply-config-language-supersede 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/lib/use-apply-config-language.dom.test.tsx` | 是 | 不适用 | OK 应用壳语言配置自动下发，Huhu 的可见语言由宿主装配。 |
| `packages/app/src/lib/use-apply-config-theme.dom.test.tsx` | 是 | 不适用 | OK server 配置驱动的全局明暗切换，Huhu 用 workbench theme。 |
| `packages/app/src/lib/use-boolean-frontmatter-field.dom.test.tsx` | — | 不适用 | use-boolean-frontmatter-field 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/lib/use-server-keepalive.dom.test.tsx` | — | 不适用 | use-server-keepalive 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/lib/use-settings-route.dom.test.tsx` | 是 | 不适用 | OK hash 设置路由，Huhu 使用自己的设置页面。 |
| `packages/app/src/lib/view-menu-state-store.dom.test.tsx` | — | 不适用 | view-menu-state-store 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/presence/use-presence.dom.test.tsx` | — | 不适用 | use-presence 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/presence/use-sync-status.dom.test.tsx` | — | 不适用 | use-sync-status 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/presence/use-sync-toasts.dom.test.tsx` | — | 不适用 | use-sync-toasts 的上游会话、授权或同步入口未由 Huhu 编辑面挂载。 |
| `packages/app/src/uninstall/UninstallApp.dom.test.tsx` | — | 不适用 | UninstallApp 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/uninstall/UninstallNoticeScreen.dom.test.tsx` | — | 不适用 | UninstallNoticeScreen 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/uninstall/UninstallPickerScreen.dom.test.tsx` | — | 不适用 | UninstallPickerScreen 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/uninstall/UninstallProgressScreen.dom.test.tsx` | — | 不适用 | UninstallProgressScreen 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/uninstall/UninstallResultScreen.dom.test.tsx` | — | 不适用 | UninstallResultScreen 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/uninstall/UninstallSurveyScreen.dom.test.tsx` | — | 不适用 | UninstallSurveyScreen 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/uninstall/main.dom.test.tsx` | — | 不适用 | main 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/src/uninstall/uninstall-copy-parity.dom.test.tsx` | — | 不适用 | uninstall-copy-parity 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/tests/dom/caret-placement-barrier.dom.test.ts` | — | 不适用 | caret-placement-barrier 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/tests/dom/comment-visibility-after-rederive.dom.test.tsx` | — | 不适用 | comment-visibility-after-rederive 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/tests/dom/frontmatter-dialects-client-realm.dom.test.tsx` | — | 不适用 | frontmatter-dialects-client-realm 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/tests/dom/input-rule-atom-ranges.dom.test.tsx` | — | 不适用 | input-rule-atom-ranges 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/tests/dom/jsdom-preload-backfills.dom.test.tsx` | — | 不适用 | jsdom-preload-backfills 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/tests/dom/jsdom-preload.dom.test.tsx` | — | 不适用 | jsdom-preload 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/tests/dom/jsx-inline-item-growth.dom.test.tsx` | — | 不适用 | jsx-inline-item-growth 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/tests/dom/jsx-interior-input-rule-suppression.dom.test.tsx` | — | 不适用 | jsx-interior-input-rule-suppression 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/tests/dom/literal-text-suggestion-gating.dom.test.tsx` | — | 不适用 | literal-text-suggestion-gating 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/tests/dom/plain-text-clipboard.dom.test.tsx` | — | 不适用 | plain-text-clipboard 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/tests/dom/promoter-claimed-text-visibility.dom.test.tsx` | — | 不适用 | promoter-claimed-text-visibility 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/tests/dom/select-all-probe.dom.test.ts` | — | 不适用 | select-all-probe 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/tests/dom/serializer-seam-rederive.dom.test.tsx` | — | 不适用 | serializer-seam-rederive 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/tests/dom/source-mode-suggestion-gating.dom.test.tsx` | — | 不适用 | source-mode-suggestion-gating 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/tests/dom/task-list-input-rule.dom.test.tsx` | — | 不适用 | task-list-input-rule 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
| `packages/app/tests/dom/underline-round-trip.dom.test.tsx` | — | 不适用 | underline-round-trip 的配套上游实现未进入固定编辑器闭包，Huhu 无该测试的同一入口。 |
