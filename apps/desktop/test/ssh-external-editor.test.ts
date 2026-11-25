import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { SshExternalDrafts } from "../src/main/ssh-external-editor.js";

test("SSH text copies are owned by the original window and survive closing its edit grant", () => {
  const folder = mkdtempSync(path.join(tmpdir(), "huhu-ssh-external-editor-test-"));
  const drafts = new SshExternalDrafts();
  const owner = {};
  const other = {};
  try {
    const local = path.join(folder, "copy.txt");
    const { id } = drafts.create(owner, local, "original");
    expect(readFileSync(local, "utf8")).toBe("original");
    expect(() => drafts.create(owner, local, "overwrite")).toThrow(/已存在/u);
    expect(() => drafts.create(owner, path.join(folder, "run.desktop"), "ignored")).toThrow(/\.txt/u);
    expect(() => drafts.read(other, id)).toThrow(/授权/u);
    const editorFile = path.join(folder, ".editor-save");
    writeFileSync(editorFile, "edited in external program");
    renameSync(editorFile, local);
    expect(drafts.read(owner, id)).toBe("edited in external program");
    drafts.release(other, id);
    expect(drafts.read(owner, id)).toBe("edited in external program");
    drafts.release(owner, id);
    expect(() => drafts.read(owner, id)).toThrow(/授权/u);
    expect(readFileSync(local, "utf8")).toBe("edited in external program");
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test.skipIf(process.platform === "win32")("write-back reads neither replacement links nor oversized or non-text content", () => {
  const folder = mkdtempSync(path.join(tmpdir(), "huhu-ssh-external-editor-test-"));
  const owner = {};
  const drafts = new SshExternalDrafts();
  try {
    const local = path.join(folder, "copy.txt");
    const { id } = drafts.create(owner, local, "original");
    writeFileSync(local, Buffer.alloc(1024 * 1024 + 1, "a"));
    expect(() => drafts.read(owner, id)).toThrow(/UTF-8/u);
    writeFileSync(local, Buffer.from([255]));
    expect(() => drafts.read(owner, id)).toThrow(/UTF-8/u);
    rmSync(local);
    const directory = path.join(folder, "other");
    mkdirSync(directory);
    const outside = path.join(directory, "other.txt");
    writeFileSync(outside, "private local text");
    symlinkSync(outside, local);
    expect(() => drafts.read(owner, id)).toThrow(/无法读取/u);
    drafts.clear();
    expect(() => drafts.read(owner, id)).toThrow(/授权/u);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
