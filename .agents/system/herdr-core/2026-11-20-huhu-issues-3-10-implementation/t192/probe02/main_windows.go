// Windows-only, fixed-purpose fixture. No executable or command is accepted from a caller.
package main

import (
	"bufio"
	"bytes"
	"errors"
	"fmt"
	w "golang.org/x/sys/windows"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unsafe"
)

const varName = "HUHU_T192_SYNTHETIC_ONLY"

var runID = regexp.MustCompile("^[a-f0-9]{32}$")
var sample = regexp.MustCompile("^fixture-t192-[a-f0-9]{32}$")

func check(e error) {
	if e != nil {
		panic(e)
	}
}
func require(ok bool) {
	if !ok {
		panic("fixture invariant")
	}
}
func wide(s string) *uint16  { v, e := w.UTF16PtrFromString(s); check(e); return v }
func number(s string) uint64 { v, e := strconv.ParseUint(s, 10, 64); check(e); return v }
func self() string           { p, e := os.Executable(); check(e); return p }

type identity struct {
	pid   uint32
	birth uint64
}

func facts(h w.Handle) identity {
	pid, e := w.GetProcessId(h)
	check(e)
	var birth, end, kernel, user w.Filetime
	check(w.GetProcessTimes(h, &birth, &end, &kernel, &user))
	out := make([]uint16, 32768)
	size := uint32(len(out))
	check(w.QueryFullProcessImageName(h, 0, &out[0], &size))
	require(strings.EqualFold(filepath.Clean(w.UTF16ToString(out[:size])), filepath.Clean(self())))
	state, e := w.WaitForSingleObject(h, 0)
	check(e)
	require(state == uint32(w.WAIT_TIMEOUT))
	return identity{pid, uint64(birth.HighDateTime)<<32 | uint64(birth.LowDateTime)}
}
func openOwn(pid uint32) w.Handle {
	h, e := w.OpenProcess(w.PROCESS_QUERY_LIMITED_INFORMATION|w.SYNCHRONIZE, false, pid)
	check(e)
	return h
}
func checkPeer(pid uint32, expected identity) bool {
	if pid != expected.pid {
		return false
	}
	peer := openOwn(pid)
	defer w.CloseHandle(peer)
	return facts(peer) == expected
}
func fromArgs(p, b string) identity {
	n := number(p)
	require(n > 0 && n <= 4294967295)
	return identity{uint32(n), number(b)}
}
func endpoint(id, role string) *uint16 {
	require(runID.MatchString(id) && (role == "outer" || role == "inner"))
	return wide("\\\\.\\pipe\\huhu-t192-probe02-" + id + "-" + role)
}
func server(name *uint16) *os.File {
	user, e := w.GetCurrentProcessToken().GetTokenUser()
	check(e)
	sd, e := w.SecurityDescriptorFromString("D:P(A;;GA;;;" + user.User.Sid.String() + ")")
	check(e)
	sa := w.SecurityAttributes{Length: uint32(unsafe.Sizeof(w.SecurityAttributes{})), SecurityDescriptor: sd}
	h, e := w.CreateNamedPipe(name, w.PIPE_ACCESS_DUPLEX|w.FILE_FLAG_FIRST_PIPE_INSTANCE, w.PIPE_TYPE_BYTE|w.PIPE_REJECT_REMOTE_CLIENTS, 1, 256, 256, 2000, &sa)
	check(e)
	return os.NewFile(uintptr(h), "synthetic pipe server")
}

