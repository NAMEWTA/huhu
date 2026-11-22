//go:build linux || windows

package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"regexp"
	"strconv"
	"unicode/utf8"
)

const (
	protocol         = 1
	maxAuthorization = 1024 * 1024
	acceptedByte     = byte('A')
	runningByte      = byte('R')
	failedByte       = byte('F')
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
	Directory         directorySpec          `json:"directory"`
	Image             fileSpec               `json:"image"`
	Entry             *fileSpec              `json:"entry,omitempty"`
	Files             []fileSpec             `json:"files,omitempty"`
	Argv              []string               `json:"argv"`
	Environment       map[string]string      `json:"environment"`
	Protect           []string               `json:"protect"`
	ApprovedShell     *approvedLinuxImage    `json:"approvedShell,omitempty"`
	LinuxInstallation *linuxInstallationSpec `json:"linuxInstallation,omitempty"`
	ReturnShell       *returnShellSpec       `json:"returnShell,omitempty"`
}

type linuxInstallationSpec struct {
	Kind           string       `json:"kind"`
	Root           string       `json:"root"`
	PackageRoot    string       `json:"packageRoot,omitempty"`
	LocalModules   string       `json:"localModules,omitempty"`
	HoistedModules string       `json:"hoistedModules,omitempty"`
	Aliases        []linuxAlias `json:"aliases,omitempty"`
	Records        []fileSpec   `json:"records,omitempty"`
}

type linuxAlias struct {
	Path   string `json:"path"`
	Target string `json:"target"`
}

type returnShellSpec struct {
	Image  fileSpec `json:"image"`
	Argv   []string `json:"argv"`
	Source string   `json:"source,omitempty"`
}

type approvedLinuxImage struct {
	Path        string `json:"path"`
	Identity    string `json:"identity"`
	BirthtimeNS string `json:"birthtimeNs"`
	CtimeNS     string `json:"ctimeNs"`
	MtimeNS     string `json:"mtimeNs"`
	Size        string `json:"size"`
	SHA256      string `json:"sha256"`
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

type startupFailure struct{ code byte }

func (startupFailure) Error() string { return "verified child startup failed" }

func relayReceipts(pipe io.Reader, acknowledge func() error, output io.Writer) error {
	var consumed [1]byte
	if _, err := io.ReadFull(pipe, consumed[:]); err != nil {
		if errors.Is(err, io.EOF) {
			return errPeer
		}
		return err
	}
	if consumed[0] != acceptedByte {
		return errPeer
	}
	if _, err := fmt.Fprintln(output, "HUHU_PTY ISSUED_ONCE"); err != nil {
		return err
	}
	var outcome [2]byte
	err := acknowledge()
	if err == nil {
		_, err = io.ReadFull(pipe, outcome[:])
	}
	if err == nil {
		switch outcome {
		case [2]byte{runningByte, 0}:
			_, err = fmt.Fprintln(output, "HUHU_PTY RUNNING")
			return err
		case [2]byte{failedByte, hostFailure}, [2]byte{failedByte, pinDenied}:
			if _, err := fmt.Fprintf(output, "HUHU_PTY START_FAILED %d\n", outcome[1]); err != nil {
				return err
			}
			return startupFailure{outcome[1]}
		}
		err = errors.New("invalid startup receipt")
	}
	fmt.Fprintln(output, "HUHU_PTY START_UNKNOWN")
	return err
}

type fileSpec struct {
	Path   string  `json:"path"`
	SHA256 string  `json:"sha256"`
	ID     *fileID `json:"id,omitempty"`
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

type processID struct {
	PID     uint32 `json:"pid"`
	Created string `json:"created"`
}

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
	var failed startupFailure
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
	case errors.As(err, &failed):
		return int(failed.code)
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
