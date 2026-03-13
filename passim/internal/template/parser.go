package template

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type Template struct {
	Name         string            `yaml:"name"`
	Category     string            `yaml:"category"`
	Version      string            `yaml:"version"`
	Icon         string            `yaml:"icon"`
	Description  map[string]string `yaml:"description"`
	Source       *Source           `yaml:"source,omitempty"`
	Guide        *Guide            `yaml:"guide,omitempty"`
	Limitations  []string          `yaml:"limitations,omitempty"`
	Settings     []Setting         `yaml:"settings"`
	Container    ContainerSpec     `yaml:"container"`
	Config       *ConfigMapping    `yaml:"config,omitempty"`
	Hooks        *Hooks            `yaml:"hooks,omitempty"`
	Clients      *ClientConfig     `yaml:"clients,omitempty"`
	ConfigExport *ConfigExport     `yaml:"config_export,omitempty"`
}

type Source struct {
	URL     string `yaml:"url,omitempty"`
	License string `yaml:"license,omitempty"`
}

type Guide struct {
	Setup   map[string]string `yaml:"setup,omitempty"`
	Usage   map[string]string `yaml:"usage,omitempty"`
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

type ClientConfig struct {
	Web     *ClientEntry `yaml:"web,omitempty"`
	Mobile  *ClientEntry `yaml:"mobile,omitempty"`
	Desktop *ClientEntry `yaml:"desktop,omitempty"`
}

type ClientEntry struct {
	URL         string            `yaml:"url,omitempty"`
	Label       map[string]string `yaml:"label,omitempty"`
	Description map[string]string `yaml:"description,omitempty"`
}

type ConfigExport struct {
	Format  string `yaml:"format"`
	Path    string `yaml:"path"`
	Pattern string `yaml:"pattern"`
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
