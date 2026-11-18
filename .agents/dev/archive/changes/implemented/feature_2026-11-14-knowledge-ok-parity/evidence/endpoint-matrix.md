# 端点矩阵（机械提取）

来源：`scripts/ok-endpoints.mjs` 对 closure-manifest 的 931 个文件做静态扫描。**请求/响应形状与 Huhu 映射列未自动填写**，由 S1/S4/S5 实施时据 design.md §4 补全；动态拼接路径只能抓到字面量前缀。

统计：调用点 140；不同 /api 路径 85；不同 okDesktop 成员 14。

## /api 路径（去重）

- `/api/agent-activity`
- `/api/agent-activity returned a body that did not match AgentActivitySuccessSchema.`
- `/api/agent-activity returned a non-RFC-9457 error response.`
- `/api/agent-burst-diff returned a body that did not match AgentBurstDiffSuccessSchema.`
- `/api/agent-burst-diff returned a non-RFC-9457 error response.`
- `/api/agent-integrations/apply`
- `/api/agent-undo`
- `/api/asset`
- `/api/audit${query}`
- `/api/backlink-counts`
- `/api/backlinks`
- `/api/comment`
- `/api/comments`
- `/api/config`
- `/api/create-folder`
- `/api/create-page`
- `/api/delete-path`
- `/api/document`
- `/api/documents`
- `/api/documents responded with ${status}`
- `/api/documents returned no usable documents field`
- `/api/duplicate-path`
- `/api/folder-config`
- `/api/folder-config${qs}`
- `/api/forward-links`
- `/api/handoff`
- `/api/history`
- `/api/hubs`
- `/api/installed-agents`
- `/api/link-graph`
- `/api/link-preview`
- `/api/lint/config${query}`
- `/api/lint/fix`
- `/api/lint/frontmatter-schema`
- `/api/lint/frontmatter-schemas`
- `/api/lint/markdownlint-config`
- `/api/orphans`
- `/api/page-headings`
- `/api/page-headings responded with ${r.status}`
- `/api/pages`
- `/api/pages responded with ${r.status}`
- `/api/principal`
- `/api/rename-path`
- `/api/rollback`
- `/api/saved-theme`
- `/api/saved-themes`
- `/api/seed/install-pack-skill`
- `/api/share/construct-url`
- `/api/skill`
- `/api/skill${qs}`
- `/api/skill-file`
- `/api/skill-file/rename`
- `/api/skill-targets`
- `/api/skill-upload`
- `/api/skill/duplicate`
- `/api/skill/edit-external`
- `/api/skill/import`
- `/api/skill/install`
- `/api/skill/install-state`
- `/api/skill/move-scope`
- `/api/skill/reimport`
- `/api/skill/revert`
- `/api/skill/track-in-git`
- `/api/skills`
- `/api/skills/detail`
- `/api/skills/discover`
- `/api/skills/import-bulk`
- `/api/skills/installed`
- `/api/skills/popular`
- `/api/skills/preview`
- `/api/skills/publisher`
- `/api/skills/reimport-bulk`
- `/api/skills/resolve-ref`
- `/api/skills/search`
- `/api/sync/conflicts`
- `/api/sync/status`
- `/api/tags`
- `/api/tags responded with ${r.status}`
- `/api/template`
- `/api/template${qs}`
- `/api/template/import`
- `/api/templates`
- `/api/trash/cleanup`
- `/api/upload`
- `/api/workspace`

## okDesktop 成员（去重）

- `appVersion`
- `cliCommandName`
- `clipboard`
- `config.apiOrigin`
- `config.mode`
- `config.projectPath`
- `config.singleFile`
- `mcpServerName`
- `noteWindow.dispatchToMain`
- `platform`
- `shell.openExternal`
- `shell.recordHandoff`
- `skill`
- `startup.reportMarks`

## 调用点

