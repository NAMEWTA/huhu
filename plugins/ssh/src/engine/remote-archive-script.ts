// Runs on the selected SSH host. Archive bytes and staging files stay on that host.
export const remoteArchiveScript = String.raw`
import calendar
import ctypes
import errno
import hashlib
import json
import os
import resource
import shutil
import signal
import stat
import subprocess
import sys
import tarfile
import tempfile
import unicodedata
import zipfile

MAX_ENTRIES = 256
NOFOLLOW = os.O_NOFOLLOW | os.O_NONBLOCK

class Invalid(Exception):
    pass

class Changed(Exception):
    pass

def interrupted(signum, frame):
    raise InterruptedError()

def entry_revision(path, info):
    values = [path, info.st_mode, info.st_size, info.st_mtime_ns // 1000000000, info.st_uid, info.st_gid, None]
    return hashlib.sha256(json.dumps(values, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()

def identity(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_size, info.st_mtime_ns, info.st_ctime_ns)

def open_directory(path):
    flags = os.O_DIRECTORY | NOFOLLOW
    descriptor = os.open("/", flags)
    try:
        for part in path.split("/"):
            if part:
                child = os.open(part, flags, dir_fd=descriptor)
                os.close(descriptor)
                descriptor = child
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise

def check_directory(path, descriptor):
    try:
        current = open_directory(path)
    except OSError:
        raise Changed() from None
    try:
        if not os.path.samestat(os.fstat(current), os.fstat(descriptor)):
            raise Changed()
    finally:
        os.close(current)

def check_source(source, absolute, revision):
    try:
        info = os.stat(source, follow_symlinks=False)
    except FileNotFoundError:
        raise Changed() from None
    if entry_revision(absolute, info) != revision:
        raise Changed()
    return info

def check_target(target, absolute, revision):
    try:
        info = os.stat(target, follow_symlinks=False)
    except FileNotFoundError:
        if revision is not None:
            raise Changed() from None
        return
    if revision is None:
        raise FileExistsError()
    if not stat.S_ISREG(info.st_mode) or entry_revision(absolute, info) != revision:
        raise Changed()

def member_parts(name):
    if name.startswith("./"):
        name = name[2:]
    parts = name.rstrip("/").split("/")
    if len(parts) > 16 or len(name.encode("utf-8")) > 1024:
        raise Invalid()
    for part in parts:
        if (not part or part in (".", "..") or len(part.encode("utf-8")) > 255 or "\\" in part
                or any(unicodedata.category(char).startswith("C") for char in part)):
            raise Invalid()
    return parts

def copy_bytes(reader, writer, length):
    remaining = length
    while remaining:
        data = reader.read(min(65536, remaining))
        if not data:
            raise Invalid()
        writer.write(data)
        remaining -= len(data)
    if reader.read(1):
        raise Invalid()

def snapshot(parent, source, destination, parts, budget, expected=None):
    member_parts("/".join(parts))
    budget["entries"] -= 1
    if budget["entries"] < 0:
        raise Invalid()
    before = os.stat(source, dir_fd=parent, follow_symlinks=False)
    if expected is not None and identity(before) != identity(expected):
        raise Changed()
    is_dir = stat.S_ISDIR(before.st_mode)
    if not is_dir and not stat.S_ISREG(before.st_mode):
        raise Invalid()
    descriptor = os.open(source, NOFOLLOW | (os.O_DIRECTORY if is_dir else 0), dir_fd=parent)
    try:
        if identity(os.fstat(descriptor)) != identity(before):
            raise Changed()
        if is_dir:
            os.mkdir(destination, mode=0o700)
            with os.scandir(descriptor) as entries:
                for child in entries:
                    snapshot(descriptor, child.name, os.path.join(destination, child.name), parts + [child.name], budget)
        else:
            budget["bytes"] -= before.st_size
            if budget["bytes"] < 0:
                raise Invalid()
            with os.fdopen(descriptor, "rb", closefd=False) as reader, open(destination, "xb") as writer:
                copy_bytes(reader, writer, before.st_size)
        if identity(os.fstat(descriptor)) != identity(before) or identity(os.stat(source, dir_fd=parent, follow_symlinks=False)) != identity(before):
            raise Changed()
        os.utime(destination, ns=(before.st_mtime_ns, before.st_mtime_ns))
    finally:
        os.close(descriptor)

def archive_members(reader, kind):
    if kind == "zip":
        with zipfile.ZipFile(reader) as zipped:
            for item in zipped.infolist():
                directory = item.is_dir()
                mode = stat.S_IFMT(item.external_attr >> 16)
                if item.flag_bits & 1 or mode not in (0, stat.S_IFDIR if directory else stat.S_IFREG):
                    raise Invalid()
                # ZIP stores a local time without an offset. Interpret it as UTC.
                yield item.orig_filename, directory, item.file_size, calendar.timegm(item.date_time) * 1000, lambda: zipped.open(item)
    else:
        with tarfile.open(fileobj=reader, mode="r|gz" if kind == "tar.gz" else "r|") as archive:
            for item in archive:
                if not item.isdir() and not item.isfile():
                    raise Invalid()
                yield item.name, item.isdir(), item.size, int(item.mtime * 1000), lambda: archive.extractfile(item)

def inspect_archive(source, kind, limit, destination=None, expected=None):
    with os.fdopen(os.open(source, NOFOLLOW), "rb") as reader:
        before = os.fstat(reader.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_size > limit:
            raise Invalid()
        if expected is not None and identity(before) != identity(expected):
            raise Changed()
        digest = hashlib.sha256()
        remaining = before.st_size
        while remaining:
            block = reader.read(min(65536, remaining))
            if not block:
                raise Changed()
            digest.update(block)
            remaining -= len(block)
        if reader.read(1):
            raise Changed()
        reader.seek(0)
        entries, paths, spellings = [], {}, {}
        count = 0
        for name, directory, length, mtime, open_member in archive_members(reader, kind):
            count += 1
            limit -= length
            if count > MAX_ENTRIES or limit < 0 or length < 0 or (directory and length):
                raise Invalid()
            if directory and name in (".", "./"):
                continue
            parts = member_parts(name)
            relative = "/".join(parts)
            key = relative.casefold()
            for index in range(1, len(parts) + 1):
                prefix = "/".join(parts[:index])
                folded = prefix.casefold()
                if spellings.setdefault(folded, prefix) != prefix or (index < len(parts) and paths.get(folded) is False):
                    raise Invalid()
            if key in paths or (not directory and any(p.startswith(key + "/") for p in spellings)):
                raise Invalid()
            paths[key] = directory
            if destination is not None:
                target = os.path.join(destination, *parts)
                if directory:
                    os.makedirs(target, exist_ok=True)
                else:
                    os.makedirs(os.path.dirname(target), exist_ok=True)
                    with open_member() as data, open(target, "xb") as output:
                        copy_bytes(data, output, length)
                    os.utime(target, ns=(mtime * 1000000, mtime * 1000000))
            entries.append({"name": relative + ("/" if directory else ""), "directory": directory, "size": length, "mtime": mtime})
        if identity(os.fstat(reader.fileno())) != identity(before):
            raise Changed()
        return {"archiveSha256": digest.hexdigest(), "entries": entries}

def publish_directory(staged, target):
    rename = getattr(ctypes.CDLL(None, use_errno=True), "renameat2", None)
    if rename is None:
        raise Invalid()
    if rename(-100, os.fsencode(staged), -100, os.fsencode(target), 1) != 0:
        code = ctypes.get_errno()
        if code in (errno.EINVAL, errno.ENOSYS, errno.ENOTSUP):
            raise Invalid()
        raise OSError(code, os.strerror(code))

def run(request):
    op, root, name, target, kind, limit, source_revision, target_revision = request
    if os.path.realpath(root) != root:
        raise Invalid()
    root_fd = open_directory(root)
    try:
        os.fchdir(root_fd)
        original = check_source(name, os.path.join(root, name), source_revision)
        archive_path = os.path.join(root, target if op == "compress" else name)
        if op == "list":
            result = inspect_archive(name, kind, limit, expected=original)
            check_directory(root, root_fd)
            return {**result, "archivePath": archive_path}
        target_path = os.path.join(root, target)
        check_target(target, target_path, target_revision)
        with tempfile.TemporaryDirectory(prefix=".huhu-archive-", dir=".") as stage:
            if op == "compress":
                snapshot_root = os.path.join(stage, "source")
                os.mkdir(snapshot_root, mode=0o700)
                snapshot(root_fd, name, os.path.join(snapshot_root, name), [name], {"entries": MAX_ENTRIES, "bytes": limit}, original)
                archive_name = "archive." + kind
                staged = os.path.join(stage, archive_name)
                program = shutil.which("zip" if kind == "zip" else "tar")
                if program is None or not os.path.isabs(program):
                    raise Invalid()
                if kind == "zip":
                    tool = [program, "-q", "-r", "../" + archive_name, "--", "./" + name]
                else:
                    tool = [program, "-czf" if kind == "tar.gz" else "-cf", "../" + archive_name, "--", name]
                environment = {"PATH": os.defpath, "TZ": "UTC"}
                subprocess.run(tool, cwd=snapshot_root, env=environment, check=True, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                result = inspect_archive(staged, kind, limit)
            else:
                staged = os.path.join(stage, "extracted")
                os.mkdir(staged, mode=0o700)
                result = inspect_archive(name, kind, limit, staged, original)
                result["extractedPath"] = target_path
            if identity(check_source(name, os.path.join(root, name), source_revision)) != identity(original):
                raise Changed()
            check_directory(root, root_fd)
            check_target(target, target_path, target_revision)
            if op == "extract":
                publish_directory(staged, target)
            elif target_revision is None:
                os.link(staged, target)
            else:
                os.replace(staged, target)
            return {**result, "archivePath": archive_path}
    finally:
        os.close(root_fd)

try:
    os.umask(0o077)
    for event in (signal.SIGHUP, signal.SIGTERM, signal.SIGALRM):
        signal.signal(event, interrupted)
    signal.alarm(90)
    request = json.loads(sys.argv[1])
    resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024,) * 2)
    resource.setrlimit(resource.RLIMIT_FSIZE, (request[5],) * 2)
    print(json.dumps(run(request), ensure_ascii=False, allow_nan=False))
except (Invalid, UnicodeError, ValueError, OverflowError, MemoryError, tarfile.TarError, zipfile.BadZipFile, NotImplementedError, subprocess.CalledProcessError):
    sys.exit(2)
except FileExistsError:
    sys.exit(3)
except Changed:
    sys.exit(4)
except PermissionError:
    sys.exit(5)
except OSError as error:
    sys.exit(2 if error.errno == errno.EFBIG else 1)
`;
