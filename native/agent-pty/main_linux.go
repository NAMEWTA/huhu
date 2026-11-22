package main

import (
	"fmt"
	"net"
	"os"
	"strconv"
	"time"

	"golang.org/x/sys/unix"
)

func run(args []string) (int, error) {
	if err := unix.Setrlimit(unix.RLIMIT_CORE, &unix.Rlimit{}); err != nil {
		return 0, err
	}
	if len(args) == 1 && args[0] == "supervise" {
		return superviseLinuxChild()
	}
	if len(args) < 2 {
		return usageFailure, errInput
	}
	switch args[0] {
	case "directory":
		if len(args) != 2 {
			return usageFailure, errInput
		}
		dir, id, err := openLinuxDirectory(args[1])
		if err != nil {
			return 0, err
		}
		defer dir.Close()
		fmt.Printf("HUHU_PTY DIRECTORY %d %s %s %s\n", protocol, id.Volume, id.Index, id.Created)
		return 0, nil
	case "program":
		if len(args) != 3 {
			return usageFailure, errInput
		}
		id, err := checkedLinuxProgram(fileSpec{Path: args[1], SHA256: args[2]}, nil)
		if err != nil {
			return 0, err
		}
		fmt.Printf("HUHU_PTY PROGRAM %d %s %s %s\n", protocol, id.Volume, id.Index, id.Created)
		return 0, nil
	case "inspect":
		if len(args) != 7 || !runID.MatchString(args[4]) {
			return usageFailure, errInput
		}
		pid, err := strconv.ParseUint(args[1], 10, 32)
		if err != nil || pid == 0 {
			return usageFailure, errInput
		}
		issuer, err := parseProcess(args[5], args[6])
		if err != nil {
			return usageFailure, err
		}
		image, id, err := checkedLinuxFile(fileSpec{Path: args[2], SHA256: args[3]}, nil)
		if err != nil {
			return 0, err
		}
		defer image.Close()
		fd, peer, err := verifyLinuxProcess(processID{PID: uint32(pid)}, id, linuxHostArgs(args[4], issuer))
		if err != nil {
			return 0, err
		}
		defer unix.Close(fd)
		if !startedAtOrAfter(peer, issuer) {
			return 0, errPeer
		}
		fmt.Printf("HUHU_PTY PROCESS %d %d %s\n", protocol, peer.PID, peer.Created)
		return 0, nil
	case "broker", "host":
		if !runID.MatchString(args[1]) || (args[0] == "broker" && len(args) != 2) || (args[0] == "host" && len(args) != 4) {
			return usageFailure, errInput
		}
		deadline := time.Now().Add(30 * time.Second)
		self, err := processExecutable(uint32(os.Getpid()))
		if err != nil {
			return 0, err
		}
		if args[0] == "broker" {
			return 0, linuxBroker(args[1], self, deadline)
		}
		issuer, err := parseProcess(args[2], args[3])
		if err != nil {
			return usageFailure, err
		}
		approval, err := consumeLinux(args[1], issuer, self, deadline)
		if err != nil {
			return 0, err
		}
		return runLinuxHost(approval)
	default:
		return usageFailure, errInput
	}
}

func linuxHostArgs(id string, issuer processID) []string {
	return []string{"host", id, strconv.FormatUint(uint64(issuer.PID), 10), issuer.Created}
}

func startedAtOrAfter(child, parent processID) bool {
	childTime, childErr := strconv.ParseUint(child.Created, 10, 64)
	parentTime, parentErr := strconv.ParseUint(parent.Created, 10, 64)
	return childErr == nil && parentErr == nil && parentTime <= childTime
}

func linuxSocket(id string) *net.UnixAddr {
	return &net.UnixAddr{Name: "@huhu-agent-pty-v1-" + id, Net: "unix"}
}
