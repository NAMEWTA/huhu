package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf16"
	"unicode/utf8"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	protocol         = 1
	maxAuthorization = 1024 * 1024
	acceptedByte     = byte('A')
)

var envName = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]{0,127}$`)

type authorization struct {
	Version int `json:"version"`
	Host    struct {
		processID
		Image fileSpec `json:"image"`
	} `json:"host"`
	Launch launchSpec `json:"launch"`
}

type launchSpec struct {
	Directory   directorySpec     `json:"directory"`
	Image       fileSpec          `json:"image"`
	Entry       *fileSpec         `json:"entry,omitempty"`
	Files       []fileSpec        `json:"files,omitempty"`
	Argv        []string          `json:"argv"`
	Environment map[string]string `json:"environment"`
	Protect     []string          `json:"protect"`
}

func decodeAuthorization(raw []byte) (authorization, error) {
	var auth authorization
	if !utf8.Valid(raw) {
		return auth, errInput
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&auth) != nil || decoder.Decode(new(any)) != io.EOF || auth.Version != protocol {
		return auth, errInput
	}
	if _, err := parseProcess(strconv.FormatUint(uint64(auth.Host.PID), 10), auth.Host.Created); err != nil {
		return auth, errInput
	}
	return auth, nil
}

func (s launchSpec) environmentBlock() ([]uint16, []string, error) {
	if len(s.Environment) == 0 || len(s.Environment) > 256 || len(s.Protect) > 32 {
		return nil, nil, errInput
	}
	names := make([]string, 0, len(s.Environment))
	values := make(map[string]string, len(s.Environment))
	for name, value := range s.Environment {
		key := strings.ToUpper(name)
		if _, exists := values[key]; exists || !envName.MatchString(name) || strings.ContainsRune(value, 0) {
			return nil, nil, errInput
		}
		names = append(names, name)
		values[key] = value
	}
	sort.Slice(names, func(i, j int) bool { return strings.ToUpper(names[i]) < strings.ToUpper(names[j]) })
	var protected []string
	taken := make(map[string]bool)
	for _, name := range s.Protect {
		key := strings.ToUpper(name)
		value := values[key]
		if taken[key] || value == "" || len(value) > 4096 || strings.IndexFunc(value, unicode.IsControl) >= 0 {
			return nil, nil, errInput
		}
		taken[key] = true
		protected = append(protected, value)
	}
	var block []uint16
	for _, name := range names {
		block = append(block, utf16.Encode([]rune(name+"="+s.Environment[name]))...)
		block = append(block, 0)
	}
	if len(block)+1 > 32767 {
		clear(block)
		return nil, nil, errInput
	}
	return append(block, 0), protected, nil
}

func (s launchSpec) pin(p *pins, protected []string) (*pinnedFile, error) {
	if len(s.Argv) == 0 || len(s.Argv) > 256 || len(s.Files) > 128 ||
		!strings.EqualFold(filepath.Ext(s.Image.Path), ".exe") || !samePath(s.Image.Path, s.Argv[0]) {
		return nil, errInput
	}
	publicInputs := append([]string{s.Directory.Path}, s.Argv...)
	for _, arg := range publicInputs {
		if strings.ContainsRune(arg, 0) {
			return nil, errInput
		}
		for _, value := range protected {
			if strings.Contains(arg, value) {
				return nil, errInput
			}
		}
	}
	if len(utf16.Encode([]rune(windows.ComposeCommandLine(s.Argv))))+1 > 32767 {
		return nil, errInput
	}
	id, err := p.directory(s.Directory.Path)
	if err != nil || id != s.Directory.ID {
		return nil, errPin
	}
	image, err := p.file(s.Image)
	if err != nil {
		return nil, err
	}
	if s.Entry != nil {
		if len(s.Argv) < 2 || !samePath(s.Entry.Path, s.Argv[1]) || s.Entry.Path == s.Image.Path {
			return nil, errInput
		}
		if _, err := p.file(*s.Entry); err != nil {
			return nil, err
		}
	}
	for _, file := range s.Files {
		if _, err := p.file(file); err != nil {
			return nil, err
		}
	}
	return image, nil
}

func privateInput(deadline time.Time) ([]byte, error) {
	if kind, err := windows.GetFileType(windows.Handle(os.Stdin.Fd())); err != nil || kind != windows.FILE_TYPE_PIPE {
		return nil, errInput
	}
	type result struct {
		raw []byte
		err error
	}
	done := make(chan result, 1)
	go func() {
		raw, err := io.ReadAll(io.LimitReader(os.Stdin, maxAuthorization+1))
		done <- result{raw, err}
	}()
	timer := time.NewTimer(time.Until(deadline))
	defer timer.Stop()
	select {
	case got := <-done:
		if got.err != nil || len(got.raw) == 0 || len(got.raw) > maxAuthorization {
			clear(got.raw)
			return nil, errInput
		}
		return got.raw, nil
	case <-timer.C:
		return nil, errTimeout
	}
}

func broker(id string, self *pinnedFile, deadline time.Time) error {
	p, err := newServer(id, deadline)
	if err != nil {
		return err
	}
	defer p.close()
	me, err := processFacts(windows.CurrentProcess(), self)
	if err != nil {
		return err
	}
	fmt.Printf("HUHU_PTY BROKER_READY %d %d %s\n", protocol, me.PID, me.Created)
	raw, err := privateInput(deadline)
	if err != nil {
		return err
	}
	defer clear(raw)
	auth, err := decodeAuthorization(raw)
	if err != nil {
		return err
	}
	locks := newPins()
	defer locks.close()
	installed, err := locks.file(auth.Host.Image)
	if err != nil {
		return err
	}
	if installed.id != self.id || !samePath(installed.path, self.path) {
		return errPeer
	}
	block, protected, err := auth.Launch.environmentBlock()
	if err != nil {
		return err
	}
	clear(block)
	if _, err := auth.Launch.pin(locks, protected); err != nil {
		return err
	}
	if err := p.connect(); err != nil {
		return err
	}
	var pid uint32
	if windows.GetNamedPipeClientProcessId(p.handle, &pid) != nil {
		return errPeer
	}
	client, err := checkPeer(pid, auth.Host.processID, installed)
	if err != nil {
		return err
	}
	defer windows.CloseHandle(client)
	if !processAlive(client) {
		return errPeer
	}
	var length [4]byte
	binary.BigEndian.PutUint32(length[:], uint32(len(raw)))
	if err := p.writeAll(length[:]); err != nil {
		return err
	}
	if err := p.writeAll(raw); err != nil {
		return err
	}
	var ack [1]byte
	if _, err := io.ReadFull(p, ack[:]); err != nil {
		if errors.Is(err, io.EOF) {
			return errPeer
		}
		return err
	}
	if ack[0] != acceptedByte {
		return errPeer
	}
	p.close()
	fmt.Println("HUHU_PTY ISSUED_ONCE")
	return nil
}

type launchApproval struct {
	locks     *pins
	spec      launchSpec
	image     *pinnedFile
	block     []uint16
	protected []string
}

func consume(id string, issuer processID, self *pinnedFile, deadline time.Time) (*launchApproval, error) {
	p, err := openClient(id, deadline)
	if err != nil {
		return nil, err
	}
	defer p.close()
	var pid uint32
	if windows.GetNamedPipeServerProcessId(p.handle, &pid) != nil {
		return nil, errPeer
	}
	server, err := checkPeer(pid, issuer, self)
	if err != nil {
		return nil, err
	}
	defer windows.CloseHandle(server)
	var prefix [4]byte
	if _, err := io.ReadFull(p, prefix[:]); err != nil {
		if errors.Is(err, io.EOF) {
			err = errPeer
		}
		return nil, err
	}
	size := binary.BigEndian.Uint32(prefix[:])
	if size == 0 || size > maxAuthorization {
		return nil, errInput
	}
	raw := make([]byte, size)
	defer clear(raw)
	if _, err := io.ReadFull(p, raw); err != nil {
		return nil, err
	}
	auth, err := decodeAuthorization(raw)
	if err != nil {
		return nil, err
	}
	me, err := processFacts(windows.CurrentProcess(), self)
	if err != nil || me != auth.Host.processID {
		return nil, errPeer
	}
	block, protected, err := auth.Launch.environmentBlock()
	if err != nil {
		return nil, err
	}
	locks := newPins()
	image, err := locks.file(auth.Host.Image)
	if err == nil && (image.id != self.id || !samePath(image.path, self.path)) {
		err = errPeer
	}
	if err == nil {
		image, err = auth.Launch.pin(locks, protected)
	}
	if err == nil && !processAlive(server) {
		err = errPeer
	}
	if err == nil {
		err = p.writeAll([]byte{acceptedByte})
	}
	if err == nil {
		var extra [1]byte
		if n, end := p.Read(extra[:]); n != 0 || end == nil {
			err = errPeer
		} else if !errors.Is(end, io.EOF) {
			err = end
		}
	}
	if err != nil {
		locks.close()
		clear(block)
		return nil, err
	}
	auth.Launch.Environment = nil
	return &launchApproval{locks, auth.Launch, image, block, protected}, nil
}

type channel struct {
	handle   windows.Handle
	deadline time.Time
}

func (p *channel) close() {
	if p.handle != 0 {
		windows.CloseHandle(p.handle)
		p.handle = 0
	}
}

func pipeName(id string) *uint16 {
	name, _ := windows.UTF16PtrFromString(`\\.\pipe\huhu-agent-pty-v1-` + id)
	return name
}

func newServer(id string, deadline time.Time) (*channel, error) {
	user, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		return nil, err
	}
	sd, err := windows.SecurityDescriptorFromString("D:P(A;;GA;;;" + user.User.Sid.String() + ")")
	if err != nil {
		return nil, err
	}
	sa := windows.SecurityAttributes{Length: uint32(unsafe.Sizeof(windows.SecurityAttributes{})), SecurityDescriptor: sd}
	h, err := windows.CreateNamedPipe(pipeName(id), windows.PIPE_ACCESS_DUPLEX|windows.FILE_FLAG_FIRST_PIPE_INSTANCE|windows.FILE_FLAG_OVERLAPPED,
		windows.PIPE_TYPE_BYTE|windows.PIPE_REJECT_REMOTE_CLIENTS, 1, 65536, 65536, 0, &sa)
	if err != nil {
		return nil, err
	}
	return &channel{h, deadline}, nil
}

func openClient(id string, deadline time.Time) (*channel, error) {
	name := pipeName(id)
	for time.Now().Before(deadline) {
		h, err := windows.CreateFile(name, windows.GENERIC_READ|windows.GENERIC_WRITE, 0, nil, windows.OPEN_EXISTING,
			windows.SECURITY_SQOS_PRESENT|windows.SECURITY_IDENTIFICATION|windows.FILE_FLAG_OVERLAPPED, 0)
		if err == nil {
			return &channel{h, deadline}, nil
		}
		if err != windows.ERROR_FILE_NOT_FOUND && err != windows.ERROR_PIPE_BUSY {
			return nil, errPeer
		}
		time.Sleep(20 * time.Millisecond)
	}
	return nil, errTimeout
}

func (p *channel) operation(start func(*windows.Overlapped, *uint32) error) (int, error) {
	if time.Until(p.deadline) <= 0 {
		return 0, errTimeout
	}
	event, err := windows.CreateEvent(nil, 1, 0, nil)
	if err != nil {
		return 0, err
	}
	defer windows.CloseHandle(event)
	overlap := &windows.Overlapped{HEvent: event}
	var n uint32
	err = start(overlap, &n)
	if err != windows.ERROR_IO_PENDING {
		return int(n), err
	}
	remaining := max(time.Until(p.deadline), 0)
	result, err := windows.WaitForSingleObject(event, uint32((remaining+time.Millisecond-1)/time.Millisecond))
	if err == nil && result == windows.WAIT_OBJECT_0 {
		err = windows.GetOverlappedResult(p.handle, overlap, &n, false)
		return int(n), err
	}
	// Wait for cancellation completion before the kernel can lose access to this Go buffer.
	_ = windows.CancelIoEx(p.handle, overlap)
	_ = windows.GetOverlappedResult(p.handle, overlap, &n, true)
	if err != nil {
		return 0, err
	}
	return 0, errTimeout
}

func (p *channel) connect() error {
	_, err := p.operation(func(o *windows.Overlapped, _ *uint32) error { return windows.ConnectNamedPipe(p.handle, o) })
	if err == windows.ERROR_PIPE_CONNECTED {
		return nil
	}
	return err
}

func (p *channel) Read(b []byte) (int, error) {
	n, err := p.operation(func(o *windows.Overlapped, n *uint32) error { return windows.ReadFile(p.handle, b, n, o) })
	runtime.KeepAlive(b)
	if err == windows.ERROR_BROKEN_PIPE || err == windows.ERROR_NO_DATA {
		return n, io.EOF
	}
	return n, err
}

func (p *channel) writeAll(b []byte) error {
	for len(b) > 0 {
		n, err := p.operation(func(o *windows.Overlapped, n *uint32) error { return windows.WriteFile(p.handle, b, n, o) })
		runtime.KeepAlive(b)
		if err != nil {
			return err
		}
		if n == 0 {
			return io.ErrShortWrite
		}
		b = b[n:]
	}
	return nil
}
