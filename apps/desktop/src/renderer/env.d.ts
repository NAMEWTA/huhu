export {};
type EngineState = "starting" | "ready" | "stopped" | "crashed";
declare global {
  interface Window {
    huhuHost: {
      appMenu: import("@huhu/workbench").AppMenuHost;
      windowChrome?: import("@huhu/workbench").WindowChromeHost;
      appInfo(): Promise<{ name: string; version: string; platform: string; arch: string; electron: string; chrome: string; node: string }>;
      revealVault(): Promise<void>;
      openVaultFile(rel: string, reveal?: boolean): Promise<"opened" | "revealed" | "denied" | "missing" | "failed">;
      openExternal(url: string): Promise<boolean>;
      sshExternalEditor: import("@huhu/plugin-ssh/shared").SshExternalEditorHost;
      externalLinkPreview(url: string): Promise<unknown>;
      previewGrant(rel: string): Promise<{ ok: true; url: string; nonce: string } | { ok: false; reason: string }>;
      previewRevoke(nonce: string): Promise<void>;
      onPreviewBlocked(cb: (e: { nonce: string; count: number }) => void): () => void;
      pickSavePath(defaultName: string): Promise<string | null>;
      pickOpenPath(kind: "zip" | "directory" | "file"): Promise<string | null>;
      mailDraftAttachments: import("@huhu/plugin-mail/desktop-attachments").DesktopDraftAttachmentHost;
      cliStatus(): Promise<unknown>;
      cliInstall(): Promise<unknown>;
      cliUninstall(): Promise<unknown>;
      notices(): Promise<string>;
      vault: import("@huhu/workbench").VaultHostApi;
      engine(): Promise<{ baseUrl: string; token: string; vaultId: string }>;
      engineState(): Promise<EngineState>;
      restartEngine(): Promise<void>;
      readExitSave(vaultPath: string): Promise<unknown>;
      acknowledgeExitSave(vaultPath: string, id: string): Promise<void>;
      onExit(prepare: import("../exit-ipc.js").PrepareExit, release: import("../exit-ipc.js").ReleaseExit): () => void;
      onEngineState(cb: (s: EngineState) => void): () => void;
      showAutomationNotification(notice: { id: string; title: string; occurrence: import("@huhu/workbench").PlanOccurrenceLink }, vaultId: string): Promise<void>;
      onAutomationNotification(cb: (notice: { vaultId: string; id: string; occurrence: import("@huhu/workbench").PlanOccurrenceLink }) => void): () => void;
    };
  }
}
