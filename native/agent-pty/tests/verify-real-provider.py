"""Run one resolver-produced launch on the production Linux helper in an offline namespace."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import pty
import re
import runpy
import subprocess
import sys
import time
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--helper", type=Path, required=True)
    parser.add_argument("--provider", choices=("codex", "pi", "claude"), required=True)
    parser.add_argument("--mode", choices=("version", "interactive"), required=True)
    args = parser.parse_args()
    devices = [line.split(":", 1)[0].strip() for line in Path("/proc/net/dev").read_text().splitlines()[2:]]
    if any(device != "lo" for device in devices):
        parser.error("run in an isolated network namespace with only the loopback interface")
    launch = json.load(sys.stdin)
    run(args.helper.resolve(strict=True), args.provider, args.mode, launch)


def staged_process(host, expected_digest, cwd):
    pending = [host]
    while pending:
        pid = pending.pop()
        try:
            for children in Path(f"/proc/{pid}/task").glob("*/children"):
                pending.extend(int(child) for child in children.read_text().split())
            executable = Path(os.readlink(f"/proc/{pid}/exe"))
            stage = next((part for part in executable.parents if part.name.startswith("huhu-agent-install-")), None)
            if not stage or os.readlink(f"/proc/{pid}/cwd") != cwd:
                continue
            with Path(f"/proc/{pid}/exe").open("rb") as actual:
                assert hashlib.file_digest(actual, "sha256").hexdigest() == expected_digest
            assert executable.is_file() and executable.stat().st_mode & 0o222 == 0
            return executable, stage
        except FileNotFoundError:
            continue
    return None


def run(helper, provider, mode, launch):
    hooks = runpy.run_path(str(Path(__file__).with_name("verify-linux.py")))
    wait_for, size, read_pty, stop = (hooks[name] for name in ("wait_for", "size", "read_pty", "stop_process"))
    marker = "isolated-provider-" + uuid.uuid4().hex
    protect = launch["protect"]
    assert protect == ["HUHU_PROVIDER_FIXTURE_SECRET"]
    ordinary = launch.pop("ordinary")
    home = Path(ordinary["HOME"])
    assert home.name == "home" and home.parent.name.startswith("huhu-real-provider-")
    launch["environment"] = {**ordinary, protect[0]: marker}
    env = {name: ordinary[name] for name in ("PATH", "HOME", "XDG_RUNTIME_DIR", "TMPDIR", "TERM", "LANG")}
    with helper.open("rb") as installed:
        helper_spec = {"path": str(helper), "sha256": hashlib.file_digest(installed, "sha256").hexdigest()}
    run_id = uuid.uuid4().hex
    with subprocess.Popen([helper, "broker", run_id], env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as broker:
        ready = broker.stdout.readline().decode().split()
        assert ready[:3] == ["HUHU_PTY", "BROKER_READY", "1"] and int(ready[3]) == broker.pid
        host_argv = [helper, "host", run_id, ready[3], ready[4]]
        host, master = pty.fork()
        if host == 0:
            os.execve(helper, host_argv, env)
        waited = False
        try:
            size(master, 48, 140)
            os.set_blocking(master, False)

            def inspect():
                check = subprocess.run(
                    [helper, "inspect", str(host), helper, helper_spec["sha256"], run_id, ready[3], ready[4]],
                    env=env, capture_output=True, timeout=5,
                )
                return check.stdout.decode().split() if check.returncode == 0 else None

            fact = wait_for(inspect, "production host identity")
            assert fact[:4] == ["HUHU_PTY", "PROCESS", "1", str(host)]
            request = {"version": 1, "host": {"pid": host, "created": fact[4], "image": helper_spec}, "launch": launch}
            receipts, _ = broker.communicate(json.dumps(request).encode(), timeout=30)
            assert broker.returncode == 0, (broker.returncode, receipts)
            assert receipts.decode().splitlines() == ["HUHU_PTY ISSUED_ONCE", "HUHU_PTY RUNNING"]
            terminal = bytearray()
            ansi = re.compile(rb"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))")
            cursor = b"\x1b[6n"

            def drain():
                tail = terminal[-4:]
                chunk = read_pty(master)
                terminal.extend(chunk)
                assert len(terminal) < 8 * 1024 * 1024, "unexpected terminal output volume"
                for _ in range((tail + chunk).count(cursor) - tail.count(cursor)):
                    os.write(master, b"\x1b[1;1R")
                return ansi.sub(b"", terminal)

            def seen(pattern):
                return re.search(pattern, drain(), re.I)

            version = {"codex": rb"codex-cli [\d.]+", "pi": rb"[0-9]+\.[0-9]+\.[0-9]+", "claude": rb"[\d.]+ \(Claude Code\)"}[provider]
            stage = None
            if mode == "version":
                wait_for(lambda: seen(version), "real provider version")
                wait_for(lambda: seen(rb"HUHU_PTY AGENT_EXIT 0"), "successful provider version exit")
            else:
                screen = {
                    "codex": rb"Codex|Sign in|Welcome",
                    "pi": rb"Startup help|Pi Coding Agent|pi v[\d.]+|ctrl\+",
                    "claude": rb"Claude Code|Welcome|text style|login method",
                }[provider]
                wait_for(lambda: seen(screen), "real provider presents its interactive screen")
                program, stage = wait_for(lambda: staged_process(host, launch["image"]["sha256"], launch["directory"]["path"]), "approved image and cwd on the actual child")
                if provider == "pi":
                    os.write(master, b"/session\r")
                    wait_for(lambda: seen(rb"Session Info"), "Pi bundled session panel")
                    os.write(master, b"/quit\r")
                else:
                    if provider == "codex":
                        vendor = program.parent.parent
                        assert (vendor / "codex-package.json").is_file()
                        assert (vendor / "codex-resources").is_dir()
                        assert (vendor / "bin/codex-code-mode-host").is_file()
                        reentered = subprocess.check_output([program, "--no-daemon", "--version"], env=ordinary, cwd=launch["directory"]["path"], timeout=15)
                        assert re.search(version, reentered, re.I)
                    os.write(master, b"\x03")
                    deadline = time.monotonic() + 1.5
                    while time.monotonic() < deadline and not seen(rb"HUHU_PTY AGENT_EXIT \d+"):
                        time.sleep(0.05)
                    if not seen(rb"HUHU_PTY AGENT_EXIT \d+"):
                        os.write(master, b"\x03")
                wait_for(lambda: seen(rb"HUHU_PTY AGENT_EXIT \d+"), "provider returned to the same PTY")

            os.write(master, b'printf "provider-shell:%s:%s:%s\\n" "$HUHU_PROVIDER_FIXTURE_PLAIN" "${HUHU_PROVIDER_FIXTURE_SECRET-absent}" "$PWD"\n')
            expected = b"provider-shell:ordinary:absent:" + os.fsencode(launch["directory"]["path"])
            wait_for(lambda: expected in drain(), "return shell has ordinary environment, approved cwd and no protected value")
            os.write(master, b"exit 23\n")

            def reap():
                pid, state = os.waitpid(host, os.WNOHANG)
                return (pid, state) if pid else None

            _, state = wait_for(reap, "the same host exits with the return shell")
            waited = True
            assert os.waitstatus_to_exitcode(state) == 23
            drain()
            assert marker.encode() not in terminal
            if stage is not None:
                assert not stage.exists()
            print(json.dumps({"provider": provider, "mode": mode, "hostPid": host, "exit": 23, "offline": True}))
        finally:
            if not waited:
                stop(host)
                os.waitpid(host, 0)
            os.close(master)
            if broker.poll() is None:
                broker.kill()


if __name__ == "__main__":
    main()
