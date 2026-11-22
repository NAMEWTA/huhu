"""Exercise the production Linux broker and host on isolated real PTYs."""

import argparse
import calendar
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pty
import re
import shutil
import signal
import struct
import subprocess
import sys
import tempfile
import termios
import time
import uuid


TERMINAL_ESCAPES = re.compile(rb"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))")


def wait_for(observe, label):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        outcome = observe()
        if outcome:
            return outcome
        time.sleep(0.025)
    raise AssertionError(label)


def size(master, rows, columns):
    fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", rows, columns, 0, 0))


def observe_file(proof, event):
    if not proof.exists():
        return None
    observations = [json.loads(line) for line in proof.read_text().splitlines(keepends=True) if line.endswith("\n")]
    return next((row for row in observations if row["event"] == event), None)


def read_pty(master):
    output = bytearray()
    while True:
        try:
            data = os.read(master, 4096)
            if not data:
                return output
            output.extend(data)
        except (BlockingIOError, OSError):
            return output


def report_terminal_tail(transcript, canary, label):
    visible = TERMINAL_ESCAPES.sub(b"", transcript).replace(canary.encode(), b"[REDACTED]")
    tail = visible[-2048:].decode("utf-8", errors="backslashreplace")
    print(f"{label} PTY tail (last 2048 redacted bytes): {tail!r}", file=sys.stderr)


def verify_return_shell(master, output, cwd, environment_prefix, plain, rows, columns):
    # The outer PTY remains raw. Query fd 0 of a command actually executed by
    # the returned shell, which inherits the inner PTY slave.
    command = (
        "printf 'shell-%s:%s:%s:%s:%s:%s\\n' proof "
        f'"${environment_prefix}_PLAIN" "${{{environment_prefix}_SECRET+x}}" '
        '''"$(pwd -P)" "$(stty size)" '''
        '''"$(python3 -I -S -c 'import termios; print("canonical" if termios.tcgetattr(0)[3] & termios.ICANON else "noncanonical")')"\r'''
    )
    os.write(master, command.encode("ascii"))
    # The full marker is absent from the command itself, so tty echo cannot pass the check.
    def observation():
        transcript = output()
        proof = re.search(rb"shell-proof:([^\r\n]*)\r?\n", transcript)
        if not proof and b"HUHU_PTY CHILD_EXIT" in transcript:
            raise AssertionError("outer host exited before the return shell completed its terminal probe")
        return proof

    proof = wait_for(observation, "return shell executed its terminal probe")
    facts, _, mode = proof.group(1).rpartition(b":")
    assert mode == b"canonical", "return shell stdin must have ICANON set"
    assert facts == os.fsencode(f"{plain}::{cwd}:{rows} {columns}"), "return shell must preserve cwd, size and ordinary environment and omit the protected variable"


def stop_process(pid):
    try:
        os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def approved_sh(file, image, names):
    current = file.stat()
    birth = subprocess.check_output(
        ["stat", "-c", "%w", file], env={**names, "TZ": "UTC", "LC_ALL": "C"}, timeout=5
    ).decode().strip()
    seconds, fraction = birth.removesuffix(" +0000").split(".")
    birth_ns = calendar.timegm(time.strptime(seconds, "%Y-%m-%d %H:%M:%S")) * 10**9 + int(fraction)
    return {
        "path": str(file), "identity": f"{current.st_dev}:{current.st_ino}",
        "birthtimeNs": str(birth_ns), "ctimeNs": str(current.st_ctime_ns),
        "mtimeNs": str(current.st_mtime_ns), "size": str(current.st_size), "sha256": image["sha256"],
    }


