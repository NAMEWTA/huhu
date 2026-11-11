import type { EngineClient } from "../engine-client/client.js";
import { host } from "../settings/host.js";

export interface ExternalCommandRef {
  pluginId: string;
  id: string;
  title: string;
}

/** 运行外部扩展的命令；命令返回 saveFile 时弹出桌面保存对话框写出文件。返回给用户看的一句结果。 */
export async function runExternalCommand(client: Pick<EngineClient, "call">, cmd: ExternalCommandRef): Promise<string> {
  const r = await client.call<{ result: unknown }>("plugins.commands.run", { pluginId: cmd.pluginId, commandId: cmd.id, args: {} }, { write: true });
  const out = (r.result ?? {}) as { saveFile?: { name?: unknown; content?: unknown }; count?: unknown };
  const file = out.saveFile;
  if (file && typeof file.name === "string" && typeof file.content === "string") {
    const saved = (await host()?.saveTextFile(file.name, file.content)) ?? false;
    return saved ? `已保存「${file.name}」` : "已取消保存";
  }
  return `已运行「${cmd.title}」`;
}
