// ConfigContext 的 Huhu 侧提供者：上游经协作配置文档同步用户 / 项目 / .okignore 配置，Huhu 没有这些文档
//（隐藏走 hiddenPaths 偏好，主题走 Huhu 设置）。编辑器只读取 merged 里少量外观项，缺省值与上游一致。
import type { Config } from "@inkeep/open-knowledge-core/config/schema";
import type { ReactNode } from "react";
import { registerHostRoutes } from "./host-fetch";
import { ConfigContext, type ConfigContextValue } from "@/lib/config-context";

export interface HostEditorConfig {
  wordWrap?: boolean;
  showHiddenFiles?: boolean;
  showOnlyMarkdownFiles?: boolean;
  linkPreviewsEnabled?: boolean;
  requestLinkPreview?(url: string): Promise<unknown>;
}

export function registerLinkPreviewRoute(request: NonNullable<HostEditorConfig["requestLinkPreview"]>): () => void {
  return registerHostRoutes({
    "POST /api/link-preview": ({ body }) => {
      const url = (body as { url?: unknown } | null)?.url;
      return typeof url === "string" ? request(url) : { ok: false, reason: "invalid-url" };
    },
  });
}

export function HostConfigProvider({ children, config = {} }: { children: ReactNode; config?: HostEditorConfig }) {
  const merged = {
    editor: { wordWrap: config.wordWrap ?? true },
    appearance: {
      sidebar: {
        showHiddenFiles: config.showHiddenFiles ?? true,
        showOnlyMarkdownFiles: config.showOnlyMarkdownFiles ?? false,
        showOkFolders: true,
      },
    },
  } as unknown as Config;
  const value: ConfigContextValue = {
    userBinding: null,
    userSynced: true,
    projectBinding: null,
    projectLocalBinding: null,
    okignoreBinding: null,
    okignoreSynced: true,
    userConfig: null,
    projectConfig: null,
    projectSynced: true,
    projectLocalConfig: { linkPreviews: { enabled: config.linkPreviewsEnabled ?? false } } as unknown as Config,
    projectLocalSynced: true,
    merged,
  };
  return <ConfigContext value={value}>{children}</ConfigContext>;
}
