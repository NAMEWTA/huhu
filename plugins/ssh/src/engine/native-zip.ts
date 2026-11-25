import { errors } from "@huhu/contracts";
import { linuxZip } from "./linux-zip.js";
import { windowsZip } from "./windows-zip.js";

export const ZIP_MAX_BYTES = 16 * 1024 * 1024;
export const ZIP_MAX_ENTRIES = 128;
export interface NativeZipEntry {
  index: number;
  name: string;
  directory: boolean;
  size: number;
  mtime: number;
  sha256?: string | undefined;
  attributes?: number;
}

type ZipRunner = (action: "probe" | "create" | "read", stage: string, signal?: AbortSignal) => Promise<string>;

export const nativeZip: { label: string; run: ZipRunner } = process.platform === "linux"
  ? { label: "本机 Linux ZIP 后端（系统 Python 3）", run: linuxZip }
  : process.platform === "win32"
    ? { label: "本机 Windows .NET ZIP 后端", run: windowsZip }
    : { label: "本机 ZIP 后端", run: async () => { throw errors.invalidInput("当前平台没有本机 ZIP 后端"); } };
