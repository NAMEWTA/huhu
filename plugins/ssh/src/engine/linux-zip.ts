import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { errors } from "@huhu/contracts";

const executable = "/usr/bin/python3";
const execute = promisify(execFile);

// ZIP names are validated by Archives before publication. This process only copies numbered
// payloads into or out of the private stage; it never extracts to an archive-selected path.
const script = String.raw`
import hashlib
import json
import shutil
import struct
import sys
import time
import zipfile
import zlib
from pathlib import Path

action = sys.argv[1]
if action == "probe":
    zipfile.ZipFile
    zlib.decompressobj()
    print("zip", end="")
    sys.exit(0)

root = Path(sys.argv[2])
archive_path = root / "payload.zip"
max_bytes = 16 * 1024 * 1024
max_entries = 128
block_size = 64 * 1024

def extended_mtime(info):
    data = info.extra
    while len(data) >= 4:
        tag, length = struct.unpack_from("<HH", data)
        if length > len(data) - 4:
            break
        if tag == 0x5455 and length >= 5 and data[4] & 1:
            return struct.unpack_from("<I", data, 5)[0]
        data = data[4 + length:]
    return time.mktime((*info.date_time, 0, 0, -1))

if action == "create":
    with (root / "entries.json").open(encoding="utf-8") as manifest:
        entries = json.load(manifest)
    with zipfile.ZipFile(archive_path, "x") as output:
        for row in entries:
            stamp = row["mtime"] // 1000
            date = time.localtime(stamp)[:6]
            if not 1980 <= date[0] <= 2107:
                sys.exit("ZIP_TIMESTAMP_RANGE")
            info = zipfile.ZipInfo(row["name"], date)
            if 0 <= stamp <= 0xFFFFFFFF:
                info.extra = struct.pack("<HHBI", 0x5455, 5, 1, stamp)
            if row["directory"]:
                info.external_attr = (0o40700 << 16) | 0x10
                output.writestr(info, b"")
            else:
                info.external_attr = 0o100600 << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                with (root / (str(row["index"]) + ".bin")).open("rb") as source, output.open(info, "w") as target:
                    shutil.copyfileobj(source, target, block_size)
    sys.exit(0)

rows = []
actual = 0
with zipfile.ZipFile(archive_path, "r") as archive:
    entries = archive.infolist()
    if len(entries) > max_entries:
        sys.exit("ZIP_ENTRY_LIMIT")
    if sum(info.file_size for info in entries) > max_bytes:
        sys.exit("ZIP_BYTE_LIMIT")
    for index, info in enumerate(entries):
        directory = info.orig_filename.endswith("/")
        row = dict(index=index, name=info.orig_filename, directory=directory, size=info.file_size,
                   mtime=int(extended_mtime(info) * 1000), attributes=info.external_attr)
        if directory and info.file_size:
            sys.exit("ZIP_MEMBER_LENGTH")
        if not directory:
            digest = hashlib.sha256()
            count = 0
            with archive.open(info) as source, (root / (str(index) + ".bin")).open("xb") as target:
                while chunk := source.read(block_size):
                    count += len(chunk)
                    actual += len(chunk)
                    if actual > max_bytes or count > info.file_size:
                        sys.exit("ZIP_BYTE_LIMIT")
                    digest.update(chunk)
                    target.write(chunk)
            if count != info.file_size:
                sys.exit("ZIP_MEMBER_LENGTH")
            row["sha256"] = digest.hexdigest()
        rows.append(row)
print(json.dumps(rows, ensure_ascii=True), end="")
`;

export async function linuxZip(action: "probe" | "create" | "read", stage: string, signal?: AbortSignal): Promise<string> {
  if (process.platform !== "linux") throw errors.invalidInput("Linux ZIP 后端不可用");
  try {
    const { stdout } = await execute(executable, ["-I", "-c", script, action, stage], {
      maxBuffer: 512 * 1024,
      encoding: "utf8",
      timeout: 60_000,
      ...(signal && { signal }),
    });
    return stdout;
  } catch (error) {
    signal?.throwIfAborted();
    if (action === "probe") throw errors.invalidInput("系统 Python 3 或 ZIP 组件不可用");
    const stderr = (error as { stderr?: string }).stderr?.trim();
    if (stderr === "ZIP_ENTRY_LIMIT") throw errors.invalidInput("ZIP 条目超过上限");
    if (stderr === "ZIP_BYTE_LIMIT") throw errors.invalidInput("ZIP 展开超过 16 MiB");
    if (stderr === "ZIP_TIMESTAMP_RANGE") throw errors.invalidInput("源时间戳超出 ZIP 可保存的范围");
    throw errors.invalidInput(action === "read" ? "ZIP 损坏或包含当前后端不支持的内容" : "Linux ZIP 压缩失败");
  }
}
