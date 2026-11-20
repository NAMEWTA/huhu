package main

import (
	"errors"
	"fmt"
	"io"
	"os"
	"runtime"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// ProcThreadAttributeValue(ProcThreadAttributeJobList, FALSE, TRUE, FALSE),
// as defined by the Windows 10 SDK WinBase.h. The job is assigned at creation.
const jobListAttribute = 0x2000d

type pseudoConsole struct {
	handle        windows.Handle
	input, output *os.File
}

func consoleSize(out windows.Handle) (windows.Coord, error) {
	var info windows.ConsoleScreenBufferInfo
	if err := windows.GetConsoleScreenBufferInfo(out, &info); err != nil {
		return windows.Coord{}, err
	}
	size := windows.Coord{X: info.Window.Right - info.Window.Left + 1, Y: info.Window.Bottom - info.Window.Top + 1}
	if size.X < 1 || size.Y < 1 {
		return windows.Coord{}, errors.New("invalid outer console size")
	}
	return size, nil
}

func newConsole(size windows.Coord) (*pseudoConsole, error) {
	in, input, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	defer in.Close()
	output, out, err := os.Pipe()
	if err != nil {
		input.Close()
		return nil, err
	}
	defer out.Close()
	var h windows.Handle
	if err := windows.CreatePseudoConsole(size, windows.Handle(in.Fd()), windows.Handle(out.Fd()), 0, &h); err != nil {
		input.Close()
		output.Close()
		return nil, err
	}
	return &pseudoConsole{h, input, output}, nil
}

func newJob() (windows.Handle, error) {
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return 0, err
	}
	var limits windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION
	limits.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	if _, err := windows.SetInformationJobObject(job, windows.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&limits)), uint32(unsafe.Sizeof(limits))); err != nil {
		windows.CloseHandle(job)
		return 0, err
	}
	return job, nil
}

func startInner(c *pseudoConsole, job windows.Handle, s launchSpec, image *pinnedFile, block []uint16) (windows.ProcessInformation, error) {
	var child windows.ProcessInformation
	args, err := windows.UTF16PtrFromString(windows.ComposeCommandLine(s.Argv))
	if err != nil {
		return child, errInput
	}
	app, err := windows.UTF16PtrFromString(image.path)
	if err != nil {
		return child, errInput
	}
	cwd, err := windows.UTF16PtrFromString(s.Directory.Path)
	if err != nil {
		return child, errInput
	}
	list, err := windows.NewProcThreadAttributeList(2)
	if err != nil {
		return child, err
	}
	defer list.Delete()
	// HPCON is an opaque pointer. x/sys stores it as a Handle, but the
	// attribute takes its value directly, unlike the pointer to the job list.
	hpcon := *(*unsafe.Pointer)(unsafe.Pointer(&c.handle))
	if err := list.Update(windows.PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE, hpcon, unsafe.Sizeof(hpcon)); err != nil {
		return child, err
	}
	if err := list.Update(jobListAttribute, unsafe.Pointer(&job), unsafe.Sizeof(job)); err != nil {
		return child, err
	}
	start := windows.StartupInfoEx{ProcThreadAttributeList: list.List()}
	start.Cb = uint32(unsafe.Sizeof(start))
	err = windows.CreateProcess(app, args, nil, nil, false,
		windows.CREATE_UNICODE_ENVIRONMENT|windows.EXTENDED_STARTUPINFO_PRESENT|windows.CREATE_SUSPENDED,
		&block[0], cwd, &start.StartupInfo, &child)
	runtime.KeepAlive(c)
	runtime.KeepAlive(job)
	return child, err
}

func (c *pseudoConsole) followSize(out windows.Handle, size windows.Coord, stop <-chan struct{}, done chan<- struct{}) {
	defer close(done)
	tick := time.NewTicker(40 * time.Millisecond)
	defer tick.Stop()
	for {
		select {
		case <-stop:
			return
		case <-tick.C:
			next, err := consoleSize(out)
			if err == nil && next != size && windows.ResizePseudoConsole(c.handle, next) == nil {
				size = next
			}
		}
	}
}

