package main

import (
	"bytes"
	"crypto/sha256"
	"debug/elf"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"golang.org/x/sys/unix"
)

const maxImageSize = 512 << 20

func linuxIdentity(st unix.Stat_t, stamp unix.Timespec) fileID {
	return fileID{
		Volume:  strconv.FormatUint(uint64(st.Dev), 10),
		Index:   strconv.FormatUint(st.Ino, 10),
		Created: strconv.FormatInt(stamp.Nano(), 10),
	}
}

func openLinuxPath(path string, flags uint64) (*os.File, unix.Stat_t, error) {
	var st unix.Stat_t
	if !filepath.IsAbs(path) || filepath.Clean(path) != path || strings.ContainsRune(path, 0) {
		return nil, st, errInput
	}
	fd, err := unix.Openat2(unix.AT_FDCWD, path, &unix.OpenHow{
		Flags:   flags | unix.O_CLOEXEC,
		Resolve: unix.RESOLVE_NO_SYMLINKS | unix.RESOLVE_NO_MAGICLINKS,
	})
	if err != nil {
		return nil, st, errPin
	}
	if unix.Fstat(fd, &st) != nil {
		_ = unix.Close(fd)
		return nil, st, errPin
	}
	return os.NewFile(uintptr(fd), path), st, nil
}

func openLinuxDirectory(path string) (*os.File, fileID, error) {
	dir, st, err := openLinuxPath(path, unix.O_PATH|unix.O_DIRECTORY)
	if err != nil {
		return nil, fileID{}, err
	}
	// Prefer a stable birth time. Filesystems without it use the stricter ctime.
	stamp := st.Ctim
	var detail unix.Statx_t
	if unix.Statx(int(dir.Fd()), "", unix.AT_EMPTY_PATH, unix.STATX_BTIME, &detail) == nil && detail.Mask&unix.STATX_BTIME != 0 {
		stamp = unix.Timespec{Sec: detail.Btime.Sec, Nsec: int64(detail.Btime.Nsec)}
	}
	return dir, linuxIdentity(st, stamp), nil
}

func checkedLinuxFile(spec fileSpec, copyTo io.Writer) (*os.File, fileID, error) {
	file, before, err := openLinuxPath(spec.Path, unix.O_RDONLY|unix.O_NONBLOCK)
	if err != nil {
		return nil, fileID{}, err
	}
	id := linuxIdentity(before, before.Ctim)
	ok := false
	defer func() {
		if !ok {
			_ = file.Close()
		}
	}()
	if before.Mode&unix.S_IFMT != unix.S_IFREG || before.Size < 0 || before.Size > maxImageSize || (spec.ID != nil && *spec.ID != id) {
		return nil, fileID{}, errPin
	}
	hash := sha256.New()
	dst := io.Writer(hash)
	if copyTo != nil {
		dst = io.MultiWriter(hash, copyTo)
	}
	n, err := io.Copy(dst, io.LimitReader(file, maxImageSize+1))
	var after unix.Stat_t
	if err != nil || n != before.Size || hex.EncodeToString(hash.Sum(nil)) != spec.SHA256 ||
		unix.Fstat(int(file.Fd()), &after) != nil || linuxIdentity(after, after.Ctim) != id {
		return nil, fileID{}, errPin
	}
	ok = true
	return file, id, nil
}

func checkELF(file *os.File) error {
	fd := int(file.Fd())
	var st unix.Stat_t
	if unix.Fstat(fd, &st) != nil || st.Mode&(unix.S_ISUID|unix.S_ISGID) != 0 ||
		unix.Faccessat2(fd, "", unix.X_OK, unix.AT_EMPTY_PATH|unix.AT_EACCESS) != nil {
		return errPin
	}
	executable, err := elf.NewFile(file)
	if err != nil || executable.Machine != elf.EM_X86_64 || (executable.Type != elf.ET_EXEC && executable.Type != elf.ET_DYN) {
		return errPin
	}
	return nil
}

func checkedLinuxProgram(spec fileSpec, copyTo io.Writer) (fileID, error) {
	file, id, err := checkedLinuxFile(spec, copyTo)
	if err != nil {
		return fileID{}, err
	}
	defer file.Close()
	return id, checkELF(file)
}

func openApprovedLinuxShell(spec fileSpec, approved approvedLinuxImage) (*os.File, error) {
	shell, err := filepath.EvalSymlinks("/bin/sh")
	if err != nil || shell != approved.Path || spec.Path != approved.Path || spec.SHA256 != approved.SHA256 {
		return nil, errPin
	}
	file, id, err := checkedLinuxFile(spec, nil)
	if err != nil {
		return nil, err
	}
	if err := verifyApprovedLinuxShell(file, id, approved); err != nil {
		_ = file.Close()
		return nil, err
	}
	return file, nil
}