// Each server instance has exactly one connection and at most one write.
func deliver(pipe *os.File, expected identity, marker string) bool {
	defer pipe.Close()
	h := w.Handle(pipe.Fd())
	e := w.ConnectNamedPipe(h, nil)
	if e != nil && !errors.Is(e, w.ERROR_PIPE_CONNECTED) {
		check(e)
	}
	var pid uint32
	check(w.GetNamedPipeClientProcessId(h, &pid))
	if !checkPeer(pid, expected) {
		return false
	}
	require(sample.MatchString(marker))
	_, e = io.WriteString(pipe, marker+"\n")
	check(e)
	// The receiver acknowledges consumption before the last server handle closes.
	var ack [1]byte
	_, e = io.ReadFull(pipe, ack[:])
	check(e)
	require(ack[0] == '!')
	return true
}
func receive(name *uint16, expected identity) (string, bool) {
	var h w.Handle
	for i := 0; i < 200; i++ {
		var e error
		h, e = w.CreateFile(name, w.GENERIC_READ|w.GENERIC_WRITE, 0, nil, w.OPEN_EXISTING, w.SECURITY_SQOS_PRESENT|w.SECURITY_IDENTIFICATION, 0)
		if e == nil {
			break
		}
		if !errors.Is(e, w.ERROR_FILE_NOT_FOUND) && !errors.Is(e, w.ERROR_PIPE_BUSY) {
			check(e)
		}
		if i == 199 {
			panic("fixture pipe unavailable")
		}
		time.Sleep(20 * time.Millisecond)
	}
	f := os.NewFile(uintptr(h), "synthetic pipe client")
	defer f.Close()
	var serverPID uint32
	check(w.GetNamedPipeServerProcessId(h, &serverPID))
	require(checkPeer(serverPID, expected))
	s, e := bufio.NewReader(io.LimitReader(f, 64)).ReadString('\n')
	if errors.Is(e, io.EOF) || errors.Is(e, w.ERROR_BROKEN_PIPE) {
		return "", false
	}
	check(e)
	marker := strings.TrimSuffix(s, "\n")
	require(sample.MatchString(marker))
	_, e = f.Write([]byte{'!'})
	check(e)
	var extra [1]byte
	n, end := f.Read(extra[:])
	require(n == 0 && (errors.Is(end, io.EOF) || errors.Is(end, w.ERROR_BROKEN_PIPE)))
	check(f.Close())
	// A second open of this fixture's now-consumed endpoint must find no server.
	other, replay := w.CreateFile(name, w.GENERIC_READ|w.GENERIC_WRITE, 0, nil, w.OPEN_EXISTING, w.SECURITY_SQOS_PRESENT|w.SECURITY_IDENTIFICATION, 0)
	if replay == nil {
		w.CloseHandle(other)
		panic("unexpected second connection")
	}
	require(errors.Is(replay, w.ERROR_FILE_NOT_FOUND))
	return marker, true
}
func cli(id string, parent identity) {
	require(os.Getenv(varName) == "")
	marker, ok := receive(endpoint(id, "inner"), parent)
	if !ok {
		require(os.Getenv(varName) == "")
		fmt.Println("INNER_RECEIVED_ZERO")
		return
	}
	check(os.Setenv(varName, marker))
	defer os.Unsetenv(varName)
	fmt.Println("INNER_REPLAY_CLOSED")
	for _, f := range []*os.File{os.Stdin, os.Stdout, os.Stderr} {
		var mode uint32
		check(w.GetConsoleMode(w.Handle(f.Fd()), &mode))
	}
	fmt.Println("CLI_TTY_READY")
	fmt.Print("CLI_INPUT> ")
	line, e := bufio.NewReader(os.Stdin).ReadString('\n')
	check(e)
	require(strings.TrimSpace(line) == "ping")
	fmt.Println("CLI_PONG")
	// Force a cross-write match on the real inner output. No raw bytes are logged.
	v := os.Getenv(varName)
	fmt.Fprint(os.Stderr, "CLI_ECHO=", v[:17])
	time.Sleep(60 * time.Millisecond)
	fmt.Fprintln(os.Stderr, v[17:])
}

type console struct {
	handle  w.Handle
	in, out *os.File
}

func newConsole() console {
	input, writer, e := os.Pipe()
	check(e)
	defer input.Close()
	reader, output, e := os.Pipe()
	check(e)
	defer output.Close()
	var h w.Handle
	check(w.CreatePseudoConsole(w.Coord{X: 120, Y: 32}, w.Handle(input.Fd()), w.Handle(output.Fd()), 0, &h))
	return console{h, writer, reader}
}
func startInner(c console, id string, parent identity) w.ProcessInformation {
	list, e := w.NewProcThreadAttributeList(1)
	check(e)
	defer list.Delete()
	check(list.Update(w.PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE, unsafe.Pointer(c.handle), unsafe.Sizeof(c.handle)))
	si := w.StartupInfoEx{ProcThreadAttributeList: list.List()}
	si.Cb = uint32(unsafe.Sizeof(si))
	args := []string{self(), "cli", id, fmt.Sprint(parent.pid), fmt.Sprint(parent.birth)}
	var pi w.ProcessInformation
	check(w.CreateProcess(wide(self()), wide(w.ComposeCommandLine(args)), nil, nil, false, w.EXTENDED_STARTUPINFO_PRESENT|w.CREATE_SUSPENDED, nil, nil, &si.StartupInfo, &pi))
	return pi
}
func scopeJob() w.Handle {
	job, e := w.CreateJobObject(nil, nil)
	check(e)
	var limits w.JOBOBJECT_EXTENDED_LIMIT_INFORMATION
	limits.BasicLimitInformation.LimitFlags = w.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	_, e = w.SetInformationJobObject(job, w.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&limits)), uint32(unsafe.Sizeof(limits)))
	check(e)
	return job
}