| 类型 | 文件:行 | 目标 | 代码 |
|---|---|---|---|
| api | app/src/comments/comments-client.ts:36 | `/api/comment` | `return request<T>('/api/comment', { method: 'POST', body: JSON.stringify(body) });` |
| api | app/src/comments/comments-client.ts:70 | `/api/comments` | `docName === undefined ? '/api/comments' : '/api/comments?doc=${encodeURIComponent(docName)}';` |
| api | app/src/comments/comments-client.ts:87 | `/api/comments` | `return request<unknown>('/api/comments', {` |
| api | app/src/comments/comments-client.ts:121 | `/api/comment?id=${encodeURIComponent(threadId)}` | `return request<unknown>('/api/comment?id=${encodeURIComponent(threadId)}', {` |
| api | app/src/components/ActivityModeContent.tsx:29 | `/api/agent-undo` | `const res = await fetch('/api/agent-undo', {` |
| api | app/src/components/FileTree.tsx:1332 | `/api/duplicate-path` | `const res = await fetch('/api/duplicate-path', {` |
| api | app/src/components/FileTree.tsx:1452 | `/api/delete-path` | `const res = await fetch('/api/delete-path', {` |
| api | app/src/components/FileTree.tsx:1511 | `/api/workspace` | `fetch('/api/workspace')` |
| api | app/src/components/FileTree.tsx:1746 | `/api/rename-path` | `const res = await fetch('/api/rename-path', {` |
| api | app/src/components/FileTree.tsx:1870 | `/api/rename-path` | `const res = await fetch('/api/rename-path', {` |
| api | app/src/components/FileTree.tsx:1944 | `/api/upload` | `const res = await fetch('/api/upload', { method: 'POST', body: formData });` |
| api | app/src/components/FileTree.tsx:2069 | `/api/create-page` | `const res = await fetch('/api/create-page', {` |
| api | app/src/components/FileTree.tsx:2111 | `/api/create-folder` | `const res = await fetch('/api/create-folder', {` |
| api | app/src/components/FileTree.tsx:2668 | `/api/delete-path` | `const res = await fetch('/api/delete-path', {` |
| api | app/src/components/FileTree.tsx:2747 | `/api/trash/cleanup` | `const res = await fetch('/api/trash/cleanup', {` |
| desktop | app/src/components/FileTree.tsx:2782 | `platform` | `typeof window !== 'undefined' ? window.okDesktop?.platform : undefined,` |
| desktop | app/src/components/FileTree.tsx:3218 | `platform` | `typeof window !== 'undefined' ? window.okDesktop?.platform : undefined,` |
| api | app/src/components/GraphPanel.tsx:82 | `/api/orphans?mode=${encodeURIComponent(mode)}` | `const res = await fetch('/api/orphans?mode=${encodeURIComponent(mode)}');` |
| api | app/src/components/GraphPanel.tsx:98 | `/api/hubs?limit=${encodeURIComponent(String(limit))}` | `const res = await fetch('/api/hubs?limit=${encodeURIComponent(String(limit))}');` |
| api | app/src/components/GraphView.tsx:595 | `/api/link-graph?${params.toString()}` | `const url = params.size > 0 ? '/api/link-graph?${params.toString()}' : '/api/link-graph';` |
| api | app/src/components/LinksPanel.tsx:54 | `/api/backlinks?docName=${encodeURIComponent(docName)}` | `const res = await fetch('/api/backlinks?docName=${encodeURIComponent(docName)}');` |
| api | app/src/components/LinksPanel.tsx:77 | `/api/forward-links?docName=${encodeURIComponent(docName)}` | `const res = await fetch('/api/forward-links?docName=${encodeURIComponent(docName)}');` |
| api | app/src/components/OutlinePanel.tsx:40 | `/api/page-headings?docName=${encodeURIComponent(docName)}` | `const res = await fetch('/api/page-headings?docName=${encodeURIComponent(docName)}');` |
| api | app/src/components/PageListContext.tsx:101 | `/api/pages` | `const r = await fetch('/api/pages');` |
| api | app/src/components/PageListContext.tsx:104 | `/api/pages responded with ${r.status}` | `throw new Error(parseApiError(body) ?? '/api/pages responded with ${r.status}');` |
| api | app/src/components/PageListContext.tsx:120 | `/api/documents responded with ${status}` | `throw new Error(parseApiError(body) ?? '/api/documents responded with ${status}');` |
| api | app/src/components/PageListContext.tsx:124 | `/api/documents returned no usable documents field` | `throw new Error(parseApiError(body) ?? '/api/documents returned no usable documents field');` |
| api | app/src/components/TimelinePanel.tsx:68 | `/api/history?docName=${encodeURIComponent(docName)}&limit=100` | `const res = await fetch('/api/history?docName=${encodeURIComponent(docName)}&limit=100', {` |
| api | app/src/components/TimelinePanel.tsx:466 | `/api/rollback` | `res = await fetch('/api/rollback', {` |
| desktop | app/src/components/TrashFailureModal.tsx:83 | `platform` | `typeof window !== 'undefined' ? window.okDesktop?.platform : undefined,` |
| api | app/src/components/file-tree-listing-transport.ts:32 | `/api/documents?showAll=true${showOk ? ` | `return '/api/documents?showAll=true${showOk ? '&showOk=true' : ''}&dir=${encodeURIComponent(dir)}&depth=1';` |
| api | app/src/components/page-header-utils.ts:36 | `/api/asset?path=${encodeURIComponent(toContentDirRelative(trimmed))}` | `'/api/asset?path=${encodeURIComponent(toContentDirRelative(trimmed))}',` |
| api | app/src/components/page-header-utils.ts:84 | `/api/asset?path=${encodeURIComponent(toContentDirRelative(trimmed))}` | `'/api/asset?path=${encodeURIComponent(toContentDirRelative(trimmed))}',` |
| desktop | app/src/editor/DocumentContext.tsx:274 | `config.mode` | `return localTabSessionKeyForMode(window.okDesktop?.config.mode, window.location.origin);` |
| api | app/src/editor/DocumentContext.tsx:1073 | `/api/principal` | `fetch('/api/principal')` |
| ws | app/src/editor/components/live-doc-pool.ts:59 | `collab` | `const provider = new HocuspocusProvider({` |
| api | app/src/editor/extensions/tag-suggestion.ts:35 | `/api/tags` | `const r = await fetch('/api/tags');` |
| api | app/src/editor/extensions/tag-suggestion.ts:36 | `/api/tags responded with ${r.status}` | `if (!r.ok) throw new Error('/api/tags responded with ${r.status}');` |
| api | app/src/editor/extensions/wiki-link-suggestion.ts:293 | `/api/pages` | `const r = await fetch('/api/pages');` |
| api | app/src/editor/extensions/wiki-link-suggestion.ts:305 | `/api/pages responded with ${r.status}` | `throw new Error(problem.success ? problem.data.title : '/api/pages responded with ${r.status}');` |
| api | app/src/editor/extensions/wiki-link-suggestion.ts:370 | `/api/page-headings?docName=${encodeURIComponent(docName)}` | `const r = await fetch('/api/page-headings?docName=${encodeURIComponent(docName)}');` |
| api | app/src/editor/extensions/wiki-link-suggestion.ts:383 | `/api/page-headings responded with ${r.status}` | `problem.success ? problem.data.title : '/api/page-headings responded with ${r.status}',` |
| api | app/src/editor/extensions/wiki-link-suggestion.ts:396 | `/api/forward-links?docName=${encodeURIComponent(docName)}` | `const r = await fetch('/api/forward-links?docName=${encodeURIComponent(docName)}');` |
| api | app/src/editor/extensions/wiki-link-suggestion.ts:412 | `/api/backlinks?docName=${encodeURIComponent(docName)}` | `const r = await fetch('/api/backlinks?docName=${encodeURIComponent(docName)}');` |
| api | app/src/editor/image-upload/index.ts:255 | `/api/upload` | `res = await fetch('/api/upload', { method: 'POST', body: formData });` |
| api | app/src/editor/image-upload/upload-file.ts:20 | `/api/upload` | `const UPLOAD_ENDPOINT = '/api/upload';` |
| api | app/src/editor/link-preview/external-link-preview.ts:15 | `/api/link-preview` | `const res = await fetch('/api/link-preview', {` |
| api | app/src/editor/link-preview/internal-doc-preview.ts:56 | `/api/document?docName=${encodeURIComponent(docName)}` | `const res = await fetch('/api/document?docName=${encodeURIComponent(docName)}');` |
| api | app/src/editor/link-preview/internal-doc-preview.ts:62 | `/api/backlink-counts?docNames=${encodeURIComponent(docName)}` | `const res = await fetch('/api/backlink-counts?docNames=${encodeURIComponent(docName)}');` |
| api | app/src/editor/lint-config-client.ts:29 | `/api/lint/config${query}` | `const res = await fetch('/api/lint/config${query}');` |
| api | app/src/editor/lint-config-client.ts:59 | `/api/lint/fix` | `const res = await fetch('/api/lint/fix', {` |
| api | app/src/editor/lint-config-client.ts:97 | `/api/lint/markdownlint-config` | `const res = await fetch('/api/lint/markdownlint-config', {` |
| api | app/src/editor/lint-config-client.ts:129 | `/api/lint/frontmatter-schema` | `const res = await fetch('/api/lint/frontmatter-schema', {` |
| api | app/src/editor/lint-config-client.ts:165 | `/api/lint/frontmatter-schemas` | `const res = await fetch('/api/lint/frontmatter-schemas');` |
| ws | app/src/editor/provider-pool.ts:942 | `collab` | `const provider = new HocuspocusProvider({` |
| api | app/src/editor/validation-audit-client.ts:49 | `/api/audit${query}` | `const res = await fetch('/api/audit${query}', signal === undefined ? undefined : { signal });` |
| api | app/src/hooks/use-conflicts.tsx:52 | `/api/sync/conflicts` | `const res = await fetch('/api/sync/conflicts', {` |
| api | app/src/hooks/use-folder-config.ts:72 | `/api/folder-config${qs}` | `fetch('/api/folder-config${qs}')` |
| api | app/src/hooks/use-folder-config.ts:130 | `/api/templates` | `fetch('/api/templates')` |
| api | app/src/hooks/use-git-sync-status.ts:67 | `/api/sync/status` | `const res = await fetch('/api/sync/status');` |
| api | app/src/lib/agent-connections.ts:58 | `/api/agent-integrations/apply` | `response = await fetch('/api/agent-integrations/apply', {` |
| desktop | app/src/lib/agent-guidance-copy.ts:7 | `mcpServerName` | `return (typeof window === 'undefined' ? null : window.okDesktop?.mcpServerName) \|\| null;` |
| api | app/src/lib/api-config.ts:16 | `/api/config` | `res = await fetch('/api/config', {` |
| desktop | app/src/lib/channel-cli-copy.ts:9 | `cliCommandName` | `typeof window === 'undefined' ? null : window.okDesktop?.cliCommandName,` |
| ws | app/src/lib/config-provider.tsx:73 | `collab` | `const provider = new HocuspocusProvider({` |
| ws | app/src/lib/config-provider.tsx:98 | `collab` | `const provider = new HocuspocusProvider({` |
| desktop | app/src/lib/copy-image.ts:70 | `clipboard` | `const desktop = typeof window === 'undefined' ? undefined : window.okDesktop?.clipboard;` |
| api | app/src/lib/create-page-request.ts:16 | `/api/create-page` | `const res = await fetch('/api/create-page', {` |
| api | app/src/lib/create-page.ts:23 | `/api/create-page` | `const res = await fetch('/api/create-page', {` |
| api | app/src/lib/documents-fetch.ts:12 | `/api/documents` | `const res = await fetch('/api/documents');` |
| desktop | app/src/lib/external-link.ts:4 | `shell.openExternal` | `const openExternal = window.okDesktop?.shell?.openExternal;` |
| desktop | app/src/lib/external-link.ts:24 | `shell.openExternal` | `const openExternal = okDesktop?.shell?.openExternal;` |
| api | app/src/lib/folder-config-api.ts:21 | `/api/folder-config` | `const res = await fetch('/api/folder-config', {` |
| api | app/src/lib/folder-config-api.ts:42 | `/api/template` | `const res = await fetch('/api/template', {` |
| api | app/src/lib/folder-config-api.ts:71 | `/api/template${qs}` | `const res = await fetch('/api/template${qs}', { method: 'DELETE' });` |
| api | app/src/lib/folder-config-api.ts:92 | `/api/template` | `const res = await fetch('/api/template', {` |
| api | app/src/lib/folder-config-api.ts:118 | `/api/template/import` | `const res = await fetch('/api/template/import', {` |
| api | app/src/lib/handoff/cowork-skill-install.ts:37 | `/api/skill/install-state` | `const INSTALL_STATE_PATH = '/api/skill/install-state';` |
| desktop | app/src/lib/handoff/cowork-skill-install.ts:128 | `appVersion` | `return window.okDesktop?.appVersion ?? 'unknown';` |
| api | app/src/lib/handoff/dispatch.ts:26 | `/api/handoff` | `res = await fetchImpl('/api/handoff', {` |
| api | app/src/lib/handoff/install-detect.ts:75 | `/api/installed-agents` | `res = await deps.fetch('/api/installed-agents', {` |
| desktop | app/src/lib/handoff/open-external.ts:15 | `shell.openExternal` | `if (okDesktop?.shell?.openExternal) {` |
| desktop | app/src/lib/handoff/open-external.ts:17 | `shell.openExternal` | `await okDesktop.shell.openExternal(url);` |
| desktop | app/src/lib/handoff/skill-installer.ts:113 | `skill` | `const electronBridge = window.okDesktop?.skill;` |
| desktop | app/src/lib/handoff/telemetry.ts:31 | `shell.recordHandoff` | `if (!okDesktop?.shell?.recordHandoff) {` |
| desktop | app/src/lib/handoff/telemetry.ts:35 | `shell.recordHandoff` | `await okDesktop.shell.recordHandoff(line);` |
| desktop | app/src/lib/note-window-main-actions.ts:9 | `noteWindow.dispatchToMain` | `const dispatch = window.okDesktop?.noteWindow?.dispatchToMain;` |
| desktop | app/src/lib/note-window-mode.ts:5 | `config.mode` | `return window.okDesktop?.config?.mode === 'note';` |
| desktop | app/src/lib/perf/startup-marks.ts:23 | `startup.reportMarks` | `typeof window !== 'undefined' ? window.okDesktop?.startup?.reportMarks : undefined;` |
| api | app/src/lib/saved-themes-client.ts:144 | `/api/saved-themes` | `const response = await request('/api/saved-themes', { signal: options.signal });` |
| api | app/src/lib/saved-themes-client.ts:205 | `/api/saved-theme` | `const response = await request('/api/saved-theme', {` |
| api | app/src/lib/saved-themes-client.ts:243 | `/api/saved-theme` | `const response = await request('/api/saved-theme', {` |
| api | app/src/lib/saved-themes-client.ts:272 | `/api/saved-theme?${query}` | `const response = await request('/api/saved-theme?${query}', { method: 'DELETE' });` |
| desktop | app/src/lib/share/clipboard-adapter.ts:64 | `clipboard` | `const okClipboard = (globalThis as OkDesktopHost).okDesktop?.clipboard;` |
| api | app/src/lib/share/run-share-action.ts:11 | `/api/share/construct-url` | `const SHARE_CONSTRUCT_URL_PATH = '/api/share/construct-url';` |
| desktop | app/src/lib/single-file-mode.tsx:9 | `config.singleFile` | `typeof window !== 'undefined' ? (window.okDesktop?.config.singleFile ?? false) : false,` |
| api | app/src/lib/skills-api.ts:76 | `/api/skills/search?q=${encodeURIComponent(q)}` | `return getJson<SkillsSearchSuccess>('/api/skills/search?q=${encodeURIComponent(q)}');` |
| api | app/src/lib/skills-api.ts:83 | `/api/seed/install-pack-skill` | `'/api/seed/install-pack-skill',` |
| api | app/src/lib/skills-api.ts:92 | `/api/skills/popular?limit=24` | `return getJson<SkillsSearchSuccess>('/api/skills/popular?limit=24');` |
| api | app/src/lib/skills-api.ts:100 | `/api/skills?scope=${scope}` | `scope ? '/api/skills?scope=${scope}' : '/api/skills',` |
| api | app/src/lib/skills-api.ts:116 | `/api/skills/detail?${params.toString()}` | `return getJson<SkillDetail>('/api/skills/detail?${params.toString()}');` |
| api | app/src/lib/skills-api.ts:124 | `/api/skills/preview?${params.toString()}` | `return getJson<SkillPreview>('/api/skills/preview?${params.toString()}', signal);` |
| api | app/src/lib/skills-api.ts:136 | `/api/skills/resolve-ref?${params.toString()}` | `return getJson<SkillRefResolution>('/api/skills/resolve-ref?${params.toString()}', signal);` |
| api | app/src/lib/skills-api.ts:142 | `/api/skills/publisher?source=${encodeURIComponent(source)}` | `return getJson<SkillsSearchSuccess>('/api/skills/publisher?source=${encodeURIComponent(source)}');` |
| api | app/src/lib/skills-api.ts:150 | `/api/skills/discover?source=${encodeURIComponent(source)}` | `'/api/skills/discover?source=${encodeURIComponent(source)}',` |
| api | app/src/lib/skills-api.ts:156 | `/api/skills/installed` | `return getJson<SkillsInstalledSuccess>('/api/skills/installed');` |
| api | app/src/lib/skills-api.ts:164 | `/api/skill/edit-external` | `const res = await fetch('/api/skill/edit-external', {` |
| api | app/src/lib/skills-api.ts:187 | `/api/skill` | `const res = await fetch('/api/skill', {` |
| api | app/src/lib/skills-api.ts:228 | `/api/skill/import` | `const res = await fetch('/api/skill/import', {` |
| api | app/src/lib/skills-api.ts:282 | `/api/skills/import-bulk` | `const res = await fetch('/api/skills/import-bulk', {` |
| api | app/src/lib/skills-api.ts:311 | `/api/skill-upload?scope=${encodeURIComponent(scope)}` | `const res = await fetch('/api/skill-upload?scope=${encodeURIComponent(scope)}', {` |
| api | app/src/lib/skills-api.ts:355 | `/api/skill/duplicate` | `const res = await fetch('/api/skill/duplicate', {` |
| api | app/src/lib/skills-api.ts:502 | `/api/skill/move-scope` | `const res = await fetch('/api/skill/move-scope', {` |
| api | app/src/lib/skills-api.ts:543 | `/api/skill/track-in-git` | `const res = await fetch('/api/skill/track-in-git', {` |
| api | app/src/lib/skills-api.ts:574 | `/api/skill` | `const res = await fetch('/api/skill', {` |
| api | app/src/lib/skills-api.ts:598 | `/api/skill?${params.toString()}` | `const res = await fetch('/api/skill?${params.toString()}');` |
| api | app/src/lib/skills-api.ts:614 | `/api/skill${qs}` | `const res = await fetch('/api/skill${qs}', { method: 'DELETE' });` |
| api | app/src/lib/skills-api.ts:636 | `/api/skill/install` | `const res = await sendJson('/api/skill/install', 'POST', {` |
| api | app/src/lib/skills-api.ts:657 | `/api/skill-file` | `const res = await fetch('/api/skill-file', {` |
| api | app/src/lib/skills-api.ts:678 | `/api/skill-file/rename` | `const res = await fetch('/api/skill-file/rename', {` |
| api | app/src/lib/skills-api.ts:714 | `/api/skill-file?${params.toString()}` | `const res = await fetch('/api/skill-file?${params.toString()}', { method: 'DELETE' });` |
| api | app/src/lib/skills-api.ts:742 | `/api/skill-file?${params.toString()}` | `const res = await fetch('/api/skill-file?${params.toString()}', { signal: input.signal });` |
| api | app/src/lib/skills-api.ts:784 | `/api/skill/install` | `const res = await fetch('/api/skill/install', {` |
| api | app/src/lib/skills-api.ts:816 | `/api/skill/install` | `const res = await fetch('/api/skill/install', {` |
| api | app/src/lib/skills-api.ts:839 | `/api/skill/install` | `const res = await sendJson('/api/skill/install', 'POST', {` |
| api | app/src/lib/skills-api.ts:854 | `/api/skill/install` | `const res = await sendJson('/api/skill/install', 'POST', {` |
| api | app/src/lib/skills-api.ts:870 | `/api/skill/install` | `const res = await sendJson('/api/skill/install', 'POST', {` |
| api | app/src/lib/skills-api.ts:889 | `/api/skill-targets` | `const res = await fetch('/api/skill-targets', {` |
| api | app/src/lib/skills-api.ts:925 | `/api/skill/reimport` | `const res = await fetch('/api/skill/reimport', {` |
| api | app/src/lib/skills-api.ts:959 | `/api/skills/reimport-bulk` | `const res = await fetch('/api/skills/reimport-bulk', {` |
| api | app/src/lib/skills-api.ts:980 | `/api/skill/revert` | `const res = await fetch('/api/skill/revert', {` |
| api | app/src/lib/use-activity-panel.ts:46 | `/api/agent-activity?agentId=${encodeURIComponent(connectionId)}` | `const url = '/api/agent-activity?agentId=${encodeURIComponent(connectionId)}';` |
| api | app/src/lib/use-activity-panel.ts:61 | `/api/agent-activity returned a non-RFC-9457 error response.` | `'/api/agent-activity returned a non-RFC-9457 error response.',` |
| api | app/src/lib/use-activity-panel.ts:70 | `/api/agent-activity returned a body that did not match AgentActivitySuccessSchema.` | `'/api/agent-activity returned a body that did not match AgentActivitySuccessSchema.',` |
| api | app/src/lib/use-activity-panel.ts:99 | `/api/agent-burst-diff returned a non-RFC-9457 error response.` | `'/api/agent-burst-diff returned a non-RFC-9457 error response.',` |
| api | app/src/lib/use-activity-panel.ts:108 | `/api/agent-burst-diff returned a body that did not match AgentBurstDiffSuccessSchema.` | `'/api/agent-burst-diff returned a body that did not match AgentBurstDiffSuccessSchema.',` |
| api | app/src/lib/use-workspace.ts:13 | `/api/workspace` | `fetch('/api/workspace')` |
| desktop | app/src/lib/use-workspace.ts:43 | `config.projectPath` | `contentDir: okDesktop.config.projectPath,` |
| desktop | app/src/lib/use-workspace.ts:44 | `platform` | `pathSeparator: okDesktop.platform === 'win32' ? '\\' : '/',` |
| desktop | core/src/utils/asset-href.ts:4 | `config.apiOrigin` | `.window?.okDesktop?.config?.apiOrigin;` |

## 补充：宿主兜底路由与 lint / audit（2026-11-18）

| 端点 | 处理 | 位置 |
| --- | --- | --- |
| `GET /api/pages`、`GET /api/documents` | 宿主未注入时返回空清单（最低优先级兜底），有数据的路由优先 | `host/host-fetch.ts` 的 baselineRoutes；数据路由在 `host/routes/core.ts`（笔记 / 紧凑编辑器注入） |
| `GET /api/audit`、`GET /api/lint/config` | 不发请求：`OkHost.features.lint=false` → `setHostLintAvailable(false)`，vendor 客户端直接返回 null（P-S3-07） | `rich/OkRoot.tsx`、`app/src/lib/host-features.ts` |
| 其余 `/api/lint/*`（fix / markdownlint-config / frontmatter-schema[s]） | 仅由用户显式操作的 UI（ProblemsPanel / 规则设置）触发，那些入口按 Q2 不接；若被触发返回 404 NOT_AVAILABLE | `host/host-fetch.ts` 兜底 404 |
