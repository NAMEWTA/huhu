export interface SshExternalEditorHost {
  open(name: string, text: string): Promise<{ id: string; opened: boolean } | null>;
  read(id: string): Promise<string>;
  release(id: string): Promise<void>;
}
