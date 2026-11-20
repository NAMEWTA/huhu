package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"golang.org/x/sys/windows"
)

func TestRelayReceipts(t *testing.T) {
	const consumed = "HUHU_PTY ISSUED_ONCE\n"
	tests := []struct {
		name, input, output string
		ackError            error
		failureCode         byte
		wantError           bool
	}{
		{name: "running", input: "AR\x00", output: consumed + "HUHU_PTY RUNNING\n"},
		{name: "startup failure", input: "AF" + string(byte(hostFailure)), output: consumed + "HUHU_PTY START_FAILED 70\n", failureCode: hostFailure, wantError: true},
		{name: "lost reply", input: "A", output: consumed + "HUHU_PTY START_UNKNOWN\n", wantError: true},
		{name: "unconfirmed consumption", input: "A", output: consumed + "HUHU_PTY START_UNKNOWN\n", ackError: io.ErrClosedPipe, wantError: true},
		{name: "untrusted status", input: "AF\xff", output: consumed + "HUHU_PTY START_UNKNOWN\n", wantError: true},
		{name: "no consumption", input: "R\x00", wantError: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var output bytes.Buffer
			err := relayReceipts(strings.NewReader(test.input), func() error {
				if output.String() != consumed {
					t.Fatal("broker acknowledged before reporting consumption")
				}
				return test.ackError
			}, &output)
			var failure startupFailure
			if output.String() != test.output || (err != nil) != test.wantError ||
				errors.As(err, &failure) != (test.failureCode != 0) || failure.code != test.failureCode {
				t.Fatalf("unexpected receipt result: %q, %v", output.String(), err)
			}
		})
	}
}

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
