package main

import (
	"os"
	"path/filepath"
	"slices"
	"strings"

	"golang.org/x/sys/unix"
)

const maxInstallationSize = 1024 << 20

type linuxInstallation struct {
	stage       string
	image       *os.File
	argv        []string
	packageRoot string
}

func installationRelative(root, file string) (string, bool) {
	if !filepath.IsAbs(root) || !filepath.IsAbs(file) || filepath.Clean(root) != root || filepath.Clean(file) != file {
		return "", false
	}
	relative, err := filepath.Rel(root, file)
	return relative, err == nil && relative != ".." && !strings.HasPrefix(relative, "../")
}

func installationVariables(spec *linuxInstallationSpec) []string {
	if spec == nil {
		return nil
	}
	switch spec.Kind {
	case "codex-npm":
		return []string{"CODEX_MANAGED_PACKAGE_ROOT", "CODEX_MANAGED_BY_NPM", "CODEX_MANAGED_BY_BUN", "CODEX_MANAGED_BY_PNPM", "CODEX_MANAGED_BY_VITE_PLUS"}
	case "pi-node":
		return []string{"PI_PACKAGE_DIR", "PI_MANAGED_INSTALL_ROOT"}
	default:
		return nil
	}
}

func matchesInstallationAlias(alias linuxAlias) bool {
	if !filepath.IsAbs(alias.Path) || filepath.Clean(alias.Path) != alias.Path {
		return false
	}
	resolved, err := filepath.EvalSymlinks(alias.Path)
	return err == nil && resolved == alias.Target
}

