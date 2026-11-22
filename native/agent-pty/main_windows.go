package main

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"golang.org/x/sys/windows"
)

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
		image, err := locks.file(fileSpec{Path: args[2], SHA256: args[3]})
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
