package main

import (
	"errors"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"time"

	"golang.org/x/sys/windows"
)

const (
	usageFailure = 64
	hostFailure  = 70
	denied       = 73
	pinDenied    = 74
	timedOut     = 75
)

var (
	runID      = regexp.MustCompile(`^[0-9a-f]{32}$`)
	errInput   = errors.New("invalid private authorization")
	errPin     = errors.New("approved file or directory changed")
	errPeer    = errors.New("peer denied")
	errTimeout = errors.New("authorization timed out")
)

func main() {
	os.Exit(safeMain(os.Args[1:]))
}

// Public diagnostics contain protocol facts only, even when an I/O error refers to private input.
func safeMain(args []string) (status int) {
	defer func() {
		if recover() != nil {
			fmt.Fprintln(os.Stderr, "HUHU_PTY FAILED")
			status = hostFailure
		}
	}()
	code, err := run(args)
	switch {
	case err == nil:
		return code
	case code == usageFailure:
		fmt.Fprintln(os.Stderr, "HUHU_PTY USAGE")
		return code
	case errors.Is(err, errPeer), errors.Is(err, errInput):
		fmt.Fprintln(os.Stderr, "HUHU_PTY DENIED")
		return denied
	case errors.Is(err, errPin):
		fmt.Fprintln(os.Stderr, "HUHU_PTY PIN_DENIED")
		return pinDenied
	case errors.Is(err, errTimeout):
		fmt.Fprintln(os.Stderr, "HUHU_PTY TIMEOUT")
		return timedOut
	default:
		fmt.Fprintln(os.Stderr, "HUHU_PTY FAILED")
		return hostFailure
	}
}

func parseProcess(pid, created string) (processID, error) {
	p, err := strconv.ParseUint(pid, 10, 32)
	if err != nil || p == 0 {
		return processID{}, errInput
	}
	t, err := strconv.ParseUint(created, 10, 64)
	if err != nil || t == 0 || strconv.FormatUint(t, 10) != created {
		return processID{}, errInput
	}
	return processID{uint32(p), created}, nil
}

func run(args []string) (int, error) {
	if len(args) < 2 {
		return usageFailure, errInput
	}
	switch args[0] {
	case "directory":
		if len(args) != 2 {
			return usageFailure, errInput
		}
		locks := newPins()
		defer locks.close()
		id, err := locks.directory(args[1])
		if err != nil {
			return 0, err
		}
		fmt.Printf("HUHU_PTY DIRECTORY 1 %s %s %s\n", id.Volume, id.Index, id.Created)
		return 0, nil
	case "inspect":
		if len(args) != 4 {
			return usageFailure, errInput
		}
		pid, err := strconv.ParseUint(args[1], 10, 32)
		if err != nil || pid == 0 {
			return usageFailure, errInput
		}
		locks := newPins()
		defer locks.close()
		image, err := locks.file(fileSpec{args[2], args[3]})
		if err != nil {
			return 0, err
		}
		h, err := openProcess(uint32(pid))
		if err != nil {
			return 0, err
		}
		defer windows.CloseHandle(h)
		id, err := processFacts(h, image)
		if err != nil {
			return 0, err
		}
		fmt.Printf("HUHU_PTY PROCESS 1 %d %s\n", id.PID, id.Created)
		return 0, nil
	case "broker", "host":
		if !runID.MatchString(args[1]) || (args[0] == "broker" && len(args) != 2) || (args[0] == "host" && len(args) != 4) {
			return usageFailure, errInput
		}
		deadline := time.Now().Add(30 * time.Second)
		locks := newPins()
		defer locks.close()
		path, err := os.Executable()
		if err != nil {
			return 0, err
		}
		self, err := locks.openFile(path)
		if err != nil {
			return 0, err
		}
		if args[0] == "broker" {
			return 0, broker(args[1], self, deadline)
		}
		peer, err := parseProcess(args[2], args[3])
		if err != nil {
			return usageFailure, err
		}
		return host(args[1], peer, self, deadline)
	default:
		return usageFailure, errInput
	}
}
