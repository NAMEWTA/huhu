package main

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"golang.org/x/sys/windows"
)

type fileSpec struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
}

type fileID struct {
	Volume  string `json:"volume"`
	Index   string `json:"index"`
	Created string `json:"created"`
}

type directorySpec struct {
	Path string `json:"path"`
	ID   fileID `json:"id"`
}

type pinnedFile struct {
	path   string
	f      *os.File
	id     fileID
	digest string
}

type pins struct {
	files   map[string]*pinnedFile
	dirs    map[string]fileID
	handles []windows.Handle
}

func newPins() *pins {
	return &pins{files: make(map[string]*pinnedFile), dirs: make(map[string]fileID)}
}

func (p *pins) close() {
	for _, file := range p.files {
		file.f.Close()
	}
	for i := len(p.handles) - 1; i >= 0; i-- {
		windows.CloseHandle(p.handles[i])
	}
}

func localPath(path string) bool {
	return len(path) >= 3 &&
		((path[0] >= 'A' && path[0] <= 'Z') || (path[0] >= 'a' && path[0] <= 'z')) &&
		path[1:3] == `:\` && path == filepath.Clean(path) &&
		!strings.ContainsAny(path[3:], ":/\x00")
}

func samePath(a, b string) bool {
	// Windows supports case-sensitive directories. Only a drive letter is
	// interchangeable, so approved file paths must keep the filesystem case.
	return len(a) >= 3 && len(b) >= 3 && strings.EqualFold(a[:1], b[:1]) && a[1:] == b[1:]
}

func timestamp(t windows.Filetime) string {
	return strconv.FormatUint(uint64(t.HighDateTime)<<32|uint64(t.LowDateTime), 10)
}

func checkedPath(h windows.Handle, path string, directory bool) (fileID, error) {
	var data windows.ByHandleFileInformation
	if err := windows.GetFileInformationByHandle(h, &data); err != nil ||
		data.FileAttributes&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 ||
		(data.FileAttributes&windows.FILE_ATTRIBUTE_DIRECTORY != 0) != directory {
		return fileID{}, errPin
	}
	buf := make([]uint16, 32768)
	n, err := windows.GetFinalPathNameByHandle(h, &buf[0], uint32(len(buf)), 0)
	if err != nil || n >= uint32(len(buf)) || !samePath(strings.TrimPrefix(windows.UTF16ToString(buf[:n]), `\\?\`), path) {
		return fileID{}, errPin
	}
	index := uint64(data.FileIndexHigh)<<32 | uint64(data.FileIndexLow)
	if index == 0 {
		return fileID{}, errPin
	}
	return fileID{strconv.FormatUint(uint64(data.VolumeSerialNumber), 10), strconv.FormatUint(index, 10), timestamp(data.CreationTime)}, nil
}

func (p *pins) directory(path string) (fileID, error) {
	if !localPath(path) {
		return fileID{}, errPin
	}
	key := strings.ToUpper(path[:1]) + path[1:]
	if id, ok := p.dirs[key]; ok {
		return id, nil
	}
	ptr, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return fileID{}, errPin
	}
	if parent := filepath.Dir(path); parent != path {
		if _, err := p.directory(parent); err != nil {
			return fileID{}, err
		}
	} else if windows.GetDriveType(ptr) != windows.DRIVE_FIXED {
		return fileID{}, errPin
	}
	// Keep every ancestor open without share-delete, including while CreateProcess resolves its paths.
	h, err := windows.CreateFile(ptr, windows.FILE_READ_ATTRIBUTES, windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE, nil,
		windows.OPEN_EXISTING, windows.FILE_FLAG_BACKUP_SEMANTICS|windows.FILE_FLAG_OPEN_REPARSE_POINT, 0)
	if err != nil {
		return fileID{}, errPin
	}
	id, err := checkedPath(h, path, true)
	if err != nil {
		windows.CloseHandle(h)
		return fileID{}, err
	}
	p.handles = append(p.handles, h)
	p.dirs[key] = id
	return id, nil
}

func (p *pins) openFile(path string) (*pinnedFile, error) {
	if !localPath(path) {
		return nil, errPin
	}
	key := strings.ToUpper(path[:1]) + path[1:]
	if file := p.files[key]; file != nil {
		return file, nil
	}
	if _, err := p.directory(filepath.Dir(path)); err != nil {
		return nil, err
	}
	ptr, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return nil, errPin
	}
	h, err := windows.CreateFile(ptr, windows.GENERIC_READ, windows.FILE_SHARE_READ, nil,
		windows.OPEN_EXISTING, windows.FILE_FLAG_OPEN_REPARSE_POINT|windows.FILE_FLAG_SEQUENTIAL_SCAN, 0)
	if err != nil {
		return nil, errPin
	}
	id, err := checkedPath(h, path, false)
	if err != nil {
		windows.CloseHandle(h)
		return nil, err
	}
	f := os.NewFile(uintptr(h), "approved file")
	file := &pinnedFile{path: path, f: f, id: id}
	p.files[key] = file
	return file, nil
}

func (p *pins) file(want fileSpec) (*pinnedFile, error) {
	file, err := p.openFile(want.Path)
	if err != nil {
		return nil, err
	}
	if file.digest == "" {
		sum := sha256.New()
		if _, err := io.Copy(sum, file.f); err != nil {
			return nil, errPin
		}
		file.digest = hex.EncodeToString(sum.Sum(nil))
	}
	if file.digest != want.SHA256 {
		return nil, errPin
	}
	return file, nil
}

type processID struct {
	PID     uint32 `json:"pid"`
	Created string `json:"created"`
}

func openProcess(pid uint32) (windows.Handle, error) {
	h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION|windows.SYNCHRONIZE, false, pid)
	if err != nil {
		return 0, errPeer
	}
	return h, nil
}

func processFacts(h windows.Handle, image *pinnedFile) (processID, error) {
	pid, err := windows.GetProcessId(h)
	if err != nil {
		return processID{}, errPeer
	}
	var birth, exit, kernel, user windows.Filetime
	if err := windows.GetProcessTimes(h, &birth, &exit, &kernel, &user); err != nil {
		return processID{}, errPeer
	}
	name := make([]uint16, 32768)
	size := uint32(len(name))
	if windows.QueryFullProcessImageName(h, 0, &name[0], &size) != nil ||
		!samePath(strings.TrimPrefix(windows.UTF16ToString(name[:size]), `\\?\`), image.path) || !processAlive(h) {
		return processID{}, errPeer
	}
	return processID{pid, timestamp(birth)}, nil
}

func processAlive(h windows.Handle) bool {
	result, err := windows.WaitForSingleObject(h, 0)
	return err == nil && result == uint32(windows.WAIT_TIMEOUT)
}

func checkPeer(pid uint32, expected processID, image *pinnedFile) (windows.Handle, error) {
	if pid != expected.PID {
		return 0, errPeer
	}
	h, err := openProcess(pid)
	if err != nil {
		return 0, err
	}
	if got, err := processFacts(h, image); err != nil || got != expected {
		windows.CloseHandle(h)
		return 0, errPeer
	}
	return h, nil
}