// Retain only a prefix that could still become this fixture's ASCII marker.
// Public prompts can reach the user before a newline or the next keystroke.
func filter(r io.Reader, marker string, done chan<- int) {
	buf := make([]byte, 11)
	key := []byte(marker)
	var pending []byte
	matches := 0
	emit := func(data []byte) {
		if len(data) == 0 {
			return
		}
		_, e := os.Stdout.Write(data)
		check(e)
	}
	for {
		n, e := r.Read(buf)
		pending = append(pending, buf[:n]...)
		require(len(pending) < len(key)+len(buf))
		for {
			i := bytes.Index(pending, key)
			if i < 0 {
				break
			}
			emit(pending[:i])
			emit([]byte("[REDACTED]"))
			matches++
			pending = pending[i+len(key):]
		}
		keep := min(len(pending), len(key)-1)
		for keep > 0 && !bytes.HasSuffix(pending, key[:keep]) {
			keep--
		}
		emit(pending[:len(pending)-keep])
		pending = pending[len(pending)-keep:]
		if e != nil {
			if !errors.Is(e, io.EOF) && !errors.Is(e, w.ERROR_BROKEN_PIPE) {
				check(e)
			}
			if len(pending) > 0 {
				emit([]byte("[TRUNCATED]"))
			}
			break
		}
	}
	done <- matches
}
func host(id string, broker identity, scenario string) {
	var cm uint32
	check(w.GetConsoleMode(w.Handle(os.Stdin.Fd()), &cm))
	check(w.GetConsoleMode(w.Handle(os.Stdout.Fd()), &cm))
	require(os.Getenv(varName) == "")
	marker, ok := receive(endpoint(id, "outer"), broker)
	if !ok {
		fmt.Println("FIXTURE_DENIED")
		os.Exit(23)
	}
	fmt.Println("OUTER_REPLAY_CLOSED")
	me := facts(w.CurrentProcess())
	c := newConsole()
	defer c.in.Close()
	defer c.out.Close()
	done := make(chan int, 1)
	go filter(c.out, marker, done)
	job := scopeJob()
	defer w.CloseHandle(job)
	pipe := server(endpoint(id, "inner"))
	defer pipe.Close()
	child := startInner(c, id, me)
	defer w.CloseHandle(child.Process)
	defer w.CloseHandle(child.Thread)
	if e := w.AssignProcessToJobObject(job, child.Process); e != nil {
		w.TerminateProcess(child.Process, 1)
		check(e)
	}
	childID := facts(child.Process)
	require(childID.pid == child.ProcessId)
	_, e := w.ResumeThread(child.Thread)
	check(e)
	if scenario == "inner-birth" {
		childID.birth++
	}
	if scenario == "inner-pid" {
		childID.pid = me.pid
	}
	delivered := deliver(pipe, childID, marker)
	if delivered {
		require(scenario == "normal")
		fmt.Println("INNER_BOUND")
		// The only input command accepted by this test program is the literal ping.
		line, e := bufio.NewReader(os.Stdin).ReadString('\n')
		check(e)
		require(strings.TrimSpace(line) == "ping")
		_, e = io.WriteString(c.in, "ping\r")
		check(e)
	} else {
		require(scenario == "inner-pid" || scenario == "inner-birth")
	}
	state, e := w.WaitForSingleObject(child.Process, 5000)
	check(e)
	require(state == w.WAIT_OBJECT_0)
	var code uint32
	check(w.GetExitCodeProcess(child.Process, &code))
	require(code == 0)
	w.ClosePseudoConsole(c.handle)
	if delivered {
		require(<-done == 1)
		fmt.Println("MASK_COUNT_ONE")
	} else {
		require(<-done == 0)
		fmt.Println("INNER_REJECTED_ZERO")
	}
}
func issue(id string) {
	pipe := server(endpoint(id, "outer"))
	defer pipe.Close()
	me := facts(w.CurrentProcess())
	fmt.Printf("BROKER %d %d\n", me.pid, me.birth)
	var p, b, m string
	_, e := fmt.Fscan(os.Stdin, &p, &b, &m)
	check(e)
	require(sample.MatchString(m))
	if deliver(pipe, fromArgs(p, b), m) {
		fmt.Println("ISSUED_ONCE")
	} else {
		fmt.Println("REJECTED_ZERO")
	}
}
func main() {
	time.AfterFunc(20*time.Second, func() { os.Exit(124) })
	defer func() {
		if recover() != nil {
			fmt.Fprintln(os.Stderr, "fixture stage failed")
			os.Exit(2)
		}
	}()
	a := os.Args[1:]
	require(len(a) >= 2)
	switch a[0] {
	case "stamp":
		require(len(a) == 2)
		h := openOwn(uint32(number(a[1])))
		defer w.CloseHandle(h)
		fmt.Println(facts(h).birth)
	case "issuer":
		require(len(a) == 2)
		issue(a[1])
	case "host":
		require(len(a) == 5 && (a[4] == "normal" || a[4] == "inner-pid" || a[4] == "inner-birth"))
		host(a[1], fromArgs(a[2], a[3]), a[4])
	case "cli":
		require(len(a) == 4)
		cli(a[1], fromArgs(a[2], a[3]))
	default:
		panic("unknown fixture role")
	}
}
