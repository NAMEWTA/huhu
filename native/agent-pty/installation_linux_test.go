package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"testing"
)

func installationFixture(t *testing.T) launchSpec {
	t.Helper()
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	payload, err := os.ReadFile(executable)
	if err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(dir, "package")
	pin := func(file string, contents []byte, mode os.FileMode) fileSpec {
		t.Helper()
		if err := os.MkdirAll(filepath.Dir(file), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(file, contents, mode); err != nil {
			t.Fatal(err)
		}
		digest := sha256.Sum256(contents)
		spec := fileSpec{Path: file, SHA256: hex.EncodeToString(digest[:])}
		opened, id, err := checkedLinuxFile(spec, nil)
		if err != nil {
			t.Fatal(err)
		}
		_ = opened.Close()
		spec.ID = &id
		return spec
	}
	image := pin(filepath.Join(dir, "node"), payload, 0700)
	entry := pin(filepath.Join(source, "dist/bundle/cli.js"), []byte("require('./chunk.js');"), 0600)
	chunk := pin(filepath.Join(source, "dist/bundle/chunk.js"), []byte("process.exit(17);"), 0600)
	manifest := pin(filepath.Join(source, "package.json"), []byte("{}"), 0600)
	dirFile, dirID, err := openLinuxDirectory(dir)
	if err != nil {
		t.Fatal(err)
	}
	_ = dirFile.Close()
	return launchSpec{
		Directory: directorySpec{Path: dir, ID: dirID}, Image: image, Entry: &entry,
		Files: []fileSpec{manifest, chunk}, Argv: []string{image.Path, entry.Path, "a b", "中文 ';!"},
		LinuxInstallation: &linuxInstallationSpec{Kind: "pi-node", Root: source},
	}
}

func TestLinuxInstallationRejectsChangedInterpreterEntryAndChunk(t *testing.T) {
	for i, name := range []string{"interpreter", "entry", "chunk"} {
		t.Run(name, func(t *testing.T) {
			plan := installationFixture(t)
			file := []fileSpec{plan.Image, *plan.Entry, plan.Files[1]}[i]
			data, err := os.ReadFile(file.Path)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := prepareLinuxInstallation(plan, false); err != nil {
				t.Fatal(err)
			}
			if err := os.Rename(file.Path, file.Path+".previous"); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(file.Path, data, 0700); err != nil {
				t.Fatal(err)
			}
			for _, materialize := range []bool{false, true} {
				pins, err := pinLinuxLaunch(plan, nil, materialize)
				if pins != nil {
					pins.close()
				}
				if !errors.Is(err, errPin) {
					t.Fatalf("%s was accepted by materialize=%t: %v", name, materialize, err)
				}
			}
		})
	}
}

func TestLinuxInstallationKeepsVerifiedPackageBytesAndArgv(t *testing.T) {
	plan := installationFixture(t)
	pins, err := pinLinuxLaunch(plan, nil, true)
	if err != nil {
		t.Fatal(err)
	}
	defer pins.close()
	install := pins.installation
	if !checkedStagedImage(pins.image) || !reflect.DeepEqual(install.argv[2:], plan.Argv[2:]) {
		t.Fatal("the supervisor did not receive the approved executable and original user arguments")
	}
	copiedChunk := filepath.Join(filepath.Dir(install.argv[1]), "chunk.js")
	if err := os.WriteFile(plan.Files[1].Path, []byte("different chunk"), 0600); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(copiedChunk)
	if err != nil || !bytes.Equal(got, []byte("process.exit(17);")) {
		t.Fatalf("the approved version did not keep the original chunk: %v", err)
	}
	info, err := os.Stat(copiedChunk)
	if err != nil || info.Mode().Perm()&0222 != 0 {
		t.Fatalf("expected read-only component: %v", err)
	}
	plan.ReturnShell = &returnShellSpec{Argv: []string{"/bin/sh", "-i"}}
	plan.Protect = []string{"KEY"}
	child := linuxLaunchChild(plan, pins, []string{"KEY=synthetic-secret", "OTHER=prefix-synthetic-secret", "NORMAL=ordinary"}, []string{"synthetic-secret"})
	if !slices.Contains(child.Env, "PI_PACKAGE_DIR="+install.packageRoot) || !reflect.DeepEqual(child.ReturnEnv, []string{"NORMAL=ordinary"}) {
		t.Fatal("incorrect environment split between the agent and return shell")
	}
}

func TestLinuxInstallationRejectsAnUpdatedAliasWithOldImageStillPresent(t *testing.T) {
	plan := installationFixture(t)
	alias := filepath.Join(plan.Directory.Path, "pi")
	if err := os.Symlink(plan.Entry.Path, alias); err != nil {
		t.Fatal(err)
	}
	plan.LinuxInstallation.Aliases = []linuxAlias{{Path: alias, Target: plan.Entry.Path}}
	if _, err := prepareLinuxInstallation(plan, false); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(alias); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(plan.Files[1].Path, alias); err != nil {
		t.Fatal(err)
	}
	if _, err := prepareLinuxInstallation(plan, false); !errors.Is(err, errPin) {
		t.Fatalf("an updated program link did not invalidate its original path: %v", err)
	}
}

func TestLinuxApprovedRuleRejectsReturnShell(t *testing.T) {
	plan := installationFixture(t)
	plan.Argv = []string{plan.Image.Path, "-c", "exit 17"}
	plan.LinuxInstallation = nil
	plan.Entry = nil
	plan.Files = nil
	plan.ApprovedShell = &approvedLinuxImage{}
	plan.ReturnShell = &returnShellSpec{Image: plan.Image, Argv: []string{plan.Image.Path, "-i"}}
	if _, err := pinLinuxLaunch(plan, nil, false); !errors.Is(err, errInput) {
		t.Fatalf("an approved rule accepted a return shell: %v", err)
	}
}
