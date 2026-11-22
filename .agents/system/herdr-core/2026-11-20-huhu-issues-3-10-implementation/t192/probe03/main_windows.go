// Windows-only, fixed-purpose fixture. No executable or command is accepted from a caller.
package main

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	w "golang.org/x/sys/windows"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"
	"unicode/utf8"
	"unsafe"
)

const varName = "HUHU_T192_SYNTHETIC_ONLY"

var runID = regexp.MustCompile("^[a-f0-9]{32}$")
var sample = regexp.MustCompile("^fixture-t192-[a-f0-9]{32}-雪🧪$")

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
func endpoint(id string) *uint16 {
	require(runID.MatchString(id))
	return wide("\\\\.\\pipe\\huhu-t192-probe03-" + id)
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

// Only these two installed code paths and the sibling fixture are eligible.
const nodeImage = "C:/Users/cdewta/AppData/Local/Programs/nodejs/node.exe"
const piEntry = "C:/Users/cdewta/.pi/agent/install/releases/1.5.2/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js"
const nodeHash = "ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32"
const piHash = "e79626f2dd6f94aa45d30f3fa63cd84319a6eefcd150b353cfaf274366926774"
const testHash = "11bce83f2e4c8ec0e5cf07d385bc456d710412228fb9d8f1a726518cee41a126"

func pin(path, digest string) *os.File {
	h, e := w.CreateFile(wide(path), w.GENERIC_READ, w.FILE_SHARE_READ, nil, w.OPEN_EXISTING, 0, 0)
	check(e)
	f := os.NewFile(uintptr(h), path)
	sum := sha256.New()
	_, e = io.Copy(sum, f)
	check(e)
	if hex.EncodeToString(sum.Sum(nil)) != digest {
		fmt.Println("TARGET_PIN_DENIED")
		os.Exit(24)
	}
	return f
}
func target(mode string) (args []string, script *os.File) {
	if mode == "pi" {
		return []string{nodeImage, piEntry, "--offline", "--no-session", "--no-extensions", "--no-mcp", "--no-skills", "--no-themes", "--no-context-files", "--no-prompt-templates", "--no-approve", "--tui-mode", "regular"}, pin(piEntry, piHash)
	}
	entry := filepath.Join(filepath.Dir(self()), "entry.cjs")
	args = []string{nodeImage, entry}
	if mode == "echo" {
		args = append(args, "echo-control")
	}
	return args, pin(entry, testHash)
}

// Explicit allowlist: never copy the parent's environment map into the target.
func environment(mode, marker, cwd string) []uint16 {
	sys := os.Getenv("SystemRoot")
	require(filepath.IsAbs(sys))
	home := filepath.Join(cwd, "profile")
	tmp := filepath.Join(cwd, "scratch")
	for _, d := range []string{home, tmp} {
		check(os.Mkdir(d, 0700))
	}
	env := map[string]string{"SYSTEMROOT": sys, "WINDIR": sys, "COMSPEC": filepath.Join(sys, "System32", "cmd.exe"),
		"PATH": filepath.Join(sys, "System32"), "HOME": home, "USERPROFILE": home, "APPDATA": home, "LOCALAPPDATA": home, "TEMP": tmp, "TMP": tmp}
	if mode != "omitted" {
		env[varName] = marker
	}
	if mode == "pi" {
		env["PI_OFFLINE"] = "1"
		env["PI_TELEMETRY"] = "0"
		env["PI_CODING_AGENT_DIR"] = filepath.Join(home, "agent")
	} else {
		env["HUHU_T192_EXPECTED"] = fmt.Sprintf("%x", sha256.Sum256([]byte(marker)))
	}
	keys := make([]string, 0, len(env))
	for k := range env {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var out []uint16
	for _, k := range keys {
		require(!strings.ContainsRune(env[k], 0))
		out = append(out, utf16.Encode([]rune(k+"="+env[k]))...)
		out = append(out, 0)
	}
	return append(out, 0)
}
func startInner(c console, args []string, block []uint16, cwd string) w.ProcessInformation {
	list, e := w.NewProcThreadAttributeList(1)
	check(e)
	defer list.Delete()
	check(list.Update(w.PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE, unsafe.Pointer(c.handle), unsafe.Sizeof(c.handle)))
	si := w.StartupInfoEx{ProcThreadAttributeList: list.List()}
	si.Cb = uint32(unsafe.Sizeof(si))

	var pi w.ProcessInformation
	check(w.CreateProcess(wide(nodeImage), wide(w.ComposeCommandLine(args)), nil, nil, false, w.EXTENDED_STARTUPINFO_PRESENT|w.CREATE_SUSPENDED|w.CREATE_UNICODE_ENVIRONMENT, &block[0], wide(cwd), &si.StartupInfo, &pi))
	runtime.KeepAlive(block)
	clear(block)
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

// Synthetic-canary filter. Once the known prefix appears, discard the entire
// interval, including interleaved terminal traffic, through the randomized
// suffix. At EOF an unmatched interval remains suppressed. No transcript is kept.
func filter(r io.Reader, marker string, done chan<- int) {
	prefix := []byte(marker[:len("fixture-t192-")])
	suffix := []byte(marker[len(marker)-len("-雪🧪")-12:])
	buf := make([]byte, 37)
	var pending []byte
	suppress := false
	matches := 0
	var tail []byte
	emit := func(data []byte) {
		data = append(tail, data...)
		tail = nil
		end := 0
		for end < len(data) && utf8.FullRune(data[end:]) {
			_, n := utf8.DecodeRune(data[end:])
			end += n
		}
		tail = append([]byte(nil), data[end:]...)
		data = data[:end]
		if len(data) == 0 {
			return
		}
		_, e := os.Stdout.Write(data)
		check(e)
	}
	for {
		n, e := r.Read(buf)
		pending = append(pending, buf[:n]...)
		for len(pending) > 0 {
			boundary := prefix
			if suppress {
				boundary = suffix
			}
			i := bytes.Index(pending, boundary)
			if i >= 0 {
				if !suppress {
					emit(pending[:i])
					emit([]byte("[REDACTED]"))
					matches++
				}
				pending = pending[i+len(boundary):]
				suppress = !suppress
				continue
			}
			keep := min(len(pending), len(boundary)-1)
			for keep > 0 && !bytes.HasSuffix(pending, boundary[:keep]) {
				keep--
			}
			if !suppress {
				emit(pending[:len(pending)-keep])
			}
			pending = pending[len(pending)-keep:]
			break
		}
		if e != nil {
			if !errors.Is(e, io.EOF) && !errors.Is(e, w.ERROR_BROKEN_PIPE) && !errors.Is(e, os.ErrClosed) {
				check(e)
			}
			if !suppress && len(pending) > 0 {
				emit([]byte("[TRUNCATED]"))
			}
			break
		}
	}
	done <- matches
}
func host(id string, broker identity, mode string) {
	var cm uint32
	check(w.GetConsoleMode(w.Handle(os.Stdin.Fd()), &cm))
	check(w.SetConsoleMode(w.Handle(os.Stdin.Fd()), cm&^w.ENABLE_ECHO_INPUT))
	hOut := w.Handle(os.Stdout.Fd())
	check(w.GetConsoleMode(hOut, &cm))
	check(w.SetConsoleMode(hOut, cm|w.ENABLE_VIRTUAL_TERMINAL_PROCESSING))
	require(os.Getenv(varName) == "" && os.Getenv("HUHU_T192_PARENT_ONLY") == "public-fixture")
	image := pin(nodeImage, nodeHash)
	defer image.Close()
	args, entry := target(mode)
	defer entry.Close()
	marker, ok := receive(endpoint(id), broker)
	if !ok {
		fmt.Println("FIXTURE_DENIED")
		os.Exit(23)
	}
	fmt.Println("HOST_VERIFIED_ONCE")
	for _, arg := range args {
		require(!strings.Contains(arg, marker))
	}
	fmt.Println("TARGET_ARGV_CLEAN")
	cwd, e := os.Getwd()
	check(e)
	block := environment(mode, marker, cwd)
	c := newConsole()
	defer c.in.Close()
	defer c.out.Close()
	done := make(chan int, 1)
	go filter(c.out, marker, done)
	job := scopeJob()
	defer w.CloseHandle(job)
	child := startInner(c, args, block, cwd)
	defer w.CloseHandle(child.Process)
	defer w.CloseHandle(child.Thread)
	if e := w.AssignProcessToJobObject(job, child.Process); e != nil {
		w.TerminateProcess(child.Process, 1)
		check(e)
	}
	name := make([]uint16, 32768)
	size := uint32(len(name))
	check(w.QueryFullProcessImageName(child.Process, 0, &name[0], &size))
	require(strings.EqualFold(filepath.Clean(w.UTF16ToString(name[:size])), filepath.Clean(nodeImage)))
	_, e = w.ResumeThread(child.Thread)
	check(e)
	reader := bufio.NewReader(os.Stdin)
	// Pi queries the outer terminal. Its CSI/OSC replies can precede the typed
	// line. Only forward the fixed built-in after removing complete replies.
	replies := regexp.MustCompile(`\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))`)
	send := func(expected string) {
		line, e := reader.ReadString('\n')
		check(e)
		require(len(line) <= 8192 && strings.TrimSpace(replies.ReplaceAllString(line, "")) == expected)
		var info w.ConsoleScreenBufferInfo
		check(w.GetConsoleScreenBufferInfo(hOut, &info))
		cols := info.Window.Right - info.Window.Left + 1
		rows := info.Window.Bottom - info.Window.Top + 1
		if mode != "pi" {
			fmt.Printf("HOST_SIZE %d %d\n", cols, rows)
		}
		check(w.ResizePseudoConsole(c.handle, w.Coord{X: cols, Y: rows}))
		_, e = io.WriteString(c.in, expected+"\r")
		check(e)
	}
	switch mode {
	case "pi":
		send("/session")
		send("/quit")
	case "fixture", "echo":
		send("ping")
	}
	state, e := w.WaitForSingleObject(child.Process, 12000)
	check(e)
	require(state == w.WAIT_OBJECT_0)
	var code uint32
	check(w.GetExitCodeProcess(child.Process, &code))
	w.ClosePseudoConsole(c.handle)
	matches := <-done
	fmt.Printf("CHILD_END code=%d matches=%d\n", code, matches)
	if mode == "omitted" {
		require(code == 17 && matches == 0)
	} else if mode == "echo" {
		require(code == 0 && matches >= 1)
	} else {
		require(code == 0 && matches == 0)
	}
}
func issue(id string) {
	pipe := server(endpoint(id))
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
	time.AfterFunc(45*time.Second, func() { os.Exit(124) })
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
		require(len(a) == 5 && (a[4] == "fixture" || a[4] == "omitted" || a[4] == "echo" || a[4] == "pi"))
		host(a[1], fromArgs(a[2], a[3]), a[4])
	default:
		panic("unknown fixture role")
	}
}
