package main

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"sort"
	"strings"
	"time"
	"unicode"

	"golang.org/x/sys/unix"
)

func linuxEnvironment(s launchSpec) ([]string, []string, error) {
	if len(s.Environment) > 256 || len(s.Protect) == 0 || len(s.Protect) > 32 {
		return nil, nil, errInput
	}
	env := make([]string, 0, len(s.Environment)+2)
	for name, value := range s.Environment {
		if !envName.MatchString(name) || strings.ContainsRune(value, 0) || strings.HasPrefix(name, "LD_") || name == "GLIBC_TUNABLES" {
			return nil, nil, errInput
		}
		env = append(env, name+"="+value)
	}
	if _, hasTerm := s.Environment["TERM"]; !hasTerm {
		env = append(env, "TERM=xterm-256color")
	}
	if _, hasColor := s.Environment["COLORTERM"]; !hasColor {
		env = append(env, "COLORTERM=truecolor")
	}
	sort.Strings(env)
	var protected []string
	taken := make(map[string]bool)
	for _, name := range s.Protect {
		value := s.Environment[name]
		if taken[name] || value == "" || len(value) > 4096 || strings.IndexFunc(value, unicode.IsControl) >= 0 {
			return nil, nil, errInput
		}
		taken[name] = true
		protected = append(protected, value)
	}
	return env, protected, nil
}

func pinLinuxLaunch(s launchSpec, protected []string, seal bool) (directory, image *os.File, err error) {
	if len(s.Argv) == 0 || len(s.Argv) > 256 || s.Argv[0] != s.Image.Path || s.Image.ID == nil || s.Entry != nil || len(s.Files) != 0 {
		return nil, nil, errInput
	}
	for _, arg := range append([]string{s.Directory.Path}, s.Argv...) {
		if strings.ContainsRune(arg, 0) {
			return nil, nil, errInput
		}
		for _, value := range protected {
			if strings.Contains(arg, value) {
				return nil, nil, errInput
			}
		}
	}
	dir, id, err := openLinuxDirectory(s.Directory.Path)
	if err != nil {
		return nil, nil, err
	}
	if id != s.Directory.ID {
		_ = dir.Close()
		return nil, nil, errPin
	}
	if s.ApprovedShell != nil {
		if len(s.Argv) != 3 || s.Argv[1] != "-c" {
			_ = dir.Close()
			return nil, nil, errInput
		}
		image, err = openApprovedLinuxShell(s.Image, *s.ApprovedShell)
		if image != nil && !seal {
			_ = image.Close()
			image = nil
		}
	} else if seal {
		image, err = sealedLinuxProgram(s.Image)
	} else {
		_, err = checkedLinuxProgram(s.Image, nil)
	}
	if err != nil {
		_ = dir.Close()
		return nil, nil, err
	}
	return dir, image, nil
}

