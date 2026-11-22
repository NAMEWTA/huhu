"""Exercise the production Linux broker and host on isolated real PTYs."""

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pty
import shutil
import signal
import struct
import subprocess
import tempfile
import termios
import time
import uuid


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


def stop_process(pid):
    try:
        os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def proof_for(helper, fixture, work, case):
    program = work / "agent"
    shutil.copy2(fixture, program)
    proof = work / "proof"
    synthetic = "fixture-linux-private-" + uuid.uuid4().hex
    names = {"PATH": "/usr/bin:/bin", "HOME": str(work), "TERM": "xterm-256color"}
    accepted = {
        **names,
        "HUHU_AGENT_FIXTURE_PROOF": str(proof),
        "HUHU_AGENT_FIXTURE_PLAIN": "fixture-ordinary",
        "HUHU_AGENT_FIXTURE_SPAWN": "1",
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
        try:
            size(master, 24, 80)
            os.set_blocking(master, False)

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

            authorization = {
                "version": 1,
                "host": {"pid": host, "created": actual[4], "image": root},
                "launch": {
                    "directory": directory, "image": target, "argv": [str(program)],
                    "environment": accepted, "protect": ["HUHU_AGENT_FIXTURE_SECRET"],
                },
            }
            completion, _ = broker.communicate(json.dumps(authorization).encode(), timeout=20)
            statuses = completion.decode().splitlines()
            if case == "changed-file":
                assert broker.returncode == 74
                assert not statuses and not proof.exists()
                return
            assert broker.returncode == 0
            assert statuses == ["HUHU_PTY ISSUED_ONCE", "HUHU_PTY RUNNING"]
            first = wait_for(lambda: observe_file(proof, "ready"), "approved process started")
            assert first["tty"] == [True, True, True] and first["plainMatched"] and first["secretMatched"]
            assert (first["rows"], first["columns"]) == (24, 80)
            descendants = [os.pidfd_open(pid) for pid in (first["pid"], first["detached"])]

            if case == "host-crash":
                stop_process(host)
            else:
                size(master, 43, 101)
                resized = wait_for(lambda: observe_file(proof, "resized"), "inner PTY resized")
                assert (resized["rows"], resized["columns"]) == (43, 101)
                os.write(master, b"q")
                wait_for(lambda: observe_file(proof, "input"), "inner PTY received input")

            def reap_host():
                pid, state = os.waitpid(host, os.WNOHANG)
                return (pid, state) if pid else None

            _, state = wait_for(reap_host, "outer host exit")
            host_waited = True
            if case == "normal":
                assert os.waitstatus_to_exitcode(state) == 17
                output = read_pty(master)
                assert b"fixture:redact [REDACTED]" in output and synthetic.encode() not in output

            def descendants_reaped():
                return all(not Path(f"/proc/{pid}").exists() for pid in (first["pid"], first["detached"]))

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
    for case in ["normal", "host-crash", "changed-file"]:
        with tempfile.TemporaryDirectory(prefix="huhu-native-linux-") as work:
            proof_for(helper, fixture, Path(work).resolve(), case)
        print(f"{case}: passed")


if __name__ == "__main__":
    main()
