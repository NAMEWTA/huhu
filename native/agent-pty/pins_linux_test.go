package main

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"golang.org/x/sys/unix"
)

func TestLinuxProgramPinRejectsReplacementWithIdenticalBytes(t *testing.T) {
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	payload, err := os.ReadFile(exe)
	if err != nil {
		t.Fatal(err)
	}
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(dir, "approved")
	if err := os.WriteFile(file, payload, 0700); err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(payload)
	wanted := fileSpec{Path: file, SHA256: hex.EncodeToString(digest[:])}
	id, err := checkedLinuxProgram(wanted, nil)
	if err != nil {
		t.Fatal(err)
	}
	wanted.ID = &id
	frozen, err := sealedLinuxProgram(wanted)
	if err != nil {
		t.Fatal(err)
	}
	defer frozen.Close()
	if err := os.Rename(file, filepath.Join(dir, "previous")); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, payload, 0700); err != nil {
		t.Fatal(err)
	}
	if _, err := checkedLinuxProgram(wanted, nil); !errors.Is(err, errPin) {
		t.Fatalf("replacement did not fail pin check: %v", err)
	}
	got, err := unix.FcntlInt(frozen.Fd(), unix.F_GET_SEALS, 0)
	if err != nil || got&programSeals != programSeals {
		t.Fatalf("expected immutable executable after replacement: %v", err)
	}
}

func TestApprovedLinuxShellChecksMetadataOnTheOpenImage(t *testing.T) {
	file, err := filepath.EvalSymlinks("/bin/sh")
	if err != nil {
		t.Fatal(err)
	}
	payload, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(payload)
	spec := fileSpec{Path: file, SHA256: hex.EncodeToString(digest[:])}
	source, id, err := checkedLinuxFile(spec, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer source.Close()
	var st unix.Stat_t
	var detail unix.Statx_t
	fd := int(source.Fd())
	if err := unix.Fstat(fd, &st); err != nil {
		t.Fatal(err)
	}
	if err := unix.Statx(fd, "", unix.AT_EMPTY_PATH, unix.STATX_BTIME, &detail); err != nil || detail.Mask&unix.STATX_BTIME == 0 {
		t.Skip("fixture filesystem does not supply a birth time")
	}
	birth := unix.Timespec{Sec: detail.Btime.Sec, Nsec: int64(detail.Btime.Nsec)}
	approved := approvedLinuxImage{
		Path: file, Identity: id.Volume + ":" + id.Index, BirthtimeNS: strconv.FormatInt(birth.Nano(), 10),
		CtimeNS: strconv.FormatInt(st.Ctim.Nano(), 10), MtimeNS: strconv.FormatInt(st.Mtim.Nano(), 10),
		Size: strconv.FormatInt(st.Size, 10), SHA256: spec.SHA256,
	}
	open, err := openApprovedLinuxShell(spec, approved)
	if err != nil {
		t.Fatal(err)
	}
	defer open.Close()

	approved.MtimeNS = "0"
	if err := verifyApprovedLinuxShell(open, id, approved); !errors.Is(err, errPin) {
		t.Fatalf("changed mtime did not invalidate the approval: %v", err)
	}
}
