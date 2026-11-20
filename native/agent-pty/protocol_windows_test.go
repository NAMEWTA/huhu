package main

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"testing"
	"time"

	"golang.org/x/sys/windows"
)

func TestApprovedEnvironment(t *testing.T) {
	spec := launchSpec{
		Environment: map[string]string{"Zulu": "", "SystemRoot": `C:\Windows`, "alpha": "雪🧪"},
		Protect:     []string{"ALPHA"},
	}
	block, protected, err := spec.environmentBlock()
	if err != nil || len(protected) != 1 || protected[0] != "雪🧪" {
		t.Fatal("valid Unicode environment was rejected")
	}
	var entries []string
	start := 0
	for i, char := range block {
		if char == 0 && i == start && i == len(block)-1 {
			break
		}
		if char == 0 {
			entries = append(entries, windows.UTF16ToString(block[start:i]))
			start = i + 1
		}
	}
	if len(block) < 2 || block[len(block)-1] != 0 || block[len(block)-2] != 0 ||
		strings.Join(entries, "|") != `alpha=雪🧪|SystemRoot=C:\Windows|Zulu=` {
		t.Fatal("Windows environment block did not match its approved entries")
	}
	for _, env := range []map[string]string{
		{"alpha": "value", "ALPHA": "other"},
		{"alpha": "nul\x00value"},
		{"alpha": "protected\nline"},
		{"invalid=key": ""},
	} {
		spec.Environment = env
		if _, _, err := spec.environmentBlock(); !errors.Is(err, errInput) {
			t.Fatal("invalid environment passed validation")
		}
	}
}

func TestTimedOutPipeReleasesName(t *testing.T) {
	var tag [16]byte
	if _, err := rand.Read(tag[:]); err != nil {
		t.Fatal(err)
	}
	id := hex.EncodeToString(tag[:])
	server, err := newServer(id, time.Now().Add(100*time.Millisecond))
	if err != nil {
		t.Fatal(err)
	}
	defer server.close()
	if err := server.connect(); !errors.Is(err, errTimeout) {
		t.Fatalf("expected canceled connection, got %v", err)
	}
	server.close()
	if _, err := openClient(id, time.Now().Add(100*time.Millisecond)); !errors.Is(err, errTimeout) {
		t.Fatalf("expected missing endpoint after closure, got %v", err)
	}
}
