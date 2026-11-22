package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/creack/pty"
	"golang.org/x/sys/unix"
	"golang.org/x/term"
)

type linuxChild struct {
	Argv          []string `json:"argv"`
	Env           []string `json:"env"`
	ApprovedShell bool     `json:"approvedShell,omitempty"`
}

func runLinuxHost(approval *linuxApproval) (int, error) {
	defer approval.receipt.Close()
	defer approval.directory.Close()
	defer approval.image.Close()
	defer clear(approval.launch.Env)
	defer clear(approval.protected)
	notStarted := true
	defer func() {
		if notStarted {
			_, _ = approval.receipt.Write([]byte{failedByte, hostFailure})
		}
	}()

	in := int(os.Stdin.Fd())
	if !term.IsTerminal(in) || !term.IsTerminal(int(os.Stdout.Fd())) || !term.IsTerminal(int(os.Stderr.Fd())) {
		return 0, errInput
	}
	events := make(chan os.Signal, 16)
	signal.Notify(events, syscall.SIGWINCH, syscall.SIGHUP, syscall.SIGTERM, syscall.SIGINT, syscall.SIGQUIT)
	defer signal.Stop(events)

	state, err := term.MakeRaw(in)
	if err != nil {
		return 0, err
	}
	defer term.Restore(in, state)

	master, slave, err := pty.Open()
	if err != nil {
		return 0, err
	}
	defer master.Close()
	defer slave.Close()
	masterControl, err := master.SyscallConn()
	if err != nil {
		return 0, err
	}
	resize := func() error {
		size, err := unix.IoctlGetWinsize(in, unix.TIOCGWINSZ)
		if err != nil {
			return err
		}
		var resizeErr error
		if err := masterControl.Control(func(fd uintptr) { resizeErr = unix.IoctlSetWinsize(int(fd), unix.TIOCSWINSZ, size) }); err != nil {
			return err
		}
		return resizeErr
	}
	if err := resize(); err != nil {
		return 0, err
	}

	control, lease, err := os.Pipe()
	if err != nil {
		return 0, err
	}
	defer control.Close()
	defer lease.Close()
	status, ready, err := os.Pipe()
	if err != nil {
		return 0, err
	}
	defer status.Close()
	defer ready.Close()
	guard := exec.Command("/proc/self/exe", "supervise")
	guard.Env = []string{}
	guard.Stdin, guard.Stdout, guard.Stderr = slave, slave, slave
	guard.ExtraFiles = []*os.File{approval.image, approval.directory, control, ready}
	// The Core can terminate its foreground group without taking away the
	// supervisor that cleans up the inner process tree.
	guard.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err := guard.Start(); err != nil {
		return 0, err
	}
	notStarted = false
	_ = slave.Close()
	_ = control.Close()
	_ = ready.Close()
	_ = approval.image.Close()
	_ = approval.directory.Close()
	exited := make(chan error, 1)
	go func() { exited <- guard.Wait() }()
	guardWaited := false
	defer func() {
		_ = lease.Close()
		if !guardWaited {
			<-exited
		}
	}()

	raw, err := json.Marshal(approval.launch)
	clear(approval.launch.Env)
	if err != nil {
		return 0, err
	}
	_ = lease.SetWriteDeadline(time.Now().Add(5 * time.Second))
	err = sendPrivateFrame(lease, raw)
	clear(raw)
	if err != nil {
		return 0, err
	}
	_ = lease.SetWriteDeadline(time.Time{})

	_ = status.SetReadDeadline(time.Now().Add(8 * time.Second))
	var receipt [1]byte
	_, err = io.ReadFull(status, receipt[:])
	_ = status.Close()
	if err != nil {
		return 0, errPeer
	}
	switch receipt[0] {
	case runningByte:
		_, _ = approval.receipt.Write([]byte{runningByte, 0})
		_ = approval.receipt.Close()
	case failedByte:
		notStarted = true
		return 0, errPin
	default:
		return 0, errPeer
	}

	outputDone := make(chan struct{})
	output := (<-chan struct{})(outputDone)
	// The masker can finish independently if the outer terminal stops reading.
	redactions := append([]string(nil), approval.protected...)
	go func() {
		defer clear(redactions)
		if approval.launch.ApprovedShell {
			_ = maskStreamWithMarker(os.Stdout, linuxMaster{master}, redactions, []byte("***"))
		} else {
			_ = maskStream(os.Stdout, linuxMaster{master}, redactions)
		}
		close(outputDone)
	}()
	inputDone := make(chan struct{})
	input := (<-chan struct{})(inputDone)
	go func() {
		_, _ = io.Copy(master, os.Stdin)
		close(inputDone)
	}()
	cancel := func() {
		_ = lease.Close()
		input = nil
	}
	for {
		select {
		case event := <-events:
			switch event {
			case syscall.SIGWINCH:
				_ = resize()
			case syscall.SIGINT, syscall.SIGQUIT:
				_ = masterControl.Control(func(fd uintptr) {
					if group, err := unix.IoctlGetInt(int(fd), unix.TIOCGPGRP); err == nil && group > 1 {
						_ = unix.Kill(-group, event.(syscall.Signal))
					}
				})
			default:
				cancel()
			}
		case <-input:
			cancel()
		case <-output:
			output = nil
			cancel()
		case waitErr := <-exited:
			guardWaited = true
			if output != nil {
				select {
				case <-output:
				case <-time.After(500 * time.Millisecond):
				}
			}
			code := exitStatus(waitErr)
			fmt.Fprintf(os.Stderr, "\r\nHUHU_PTY CHILD_EXIT %d\n", code)
			return code, nil
		}
	}
}

