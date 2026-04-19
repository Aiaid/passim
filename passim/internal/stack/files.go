package stack

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/compose-spec/compose-go/v2/types"
)

// StackFiles holds the host paths of materialized configs + secrets so the
// deployer can build bind-mount volume specs for service references.
type StackFiles struct {
	ConfigPaths map[string]string // compose source name → host path
	SecretPaths map[string]string
	// RootDir is the `<DataDir>/stacks/<stack-name>` directory; rollback
	// deletes it wholesale.
	RootDir string
}

// StackFilesDir returns <DataDir>/stacks/<stack-name>. Deterministic so
// both materialize and teardown use the same path without threading.
func StackFilesDir(dataDir, stackName string) string {
	return filepath.Join(dataDir, "stacks", stackName)
}

// MaterializeFiles writes every top-level config and secret the YAML
// declares to disk, returning a lookup map from the compose source name
// to the host-side path. Only inline `content:` and absolute `file:`
// paths under DataDir are accepted — anything else would require
// streaming files from the user's browser which is a phase-6 concern.
//
// Files land under:
//   <DataDir>/stacks/<stack-name>/configs/<source>   (mode 0644)
//   <DataDir>/stacks/<stack-name>/secrets/<source>   (mode 0600)
//
// Secret files get restrictive permissions so they don't accidentally
// leak when other containers happen to mount the parent.
func MaterializeFiles(dataDir string, s *Stack, p *types.Project) (*StackFiles, error) {
	if dataDir == "" || p == nil {
		return &StackFiles{
			ConfigPaths: map[string]string{},
			SecretPaths: map[string]string{},
		}, nil
	}

	root := StackFilesDir(dataDir, s.Name)
	out := &StackFiles{
		ConfigPaths: make(map[string]string, len(p.Configs)),
		SecretPaths: make(map[string]string, len(p.Secrets)),
		RootDir:     root,
	}

	if len(p.Configs) > 0 {
		cfgDir := filepath.Join(root, "configs")
		if err := os.MkdirAll(cfgDir, 0o755); err != nil {
			return nil, fmt.Errorf("mkdir configs: %w", err)
		}
		for name, cfg := range p.Configs {
			path, err := writeFileObject(cfgDir, name, cfg, 0o644, dataDir)
			if err != nil {
				return nil, fmt.Errorf("config %s: %w", name, err)
			}
			out.ConfigPaths[name] = path
		}
	}
	if len(p.Secrets) > 0 {
		secDir := filepath.Join(root, "secrets")
		if err := os.MkdirAll(secDir, 0o700); err != nil {
			return nil, fmt.Errorf("mkdir secrets: %w", err)
		}
		for name, sec := range p.Secrets {
			path, err := writeFileObject(secDir, name, types.ConfigObjConfig(sec), 0o600, dataDir)
			if err != nil {
				return nil, fmt.Errorf("secret %s: %w", name, err)
			}
			out.SecretPaths[name] = path
		}
	}
	return out, nil
}

// writeFileObject handles both Content and File forms. External is rejected
// by the parser long before we reach here, so it's only a safety net.
func writeFileObject(dir, name string, obj types.ConfigObjConfig, mode os.FileMode, dataDir string) (string, error) {
	target := filepath.Join(dir, name)
	switch {
	case bool(obj.External):
		return "", fmt.Errorf("external not supported (should have been caught by parser)")
	case obj.Content != "":
		if err := os.WriteFile(target, []byte(obj.Content), mode); err != nil {
			return "", fmt.Errorf("write content: %w", err)
		}
	case obj.File != "":
		// Require absolute paths under DataDir so YAML can't read arbitrary
		// host files via bind-mount abuse.
		if !filepath.IsAbs(obj.File) {
			return "", fmt.Errorf("file path must be absolute (got %q)", obj.File)
		}
		rel, err := filepath.Rel(dataDir, obj.File)
		if err != nil || strings.HasPrefix(rel, "..") {
			return "", fmt.Errorf("file path %q must live under DataDir %q", obj.File, dataDir)
		}
		src, err := os.ReadFile(obj.File)
		if err != nil {
			return "", fmt.Errorf("read file %s: %w", obj.File, err)
		}
		if err := os.WriteFile(target, src, mode); err != nil {
			return "", fmt.Errorf("copy to %s: %w", target, err)
		}
	default:
		return "", fmt.Errorf("neither content: nor file: provided")
	}
	return target, nil
}

// RemoveStackFiles deletes the stack's materialized directory. Best-effort:
// a missing directory is not an error (tear-down after a failed partial
// deploy may hit this).
func RemoveStackFiles(dataDir, stackName string) error {
	if dataDir == "" || stackName == "" {
		return nil
	}
	dir := StackFilesDir(dataDir, stackName)
	if err := os.RemoveAll(dir); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove %s: %w", dir, err)
	}
	return nil
}

// ConfigMountSpec translates a service's `configs:` reference into a Docker
// bind-mount volume spec. Target defaults to `/<source>` (compose rule).
// Returns "" when the source isn't in files (e.g. the project declared a
// config but the service didn't mount it).
func ConfigMountSpec(files *StackFiles, ref types.ServiceConfigObjConfig) string {
	host, ok := files.ConfigPaths[ref.Source]
	if !ok {
		return ""
	}
	target := ref.Target
	if target == "" {
		target = "/" + ref.Source
	}
	return host + ":" + target + ":ro"
}

// SecretMountSpec is ConfigMountSpec for secrets. Compose default target is
// `/run/secrets/<source>`.
func SecretMountSpec(files *StackFiles, ref types.ServiceSecretConfig) string {
	host, ok := files.SecretPaths[ref.Source]
	if !ok {
		return ""
	}
	target := ref.Target
	if target == "" {
		target = "/run/secrets/" + ref.Source
	}
	return host + ":" + target + ":ro"
}
