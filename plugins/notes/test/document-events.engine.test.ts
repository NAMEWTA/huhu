import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { boot } from "../../../apps/engine/src/boot.js";
import { DocumentSession, type SessionEngine } from "../src/ui/documents/DocumentSession.js";

test.each(["shared.md", "shared.html"])("保存 %s 通知同库其他编辑会话，保留未保存正文并拒绝旧版本", async (file) => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-doc-events-"));
  writeFileSync(path.join(root, file), "initial");
  const running = await boot({ vaultPath: root, create: true });
  const client: SessionEngine = {
    async call<T>(capability: string, input: unknown): Promise<T> {
      const result = await running.dispatcher.call("desktop", { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
      if (!result.ok) throw new Error(result.error.code);
      return result.data as T;
    },
  };
  const options = { engine: client, autosave: () => false, pollMs: 0 };
  const writer: SessionEngine = { call: client.call };
  const clean = new DocumentSession({ ...options, engine: writer, id: { vaultId: running.vault.id, path: file, epoch: 1 } });
  const dirty = new DocumentSession({ ...options, id: { vaultId: running.vault.id, path: file, epoch: 2 } });
  const events: { path: string; writeId?: string }[] = [];
  let deferredDelivery: (() => void)[] | undefined;
  const unsubscribe = running.events.subscribe((event) => {
    if (event.type !== "vault.fileChanged" || !("path" in event.payload) || event.payload.path !== file) return;
    const writeId = "writeId" in event.payload ? event.payload.writeId : undefined;
    events.push({ path: file, ...(writeId && { writeId }) });
    if (deferredDelivery) deferredDelivery.push(() => clean.notifyExternalChange("modified", writeId));
    else clean.notifyExternalChange("modified", writeId);
    dirty.notifyExternalChange("modified", writeId);
  });
  try {
    await clean.load();
    await dirty.load();
    const version = clean.getSnapshot().baseVersion;
    dirty.setText("my unsaved input");
    const otherWriteId = randomUUID();
    await client.call("notes.save", { path: `./${file}`, text: "from another workbench", expectedVersion: version, writeId: otherWriteId });
    expect(readFileSync(path.join(root, file), "utf8")).toBe("from another workbench");
    expect(events).toEqual([{ path: file, writeId: otherWriteId }]);
    await expect.poll(() => clean.currentText()).toBe("from another workbench");
    await expect.poll(dirty.getSnapshot).toMatchObject({ text: "my unsaved input", state: "conflict", hasUnsaved: true });
    await expect(client.call("notes.save", { path: file, text: "stale", expectedVersion: version })).rejects.toThrow("VERSION_CONFLICT");
    expect(events).toEqual([{ path: file, writeId: otherWriteId }]);
    expect(readFileSync(path.join(root, file), "utf8")).toBe("from another workbench");
    clean.setText("saved by the subscribed editor");
    const calls = vi.spyOn(writer, "call");
    expect(await clean.save()).toBe(true);
    expect(clean.getSnapshot()).toMatchObject({ text: "saved by the subscribed editor", state: "saved", hasUnsaved: false });
    expect(dirty.getSnapshot()).toMatchObject({ text: "my unsaved input", state: "conflict", hasUnsaved: true });
    expect(events).toEqual([
      { path: file, writeId: otherWriteId },
      { path: file, writeId: expect.any(String) },
    ]);
    expect(calls.mock.calls.map(([capability]) => capability)).toEqual(["notes.save"]);

    // 保存调用的回执先交付，单独扣住这笔保存的事件，模拟 WS 晚于 HTTP。
    const delayed: (() => void)[] = [];
    deferredDelivery = delayed;
    clean.setText("A");
    expect(await clean.save()).toBe(true);
    const savedVersion = clean.getSnapshot().baseVersion;
    expect(delayed).toHaveLength(1);
    clean.setText("B");
    calls.mockClear();
    deferredDelivery = undefined;
    for (const deliver of delayed) deliver();
    await Promise.all(calls.mock.results.map(({ value }) => value));

    expect(readFileSync(path.join(root, file), "utf8")).toBe("A");
    expect(clean.getSnapshot()).toMatchObject({ text: "B", baseVersion: savedVersion, state: "dirty", hasUnsaved: true });
    expect(calls).not.toHaveBeenCalled();
    calls.mockRestore();
    expect(await clean.save()).toBe(true);
    expect(readFileSync(path.join(root, file), "utf8")).toBe("B");
  } finally {
    unsubscribe();
    await running.shutdown();
    rmSync(root, { recursive: true, force: true });
  }
});