func verifyApprovedLinuxShell(file *os.File, id fileID, approved approvedLinuxImage) error {
	fd := int(file.Fd())
	var st unix.Stat_t
	var detail unix.Statx_t
	if unix.Fstat(fd, &st) != nil || !trustedLinuxShellMode(st) ||
		unix.Statx(fd, "", unix.AT_EMPTY_PATH, unix.STATX_BTIME, &detail) != nil || detail.Mask&unix.STATX_BTIME == 0 {
		return errPin
	}
	birth := unix.Timespec{Sec: detail.Btime.Sec, Nsec: int64(detail.Btime.Nsec)}
	if approved.Identity != id.Volume+":"+id.Index || approved.BirthtimeNS != strconv.FormatInt(birth.Nano(), 10) ||
		approved.CtimeNS != strconv.FormatInt(st.Ctim.Nano(), 10) || approved.MtimeNS != strconv.FormatInt(st.Mtim.Nano(), 10) ||
		approved.Size != strconv.FormatInt(st.Size, 10) {
		return errPin
	}
	return checkELF(file)
}

func trustedLinuxShellMode(st unix.Stat_t) bool {
	return st.Mode&unix.S_IFMT == unix.S_IFREG && st.Mode&0o022 == 0 && (os.Geteuid() == 0 || int(st.Uid) != os.Geteuid())
}

const programSeals = unix.F_SEAL_WRITE | unix.F_SEAL_GROW | unix.F_SEAL_SHRINK | unix.F_SEAL_SEAL

func sealedLinuxProgram(spec fileSpec) (*os.File, error) {
	const flags = unix.MFD_CLOEXEC | unix.MFD_ALLOW_SEALING
	fd, err := unix.MemfdCreate("huhu-agent", flags|unix.MFD_EXEC)
	if err == unix.EINVAL {
		// Kernels before Linux 6.3 implicitly create executable memfds.
		fd, err = unix.MemfdCreate("huhu-agent", flags)
	}
	if err != nil {
		return nil, errPin
	}
	file := os.NewFile(uintptr(fd), "huhu-agent")
	if _, err = checkedLinuxProgram(spec, file); err == nil {
		err = unix.Fchmod(fd, 0500)
	}
	if err == nil {
		_, err = unix.FcntlInt(file.Fd(), unix.F_ADD_SEALS, programSeals)
	}
	defer file.Close()
	if err != nil {
		return nil, errPin
	}
	readOnly, err := os.Open("/proc/self/fd/" + strconv.Itoa(fd))
	if err != nil {
		return nil, errPin
	}
	return readOnly, nil
}

func processExecutable(pid uint32) (fileID, error) {
	exe, err := os.Open(fmt.Sprintf("/proc/%d/exe", pid))
	if err != nil {
		return fileID{}, errPeer
	}
	defer exe.Close()
	var st unix.Stat_t
	if unix.Fstat(int(exe.Fd()), &st) != nil {
		return fileID{}, errPeer
	}
	return linuxIdentity(st, st.Ctim), nil
}

func linuxProcessStat(pid uint32) ([]string, error) {
	raw, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
	if err != nil {
		return nil, errPeer
	}
	// The comm field is parenthesized and may itself contain spaces or ')'.
	end := bytes.LastIndexByte(raw, ')')
	if end < 0 {
		return nil, errPeer
	}
	fields := strings.Fields(string(raw[end+1:]))
	if len(fields) < 20 {
		return nil, errPeer
	}
	return fields, nil
}

func linuxProcessFacts(pid uint32, image fileID) (processID, error) {
	fields, err := linuxProcessStat(pid)
	if err != nil {
		return processID{}, err
	}
	_, err = strconv.ParseUint(fields[19], 10, 64)
	if err != nil || fields[0] == "Z" {
		return processID{}, errPeer
	}
	actual, err := processExecutable(pid)
	if err != nil || actual != image {
		return processID{}, errPeer
	}
	return processID{pid, fields[19]}, nil
}

func verifyLinuxProcess(expected processID, image fileID, argv []string) (int, processID, error) {
	fd, err := unix.PidfdOpen(int(expected.PID), 0)
	if err != nil {
		return -1, processID{}, errPeer
	}
	actual, err := linuxProcessFacts(expected.PID, image)
	if err == nil && expected.Created != "" && expected != actual {
		err = errPeer
	}
	if err == nil && len(argv) != 0 {
		raw, readErr := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", expected.PID))
		// Core may canonicalize argv[0]. The running image has its own independent identity proof.
		start := bytes.IndexByte(raw, 0)
		if readErr != nil || start < 0 || string(raw[start+1:]) != strings.Join(argv, "\x00")+"\x00" {
			err = errPeer
		}
	}
	if err == nil && !linuxProcessAlive(fd) {
		err = errPeer
	}
	if err != nil {
		_ = unix.Close(fd)
		return -1, processID{}, err
	}
	return fd, actual, nil
}

func linuxProcessAlive(fd int) bool {
	poll := []unix.PollFd{{Fd: int32(fd), Events: unix.POLLIN}}
	n, err := unix.Poll(poll, 0)
	return err == nil && n == 0
}