// Linux PTY masters report EIO after their last slave descriptor is closed.
type linuxMaster struct{ io.Reader }

func (master linuxMaster) Read(buf []byte) (int, error) {
	n, err := master.Reader.Read(buf)
	if errors.Is(err, syscall.EIO) {
		return n, io.EOF
	}
	return n, err
}

func superviseLinuxChild() (int, error) {
	for fd := 3; fd <= 6; fd++ {
		unix.CloseOnExec(fd)
	}
	image := os.NewFile(3, "approved-image")
	directory := os.NewFile(4, "approved-directory")
	control := os.NewFile(5, "private-startup")
	status := os.NewFile(6, "private-receipt")
	defer image.Close()
	defer directory.Close()
	defer control.Close()
	defer status.Close()
	failed := true
	defer func() {
		if failed {
			_, _ = status.Write([]byte{failedByte})
		}
	}()

	raw, err := readPrivateFrame(control)
	if err != nil {
		return 0, err
	}
	var launch linuxChild
	err = json.Unmarshal(raw, &launch)
	clear(raw)
	if err != nil || len(launch.Argv) == 0 {
		return 0, errInput
	}
	defer clear(launch.Env)
	if launch.ApprovedShell {
		var st unix.Stat_t
		if unix.Fstat(int(image.Fd()), &st) != nil || !trustedLinuxShellMode(st) || checkELF(image) != nil {
			return 0, errPin
		}
	} else {
		seals, err := unix.FcntlInt(image.Fd(), unix.F_GET_SEALS, 0)
		if err != nil || seals&programSeals != programSeals {
			return 0, errPin
		}
	}
	// A Go fork inherits the OS thread's no_new_privs and its parent-death
	// signal is bound to that same thread. Keep the thread for the full run.
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	if err := unix.Prctl(unix.PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0); err != nil {
		return 0, err
	}
	if err := unix.Prctl(unix.PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0); err != nil {
		return 0, err
	}
	shutdown := make(chan struct{})
	go func() {
		_, _ = io.Copy(io.Discard, control)
		close(shutdown)
	}()
	select {
	case <-shutdown:
		return 0, errPeer
	default:
	}

	cmd := &exec.Cmd{
		Path:        "/proc/self/fd/3",
		Args:        launch.Argv,
		Dir:         "/proc/self/fd/4",
		Env:         launch.Env,
		Stdin:       os.Stdin,
		Stdout:      os.Stdout,
		Stderr:      os.Stderr,
		SysProcAttr: &syscall.SysProcAttr{Setsid: true, Setctty: true, Ctty: 0, Pdeathsig: syscall.SIGKILL},
	}
	if err := cmd.Start(); err != nil {
		return 0, err
	}
	failed = false
	clear(launch.Env)
	_ = image.Close()
	_ = directory.Close()
	if _, err := status.Write([]byte{runningByte}); err != nil {
		_ = cmd.Process.Kill()
	}
	_ = status.Close()
	exited := make(chan error, 1)
	go func() { exited <- cmd.Wait() }()
	var waitErr error
	select {
	case waitErr = <-exited:
	case <-shutdown:
		_ = cmd.Process.Kill()
		waitErr = <-exited
	}
	if err := reapLinuxDescendants(); err != nil {
		return 0, err
	}
	return exitStatus(waitErr), nil
}

func exitStatus(waitErr error) int {
	if waitErr == nil {
		return 0
	}
	var e *exec.ExitError
	if errors.As(waitErr, &e) {
		if status, ok := e.Sys().(syscall.WaitStatus); ok && status.Signaled() {
			return 128 + int(status.Signal())
		}
		return e.ExitCode()
	}
	return hostFailure
}

func reapLinuxDescendants() error {
	deadline := time.Now().Add(4 * time.Second)
	for {
		pid, err := unix.Wait4(-1, nil, unix.WNOHANG, nil)
		if err == unix.ECHILD {
			return nil
		}
		if err == unix.EINTR || pid > 0 {
			continue
		}
		if err != nil || time.Now().After(deadline) {
			return errPeer
		}
		// Exited parents reparent detached descendants here. Repeat after
		// each reap until the kernel confirms there are no children.
		tasks, err := os.ReadDir("/proc/self/task")
		if err != nil {
			return err
		}
		for _, task := range tasks {
			children, _ := os.ReadFile("/proc/self/task/" + task.Name() + "/children")
			for _, child := range strings.Fields(string(children)) {
				id, err := strconv.ParseUint(child, 10, 32)
				if err == nil {
					killAdoptedLinuxChild(uint32(id))
				}
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func killAdoptedLinuxChild(pid uint32) {
	fd, err := unix.PidfdOpen(int(pid), 0)
	if err != nil {
		return
	}
	defer unix.Close(fd)
	fields, err := linuxProcessStat(pid)
	if err == nil && fields[1] == strconv.Itoa(os.Getpid()) {
		_ = unix.PidfdSendSignal(fd, unix.SIGKILL, nil, 0)
	}
}
