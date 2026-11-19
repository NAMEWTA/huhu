// DocumentContext 的 Huhu 侧替身（取代上游 1868 行的 DocumentContext.tsx + 2121 行的 provider-pool.ts）。
// 上游把“标签 / 分屏 / 协作连接 / 会话恢复”都放在这里；Huhu 的标签与会话由 plugins/notes 的
// DocumentSession / DocTab 负责（design §3、§7），所以这里只保留 vendor 组件实际读取的最小子集，
// 其余能力由宿主以回调形式注入（DocumentHostCallbacks）。没有注入的回调是明确的空操作，不伪装成功。
import type { Principal } from "@inkeep/open-knowledge-core/types/principal";
import { createContext, type ReactNode, use, useMemo } from "react";
import type { ResolvedNavigationTarget } from "@/components/navigation-targets";
import type { LocalRemovalReconciliation, LocalRenameReconciliation } from "@/editor/client-removal-reconciliation";
import type { HocuspocusProvider } from "@hocuspocus/provider";

export interface OpenTargetOptions {
  deliberate?: boolean;
  disposition?: "preview" | "permanent";
  consumeActiveNewTab?: boolean;
  tabBehavior?: "append" | "replace-active";
}

interface CloseTabsOptions {
  force?: boolean;
}

/** vendor 组件读取的子集（TiptapEditor / FileTree / DocPanel / OutlinePanel / ActivityModeContent）。 */
export interface DocumentContextValue {
  principal: Principal | null;
  activeTarget: ResolvedNavigationTarget | null;
  activeDocName: string | null;
  activeProvider: HocuspocusProvider | null;
  isNewTabActive: boolean;
  docPanelAgentId: string | null;
  systemProvider: HocuspocusProvider | null;
  readAsset?: (path: string) => Promise<Blob>;
  openDocument: (docName: string) => void;
  openDocumentTransition: (docName: string) => void;
  openTarget: (target: ResolvedNavigationTarget, options?: OpenTargetOptions) => void;
  openTargetTransition: (target: ResolvedNavigationTarget, options?: OpenTargetOptions) => void;
  closeDocument: (docName: string) => void;
  closeTabs: (tabIds: readonly string[], options?: CloseTabsOptions) => void;
  reconcileLocalRename: (input: LocalRenameReconciliation) => Promise<void>;
  reconcileLocalRemoval: (input: LocalRemovalReconciliation) => Promise<void>;
  recycleDocument: (docName: string) => void;
  prewarm: (docName: string) => string | null;
  closeActivityPanel: () => void;
}

export type DocumentHostCallbacks = Partial<DocumentContextValue>;

const LOCAL_PRINCIPAL: Principal = { id: "local", name: "Huhu", kind: "human" } as unknown as Principal;

const noop = (): void => {};
const noopAsync = async (): Promise<void> => {};

const DEFAULTS: DocumentContextValue = {
  principal: LOCAL_PRINCIPAL,
  activeTarget: null,
  activeDocName: null,
  activeProvider: null,
  isNewTabActive: false,
  docPanelAgentId: null,
  systemProvider: null,
  openDocument: noop,
  openDocumentTransition: noop,
  openTarget: noop,
  openTargetTransition: noop,
  closeDocument: noop,
  closeTabs: noop,
  reconcileLocalRename: noopAsync,
  reconcileLocalRemoval: noopAsync,
  recycleDocument: noop,
  prewarm: () => null,
  closeActivityPanel: noop,
};

const DocumentContext = createContext<DocumentContextValue | null>(null);

export function DocumentProvider({ children, host }: { children: ReactNode; host?: DocumentHostCallbacks }) {
  const value = useMemo<DocumentContextValue>(() => ({ ...DEFAULTS, ...host }), [host]);
  return <DocumentContext value={value}>{children}</DocumentContext>;
}

export function useDocumentContext(): DocumentContextValue {
  const ctx = use(DocumentContext);
  if (!ctx) throw new Error("useDocumentContext must be used within <DocumentProvider />");
  return ctx;
}

export function useOpenBlobRunner(): (() => void) | null {
  return null;
}

export function useDocumentTransition(): Pick<DocumentContextValue, "openDocumentTransition" | "openTargetTransition"> {
  const { openDocumentTransition, openTargetTransition } = useDocumentContext();
  return { openDocumentTransition, openTargetTransition };
}