func readPrivateLinuxInput(deadline time.Time) ([]byte, error) {
	var st unix.Stat_t
	if unix.Fstat(int(os.Stdin.Fd()), &st) != nil || (st.Mode&unix.S_IFMT != unix.S_IFIFO && st.Mode&unix.S_IFMT != unix.S_IFSOCK) {
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

func peerLinuxPID(conn *net.UnixConn) (uint32, error) {
	sc, err := conn.SyscallConn()
	if err != nil {
		return 0, errPeer
	}
	var peer *unix.Ucred
	var peerErr error
	if sc.Control(func(fd uintptr) {
		peer, peerErr = unix.GetsockoptUcred(int(fd), unix.SOL_SOCKET, unix.SO_PEERCRED)
	}) != nil || peerErr != nil || peer == nil || peer.Pid <= 0 || int(peer.Uid) != os.Geteuid() {
		return 0, errPeer
	}
	return uint32(peer.Pid), nil
}

func sendPrivateFrame(w io.Writer, raw []byte) error {
	if len(raw) == 0 || len(raw) > maxAuthorization {
		return errInput
	}
	var prefix [4]byte
	binary.BigEndian.PutUint32(prefix[:], uint32(len(raw)))
	if _, err := w.Write(prefix[:]); err != nil {
		return err
	}
	_, err := w.Write(raw)
	return err
}

func readPrivateFrame(r io.Reader) ([]byte, error) {
	var prefix [4]byte
	if _, err := io.ReadFull(r, prefix[:]); err != nil {
		return nil, err
	}
	n := binary.BigEndian.Uint32(prefix[:])
	if n == 0 || n > maxAuthorization {
		return nil, errInput
	}
	raw := make([]byte, n)
	if _, err := io.ReadFull(r, raw); err != nil {
		clear(raw)
		return nil, err
	}
	return raw, nil
}

func linuxBroker(id string, self fileID, deadline time.Time) error {
	listener, err := net.ListenUnix("unix", linuxSocket(id))
	if err != nil {
		return err
	}
	defer listener.Close()
	if err := listener.SetDeadline(deadline); err != nil {
		return err
	}
	me, err := linuxProcessFacts(uint32(os.Getpid()), self)
	if err != nil {
		return err
	}
	fmt.Printf("HUHU_PTY BROKER_READY %d %d %s\n", protocol, me.PID, me.Created)
	raw, err := readPrivateLinuxInput(deadline)
	if err != nil {
		return err
	}
	defer clear(raw)
	auth, err := decodeAuthorization(raw)
	if err != nil {
		return err
	}
	installed, image, err := checkedLinuxFile(auth.Host.Image, nil)
	if err != nil {
		return err
	}
	defer installed.Close()
	if self != image || !startedAtOrAfter(auth.Host.processID, me) {
		return errPeer
	}
	env, protected, err := linuxEnvironment(auth.Launch)
	if err != nil {
		return err
	}
	clear(env)
	dir, _, err := pinLinuxLaunch(auth.Launch, protected, false)
	clear(protected)
	if err != nil {
		return err
	}
	defer dir.Close()
	conn, err := listener.AcceptUnix()
	if err != nil {
		if errors.Is(err, os.ErrDeadlineExceeded) {
			return errTimeout
		}
		return err
	}
	defer conn.Close()
	if err := conn.SetDeadline(deadline); err != nil {
		return err
	}
	pid, err := peerLinuxPID(conn)
	if err != nil || pid != auth.Host.PID {
		return errPeer
	}
	fd, _, err := verifyLinuxProcess(auth.Host.processID, image, linuxHostArgs(id, me))
	if err != nil {
		return err
	}
	defer unix.Close(fd)
	if err := sendPrivateFrame(conn, raw); err != nil {
		return err
	}
	clear(raw)
	return relayReceipts(conn, func() error {
		if !linuxProcessAlive(fd) {
			return errPeer
		}
		_, err := conn.Write([]byte{acceptedByte})
		return err
	}, os.Stdout)
}

type linuxApproval struct {
	receipt          *net.UnixConn
	directory, image *os.File
	launch           linuxChild
	protected        []string
}

func consumeLinux(id string, issuer processID, self fileID, deadline time.Time) (*linuxApproval, error) {
	dialer := net.Dialer{Deadline: deadline}
	socket, err := dialer.Dial("unix", linuxSocket(id).Name)
	if err != nil {
		return nil, errPeer
	}
	conn := socket.(*net.UnixConn)
	approved := false
	defer func() {
		if !approved {
			_ = conn.Close()
		}
	}()
	if err := conn.SetDeadline(deadline); err != nil {
		return nil, err
	}
	pid, err := peerLinuxPID(conn)
	if err != nil || pid != issuer.PID {
		return nil, errPeer
	}
	fd, _, err := verifyLinuxProcess(issuer, self, []string{"broker", id})
	if err != nil {
		return nil, err
	}
	defer unix.Close(fd)
	raw, err := readPrivateFrame(conn)
	if err != nil {
		return nil, err
	}
	defer clear(raw)
	auth, err := decodeAuthorization(raw)
	if err != nil {
		return nil, err
	}
	me, err := linuxProcessFacts(uint32(os.Getpid()), self)
	if err != nil || me != auth.Host.processID || !startedAtOrAfter(me, issuer) {
		return nil, errPeer
	}
	installed, imageID, err := checkedLinuxFile(auth.Host.Image, nil)
	if err != nil {
		return nil, err
	}
	defer installed.Close()
	if imageID != self {
		return nil, errPeer
	}
	env, protected, err := linuxEnvironment(auth.Launch)
	if err != nil {
		return nil, err
	}
	dir, image, err := pinLinuxLaunch(auth.Launch, protected, true)
	if err != nil {
		clear(env)
		clear(protected)
		return nil, err
	}
	defer func() {
		if !approved {
			_ = dir.Close()
			_ = image.Close()
			clear(env)
			clear(protected)
		}
	}()
	if !linuxProcessAlive(fd) {
		return nil, errPeer
	}
	if _, err := conn.Write([]byte{acceptedByte}); err != nil {
		return nil, err
	}
	var ack [1]byte
	if _, err := io.ReadFull(conn, ack[:]); err != nil || ack[0] != acceptedByte {
		return nil, errPeer
	}
	approved = true
	return &linuxApproval{conn, dir, image, linuxChild{Argv: auth.Launch.Argv, Env: env, ApprovedShell: auth.Launch.ApprovedShell != nil}, protected}, nil
}