def proof_for(helper, fixture, work, case):
    rule = case == "approved-rule"
    shell = Path("/bin/bash" if case == "shell-alias" else "/bin/sh").resolve(strict=True)
    program = shell if rule else work / "agent"
    if not rule:
        shutil.copy2(fixture, program)
    proof = work / "proof"
    synthetic = "fixture-linux-private-" + uuid.uuid4().hex
    names = {"PATH": "/usr/bin:/bin", "HOME": str(work), "TERM": "xterm-256color"}
    accepted = {
        **names,
        "HUHU_AGENT_FIXTURE_PROOF": str(proof),
        "HUHU_AGENT_FIXTURE_PLAIN": "fixture-ordinary",
        "HUHU_AGENT_FIXTURE_SPAWN": "1",
        "HUHU_AGENT_FIXTURE_LEAVE_RAW": "1",
        "HUHU_AGENT_FIXTURE_SHA": hashlib.sha256(synthetic.encode()).hexdigest(),
        "HUHU_AGENT_FIXTURE_SECRET": synthetic,
    }

    def status(*args):
        return subprocess.check_output([helper, *args], env=names, stderr=subprocess.DEVNULL, timeout=5).decode().split()

    def image(file):
        with file.open("rb") as data:
            digest = hashlib.file_digest(data, "sha256").hexdigest()
        return {"path": str(file), "sha256": digest}

    def identity(fields):
        return dict(zip(("volume", "index", "created"), fields, strict=True))

    root = image(helper)
    target = image(program)
    target["id"] = identity(status("program", program, target["sha256"])[3:])
    directory = {"path": str(work), "id": identity(status("directory", work)[3:])}
    run_id = uuid.uuid4().hex
    with subprocess.Popen([helper, "broker", run_id], env=names, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as broker:
        ready = broker.stdout.readline().decode().split()
        assert ready[:3] == ["HUHU_PTY", "BROKER_READY", "1"] and int(ready[3]) == broker.pid
        host_args = [helper, "host", run_id, ready[3], ready[4]]
        host, master = pty.fork()
        if host == 0:
            os.execve(helper, host_args, names)
        descendants = []
        host_waited = False
        transcript = bytearray()
        os.set_blocking(master, False)

        def output():
            transcript.extend(read_pty(master))
            return transcript

        try:
            size(master, 24, 80)

            def inspect():
                try:
                    return status("inspect", str(host), helper, root["sha256"], run_id, ready[3], ready[4])
                except subprocess.CalledProcessError:
                    return None

            actual = wait_for(inspect, "Core root process image and instance")
            assert actual[:4] == ["HUHU_PTY", "PROCESS", "1", str(host)]
            if case == "changed-file":
                program.rename(work / "previous")
                shutil.copy2(fixture, program)  # same bytes, different identity

            launch = {
                "directory": directory, "image": target, "argv": [str(program)],
                "environment": accepted, "protect": ["HUHU_AGENT_FIXTURE_SECRET"],
            }
            if rule:
                launch["approvedShell"] = approved_sh(shell, target, names)
                launch["argv"] += [
                    "-c",
                    'printf "once\\n" >> rule-count; printf "literal [REDACTED], protected %s\\n" "$HUHU_AGENT_FIXTURE_SECRET"; exit 17',
                ]
            else:
                return_image = image(shell)
                return_image["id"] = identity(status("program", shell, return_image["sha256"])[3:])
                launch["returnShell"] = {"image": return_image, "argv": [str(shell), "-i"]}
                if case == "shell-alias":
                    alias = work / "sh"
                    alias.symlink_to(shell)
                    launch["returnShell"].update({"source": str(alias), "argv": [str(alias), "-i"]})
            authorization = {
                "version": 1,
                "host": {"pid": host, "created": actual[4], "image": root},
                "launch": launch,
            }
            completion, _ = broker.communicate(json.dumps(authorization).encode(), timeout=20)
            statuses = completion.decode().splitlines()
            if case == "changed-file":
                assert broker.returncode == 74
                assert not statuses and not proof.exists()
                return
            assert broker.returncode == 0
            assert statuses == ["HUHU_PTY ISSUED_ONCE", "HUHU_PTY RUNNING"]

            def reap_host():
                pid, state = os.waitpid(host, os.WNOHANG)
                return (pid, state) if pid else None

            if rule:
                _, state = wait_for(reap_host, "approved sh exits without waiting for input")
                host_waited = True
                assert os.waitstatus_to_exitcode(state) == 17
                output = read_pty(master)
                assert b"literal [REDACTED], protected ***" in output and synthetic.encode() not in output
                assert b"AGENT_EXIT" not in output and (work / "rule-count").read_bytes() == b"once\n"
                retry, retry_master = pty.fork()
                try:
                    if retry == 0:
                        os.execve(helper, host_args, names)
                    _, retry_state = os.waitpid(retry, 0)
                    assert os.waitstatus_to_exitcode(retry_state) == 73
                    assert (work / "rule-count").read_bytes() == b"once\n"
                finally:
                    os.close(retry_master)
                return
            first = wait_for(lambda: observe_file(proof, "ready"), "approved process started")
            assert first["tty"] == [True, True, True] and first["plainMatched"] and first["secretMatched"]
            assert (first["rows"], first["columns"]) == (24, 80)
            observed_pids = [first["pid"], first["detached"]]
            descendants = [os.pidfd_open(pid) for pid in observed_pids]

            if case == "host-crash":
                stop_process(host)
            else:
                size(master, 43, 101)
                resized = wait_for(lambda: observe_file(proof, "resized"), "inner PTY resized")
                assert (resized["rows"], resized["columns"]) == (43, 101)
                os.write(master, b"q")
                wait_for(lambda: observe_file(proof, "input"), "inner PTY received input")

            def saw(value):
                return value in output()

            if case in ("normal", "return-shell-crash", "shell-alias"):
                wait_for(lambda: saw(b"HUHU_PTY AGENT_EXIT 17"), "agent exit in the same terminal")
                verify_return_shell(master, output, work, "HUHU_AGENT_FIXTURE", "fixture-ordinary", 43, 101)
                if case == "shell-alias":
                    os.write(master, b"if shopt -oq posix; then printf 'alias-%s\\n' preserved; fi\r")
                    wait_for(lambda: saw(b"alias-preserved"), "Bash invoked as sh preserves POSIX mode")
                if case == "return-shell-crash":
                    os.write(master, b'/bin/sleep 60 & printf "%s %s\\n" "$$" "$!" > return-shell-pids\r')
                    pid_file = work / "return-shell-pids"

                    def return_pids():
                        recorded = pid_file.read_text().split() if pid_file.exists() else []
                        return recorded if len(recorded) == 2 else None

                    shell_pids = wait_for(return_pids, "return shell and background child")
                    observed_pids.extend(map(int, shell_pids))
                    descendants.extend(os.pidfd_open(int(pid)) for pid in shell_pids)
                    stop_process(host)
                else:
                    os.write(master, b"exit 23\r")

            _, state = wait_for(reap_host, "outer host exit")
            host_waited = True
            if case in ("normal", "shell-alias"):
                assert os.waitstatus_to_exitcode(state) == 23
                transcript.extend(read_pty(master))
                assert b"fixture:redact [REDACTED]" in transcript and synthetic.encode() not in transcript
            elif case == "host-crash":
                assert b"AGENT_EXIT" not in read_pty(master)
            elif case == "return-shell-crash":
                assert os.waitstatus_to_exitcode(state) == -signal.SIGKILL

            def descendants_reaped():
                return all(not Path(f"/proc/{pid}").exists() for pid in observed_pids)

            wait_for(descendants_reaped, "original inner process and detached descendant reaped")
            # Public host argv does not grant a second execution after the broker exits.
            retry, retry_master = pty.fork()
            if retry == 0:
                os.execve(helper, host_args, names)
            try:
                _, retry_state = os.waitpid(retry, 0)
                assert os.waitstatus_to_exitcode(retry_state) == 73
                assert sum(json.loads(line)["event"] == "ready" for line in proof.read_text().splitlines()) == 1
            finally:
                os.close(retry_master)
        except Exception:
            report_terminal_tail(output(), synthetic, case)
            raise
        finally:
            for fd in descendants:
                try:
                    signal.pidfd_send_signal(fd, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                finally:
                    os.close(fd)
            if not host_waited:
                stop_process(host)
                os.waitpid(host, 0)
            os.close(master)
            if broker.poll() is None:
                broker.kill()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--helper", type=Path, required=True)
    parser.add_argument("--fixture", type=Path, required=True)
    args = parser.parse_args()
    helper = args.helper.resolve(strict=True)
    fixture = args.fixture.resolve(strict=True)
    for case in ["normal", "host-crash", "return-shell-crash", "changed-file", "approved-rule", "shell-alias"]:
        with tempfile.TemporaryDirectory(prefix="huhu-native-linux-") as work:
            proof_for(helper, fixture, Path(work).resolve(), case)
        print(f"{case}: passed")


if __name__ == "__main__":
    main()
