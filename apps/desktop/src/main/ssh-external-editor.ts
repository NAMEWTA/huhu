import { randomUUID } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { EDIT_MAX_BYTES } from "@huhu/plugin-ssh/shared";

type Draft = { owner: object; file: string };

export class SshExternalDrafts {
  private readonly drafts = new Map<string, Draft>();

  create(owner: object, file: string, text: string): { id: string; file: string } {
    if (path.extname(file).toLowerCase() !== ".txt" || !path.isAbsolute(file)) throw new Error("请选择新的 .txt 本机副本。");
    if (text.includes("\0") || Buffer.byteLength(text, "utf8") > EDIT_MAX_BYTES) throw new Error("外部编辑需要 1 MiB 以内的 UTF-8 文本。");
    file = path.join(realpathSync(path.dirname(file)), path.basename(file));
    try {
      writeFileSync(file, text, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("此本机文件已存在，请选择新名称。");
      throw new Error("无法保存本机文本副本。");
    }
    const id = randomUUID();
    this.drafts.set(id, { owner, file });
    return { id, file };
  }

  read(owner: object, id: string): string {
    const row = this.drafts.get(id);
    if (!row || row.owner !== owner) throw new Error("本机编辑副本的授权已失效。");
    let file: number | undefined;
    try {
      if (realpathSync(row.file) !== row.file) throw new Error();
      file = openSync(row.file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
      const before = fstatSync(file, { bigint: true });
      if (!before.isFile() || before.size > BigInt(EDIT_MAX_BYTES)) throw new Error();
      const data = Buffer.alloc(Number(before.size) + 1);
      let offset = 0;
      while (offset < data.length) {
        const count = readSync(file, data, offset, data.length - offset, null);
        if (count === 0) break;
        offset += count;
      }
      const after = fstatSync(file, { bigint: true });
      const content = data.subarray(0, offset);
      if (BigInt(offset) !== before.size || after.size !== before.size || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs || content.includes(0)) throw new Error();
      return new TextDecoder("utf-8", { fatal: true }).decode(content);
    } catch {
      throw new Error("无法读取本机副本。请确认编辑器已保存为 1 MiB 以内的 UTF-8 文本。");
    } finally {
      if (file !== undefined) closeSync(file);
    }
  }

  release(owner: object, id?: string) {
    for (const [key, row] of this.drafts) if (row.owner === owner && (id === undefined || key === id)) this.drafts.delete(key);
  }

  clear() {
    this.drafts.clear();
  }
}
