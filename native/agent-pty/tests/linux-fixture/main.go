//go:build linux

// The isolated native/desktop fixture records only booleans, process IDs, and
// terminal geometry. It never writes the protected value into its proof file.
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
	"time"

	"golang.org/x/term"
)

type observation struct {
	Event         string  `json:"event"`
	TTY           [3]bool `json:"tty"`
	PID           int     `json:"pid"`
	Detached      int     `json:"detached"`
	Columns       int     `json:"columns"`
	Rows          int     `json:"rows"`
	PlainMatched  bool    `json:"plainMatched"`
	SecretMatched bool    `json:"secretMatched"`
}

func main() {
	if len(os.Args) == 2 && os.Args[1] == "--version" {
		fmt.Println("codex-cli 0.0.0-fixture")
		return
	}
	os.Exit(probe())
}

func probe() int {
	proof, err := os.OpenFile(os.Getenv("HUHU_AGENT_FIXTURE_PROOF"), os.O_WRONLY|os.O_CREATE|os.O_APPEND, 0600)
	if err != nil {
		return 31
	}
	defer proof.Close()
	in := int(os.Stdin.Fd())
	facts := observation{PID: os.Getpid(), TTY: [3]bool{term.IsTerminal(in), term.IsTerminal(int(os.Stdout.Fd())), term.IsTerminal(int(os.Stderr.Fd()))}}
	facts.PlainMatched = os.Getenv("HUHU_AGENT_FIXTURE_PLAIN") == "fixture-ordinary"
	secret := os.Getenv("HUHU_AGENT_FIXTURE_SECRET")
	hash := sha256.Sum256([]byte(secret))
	facts.SecretMatched = hex.EncodeToString(hash[:]) == os.Getenv("HUHU_AGENT_FIXTURE_SHA")
	if os.Getenv("HUHU_AGENT_FIXTURE_SPAWN") == "1" {
		detached := exec.Command("/bin/sleep", "60")
		detached.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
		if detached.Start() != nil {
			return 33
		}
		facts.Detached = detached.Process.Pid
		_ = detached.Process.Release()
	}
	state, err := term.MakeRaw(in)
	if err != nil {
		return 34
	}
	defer term.Restore(in, state)
	resize := make(chan os.Signal, 1)
	signal.Notify(resize, syscall.SIGWINCH)
	defer signal.Stop(resize)
	record := func(event string) {
		facts.Event = event
		facts.Columns, facts.Rows, _ = term.GetSize(in)
		_ = json.NewEncoder(proof).Encode(facts)
	}
	record("ready")
	if secret != "" {
		fmt.Print("fixture:redact ", secret[:len(secret)/2])
		time.Sleep(25 * time.Millisecond)
		fmt.Print(secret[len(secret)/2:], "\r\n")
	}
	fmt.Print("fixture:ready\r\n")
	type keypress struct {
		key byte
		err error
	}
	input := make(chan keypress, 1)
	go func() {
		var key [1]byte
		_, err := os.Stdin.Read(key[:])
		input <- keypress{key[0], err}
	}()
	timeout := time.NewTimer(30 * time.Second)
	defer timeout.Stop()
	for {
		select {
		case <-resize:
			record("resized")
		case press := <-input:
			if press.err != nil || press.key != 'q' {
				return 35
			}
			record("input")
			return 17
		case <-timeout.C:
			return 36
		}
	}
}
