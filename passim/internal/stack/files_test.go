package stack

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/compose-spec/compose-go/v2/types"
)

func mustMaterialize(t *testing.T, yaml string) (*StackFiles, string) {
	t.Helper()
	dataDir := t.TempDir()
	project, _, err := ParseAndValidate(t.Context(), "test", yaml, "", nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	files, err := MaterializeFiles(dataDir, &Stack{ID: "sid", Name: "test"}, project)
	if err != nil {
		t.Fatalf("materialize: %v", err)
	}
	return files, dataDir
}

func TestMaterializeInlineConfig(t *testing.T) {
	files, _ := mustMaterialize(t, `
services:
  app:
    image: nginx
configs:
  caddy:
    content: |
      :80 {
        respond "hello"
      }
`)
	path := files.ConfigPaths["caddy"]
	if path == "" {
		t.Fatal("caddy path missing")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data[:4]) != ":80 " {
		t.Errorf("content wrong: %q", data)
	}
	info, _ := os.Stat(path)
	if info.Mode().Perm() != 0o644 {
		t.Errorf("config mode = %v, want 0644", info.Mode().Perm())
	}
}

func TestMaterializeInlineSecret(t *testing.T) {
	files, _ := mustMaterialize(t, `
services:
  app:
    image: nginx
secrets:
  db_password:
    content: "hunter2"
`)
	path := files.SecretPaths["db_password"]
	if path == "" {
		t.Fatal("secret path missing")
	}
	data, _ := os.ReadFile(path)
	if string(data) != "hunter2" {
		t.Errorf("content = %q", data)
	}
	info, _ := os.Stat(path)
	if info.Mode().Perm() != 0o600 {
		t.Errorf("secret mode = %v, want 0600", info.Mode().Perm())
	}
}

func TestMaterializeRejectsRelativeFile(t *testing.T) {
	dataDir := t.TempDir()
	project, _, err := ParseAndValidate(t.Context(), "test", `
services:
  app:
    image: nginx
configs:
  c:
    file: ./relative.conf
`, "", nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	_, err = MaterializeFiles(dataDir, &Stack{ID: "s", Name: "test"}, project)
	if err == nil {
		t.Fatal("expected error for relative path")
	}
}

func TestMaterializeRejectsFileOutsideDataDir(t *testing.T) {
	dataDir := t.TempDir()
	project, _, err := ParseAndValidate(t.Context(), "test", `
services:
  app:
    image: nginx
configs:
  c:
    file: /etc/passwd
`, "", nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	_, err = MaterializeFiles(dataDir, &Stack{ID: "s", Name: "test"}, project)
	if err == nil {
		t.Fatal("expected error for path outside DataDir")
	}
}

func TestMaterializeFileFromDataDir(t *testing.T) {
	dataDir := t.TempDir()
	src := filepath.Join(dataDir, "app.conf")
	if err := os.WriteFile(src, []byte("key=value"), 0o644); err != nil {
		t.Fatal(err)
	}
	project, _, err := ParseAndValidate(t.Context(), "test", `
services:
  app:
    image: nginx
configs:
  c:
    file: `+src+`
`, "", nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	files, err := MaterializeFiles(dataDir, &Stack{ID: "s", Name: "test"}, project)
	if err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(files.ConfigPaths["c"])
	if string(data) != "key=value" {
		t.Errorf("content = %q", data)
	}
}

func TestConfigMountSpecDefaultTarget(t *testing.T) {
	files := &StackFiles{ConfigPaths: map[string]string{"caddy": "/data/stacks/x/configs/caddy"}}
	spec := ConfigMountSpec(files, types.ServiceConfigObjConfig{Source: "caddy"})
	want := "/data/stacks/x/configs/caddy:/caddy:ro"
	if spec != want {
		t.Errorf("got %q, want %q", spec, want)
	}
}

func TestConfigMountSpecExplicitTarget(t *testing.T) {
	files := &StackFiles{ConfigPaths: map[string]string{"caddy": "/data/stacks/x/configs/caddy"}}
	spec := ConfigMountSpec(files, types.ServiceConfigObjConfig{
		Source: "caddy",
		Target: "/etc/caddy/Caddyfile",
	})
	want := "/data/stacks/x/configs/caddy:/etc/caddy/Caddyfile:ro"
	if spec != want {
		t.Errorf("got %q, want %q", spec, want)
	}
}

func TestSecretMountSpecDefaultTarget(t *testing.T) {
	files := &StackFiles{SecretPaths: map[string]string{"db_password": "/data/stacks/x/secrets/db_password"}}
	spec := SecretMountSpec(files, types.ServiceSecretConfig{Source: "db_password"})
	want := "/data/stacks/x/secrets/db_password:/run/secrets/db_password:ro"
	if spec != want {
		t.Errorf("got %q, want %q", spec, want)
	}
}

func TestMountSpecMissingSource(t *testing.T) {
	files := &StackFiles{ConfigPaths: map[string]string{}, SecretPaths: map[string]string{}}
	if got := ConfigMountSpec(files, types.ServiceConfigObjConfig{Source: "nope"}); got != "" {
		t.Errorf("got %q, want empty", got)
	}
	if got := SecretMountSpec(files, types.ServiceSecretConfig{Source: "nope"}); got != "" {
		t.Errorf("got %q, want empty", got)
	}
}

func TestRemoveStackFiles(t *testing.T) {
	dataDir := t.TempDir()
	dir := StackFilesDir(dataDir, "myst")
	_ = os.MkdirAll(dir, 0o755)
	if err := RemoveStackFiles(dataDir, "myst"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Error("dir still exists")
	}
	// Idempotent — removing twice is fine.
	if err := RemoveStackFiles(dataDir, "myst"); err != nil {
		t.Errorf("second remove errored: %v", err)
	}
}