func host(id string, issuer processID, self *pinnedFile, deadline time.Time) (int, error) {
	approval, err := consume(id, issuer, self, deadline)
	if err != nil {
		return 0, err
	}
	defer approval.locks.close()
	defer clear(approval.block)
	code, err := runInner(approval.spec, approval.image, approval.block, approval.protected)
	if err != nil {
		return 0, err
	}
	fmt.Fprintf(os.Stderr, "\r\nHUHU_PTY CHILD_EXIT %d\n", code)
	return int(code), nil
}

func runInner(spec launchSpec, image *pinnedFile, block []uint16, protected []string) (code uint32, err error) {
	in := windows.Handle(os.Stdin.Fd())
	out := windows.Handle(os.Stdout.Fd())
	var oldIn, oldOut uint32
	if err := windows.GetConsoleMode(in, &oldIn); err != nil {
		return 0, err
	}
	if err := windows.GetConsoleMode(out, &oldOut); err != nil {
		return 0, err
	}
	raw := (oldIn | windows.ENABLE_VIRTUAL_TERMINAL_INPUT | windows.ENABLE_EXTENDED_FLAGS) &^
		(windows.ENABLE_LINE_INPUT | windows.ENABLE_ECHO_INPUT | windows.ENABLE_PROCESSED_INPUT | windows.ENABLE_QUICK_EDIT_MODE)
	if err := windows.SetConsoleMode(in, raw); err != nil {
		return 0, err
	}
	defer windows.SetConsoleMode(in, oldIn)
	if err := windows.SetConsoleMode(out, oldOut|windows.ENABLE_PROCESSED_OUTPUT|windows.ENABLE_VIRTUAL_TERMINAL_PROCESSING); err != nil {
		return 0, err
	}
	defer windows.SetConsoleMode(out, oldOut)

	size, err := consoleSize(out)
	if err != nil {
		return 0, err
	}
	job, err := newJob()
	if err != nil {
		return 0, err
	}
	c, err := newConsole(size)
	if err != nil {
		windows.CloseHandle(job)
		return 0, err
	}
	defer c.output.Close()
	filtered := make(chan error, 1)
	go func() {
		err := maskStream(os.Stdout, c.output, protected)
		filtered <- err
		if err != nil {
			_, _ = io.Copy(io.Discard, c.output)
		}
	}()
	var filterReturned bool
	defer func() {
		// Closing the only job handle also stops descendants that outlive the root.
		windows.CloseHandle(job)
		c.input.Close()
		closed := make(chan struct{})
		go func() {
			windows.ClosePseudoConsole(c.handle)
			close(closed)
		}()
		timer := time.NewTimer(4 * time.Second)
		defer timer.Stop()
		select {
		case <-closed:
			if !filterReturned {
				select {
				case outputErr := <-filtered:
					if err == nil {
						err = outputErr
					}
				case <-timer.C:
					err = errors.New("console drain stalled")
				}
			}
		case <-timer.C:
			err = errors.New("console close stalled")
		}
	}()
	child, err := startInner(c, job, spec, image, block)
	clear(block)
	if err != nil {
		return 0, err
	}
	defer windows.CloseHandle(child.Process)
	defer windows.CloseHandle(child.Thread)
	if _, err := processFacts(child.Process, image); err != nil {
		return 0, errPin
	}
	var waitHandle windows.Handle
	current := windows.CurrentProcess()
	if err := windows.DuplicateHandle(current, child.Process, current, &waitHandle, windows.SYNCHRONIZE, false, 0); err != nil {
		return 0, err
	}
	if _, err := windows.ResumeThread(child.Thread); err != nil {
		windows.CloseHandle(waitHandle)
		return 0, err
	}
	stopResize := make(chan struct{})
	resizeDone := make(chan struct{})
	go c.followSize(out, size, stopResize, resizeDone)
	defer func() {
		close(stopResize)
		<-resizeDone
	}()
	go func() {
		_, _ = io.Copy(c.input, os.Stdin)
		c.input.Close()
	}()
	wait := make(chan error, 1)
	go func() {
		defer windows.CloseHandle(waitHandle)
		_, err := windows.WaitForSingleObject(waitHandle, windows.INFINITE)
		wait <- err
	}()
	select {
	case err = <-wait:
	case err = <-filtered:
		filterReturned = true
		if err == nil {
			err = <-wait
		}
	}
	if err != nil {
		return 0, err
	}
	err = windows.GetExitCodeProcess(child.Process, &code)
	return code, err
}