func prepareLinuxInstallation(s launchSpec, copyFiles bool) (_ linuxInstallation, err error) {
	layout := s.LinuxInstallation
	directory, _, err := openLinuxDirectory(layout.Root)
	if err != nil {
		return linuxInstallation{}, err
	}
	_ = directory.Close()

	imagePath, imageInside := installationRelative(layout.Root, s.Image.Path)
	var packageRoot string
	switch layout.Kind {
	case "pi-node":
		if s.Entry == nil || layout.PackageRoot != "" {
			return linuxInstallation{}, errInput
		}
		imagePath = filepath.Join(".node", "bin", filepath.Base(s.Image.Path))
		packageRoot = "package"
	case "codex-npm":
		var within bool
		packageRoot, within = installationRelative(layout.Root, layout.PackageRoot)
		if !within || !imageInside || imagePath == "." || s.Entry != nil || layout.LocalModules != "" || layout.HoistedModules != "" {
			return linuxInstallation{}, errInput
		}
	case "claude-native":
		if !imageInside || filepath.Base(imagePath) != imagePath || imagePath == "." || layout.PackageRoot != "" ||
			s.Entry != nil || len(s.Files) != 0 || layout.LocalModules != "" || layout.HoistedModules != "" {
			return linuxInstallation{}, errInput
		}
	default:
		return linuxInstallation{}, errInput
	}

	type component struct {
		spec     fileSpec
		relative string
	}
	components := []component{{s.Image, imagePath}}
	occupied := map[string]bool{imagePath: true}
	declared := append([]fileSpec(nil), s.Files...)
	if s.Entry != nil {
		declared = append(declared, *s.Entry)
	}
	mapPackage := func(file string) (string, bool) {
		relative, within := installationRelative(layout.Root, file)
		if !within || relative == "." {
			return "", false
		}
		if layout.Kind == "pi-node" {
			if relative == "node_modules" || strings.HasPrefix(relative, "node_modules/") {
				return "", false
			}
			relative = filepath.Join(packageRoot, relative)
		}
		return relative, true
	}
	for _, file := range declared {
		relative, valid := mapPackage(file.Path)
		if !valid || occupied[relative] || file.ID == nil {
			return linuxInstallation{}, errInput
		}
		occupied[relative] = true
		components = append(components, component{file, relative})
	}
	if layout.Kind != "claude-native" && !occupied[filepath.Join(packageRoot, "package.json")] {
		return linuxInstallation{}, errInput
	}

	var stage string
	if copyFiles {
		temp, err := filepath.EvalSymlinks(os.TempDir())
		if err != nil || !filepath.IsAbs(temp) {
			return linuxInstallation{}, errPin
		}
		stage, err = os.MkdirTemp(temp, "huhu-agent-install-")
		if err != nil {
			return linuxInstallation{}, errPin
		}
	}
	var image *os.File
	defer func() {
		if err != nil && stage != "" {
			if image != nil {
				_ = image.Close()
			}
			_ = os.RemoveAll(stage)
		}
	}()
	var total int64
	for i, file := range components {
		size, err := checkInstallationComponent(stage, file.relative, file.spec, i == 0)
		if err != nil || size > maxInstallationSize-total {
			return linuxInstallation{}, errPin
		}
		total += size
	}
	for _, record := range layout.Records {
		file, _, err := checkedLinuxFile(record, nil)
		if err != nil {
			return linuxInstallation{}, errPin
		}
		_ = file.Close()
	}
	for _, alias := range layout.Aliases {
		if !matchesInstallationAlias(alias) {
			return linuxInstallation{}, errPin
		}
	}
	for _, component := range components {
		file, stat, err := openLinuxPath(component.spec.Path, unix.O_PATH)
		if err != nil {
			return linuxInstallation{}, errPin
		}
		_ = file.Close()
		if component.spec.ID == nil || *component.spec.ID != linuxIdentity(stat, stat.Ctim) {
			return linuxInstallation{}, errPin
		}
	}
	for _, modules := range []struct{ source, relative string }{
		{layout.LocalModules, filepath.Join(packageRoot, "node_modules")},
		{layout.HoistedModules, "node_modules"},
	} {
		if modules.source == "" {
			continue
		}
		dir, _, err := openLinuxDirectory(modules.source)
		if err != nil {
			return linuxInstallation{}, errPin
		}
		_ = dir.Close()
		if stage != "" && os.Symlink(modules.source, filepath.Join(stage, modules.relative)) != nil {
			return linuxInstallation{}, errPin
		}
	}
	if stage == "" {
		return linuxInstallation{}, nil
	}
	namedImage := filepath.Join(stage, imagePath)
	image, _, err = checkedLinuxFile(fileSpec{Path: namedImage, SHA256: s.Image.SHA256}, nil)
	if err != nil || checkELF(image) != nil {
		return linuxInstallation{}, errPin
	}
	argv := slices.Clone(s.Argv)
	argv[0] = namedImage
	if s.Entry != nil {
		entry, _ := mapPackage(s.Entry.Path)
		argv[1] = filepath.Join(stage, entry)
	}
	return linuxInstallation{stage: stage, image: image, argv: argv, packageRoot: filepath.Join(stage, packageRoot)}, nil
}

func checkInstallationComponent(stage, relative string, spec fileSpec, executable bool) (int64, error) {
	if stage == "" {
		file, _, err := checkedLinuxFile(spec, nil)
		if err != nil {
			return 0, err
		}
		defer file.Close()
		if executable && checkELF(file) != nil {
			return 0, errPin
		}
		stat, err := file.Stat()
		if err != nil {
			return 0, errPin
		}
		return stat.Size(), nil
	}
	dest := filepath.Join(stage, relative)
	if err := os.MkdirAll(filepath.Dir(dest), 0700); err != nil {
		return 0, errPin
	}
	copy, err := os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return 0, errPin
	}
	defer copy.Close()
	source, _, err := checkedLinuxFile(spec, copy)
	if err != nil {
		return 0, err
	}
	defer source.Close()
	if executable && checkELF(source) != nil {
		return 0, errPin
	}
	stat, err := source.Stat()
	if err != nil {
		return 0, errPin
	}
	mode := os.FileMode(0400)
	if stat.Mode().Perm()&0111 != 0 {
		mode |= 0100
	}
	if copy.Chmod(mode) != nil || copy.Close() != nil {
		return 0, errPin
	}
	return stat.Size(), nil
}

func checkedStagedImage(image *os.File) bool {
	var stat unix.Stat_t
	return unix.Fstat(int(image.Fd()), &stat) == nil && stat.Mode&0222 == 0 && checkELF(image) == nil
}
