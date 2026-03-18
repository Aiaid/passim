package template

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type Template struct {
	Name        string            `yaml:"name"`
	Category    string            `yaml:"category"`
	Version     string            `yaml:"version"`
	Icon        string            `yaml:"icon"`
	Description map[string]string `yaml:"description"`
	Source      *Source           `yaml:"source,omitempty"`
	Guide       *Guide           `yaml:"guide,omitempty"`
	Limitations []string          `yaml:"limitations,omitempty"`
	Settings    []Setting         `yaml:"settings"`
	Container   ContainerSpec     `yaml:"container"`
	Config      *ConfigMapping    `yaml:"config,omitempty"`
	Hooks       *Hooks           `yaml:"hooks,omitempty"`
	Clients     *ClientConfig    `yaml:"clients,omitempty"`
	Share       *ShareConfig     `yaml:"share,omitempty"`
	Generated   []GeneratedSpec  `yaml:"generated,omitempty"`
}

type Source struct {
	URL     string `yaml:"url,omitempty"`
	License string `yaml:"license,omitempty"`
}

type Guide struct {
	Setup     map[string]string `yaml:"setup,omitempty"`
	Usage     map[string]string `yaml:"usage,omitempty"`
	Platforms []GuidePlatform   `yaml:"platforms,omitempty"`
}

type GuidePlatform struct {
	Name        string   `yaml:"name"`
	StoreURL    string   `yaml:"store_url,omitempty"`
	DownloadURL string   `yaml:"download_url,omitempty"`
	Steps       []string `yaml:"steps"`
}

type Setting struct {
	Key         string            `yaml:"key"`
	Type        string            `yaml:"type"`
	Min         *int              `yaml:"min,omitempty"`
	Max         *int              `yaml:"max,omitempty"`
	Default     interface{}       `yaml:"default,omitempty"`
	Label       map[string]string `yaml:"label"`
	Required    *bool             `yaml:"required,omitempty"`
	Advanced    bool              `yaml:"advanced,omitempty"`
	Description map[string]string `yaml:"description,omitempty"`
	Options     []SettingOption   `yaml:"options,omitempty"`
	Pattern     string            `yaml:"pattern,omitempty"`
}

type SettingOption struct {
	Value interface{}       `yaml:"value"`
	Label map[string]string `yaml:"label"`
}

type ContainerSpec struct {
	Image       string            `yaml:"image"`
	Ports       []string          `yaml:"ports"`
	Volumes     []string          `yaml:"volumes"`
	Environment map[string]string `yaml:"environment"`
	Labels      map[string]string `yaml:"labels"`
	CapAdd      []string          `yaml:"cap_add,omitempty"`
	Sysctls     map[string]string `yaml:"sysctls,omitempty"`
	Args        []string          `yaml:"args,omitempty"`
}

type ConfigMapping struct {
	Files []ConfigFile `yaml:"files,omitempty"`
}

type ConfigFile struct {
	Path     string `yaml:"path"`
	Template string `yaml:"template"`
}

type Hooks struct {
	PostStart []HookCommand `yaml:"post_start,omitempty"`
	PreStop   []HookCommand `yaml:"pre_stop,omitempty"`
}

type HookCommand struct {
	Exec    string `yaml:"exec,omitempty"`
	Wait    string `yaml:"wait,omitempty"`
	Timeout int    `yaml:"timeout,omitempty"`
}

// ClientConfig defines how end-users obtain their connection configuration.
// Three types: "file_per_user" (WireGuard), "credentials" (L2TP/WebDAV), "url" (Hysteria/V2Ray).
type ClientConfig struct {
	Type string `yaml:"type"` // "file_per_user" | "credentials" | "url"

	// file_per_user: per-user config file inside the container volume
	Source string `yaml:"source,omitempty"` // e.g. "/config/wg_confs/peer{n}.conf"
	Format string `yaml:"format,omitempty"` // conf | json | yaml | txt
	QR     bool   `yaml:"qr,omitempty"`

	// credentials: key-value fields rendered from template variables
	Fields []CredentialField `yaml:"fields,omitempty"`

	// url: URI schemes for proxy clients
	URLs       []ClientURL       `yaml:"urls,omitempty"`
	ImportURLs map[string]string `yaml:"import_urls,omitempty"` // e.g. stash: "stash://..."
}

// CredentialField is a single credential entry (server, username, password, etc.).
type CredentialField struct {
	Key    string            `yaml:"key"`
	Label  map[string]string `yaml:"label"`
	Value  string            `yaml:"value"`           // Go template string
	Secret bool              `yaml:"secret,omitempty"`
}

// ClientURL is a URI scheme for proxy client import.
type ClientURL struct {
	Name   string `yaml:"name"`
	Scheme string `yaml:"scheme"` // URI template with {{settings.*}} / {{node.*}} placeholders
	QR     bool   `yaml:"qr,omitempty"`
}

// ShareConfig controls whether the app supports public sharing of client configs.
type ShareConfig struct {
	Supports     bool     `yaml:"supports"`
	PerUser      bool     `yaml:"per_user,omitempty"`
	ShareContent []string `yaml:"share_content,omitempty"` // e.g. ["client_config", "guide"]
}

type GeneratedSpec struct {
	Key    string `yaml:"key"`
	Type   string `yaml:"type"`
	Length int    `yaml:"length,omitempty"`
}

func ParseFile(path string) (*Template, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read template %s: %w", path, err)
	}
	return Parse(data)
}

func Parse(data []byte) (*Template, error) {
	var t Template
	if err := yaml.Unmarshal(data, &t); err != nil {
		return nil, fmt.Errorf("parse template: %w", err)
	}
	if t.Name == "" {
		return nil, fmt.Errorf("template missing name")
	}
	return &t, nil
}
