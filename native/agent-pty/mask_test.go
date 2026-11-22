package main

import (
	"bytes"
	"io"
	"strings"
	"testing"
	"testing/iotest"
)

func TestApprovedRuleMarkerPreservesLiteralOutput(t *testing.T) {
	var output bytes.Buffer
	input := iotest.OneByteReader(strings.NewReader("literal [REDACTED], secret synthetic-rule-value"))
	if err := maskStreamWithMarker(&output, input, []string{"synthetic-rule-value"}, []byte("***")); err != nil {
		t.Fatal(err)
	}
	if output.String() != "literal [REDACTED], secret ***" {
		t.Fatalf("unexpected masking: %q", output.String())
	}
}

func TestMaskStream(t *testing.T) {
	const canary = "fixture-huhu-521bc72446fb8d5aca1051ab319a7a2f-雪🧪"
	input := "普通 prompt>" + canary[:21] + "\x1b[1mPUBLIC_EVENT\x1b[0m" + canary[21:] + " ✓ short and clean"
	want := "普通 prompt>[REDACTED] ✓ [REDACTED] and clean"
	var actual bytes.Buffer
	if err := maskStream(&actual, iotest.OneByteReader(strings.NewReader(input)), []string{canary, "short"}); err != nil {
		t.Fatal(err)
	}
	if actual.String() != want {
		t.Fatal("chunked output did not preserve the expected public content")
	}
}

func TestMaskStreamStopsAnUnfinishedSpan(t *testing.T) {
	const canary = "fixture-huhu-521bc72446fb8d5aca1051ab319a7a2f-雪🧪"
	var actual bytes.Buffer
	if err := maskStream(&actual, strings.NewReader("READY> "+canary[:26]), []string{canary}); err != nil {
		t.Fatal(err)
	}
	if actual.String() != "READY> [REDACTED]" {
		t.Fatal("unfinished span did not remain masked")
	}
}

func TestMaskStreamResumesAfterEitherSecretWithSharedPrefix(t *testing.T) {
	const a = "shared-start-first-secret-111111111111"
	const b = "shared-start-other-secret-222222222222"
	input := "READY> " + b[:20] + "\x1b[1mPUBLIC_EVENT\x1b[0m" + b[20:] + " AFTER_B " + a + " AFTER_A"
	var actual bytes.Buffer
	if err := maskStream(&actual, iotest.OneByteReader(strings.NewReader(input)), []string{a, b}); err != nil {
		t.Fatal(err)
	}
	if actual.String() != "READY> [REDACTED] AFTER_B [REDACTED] AFTER_A" {
		t.Fatal("output did not resume after matching both secret suffixes")
	}
}

func TestMaskStreamDoesNotWaitForANewline(t *testing.T) {
	reader, writer := io.Pipe()
	defer reader.Close()
	defer writer.Close()
	report := make(chan string, 1)
	done := make(chan error, 1)
	go func() {
		done <- maskStream(recordWrite(report), reader, []string{"abcdef"})
	}()
	if _, err := io.WriteString(writer, "CLI_INPUT> "); err != nil {
		t.Fatal(err)
	}
	if output := <-report; output != "CLI_INPUT> " {
		t.Fatal("interactive prompt was not passed through")
	}
	writer.Close()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

type recordWrite chan string

func (w recordWrite) Write(p []byte) (int, error) {
	w <- string(p)
	return len(p), nil
}
